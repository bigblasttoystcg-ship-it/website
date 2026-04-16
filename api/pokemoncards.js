const express = require('express');
const https   = require('https');
const router  = express.Router();
const { requireAuth, requireAdmin } = require('./auth');

const POKEMON_TCG_KEY = process.env.POKEMONTCG_API_KEY;

const VARIANT_LABELS = {
  normal:                'Normal',
  holofoil:              'Holofoil',
  reverseHolofoil:       'Reverse Holo',
  '1stEditionNormal':    '1st Edition Normal',
  '1stEditionHolofoil':  '1st Edition Holo',
  unlimitedNormal:       'Unlimited Normal',
  unlimitedHolofoil:     'Unlimited Holo',
  masterBallHolofoil:    'Master Ball Holo',
  masterBallNormal:      'Master Ball Normal',
  masterBallReverseHolo: 'Master Ball Reverse Holo',
  pokeballHolofoil:      'Pokeball Holo',
  pokeballNormal:        'Pokeball Normal',
  pokeballReverseHolo:   'Pokeball Reverse Holo',
};

function fetchAPI(url) {
  return new Promise((resolve, reject) => {
    const options = { headers: { 'X-Api-Key': POKEMON_TCG_KEY, 'User-Agent': 'BigBlastToys-Admin/1.0' } };
    https.get(url, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function extractVariants(prices) {
  if (!prices) return [];
  return Object.entries(prices)
    .map(([key, val]) => ({ key, label: VARIANT_LABELS[key] || key, market: val?.market ?? val?.mid ?? null, low: val?.low ?? null, high: val?.high ?? null }))
    .filter(v => v.market !== null);
}

function extractBestPrice(prices) {
  if (!prices) return null;
  const order = ['holofoil','reverseHolofoil','normal','1stEditionHolofoil','unlimitedHolofoil'];
  for (const k of order) { if (prices[k]?.market) return prices[k].market; }
  for (const v of Object.values(prices)) { if (v?.market) return v.market; }
  return null;
}

function rowToCard(r) {
  const prices = r.prices || {};
  return {
    name:         r.name,
    set:          r.set_name,
    variant:      r.rarity || '',
    img_url:      r.img_url,
    variants:     extractVariants(prices),
    market_price: extractBestPrice(prices),
  };
}

// GET /api/pokemoncards/sets?q= — autocomplete set names
router.get('/sets', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  try {
    // Try local DB first
    const { rows } = await req.db.query(
      `SELECT DISTINCT set_name FROM pokemon_cards WHERE set_name ILIKE $1 ORDER BY set_name LIMIT 20`,
      [`%${q}%`]
    );
    if (rows.length) return res.json(rows.map(r => r.set_name).filter(Boolean));

    // Fallback: hit pokemontcg.io sets endpoint
    const data = await fetchAPI(
      `https://api.pokemontcg.io/v2/sets?q=${encodeURIComponent('name:' + q + '*')}&pageSize=20&select=name`
    );
    res.json((data?.data || []).map(s => s.name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pokemoncards/search?name=&set=
router.get('/search', requireAuth, async (req, res) => {
  const { name, set } = req.query;
  if (!name || name.length < 2) return res.json([]);
  try {
    // Try local DB first
    const params = [`%${name}%`];
    let q = 'SELECT * FROM pokemon_cards WHERE name ILIKE $1';
    if (set) { params.push(`%${set}%`); q += ` AND set_name ILIKE $${params.length}`; }
    q += ' ORDER BY name LIMIT 24';
    const { rows } = await req.db.query(q, params);
    if (rows.length) return res.json(rows.map(rowToCard));

    // Fallback: hit pokemontcg.io directly
    const namePart = `name:${name.replace(/"/g, '')}*`;
    const setPart  = set ? ` set.name:${set.replace(/"/g, '')}` : '';
    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(namePart + setPart)}&pageSize=24&select=id,name,set,rarity,tcgplayer,images`;
    const data = await fetchAPI(url);
    res.json((data?.data || []).map(c => ({
      name:         c.name,
      set:          c.set?.name || '',
      variant:      c.rarity   || '',
      img_url:      c.images?.large || c.images?.small || null,
      variants:     extractVariants(c.tcgplayer?.prices),
      market_price: extractBestPrice(c.tcgplayer?.prices),
    })).filter(c => c.img_url));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pokemoncards/sync-status
router.get('/sync-status', requireAuth, requireAdmin, (req, res) => {
  res.json(syncStatus);
});

// POST /api/pokemoncards/sync — full sync, runs in background
let syncStatus = { running: false, processed: 0, total: 0, lastSync: null, error: null };

router.post('/sync', requireAuth, requireAdmin, async (req, res) => {
  if (syncStatus.running) return res.json({ message: 'Sync already in progress', syncStatus });
  res.json({ message: 'Sync started in background', syncStatus });
  runFullSync(req.db).catch(err => { syncStatus.running = false; syncStatus.error = err.message; });
});

// POST /api/pokemoncards/refresh-prices — update prices only (faster than full sync)
router.post('/refresh-prices', requireAuth, requireAdmin, async (req, res) => {
  if (syncStatus.running) return res.json({ message: 'Sync already in progress', syncStatus });
  res.json({ message: 'Price refresh started in background', syncStatus });
  runPriceRefresh(req.db).catch(err => { syncStatus.running = false; syncStatus.error = err.message; });
});

async function runFullSync(db) {
  syncStatus = { running: true, processed: 0, total: 0, lastSync: null, error: null };
  try {
    // Get total count
    const first = await fetchAPI('https://api.pokemontcg.io/v2/cards?pageSize=1&select=id');
    syncStatus.total = first.totalCount || 0;
    const pages = Math.ceil(syncStatus.total / 250);

    for (let page = 1; page <= pages; page++) {
      const data = await fetchAPI(
        `https://api.pokemontcg.io/v2/cards?page=${page}&pageSize=250&select=id,name,set,rarity,images,tcgplayer`
      );
      for (const c of (data.data || [])) {
        await db.query(
          `INSERT INTO pokemon_cards (id, name, set_name, set_id, rarity, img_url, prices, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
           ON CONFLICT (id) DO UPDATE SET
             name=EXCLUDED.name, set_name=EXCLUDED.set_name, set_id=EXCLUDED.set_id,
             rarity=EXCLUDED.rarity, img_url=EXCLUDED.img_url, prices=EXCLUDED.prices,
             updated_at=NOW()`,
          [c.id, c.name, c.set?.name||'', c.set?.id||'', c.rarity||'',
           c.images?.large||c.images?.small||'', JSON.stringify(c.tcgplayer?.prices||null)]
        );
        syncStatus.processed++;
      }
      await new Promise(r => setTimeout(r, 120)); // respect rate limits
    }
    syncStatus.running = false;
    syncStatus.lastSync = new Date().toISOString();
  } catch (err) {
    syncStatus.running = false;
    syncStatus.error = err.message;
    throw err;
  }
}

async function runPriceRefresh(db) {
  syncStatus = { running: true, processed: 0, total: 0, lastSync: null, error: null };
  try {
    const { rows: existing } = await db.query('SELECT COUNT(*) FROM pokemon_cards');
    syncStatus.total = parseInt(existing[0].count);
    const pages = Math.ceil(syncStatus.total / 250);

    for (let page = 1; page <= pages; page++) {
      const data = await fetchAPI(
        `https://api.pokemontcg.io/v2/cards?page=${page}&pageSize=250&select=id,tcgplayer`
      );
      for (const c of (data.data || [])) {
        await db.query(
          `UPDATE pokemon_cards SET prices=$1, updated_at=NOW() WHERE id=$2`,
          [JSON.stringify(c.tcgplayer?.prices||null), c.id]
        );
        syncStatus.processed++;
      }
      await new Promise(r => setTimeout(r, 120));
    }
    syncStatus.running = false;
    syncStatus.lastSync = new Date().toISOString();
  } catch (err) {
    syncStatus.running = false;
    syncStatus.error = err.message;
    throw err;
  }
}

module.exports = router;
