const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM locations ORDER BY name');
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Ошибка загрузки локаций' });
  }
});

router.post('/', authorize('dispatcher'), async (req, res) => {
  const { name, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название' });

  try {
    const result = await pool.query(
      'INSERT INTO locations (name, address, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name, address || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Ошибка создания локации' });
  }
});

router.put('/:id', authorize('dispatcher'), async (req, res) => {
  const { name, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название' });

  try {
    const result = await pool.query(
      'UPDATE locations SET name = $1, address = $2 WHERE id = $3 RETURNING *',
      [name, address || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Локация не найдена' });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Ошибка обновления локации' });
  }
});

router.delete('/:id', authorize('dispatcher'), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM locations WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Локация не найдена' });
    res.json({ deleted: true });
  } catch {
    res.status(500).json({ error: 'Ошибка удаления локации' });
  }
});

module.exports = router;
