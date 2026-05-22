require('dotenv').config();
const express = require('express');
require('express-async-errors');
const path = require('path');
const db = require('./db');

const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');
const nomenclatureRoutes = require('./routes/nomenclatures');
const brigadeRoutes = require('./routes/brigades');
const userRoutes = require('./routes/users');
const operationRoutes = require('./routes/operations');
const laborRoutes = require('./routes/labor');

const startedAt = Date.now();
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/nomenclatures', nomenclatureRoutes);
app.use('/api/brigades', brigadeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/operations', operationRoutes);
app.use('/api/labor', laborRoutes);

app.get('/api/health', async (req, res) => {
    const result = {
        ok: true,
        api: 'ok',
        db: 'unknown',
        server_time: new Date().toISOString(),
        uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    };
    try {
        const start = Date.now();
        await db.query('SELECT 1');
        result.db = 'ok';
        result.db_latency_ms = Date.now() - start;
    } catch (err) {
        result.ok = false;
        result.db = 'error';
        result.db_error = err.message;
        return res.status(503).json(result);
    }
    res.json(result);
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Внутренняя ошибка' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Shop floor tracker listening on http://localhost:${PORT}`);
});
