const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('./auth');

// POST /api/sales — record a sale and deduct from inventory
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { inventory_id, quantity, channel, customer_name, sale_price } = req.body;

  if (!inventory_id || !quantity || !channel) {
    return res.status(400).json({ error: 'inventory_id, quantity and channel are required' });
  }

  try {
    // 1. Fetch the inventory item
    const { rows: items } = await req.db.query(
      'SELECT * FROM inventory WHERE id = $1', [inventory_id]
    );
    const item = items[0];
    if (!item) return res.status(404).json({ error: 'Item not found in inventory' });

    // 2. Check stock for the correct channel
    const availableStock = channel === 'online' ? item.online_stock : item.instore_stock;
    if (availableStock < quantity) {
      return res.status(400).json({
        error: `Not enough ${channel} stock. Available: ${availableStock}, Requested: ${quantity}`
      });
    }

    // 3. Create the order
    const price = sale_price || item.price;
    const total = price * quantity;
    const { rows: orders } = await req.db.query(
      `INSERT INTO orders (customer_name, channel, status, total)
       VALUES ($1, $2, 'fulfilled', $3) RETURNING *`,
      [customer_name || 'Walk-in', channel, total]
    );
    const order = orders[0];

    // 4. Create order item
    await req.db.query(
      `INSERT INTO order_items (order_id, inventory_id, quantity, price_at_sale)
       VALUES ($1, $2, $3, $4)`,
      [order.id, inventory_id, quantity, price]
    );

    // 5. Deduct from correct stock column
    const stockCol = channel === 'online' ? 'online_stock' : 'instore_stock';
    await req.db.query(
      `UPDATE inventory SET ${stockCol} = ${stockCol} - $1 WHERE id = $2`,
      [quantity, inventory_id]
    );

    res.json({
      success: true,
      order,
      item: {
        name: item.name,
        set_name: item.set_name,
        grade: item.grade,
        condition: item.condition,
        remaining_online: channel === 'online' ? item.online_stock - quantity : item.online_stock,
        remaining_instore: channel === 'instore' ? item.instore_stock - quantity : item.instore_stock,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
