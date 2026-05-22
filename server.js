require('dotenv').config();
const express = require('express');
require('express-async-errors');
const path = require('path');

const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');
const nomenclatureRoutes = require('./routes/nomenclatures');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/nomenclatures', nomenclatureRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Внутренняя ошибка' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Shop floor tracker listening on http://localhost:${PORT}`);
});
