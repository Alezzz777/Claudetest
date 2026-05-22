const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res) => {
    const { rows } = await db.query(
        `SELECT n.id, n.code, n.name, n.description,
                COALESCE(json_agg(json_build_object('id', o.id, 'seq', o.seq, 'name', o.name)
                                  ORDER BY o.seq)
                         FILTER (WHERE o.id IS NOT NULL), '[]') AS operations
         FROM nomenclatures n
         LEFT JOIN operations o ON o.nomenclature_id = n.id
         GROUP BY n.id
         ORDER BY n.code`
    );
    res.json(rows);
});

router.post('/', requireRole('master'), async (req, res) => {
    const { code, name, description, operations } = req.body || {};
    if (!code || !name || !Array.isArray(operations) || operations.length === 0) {
        return res.status(400).json({ error: 'Укажите код, название и хотя бы одну операцию' });
    }
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `INSERT INTO nomenclatures (code, name, description) VALUES ($1,$2,$3) RETURNING id`,
            [code, name, description || null]
        );
        const nomId = rows[0].id;
        for (let i = 0; i < operations.length; i++) {
            await client.query(
                `INSERT INTO operations (nomenclature_id, seq, name) VALUES ($1,$2,$3)`,
                [nomId, i + 1, operations[i]]
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

module.exports = router;
