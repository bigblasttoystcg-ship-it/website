const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('./auth');

// GET /api/orders
router.get('/', requireAuth, async (req, res) => {
  const { channel, status } = req.query;
  let query = 'SELECT * FROM orders WHERE 1=1';
  const params = [];
  if (channel) { params.push(channel); query += ` AND channel = $${params.length}`; }
  if (status) { params.push(status); query += ` AND status = $${params.length}`; }
  query += ' ORDER BY created_at DESC';
  try {
    const { rows } = await req.db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:id (with line items)
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: order } = await req.db.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!order[0]) return res.status(404).json({ error: 'Not found' });
    const { rows: items } = await req.db.query(
      `SELECT oi.*, i.name, i.set_name, i.img_url FROM order_items oi
       LEFT JOIN inventory i ON i.id = oi.inventory_id
       WHERE oi.order_id = $1`, [req.params.id]
    );
    res.json({ ...order[0], items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { customer_name, channel, items } = req.body;
  try {
    const total = (items || []).reduce((s, i) => s + (i.price_at_sale * i.quantity), 0);
    const { rows } = await req.db.query(
      'INSERT INTO orders (customer_name, channel, total) VALUES ($1,$2,$3) RETURNING *',
      [customer_name, channel, total]
    );
    const order = rows[0];
    for (const item of (items || [])) {
      await req.db.query(
        'INSERT INTO order_items (order_id, inventory_id, quantity, price_at_sale) VALUES ($1,$2,$3,$4)',
        [order.id, item.inventory_id, item.quantity, item.price_at_sale]
      );
    }
    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/:id/status
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const { status } = req.body;
  try {
    const { rows } = await req.db.query(
      'UPDATE orders SET status=$1 WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/analytics/summary
router.get('/analytics/summary', requireAuth, requireAdmin, async (req, res) => {
  const { days = 30 } = req.query;
  try {
    const { rows } = await req.db.query(`
      SELECT
        DATE(created_at) as date,
        channel,
        SUM(total) as revenue,
        COUNT(*) as order_count
      FROM orders
      WHERE status = 'fulfilled'
        AND created_at >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE(created_at), channel
      ORDER BY date ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
