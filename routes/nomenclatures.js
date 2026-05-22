const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res) => {
    const { rows } = await db.query(
        `SELECT n.id, n.code, n.name, n.description,
                COALESCE(json_agg(
                    json_build_object('id', o.id, 'seq', o.seq, 'name', o.name, 'hours', o.hours)
                    ORDER BY o.seq
                ) FILTER (WHERE o.id IS NOT NULL), '[]') AS operations,
                COALESCE(SUM(o.hours), 0)::float AS total_hours
         FROM nomenclatures n
         LEFT JOIN operations o ON o.nomenclature_id = n.id
         GROUP BY n.id
         ORDER BY n.code`
    );
    res.json(rows);
});

function normalizeOps(raw) {
    if (!Array.isArray(raw)) return null;
    const ops = [];
    for (const item of raw) {
        if (typeof item === 'string') {
            const name = item.trim();
            if (name) ops.push({ name, hours: 0 });
        } else if (item && typeof item === 'object') {
            const name = String(item.name || '').trim();
            const hours = Number(item.hours);
            if (!name) continue;
            if (!isFinite(hours) || hours < 0) return false;
            ops.push({ name, hours });
        }
    }
    return ops;
}

router.post('/', requireRole('technologist'), async (req, res) => {
    const { code, name, description, operations } = req.body || {};
    if (!code || !name) {
        return res.status(400).json({ error: 'Укажите код и название номенклатуры' });
    }
    const ops = normalizeOps(operations);
    if (ops === false) return res.status(400).json({ error: 'Трудоёмкость операции должна быть неотрицательным числом' });
    if (!ops || ops.length === 0) {
        return res.status(400).json({ error: 'Добавьте хотя бы одну операцию' });
    }
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `INSERT INTO nomenclatures (code, name, description) VALUES ($1,$2,$3) RETURNING id`,
            [code.trim(), name.trim(), description || null]
        );
        const nomId = rows[0].id;
        for (let i = 0; i < ops.length; i++) {
            await client.query(
                `INSERT INTO operations (nomenclature_id, seq, name, hours) VALUES ($1,$2,$3,$4)`,
                [nomId, i + 1, ops[i].name, ops[i].hours]
            );
        }
        await client.query('COMMIT');
        res.json({ id: nomId });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Код номенклатуры уже существует' });
        }
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

router.patch('/:id', requireRole('technologist'), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Неверный id' });

    const { name, description } = req.body || {};
    const sets = [], params = [];
    if (name !== undefined) {
        if (!name.trim()) return res.status(400).json({ error: 'Название не может быть пустым' });
        params.push(name.trim()); sets.push(`name = $${params.length}`);
    }
    if (description !== undefined) {
        params.push(description || null); sets.push(`description = $${params.length}`);
    }
    if (sets.length === 0) return res.json({ ok: true });
    params.push(id);
    const { rowCount } = await db.query(
        `UPDATE nomenclatures SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Номенклатура не найдена' });
    res.json({ ok: true });
});

module.exports = router;
