const express = require('express');
const path = require('path');
const pool = require('./src/db/pool');
const push = require('./src/push');
const { authenticate } = require('./src/middleware/auth');
const authRoutes = require('./src/routes/auth');
const requestRoutes = require('./src/routes/requests');
const userRoutes = require('./src/routes/users');
const locationRoutes = require('./src/routes/locations');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '500kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', async (req, res) => {
  const status = { server: 'ok', timestamp: new Date().toISOString() };
  try {
    const result = await pool.query('SELECT NOW() AS db_time');
    status.database = 'ok';
    status.db_time = result.rows[0].db_time;
  } catch {
    status.database = 'error';
  }
  const httpCode = status.database === 'ok' ? 200 : 503;
  res.status(httpCode).json(status);
});

app.get('/api/ping', (req, res) => {
  res.json({ pong: true });
});

app.get('/api/push/vapid-key', (req, res) => {
  res.json({ key: push.getPublicKey() });
});

app.post('/api/push/subscribe', authenticate, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Невалидная подписка' });
  }
  try {
    await push.saveSubscription(req.user.id, subscription);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Ошибка сохранения подписки' });
  }
});

app.post('/api/push/unsubscribe', authenticate, async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Укажите endpoint' });
  try {
    await push.removeSubscription(endpoint);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Ошибка отписки' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/users', userRoutes);
app.use('/api/locations', locationRoutes);

app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
