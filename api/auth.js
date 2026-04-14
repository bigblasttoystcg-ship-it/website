const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'bigblasttoys-secret-change-in-production';

// Middleware to verify JWT
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Middleware to require admin role
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const { rows } = await req.db.query(
      'SELECT * FROM staff WHERE email = $1', [email.toLowerCase().trim()]
    );
    const staff = rows[0];
    if (!staff) return res.status(401).json({ error: 'Invalid email or password' });
    const valid = await bcrypt.compare(password, staff.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign(
      { id: staff.id, email: staff.email, name: staff.name, role: staff.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: staff.id, name: staff.name, email: staff.email, role: staff.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/create-admin (first-time setup only)
router.post('/create-admin', async (req, res) => {
  const { email, password, name, setupKey } = req.body;
  if (setupKey !== (process.env.SETUP_KEY || 'bigblast-setup')) {
    return res.status(403).json({ error: 'Invalid setup key' });
  }
  try {
    const { rows: existing } = await req.db.query('SELECT id FROM staff WHERE role = $1', ['admin']);
    if (existing.length > 0) return res.status(400).json({ error: 'Admin already exists' });
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await req.db.query(
      'INSERT INTO staff (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, email.toLowerCase().trim(), hash, 'admin']
    );
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, requireAuth, requireAdmin };
