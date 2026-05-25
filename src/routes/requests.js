const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { notifyRequestStatusChange } = require('../push');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const { role, id } = req.user;
  const { status, page = 1 } = req.query;
  const limit = 20;
  const offset = (page - 1) * limit;

  let where = '';
  const params = [];
  let paramIdx = 1;

  if (role === 'client') {
    where = `WHERE (r.sender_id = $${paramIdx} OR r.receiver_id = $${paramIdx})`;
    paramIdx++;
    params.push(id);
  } else if (role === 'executor') {
    where = `WHERE (r.executor_id = $${paramIdx} OR r.status = 'new')`;
    paramIdx++;
    params.push(id);
  }

  if (status) {
    where += where ? ` AND r.status = $${paramIdx++}` : `WHERE r.status = $${paramIdx++}`;
    params.push(status);
  }

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM transport_requests r ${where}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(limit, offset);
    const result = await pool.query(`
      SELECT r.*,
        s.full_name as sender_name,
        rv.full_name as receiver_name,
        e.full_name as executor_name,
        d.full_name as dispatcher_name
      FROM transport_requests r
      LEFT JOIN users s ON r.sender_id = s.id
      LEFT JOIN users rv ON r.receiver_id = rv.id
      LEFT JOIN users e ON r.executor_id = e.id
      LEFT JOIN users d ON r.dispatcher_id = d.id
      ${where}
      ORDER BY
        CASE r.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
        r.created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `, params);

    res.json({ requests: result.rows, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки заявок' });
  }
});

router.get('/stats', async (req, res) => {
  const { role, id } = req.user;
  let filter = '';
  const params = [];

  if (role === 'client') {
    filter = 'WHERE (sender_id = $1 OR receiver_id = $1)';
    params.push(id);
  } else if (role === 'executor') {
    filter = 'WHERE (executor_id = $1 OR status = \'new\')';
    params.push(id);
  }

  try {
    const result = await pool.query(`
      SELECT status, COUNT(*) as count FROM transport_requests ${filter} GROUP BY status
    `, params);

    const stats = { new: 0, assigned: 0, in_progress: 0, delivered: 0, confirmed: 0, rejected: 0 };
    result.rows.forEach(r => { stats[r.status] = parseInt(r.count); });
    stats.total = Object.values(stats).reduce((a, b) => a + b, 0);

    res.json(stats);
  } catch {
    res.status(500).json({ error: 'Ошибка загрузки статистики' });
  }
});

router.get('/leaderboard', async (req, res) => {
  const { month } = req.query;
  let dateFilter = '';
  const params = [];

  if (month) {
    dateFilter = ' AND r.updated_at >= $1 AND r.updated_at < ($1::date + interval \'1 month\')';
    params.push(month + '-01');
  }

  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.full_name,
        u.username,
        u.avatar,
        COUNT(r.id) as completed,
        COALESCE(SUM(
          10
          + CASE r.priority WHEN 'urgent' THEN 15 WHEN 'high' THEN 10 WHEN 'normal' THEN 5 ELSE 2 END
          + COALESCE(r.rating * 2, 0)
        ), 0) as points,
        ROUND(AVG(r.rating)::numeric, 1) as avg_rating,
        COUNT(r.rating) as rated_count
      FROM users u
      LEFT JOIN transport_requests r ON r.executor_id = u.id AND r.status = 'confirmed'${dateFilter}
      WHERE u.role = 'executor'
      GROUP BY u.id, u.full_name, u.username, u.avatar
      ORDER BY points DESC, completed DESC
    `, params);

    const months = await pool.query(`
      SELECT DISTINCT TO_CHAR(updated_at, 'YYYY-MM') as month
      FROM transport_requests
      WHERE status = 'confirmed'
      ORDER BY month DESC
    `);

    res.json({ rows: result.rows, months: months.rows.map(m => m.month) });
  } catch {
    res.status(500).json({ error: 'Ошибка загрузки рейтинга' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*,
        s.full_name as sender_name, s.phone as sender_phone,
        rv.full_name as receiver_name, rv.phone as receiver_phone,
        e.full_name as executor_name, e.phone as executor_phone,
        d.full_name as dispatcher_name
      FROM transport_requests r
      LEFT JOIN users s ON r.sender_id = s.id
      LEFT JOIN users rv ON r.receiver_id = rv.id
      LEFT JOIN users e ON r.executor_id = e.id
      LEFT JOIN users d ON r.dispatcher_id = d.id
      WHERE r.id = $1
    `, [req.params.id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Заявка не найдена' });

    const history = await pool.query(`
      SELECT sh.*, u.full_name as changed_by_name
      FROM status_history sh
      JOIN users u ON sh.changed_by = u.id
      WHERE sh.request_id = $1
      ORDER BY sh.created_at DESC
    `, [req.params.id]);

    res.json({ ...result.rows[0], history: history.rows });
  } catch {
    res.status(500).json({ error: 'Ошибка загрузки заявки' });
  }
});

