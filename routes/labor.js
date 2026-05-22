const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// List labor entries.
// Master & technologist: see all (with filters).
// Foreman: limited to their own brigade.
// Worker: limited to their own entries.
router.get('/', requireRole('worker', 'foreman', 'master', 'technologist'), async (req, res) => {
    const { from, to, user_id, brigade_id, nomenclature_id } = req.query;
    const params = [];
    const where = [];

    if (req.user.role === 'foreman') {
        // restrict to brigades led by this foreman
        params.push(req.user.id);
        where.push(`l.brigade_id IN (SELECT id FROM brigades WHERE foreman_id = $${params.length})`);
    } else if (req.user.role === 'worker') {
        params.push(req.user.id);
        where.push(`l.user_id = $${params.length}`);
    }
    if (from) { params.push(from); where.push(`l.created_at >= $${params.length}`); }
    if (to)   { params.push(to);   where.push(`l.created_at <= $${params.length}`); }
    if (user_id)         { params.push(parseInt(user_id, 10));         where.push(`l.user_id = $${params.length}`); }
    if (brigade_id)      { params.push(parseInt(brigade_id, 10));      where.push(`l.brigade_id = $${params.length}`); }
    if (nomenclature_id) { params.push(parseInt(nomenclature_id, 10)); where.push(`l.nomenclature_id = $${params.length}`); }

    const sql = `
        SELECT l.id, l.created_at, l.hours,
               l.operation_name, l.brigade_name,
               u.id AS user_id, u.full_name AS user_name,
               i.id AS item_id, i.serial_number, i.barcode,
               n.code AS nom_code, n.name AS nom_name
        FROM labor_log l
        JOIN users u ON u.id = l.user_id
        LEFT JOIN items i ON i.id = l.item_id
        LEFT JOIN nomenclatures n ON n.id = l.nomenclature_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY l.created_at DESC
        LIMIT 500`;
    const { rows } = await db.query(sql, params);

    const totalHours = rows.reduce((s, r) => s + Number(r.hours || 0), 0);
    res.json({ entries: rows, total_hours: totalHours, count: rows.length });
});

// Aggregate by worker for a date range.
router.get('/summary', requireRole('master', 'technologist'), async (req, res) => {
    const { from, to } = req.query;
    const params = [];
    const where = [];
    if (from) { params.push(from); where.push(`l.created_at >= $${params.length}`); }
    if (to)   { params.push(to);   where.push(`l.created_at <= $${params.length}`); }
    const sql = `
        SELECT u.id, u.full_name, u.username,
               COUNT(*)::int AS entries,
               COALESCE(SUM(l.hours), 0)::float AS hours,
               (array_agg(DISTINCT l.brigade_name) FILTER (WHERE l.brigade_name IS NOT NULL)) AS brigades
        FROM labor_log l
        JOIN users u ON u.id = l.user_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        GROUP BY u.id
        ORDER BY hours DESC`;
    const { rows } = await db.query(sql, params);
    res.json(rows);
});

module.exports = router;
