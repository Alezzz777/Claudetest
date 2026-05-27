const { Router } = require('express');
const pool = require('../db/pool');
const router = Router();

router.get('/', async (req, res) => {
    const { rows } = await pool.query(
        'SELECT id, name, inventory_no AS "inventoryNo", status, note FROM equipment ORDER BY id'
    );
    res.json(rows);
});

router.post('/', async (req, res) => {
    const { name, inventoryNo, status, note } = req.body;
    const { rows } = await pool.query(
        'INSERT INTO equipment (name, inventory_no, status, note) VALUES ($1,$2,$3,$4) RETURNING id, name, inventory_no AS "inventoryNo", status, note',
        [name, inventoryNo || '', status || 'working', note || '']
    );
    res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
    const { name, inventoryNo, status, note } = req.body;
    const { rows } = await pool.query(
        'UPDATE equipment SET name=$1, inventory_no=$2, status=$3, note=$4 WHERE id=$5 RETURNING id, name, inventory_no AS "inventoryNo", status, note',
        [name, inventoryNo || '', status, note || '', req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
    await pool.query('DELETE FROM equipment WHERE id=$1', [req.params.id]);
    res.status(204).end();
});

module.exports = router;
