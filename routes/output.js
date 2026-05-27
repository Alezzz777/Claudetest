const { Router } = require('express');
const pool = require('../db/pool');
const router = Router();

router.get('/:date', async (req, res) => {
    const { rows } = await pool.query(
        `SELECT id, employee_id AS "employeeId", equipment_id AS "equipment",
                product, qty, unit
         FROM output WHERE date=$1 ORDER BY id`,
        [req.params.date]
    );
    rows.forEach(r => { r.qty = Number(r.qty); });
    res.json(rows);
});

router.post('/:date', async (req, res) => {
    const { employeeId, equipment, product, qty, unit } = req.body;
    const { rows } = await pool.query(
        `INSERT INTO output (employee_id, equipment_id, date, product, qty, unit)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, employee_id AS "employeeId", equipment_id AS "equipment", product, qty, unit`,
        [employeeId, equipment || null, req.params.date, product, qty, unit || 'шт']
    );
    rows[0].qty = Number(rows[0].qty);
    res.status(201).json(rows[0]);
});

router.put('/:date/:id', async (req, res) => {
    const { employeeId, equipment, product, qty, unit } = req.body;
    const { rows } = await pool.query(
        `UPDATE output SET employee_id=$1, equipment_id=$2, product=$3, qty=$4, unit=$5
         WHERE id=$6 AND date=$7
         RETURNING id, employee_id AS "employeeId", equipment_id AS "equipment", product, qty, unit`,
        [employeeId, equipment || null, product, qty, unit, req.params.id, req.params.date]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    rows[0].qty = Number(rows[0].qty);
    res.json(rows[0]);
});

router.delete('/:date/:id', async (req, res) => {
    await pool.query('DELETE FROM output WHERE id=$1 AND date=$2', [req.params.id, req.params.date]);
    res.status(204).end();
});

module.exports = router;
