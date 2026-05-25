const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/by-role/:role', async (req, res) => {
  const validRoles = ['sender', 'receiver', 'dispatcher', 'transporter'];
  if (!validRoles.includes(req.params.role)) {
    return res.status(400).json({ error: 'Недопустимая роль' });
  }

  try {
    const result = await pool.query(
      'SELECT id, username, full_name, phone FROM users WHERE role = $1 ORDER BY full_name',
      [req.params.role]
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Ошибка загрузки пользователей' });
  }
});

router.get('/', authorize('dispatcher'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, full_name, role, phone, created_at FROM users ORDER BY role, full_name'
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Ошибка загрузки пользователей' });
  }
});

module.exports = router;
