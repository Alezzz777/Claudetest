const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const ALLOWED_ROLES = ['worker', 'foreman', 'master', 'admin'];

// List users, optionally filtered by role. Admin can ask for inactive users too.
router.get('/', requireRole('foreman', 'master', 'admin'), async (req, res) => {
    const { role, include_inactive } = req.query;
    const params = [];
    const where = [];
    if (!(req.user.role === 'admin' && include_inactive === '1')) {
        where.push('active = TRUE');
    }
    if (role) { params.push(role); where.push(`role = $${params.length}`); }
    const { rows } = await db.query(
        `SELECT id, username, full_name, role, active, created_at FROM users
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY full_name`,
        params
    );
    res.json(rows);
});

router.post('/', requireRole('admin'), async (req, res) => {
    const { username, full_name, role, password } = req.body || {};
    if (!username || !full_name || !role || !password) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }
    if (!ALLOWED_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Неизвестная роль' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
    }
    const hash = await bcrypt.hash(password, 10);
    try {
        const { rows } = await db.query(
            `INSERT INTO users (username, full_name, role, password_hash)
             VALUES ($1,$2,$3,$4) RETURNING id`,
            [username.trim(), full_name.trim(), role, hash]
        );
        res.json({ id: rows[0].id });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Логин уже занят' });
        throw err;
    }
});

router.patch('/:id', requireRole('admin'), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Неверный id' });

    const { full_name, role, password, active } = req.body || {};
    const sets = [], params = [];

    if (full_name !== undefined) {
        if (!full_name.trim()) return res.status(400).json({ error: 'ФИО не может быть пустым' });
        params.push(full_name.trim()); sets.push(`full_name = $${params.length}`);
    }
    if (role !== undefined) {
        if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ error: 'Неизвестная роль' });
        params.push(role); sets.push(`role = $${params.length}`);
    }
    if (active !== undefined) {
        if (id === req.user.id && active === false) {
            return res.status(400).json({ error: 'Нельзя деактивировать собственную учётную запись' });
        }
        params.push(!!active); sets.push(`active = $${params.length}`);
    }
    if (password) {
        if (password.length < 6) return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
        params.push(await bcrypt.hash(password, 10));
        sets.push(`password_hash = $${params.length}`);
    }
    if (sets.length === 0) return res.json({ ok: true });

    params.push(id);
    const { rowCount } = await db.query(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ ok: true });
});

module.exports = router;
