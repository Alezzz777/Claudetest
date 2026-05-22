const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.patch('/:id', requireRole('technologist'), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Неверный id' });

    const { name, hours } = req.body || {};
    const sets = [], params = [];
    if (name !== undefined) {
        if (!String(name).trim()) return res.status(400).json({ error: 'Название не может быть пустым' });
        params.push(String(name).trim()); sets.push(`name = $${params.length}`);
    }
    if (hours !== undefined) {
        const h = Number(hours);
        if (!isFinite(h) || h < 0) return res.status(400).json({ error: 'Трудоёмкость должна быть неотрицательным числом' });
        params.push(h); sets.push(`hours = $${params.length}`);
    }
    if (sets.length === 0) return res.json({ ok: true });
    params.push(id);
    const { rowCount } = await db.query(
        `UPDATE operations SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Операция не найдена' });
    res.json({ ok: true });
});

module.exports = router;