router.post('/', authorize('client', 'dispatcher'), async (req, res) => {
  const { cargo_description, weight, pickup_location, delivery_location, receiver_id, priority, notes } = req.body;

  if (!cargo_description || !pickup_location || !delivery_location) {
    return res.status(400).json({ error: 'Заполните описание груза, место отправки и доставки' });
  }

  try {
    const dispatcherId = req.user.role === 'dispatcher' ? req.user.id : null;

    const result = await pool.query(`
      INSERT INTO transport_requests (sender_id, receiver_id, dispatcher_id, cargo_description, weight, pickup_location, delivery_location, priority, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [req.user.id, receiver_id || null, dispatcherId, cargo_description, weight || null, pickup_location, delivery_location, priority || 'normal', notes || null]);

    const request = result.rows[0];

    await pool.query(
      'INSERT INTO status_history (request_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
      [request.id, 'new', req.user.id, 'Заявка создана']
    );

    res.status(201).json(request);
  } catch {
    res.status(500).json({ error: 'Ошибка создания заявки' });
  }
});

router.patch('/:id/take', authorize('executor'), async (req, res) => {
  try {
    const check = await pool.query('SELECT * FROM transport_requests WHERE id = $1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Заявка не найдена' });
    if (check.rows[0].status !== 'new') {
      return res.status(400).json({ error: 'Заявка уже взята или назначена' });
    }

    const result = await pool.query(
      `UPDATE transport_requests SET executor_id = $1, status = 'in_progress', updated_at = NOW() WHERE id = $2 RETURNING *`,
      [req.user.id, req.params.id]
    );

    await pool.query(
      'INSERT INTO status_history (request_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
      [req.params.id, 'in_progress', req.user.id, 'Исполнитель взял заявку']
    );

    notifyRequestStatusChange(req.params.id, 'in_progress');
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Ошибка взятия заявки' });
  }
});

router.patch('/:id/assign', authorize('dispatcher'), async (req, res) => {
  const { executor_id, receiver_id } = req.body;
  if (!executor_id) return res.status(400).json({ error: 'Укажите исполнителя' });

  try {
    const check = await pool.query('SELECT * FROM transport_requests WHERE id = $1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Заявка не найдена' });
    if (!['new', 'assigned'].includes(check.rows[0].status)) {
      return res.status(400).json({ error: 'Невозможно назначить — заявка уже в работе' });
    }

    const sets = ['executor_id = $1', 'dispatcher_id = $2', "status = 'assigned'", 'updated_at = NOW()'];
    const params = [executor_id, req.user.id];
    let paramIdx = 3;

    if (receiver_id) {
      sets.push(`receiver_id = $${paramIdx++}`);
      params.push(receiver_id);
    }

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE transport_requests SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    await pool.query(
      'INSERT INTO status_history (request_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
      [req.params.id, 'assigned', req.user.id, 'Назначен исполнитель']
    );

    notifyRequestStatusChange(req.params.id, 'assigned');
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Ошибка назначения' });
  }
});

router.patch('/:id/status', async (req, res) => {
  const { status, comment } = req.body;
  const { role, id: userId } = req.user;

  const allowedTransitions = {
    executor: { assigned: 'in_progress', in_progress: 'delivered' },
    client: { delivered: 'confirmed' },
    dispatcher: { new: 'assigned', assigned: 'in_progress', in_progress: 'delivered', delivered: 'confirmed' },
  };

  try {
    const check = await pool.query('SELECT * FROM transport_requests WHERE id = $1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Заявка не найдена' });

    const row = check.rows[0];
    const currentStatus = row.status;
    const transitions = allowedTransitions[role];

    if (!transitions || transitions[currentStatus] !== status) {
      return res.status(400).json({ error: 'Недопустимый переход статуса' });
    }

    if (role === 'client' && status === 'confirmed') {
      if (row.receiver_id !== userId && row.sender_id !== userId) {
        return res.status(403).json({ error: 'Только получатель или отправитель может подтвердить' });
      }
    }

    const result = await pool.query(
      'UPDATE transport_requests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );

    await pool.query(
      'INSERT INTO status_history (request_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
      [req.params.id, status, req.user.id, comment || null]
    );

    notifyRequestStatusChange(req.params.id, status);
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Ошибка обновления статуса' });
  }
});

router.patch('/:id/rate', authorize('client'), async (req, res) => {
  const { rating } = req.body;
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Оценка должна быть от 1 до 5' });
  }

  try {
    const check = await pool.query('SELECT * FROM transport_requests WHERE id = $1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Заявка не найдена' });

    const row = check.rows[0];
    if (row.status !== 'confirmed') {
      return res.status(400).json({ error: 'Оценить можно только подтверждённую заявку' });
    }
    if (row.receiver_id !== req.user.id && row.sender_id !== req.user.id) {
      return res.status(403).json({ error: 'Только заказчик или получатель может оценить' });
    }
    if (row.rating) {
      return res.status(400).json({ error: 'Заявка уже оценена' });
    }

    const result = await pool.query(
      'UPDATE transport_requests SET rating = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [rating, req.params.id]
    );

    await pool.query(
      'INSERT INTO status_history (request_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
      [req.params.id, 'confirmed', req.user.id, 'Оценка: ' + rating + ' из 5']
    );

    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Ошибка сохранения оценки' });
  }
});

router.patch('/:id/reject', authorize('client', 'dispatcher'), async (req, res) => {
  const { comment } = req.body;
  if (!comment) return res.status(400).json({ error: 'Укажите причину отклонения' });

  try {
    const check = await pool.query('SELECT * FROM transport_requests WHERE id = $1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Заявка не найдена' });

    const row = check.rows[0];

    if (req.user.role === 'client') {
      if (row.receiver_id !== req.user.id && row.sender_id !== req.user.id) {
        return res.status(403).json({ error: 'Только получатель или отправитель может отклонить' });
      }
      if (row.status !== 'delivered') {
        return res.status(400).json({ error: 'Клиент может отклонить только доставленную заявку' });
      }
    } else {
      if (!['delivered', 'new', 'assigned'].includes(row.status)) {
        return res.status(400).json({ error: 'Невозможно отклонить заявку в текущем статусе' });
      }
    }

    const result = await pool.query(
      "UPDATE transport_requests SET status = 'rejected', updated_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id]
    );

    await pool.query(
      'INSERT INTO status_history (request_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
      [req.params.id, 'rejected', req.user.id, comment]
    );

    notifyRequestStatusChange(req.params.id, 'rejected');
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Ошибка отклонения' });
  }
});

module.exports = router;
