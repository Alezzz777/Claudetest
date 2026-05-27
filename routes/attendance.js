const { Router } = require('express');
const pool = require('../db/pool');
const router = Router();

router.get('/:date', async (req, res) => {
    const { rows } = await pool.query(
        'SELECT employee_id AS "employeeId", status FROM attendance WHERE date=$1',
        [req.params.date]
    );
    const map = {};
    rows.forEach(r => { map[r.employeeId] = r.status; });
    res.json(map);
});

router.put('/:date/:employeeId', async (req, res) => {
    const { date, employeeId } = req.params;
    const { status } = req.body;
    await pool.query(
        `INSERT INTO attendance (employee_id, date, status) VALUES ($1,$2,$3)
         ON CONFLICT (employee_id, date) DO UPDATE SET status=$3`,
        [employeeId, date, status]
    );
    res.json({ employeeId: Number(employeeId), date, status });
});

module.exports = router;
