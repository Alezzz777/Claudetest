const { Router } = require('express');
const pool = require('../db/pool');
const router = Router();

router.get('/items', async (req, res) => {
    const { rows } = await pool.query(
        'SELECT id, name, unit, plan_qty AS "planQty" FROM plan_items ORDER BY id'
    );
    rows.forEach(r => { r.planQty = Number(r.planQty); });
    res.json(rows);
});

router.post('/items', async (req, res) => {
    const { name, unit, planQty } = req.body;
    const { rows } = await pool.query(
        'INSERT INTO plan_items (name, unit, plan_qty) VALUES ($1,$2,$3) RETURNING id, name, unit, plan_qty AS "planQty"',
        [name, unit || 'шт', planQty]
    );
    rows[0].planQty = Number(rows[0].planQty);
    res.status(201).json(rows[0]);
});

router.put('/items/:id', async (req, res) => {
    const { name, unit, planQty } = req.body;
    const { rows } = await pool.query(
        'UPDATE plan_items SET name=$1, unit=$2, plan_qty=$3 WHERE id=$4 RETURNING id, name, unit, plan_qty AS "planQty"',
        [name, unit, planQty, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    rows[0].planQty = Number(rows[0].planQty);
    res.json(rows[0]);
});

router.delete('/items/:id', async (req, res) => {
    await pool.query('DELETE FROM plan_items WHERE id=$1', [req.params.id]);
    res.status(204).end();
});

router.get('/fact/:date', async (req, res) => {
    const { rows } = await pool.query(
        'SELECT plan_item_id AS "planItemId", fact_qty AS "factQty" FROM plan_fact WHERE date=$1',
        [req.params.date]
    );
    const map = {};
    rows.forEach(r => { map[r.planItemId] = Number(r.factQty); });
    res.json(map);
});

router.put('/fact/:date/:itemId', async (req, res) => {
    const { date, itemId } = req.params;
    const { factQty } = req.body;
    await pool.query(
        `INSERT INTO plan_fact (plan_item_id, date, fact_qty) VALUES ($1,$2,$3)
         ON CONFLICT (plan_item_id, date) DO UPDATE SET fact_qty=$3`,
        [itemId, date, factQty]
    );
    res.json({ planItemId: Number(itemId), date, factQty: Number(factQty) });
});

module.exports = router;
