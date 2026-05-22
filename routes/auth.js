const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'Введите логин и пароль' });
    }
    const { rows } = await db.query(
        'SELECT * FROM users WHERE username = $1 AND active = TRUE',
        [username]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Неверный логин или пароль' });

    const token = sign(user);
    res.json({
        token,
        user: {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            role: user.role,
        },
    });
});

router.get('/me', authenticate, (req, res) => {
    res.json({ user: req.user });
});

module.exports = router;
