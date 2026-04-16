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
app.use('/api/sales',     require('./api/sales'));
app.use('/api/pricesync',    require('./api/pricesync'));
app.use('/api/pokemoncards', require('./api/pokemoncards'));

// Auto-migrate: ensure all columns exist (safe to re-run)
(async () => {
  try {
    await pool.query(`
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS img_url TEXT;
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS grade TEXT;
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS variant TEXT;
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS sale_channel TEXT DEFAULT 'both';
      CREATE TABLE IF NOT EXISTS price_history (
        id SERIAL PRIMARY KEY,
        inventory_id TEXT NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        recorded_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS pokemon_cards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        set_name TEXT,
        set_id TEXT,
        rarity TEXT,
        img_url TEXT,
        prices JSONB,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS pokemon_cards_name_idx ON pokemon_cards (name text_pattern_ops);
    `);
    console.log('DB migration OK');
  } catch (err) {
    console.error('DB migration error:', err.message);
  }
})();

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
