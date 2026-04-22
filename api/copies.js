const express = require('express');
const router  = express.Router();
const { requireAuth } = require('./auth');

// GET /api/copies/:inventoryId — all copies for an item
router.get('/:inventoryId', requireAuth, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      'SELECT * FROM copies WHERE inventory_id = $1 ORDER BY created_at ASC',
      [req.params.inventoryId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/copies/:inventoryId — add a copy
router.post('/:inventoryId', requireAuth, async (req, res) => {
  const { condition, price_paid, date_acquired, notes } = req.body;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO copies (inventory_id, condition, price_paid, date_acquired, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.inventoryId, condition || 'NM', price_paid ?? null, date_acquired || null, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/copies/:copyId — edit a copy
router.put('/:copyId', requireAuth, async (req, res) => {
  const { condition, price_paid, date_acquired, notes } = req.body;
  try {
    const { rows } = await req.db.query(
      `UPDATE copies SET condition=$1, price_paid=$2, date_acquired=$3, notes=$4
       WHERE id=$5 AND status='owned' RETURNING *`,
      [condition, price_paid ?? null, date_acquired || null, notes || null, req.params.copyId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Copy not found or already sold' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/copies/:copyId/sell — mark as sold
router.post('/:copyId/sell', requireAuth, async (req, res) => {
  const { sold_price, sold_date, notes } = req.body;
  try {
    const { rows } = await req.db.query(
      `UPDATE copies
       SET status='sold', sold_price=$1, sold_date=$2, notes=COALESCE($3, notes)
       WHERE id=$4 AND status='owned' RETURNING *`,
      [sold_price ?? null, sold_date || null, notes || null, req.params.copyId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Copy not found or already sold' });
    const copy = rows[0];

    // Record in orders + order_items so Analytics picks it up
    try {
      const price = parseFloat(sold_price) || 0; // parseFloat returns NaN on bad input; || 0 is correct here
      const { rows: orders } = await req.db.query(
        `INSERT INTO orders (customer_name, channel, status, total)
         VALUES ('Walk-in', 'instore', 'fulfilled', $1) RETURNING *`,
        [price]
      );
      await req.db.query(
        `INSERT INTO order_items (order_id, inventory_id, quantity, price_at_sale)
         VALUES ($1, $2, 1, $3)`,
        [orders[0].id, copy.inventory_id, price]
      );
    } catch (analyticsErr) {
      console.error('Analytics record failed (non-fatal):', analyticsErr.message);
    }

    res.json(copy);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/copies/:copyId
router.delete('/:copyId', requireAuth, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      'DELETE FROM copies WHERE id=$1 RETURNING *',
      [req.params.copyId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Copy not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
