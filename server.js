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
app.use('/api/copies',      require('./api/copies'));

// Auto-migrate: ensure all columns exist (safe to re-run)
(async () => {
  try {
    await pool.query(`
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS img_url TEXT;
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS grade TEXT;
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS variant TEXT;
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS sale_channel TEXT DEFAULT 'both';
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS price_paid NUMERIC(10,2) DEFAULT NULL;
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS date_acquired DATE DEFAULT NULL;
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;
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
      CREATE TABLE IF NOT EXISTS copies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inventory_id TEXT NOT NULL,
        condition TEXT NOT NULL DEFAULT 'NM',
        price_paid NUMERIC(10,2),
        date_acquired DATE,
        status TEXT NOT NULL DEFAULT 'owned',
        sold_price NUMERIC(10,2),
        sold_date DATE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS copies_inventory_id_idx ON copies (inventory_id);
      CREATE INDEX IF NOT EXISTS copies_status_idx ON copies (status);
    `);

    // One-time migration: seed copies from existing inventory stock counts
    const { rows: unmigrated } = await pool.query(`
      SELECT id::text, condition, price_paid, date_acquired,
             COALESCE(online_stock, 0) + COALESCE(instore_stock, 0) AS total_stock
      FROM inventory
      WHERE COALESCE(online_stock, 0) + COALESCE(instore_stock, 0) > 0
        AND NOT EXISTS (SELECT 1 FROM copies WHERE copies.inventory_id = inventory.id::text)
    `);
    for (const item of unmigrated) {
      const count = parseInt(item.total_stock, 10);
      for (let j = 0; j < count; j++) {
        await pool.query(
          `INSERT INTO copies (inventory_id, condition, price_paid, date_acquired, status)
           VALUES ($1, $2, $3, $4, 'owned')`,
          [item.id, item.condition || 'NM', item.price_paid ?? null, item.date_acquired ?? null]
        );
      }
    }
    if (unmigrated.length) console.log(`Migrated ${unmigrated.length} inventory items to copies`);

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
