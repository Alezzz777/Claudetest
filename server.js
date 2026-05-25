const express = require('express');
const path = require('path');
const pool = require('./src/db/pool');
const authRoutes = require('./src/routes/auth');
const requestRoutes = require('./src/routes/requests');
const userRoutes = require('./src/routes/users');
const locationRoutes = require('./src/routes/locations');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/users', userRoutes);
app.use('/api/locations', locationRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
