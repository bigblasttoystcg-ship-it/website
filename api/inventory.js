const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('./auth');

// GET /api/inventory
router.get('/', requireAuth, async (req, res) => {
  const { search, category, condition, stock, channel, set_name } = req.query;
  let query = `
    SELECT i.*,
           COUNT(c.id) FILTER (WHERE c.status = 'owned') AS copy_count
    FROM inventory i
    LEFT JOIN copies c ON c.inventory_id = i.id::text
    WHERE 1=1`;
  const params = [];
  if (search)    { params.push(`%${search}%`);   query += ` AND (i.name ILIKE $${params.length} OR i.set_name ILIKE $${params.length})`; }
  if (category)  { params.push(category);         query += ` AND i.category = $${params.length}`; }
  if (condition) { params.push(condition);         query += ` AND i.condition = $${params.length}`; }
  if (set_name)  { params.push(`%${set_name}%`);  query += ` AND i.set_name ILIKE $${params.length}`; }
  if (channel === 'online')  query += ` AND (i.sale_channel = 'online'  OR i.sale_channel = 'both' OR i.sale_channel IS NULL)`;
  if (channel === 'instore') query += ` AND (i.sale_channel = 'instore' OR i.sale_channel = 'both' OR i.sale_channel IS NULL)`;
  query += ' GROUP BY i.id ORDER BY i.updated_at DESC';
  if (stock === 'low') query = `SELECT * FROM (${query}) sub WHERE copy_count > 0 AND copy_count <= sub.low_stock_threshold`;
  if (stock === 'out') query = `SELECT * FROM (${query}) sub WHERE copy_count = 0`;
  try {
    const { rows } = await req.db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/:id/history
router.get('/:id/history', requireAuth, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      'SELECT price, recorded_at FROM price_history WHERE inventory_id = $1 ORDER BY recorded_at ASC',
      [req.params.id]
    );
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
  const { name, set_name, variant, category, condition, price, online_stock, instore_stock, low_stock_threshold, img_url, grade, sale_channel, price_paid, date_acquired, notes } = req.body;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO inventory (name, set_name, variant, category, condition, price, online_stock, instore_stock, low_stock_threshold, img_url, grade, sale_channel, price_paid, date_acquired, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [name, set_name, variant, category, condition || 'NM', price || 0, online_stock || 0, instore_stock || 0, low_stock_threshold || 3, img_url, grade || null, sale_channel || 'both', price_paid || null, date_acquired || null, notes || null]
    );
    const item = rows[0];
    // Auto-record price history so chart is immediately populated
    if (item.price && parseFloat(item.price) > 0) {
      await req.db.query('INSERT INTO price_history (inventory_id, price) VALUES ($1, $2)', [item.id, item.price]);
    }
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inventory/:id
router.put('/:id', requireAuth, async (req, res) => {
  const { name, set_name, variant, category, condition, price, online_stock, instore_stock, low_stock_threshold, img_url, grade, sale_channel, price_paid, date_acquired, notes } = req.body;
  try {
    // Fetch old price to detect changes
    const { rows: old } = await req.db.query('SELECT price FROM inventory WHERE id = $1', [req.params.id]);
    const { rows } = await req.db.query(
      `UPDATE inventory SET name=$1, set_name=$2, variant=$3, category=$4, condition=$5,
       price=$6, online_stock=$7, instore_stock=$8, low_stock_threshold=$9, img_url=$10, grade=$11, sale_channel=$12, price_paid=$13,
       date_acquired=$14, notes=$15
       WHERE id=$16 RETURNING *`,
      [name, set_name, variant, category, condition, price, online_stock, instore_stock, low_stock_threshold, img_url, grade || null, sale_channel || 'both', price_paid || null, date_acquired || null, notes || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    // Record price history whenever price changes (so chart is always up to date)
    const newPrice = parseFloat(price) || 0;
    const oldPrice = old[0] ? parseFloat(old[0].price) : null;
    if (newPrice > 0 && newPrice !== oldPrice) {
      await req.db.query('INSERT INTO price_history (inventory_id, price) VALUES ($1, $2)', [req.params.id, newPrice]);
    }
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
