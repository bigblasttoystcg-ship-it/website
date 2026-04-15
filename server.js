const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Attach db pool to every request
app.use((req, res, next) => { req.db = pool; next(); });

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// API routes
const { router: authRouter } = require('./api/auth');
app.use('/api/auth',      authRouter);
app.use('/api/inventory', require('./api/inventory'));
app.use('/api/orders',    require('./api/orders'));
app.use('/api/graded',    require('./api/graded'));
app.use('/api/staff',     require('./api/staff'));
app.use('/api/settings',  require('./api/settings'));
app.use('/api/import',    require('./api/import'));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected', error: err.message });
  }
});

// Serve admin pages
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Fallback to public site
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`BigBlastToys TCG running on port ${PORT}`);
});
