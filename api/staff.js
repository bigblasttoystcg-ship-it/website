const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { requireAuth, requireAdmin } = require('./auth');

// GET /api/staff (admin only)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      'SELECT id, name, email, role, created_at FROM staff ORDER BY created_at ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/staff (admin only — invite new staff)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await req.db.query(
      'INSERT INTO staff (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role, created_at',
      [name, email.toLowerCase().trim(), hash, role || 'staff']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/staff/:id (admin only)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, role, password } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      const { rows } = await req.db.query(
        'UPDATE staff SET name=$1, role=$2, password_hash=$3 WHERE id=$4 RETURNING id, name, email, role',
        [name, role, hash, req.params.id]
      );
      return res.json(rows[0]);
    }
    const { rows } = await req.db.query(
      'UPDATE staff SET name=$1, role=$2 WHERE id=$3 RETURNING id, name, email, role',
      [name, role, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/staff/:id (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  try {
    await req.db.query('DELETE FROM staff WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
