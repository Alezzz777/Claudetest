const { Router } = require('express');
const pool = require('../db/pool');
const router = Router();

router.get('/', async (req, res) => {
    const { rows } = await pool.query(
        'SELECT id, name, position, grade FROM employees ORDER BY id'
    );
    res.json(rows);
});

router.post('/', async (req, res) => {
    const { name, position, grade } = req.body;
    const { rows } = await pool.query(
        'INSERT INTO employees (name, position, grade) VALUES ($1,$2,$3) RETURNING id, name, position, grade',
        [name, position || '', grade || '']
    );
    res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
    const { name, position, grade } = req.body;
    const { rows } = await pool.query(
        'UPDATE employees SET name=$1, position=$2, grade=$3 WHERE id=$4 RETURNING id, name, position, grade',
        [name, position || '', grade || '', req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
    await pool.query('DELETE FROM employees WHERE id=$1', [req.params.id]);
    res.status(204).end();
});

module.exports = router;
