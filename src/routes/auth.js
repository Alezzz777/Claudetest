const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { JWT_SECRET, authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name } });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/register', async (req, res) => {
  const { username, password, full_name, role, phone } = req.body;
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Заполните все обязательные поля' });
  }

  const validRoles = ['client', 'executor', 'dispatcher'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Недопустимая роль' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, full_name, role, phone) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, role, full_name',
      [username, hash, full_name, role, phone || null]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({ token, user });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Пользователь с таким логином уже существует' });
    }
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, full_name, role, phone, avatar, created_at FROM users WHERE id = $1', [req.user.id]);
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/avatar', authenticate, async (req, res) => {
  const { avatar } = req.body;
  if (!avatar) return res.status(400).json({ error: 'Укажите изображение' });
  if (avatar.length > 200000) return res.status(400).json({ error: 'Изображение слишком большое (макс 150KB)' });

  try {
    await pool.query('UPDATE users SET avatar = $1 WHERE id = $2', [avatar, req.user.id]);
    res.json({ avatar });
  } catch {
    res.status(500).json({ error: 'Ошибка сохранения аватарки' });
  }
});

router.delete('/avatar', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE users SET avatar = NULL WHERE id = $1', [req.user.id]);
    res.json({ avatar: null });
  } catch {
    res.status(500).json({ error: 'Ошибка удаления аватарки' });
  }
});

module.exports = router;
