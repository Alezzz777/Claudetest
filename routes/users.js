const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// List users, optionally filtered by role. Available to foreman/master only.
router.get('/', requireRole('foreman', 'master'), async (req, res) => {
    const { role } = req.query;
    const params = [];
    const where = ['active = TRUE'];
    if (role) { params.push(role); where.push(`role = $${params.length}`); }
    const { rows } = await db.query(
        `SELECT id, username, full_name, role FROM users
         WHERE ${where.join(' AND ')}
         ORDER BY full_name`,
        params
    );
    res.json(rows);
});

module.exports = router;
