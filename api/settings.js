const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('./auth');

// GET /api/settings (admin only)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await req.db.query('SELECT * FROM settings');
    const settings = {};
    rows.forEach(r => settings[r.key] = r.value);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings (admin only)
router.put('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await req.db.query(
        'INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2',
        [key, value]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
