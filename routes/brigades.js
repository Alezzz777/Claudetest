const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

async function loadBrigade(client, id) {
    const { rows } = await client.query(
        `SELECT b.id, b.name, b.foreman_id, b.created_at,
                f.full_name AS foreman_name, f.username AS foreman_username
         FROM brigades b
         LEFT JOIN users f ON f.id = b.foreman_id
         WHERE b.id = $1`,
        [id]
    );
    if (!rows[0]) return null;
    const brigade = rows[0];
    const { rows: members } = await client.query(
        `SELECT u.id, u.username, u.full_name, u.role, bm.joined_at
         FROM brigade_members bm
         JOIN users u ON u.id = bm.user_id
         WHERE bm.brigade_id = $1
         ORDER BY u.full_name`,
        [id]
    );
    brigade.members = members;
    return brigade;
}

async function isBrigadeForeman(userId, brigadeId) {
    const { rows } = await db.query(
        `SELECT 1 FROM brigades WHERE id = $1 AND foreman_id = $2`,
        [brigadeId, userId]
    );
    return rows.length > 0;
}

// List brigades. Foremen see all brigades but only edit their own; workers don't get here.
router.get('/', requireRole('foreman', 'master'), async (req, res) => {
    const { rows } = await db.query(
        `SELECT b.id, b.name, b.foreman_id,
                f.full_name AS foreman_name,
                COALESCE((SELECT COUNT(*) FROM brigade_members bm WHERE bm.brigade_id = b.id), 0)::int AS member_count
         FROM brigades b
         LEFT JOIN users f ON f.id = b.foreman_id
         ORDER BY b.name`
    );
    res.json(rows);
});

router.get('/:id', requireRole('foreman', 'master'), async (req, res) => {
    const client = await db.getClient();
    try {
        const b = await loadBrigade(client, req.params.id);
        if (!b) return res.status(404).json({ error: 'Бригада не найдена' });
        res.json(b);
    } finally {
        client.release();
    }
});

// Create brigade (master only)
router.post('/', requireRole('master'), async (req, res) => {
    const { name, foreman_id } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Укажите название бригады' });

    if (foreman_id) {
        const { rows } = await db.query(`SELECT role FROM users WHERE id = $1 AND active = TRUE`, [foreman_id]);
        if (!rows[0]) return res.status(400).json({ error: 'Бригадир не найден' });
        if (rows[0].role !== 'foreman') return res.status(400).json({ error: 'Назначить бригадиром можно только пользователя с ролью «бригадир»' });
    }

    const { rows } = await db.query(
        `INSERT INTO brigades (name, foreman_id) VALUES ($1, $2) RETURNING id`,
        [name.trim(), foreman_id || null]
    );
    res.json({ id: rows[0].id });
});

// Update brigade name / foreman (master only)
router.patch('/:id', requireRole('master'), async (req, res) => {
    const { name, foreman_id } = req.body || {};
    if (foreman_id !== undefined && foreman_id !== null) {
        const { rows } = await db.query(`SELECT role FROM users WHERE id = $1 AND active = TRUE`, [foreman_id]);
        if (!rows[0]) return res.status(400).json({ error: 'Бригадир не найден' });
        if (rows[0].role !== 'foreman') return res.status(400).json({ error: 'Назначить бригадиром можно только пользователя с ролью «бригадир»' });
    }
    const sets = [];
    const params = [];
    if (name !== undefined) { params.push(name.trim()); sets.push(`name = $${params.length}`); }
    if (foreman_id !== undefined) { params.push(foreman_id || null); sets.push(`foreman_id = $${params.length}`); }
    if (sets.length === 0) return res.json({ ok: true });
    params.push(req.params.id);
    const { rowCount } = await db.query(
        `UPDATE brigades SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Бригада не найдена' });
    res.json({ ok: true });
});

// Delete brigade (master only)
router.delete('/:id', requireRole('master'), async (req, res) => {
    const { rowCount } = await db.query(`DELETE FROM brigades WHERE id = $1`, [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Бригада не найдена' });
    res.json({ ok: true });
});

// Add member: master always, foreman only if they lead this brigade
router.post('/:id/members', requireRole('foreman', 'master'), async (req, res) => {
    const brigadeId = parseInt(req.params.id, 10);
    const { user_id } = req.body || {};
    if (!user_id) return res.status(400).json({ error: 'Укажите пользователя' });

    if (req.user.role === 'foreman' && !(await isBrigadeForeman(req.user.id, brigadeId))) {
        return res.status(403).json({ error: 'Можно управлять только составом своей бригады' });
    }

    const { rows } = await db.query(`SELECT role, active FROM users WHERE id = $1`, [user_id]);
    if (!rows[0] || !rows[0].active) return res.status(400).json({ error: 'Пользователь не найден' });
    if (rows[0].role !== 'worker') return res.status(400).json({ error: 'В бригаду можно добавлять только рабочих' });

    try {
        await db.query(
            `INSERT INTO brigade_members (brigade_id, user_id) VALUES ($1, $2)`,
            [brigadeId, user_id]
        );
        res.json({ ok: true });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Рабочий уже состоит в бригаде. Сначала исключите из другой.' });
        }
        if (err.code === '23503') {
            return res.status(404).json({ error: 'Бригада не найдена' });
        }
        throw err;
    }
});

// Remove member: master always, foreman only if they lead this brigade
router.delete('/:id/members/:user_id', requireRole('foreman', 'master'), async (req, res) => {
    const brigadeId = parseInt(req.params.id, 10);
    const userId = parseInt(req.params.user_id, 10);

    if (req.user.role === 'foreman' && !(await isBrigadeForeman(req.user.id, brigadeId))) {
        return res.status(403).json({ error: 'Можно управлять только составом своей бригады' });
    }

    const { rowCount } = await db.query(
        `DELETE FROM brigade_members WHERE brigade_id = $1 AND user_id = $2`,
        [brigadeId, userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Участник не найден в бригаде' });
    res.json({ ok: true });
});

module.exports = router;
