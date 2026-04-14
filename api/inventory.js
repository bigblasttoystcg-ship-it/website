const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('./auth');

// GET /api/inventory
router.get('/', requireAuth, async (req, res) => {
  const { search, category, condition, stock } = req.query;
  let query = 'SELECT * FROM inventory WHERE 1=1';
  const params = [];
  if (search) { params.push(`%${search}%`); query += ` AND (name ILIKE $${params.length} OR set_name ILIKE $${params.length})`; }
  if (category) { params.push(category); query += ` AND category = $${params.length}`; }
  if (condition) { params.push(condition); query += ` AND condition = $${params.length}`; }
  if (stock === 'low') query += ` AND (online_stock + instore_stock) <= low_stock_threshold`;
  if (stock === 'out') query += ` AND online_stock = 0`;
  query += ' ORDER BY updated_at DESC';
  try {
    const { rows } = await req.db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await req.db.query('SELECT * FROM inventory WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, set_name, variant, category, condition, price, online_stock, instore_stock, low_stock_threshold, img_url } = req.body;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO inventory (name, set_name, variant, category, condition, price, online_stock, instore_stock, low_stock_threshold, img_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [name, set_name, variant, category, condition || 'NM', price || 0, online_stock || 0, instore_stock || 0, low_stock_threshold || 3, img_url]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inventory/:id
router.put('/:id', requireAuth, async (req, res) => {
  const { name, set_name, variant, category, condition, price, online_stock, instore_stock, low_stock_threshold, img_url } = req.body;
  try {
    const { rows } = await req.db.query(
      `UPDATE inventory SET name=$1, set_name=$2, variant=$3, category=$4, condition=$5,
       price=$6, online_stock=$7, instore_stock=$8, low_stock_threshold=$9, img_url=$10
       WHERE id=$11 RETURNING *`,
      [name, set_name, variant, category, condition, price, online_stock, instore_stock, low_stock_threshold, img_url, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/inventory/:id/stock (quick stock update)
router.patch('/:id/stock', requireAuth, async (req, res) => {
  const { online_stock, instore_stock } = req.body;
  try {
    const { rows } = await req.db.query(
      'UPDATE inventory SET online_stock=$1, instore_stock=$2 WHERE id=$3 RETURNING *',
      [online_stock, instore_stock, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/inventory/:id (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await req.db.query('DELETE FROM inventory WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
