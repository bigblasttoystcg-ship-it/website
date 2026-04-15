const express = require('express');
const https = require('https');
const router = express.Router();
const { requireAuth, requireAdmin } = require('./auth');

const POKEMON_TCG_KEY = process.env.POKEMONTCG_API_KEY;

// Fetch from Pokemon TCG API
function fetchPokemonTCG(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'X-Api-Key': POKEMON_TCG_KEY,
        'User-Agent': 'BigBlastToys-Admin/1.0'
      }
    };
    https.get(url, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid response from Pokemon TCG API')); }
      });
    }).on('error', reject);
  });
}

// Extract best market price from TCGPlayer price object
function extractMarketPrice(tcgplayer) {
  if (!tcgplayer?.prices) return null;
  const variants = ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', 'unlimitedHolofoil'];
  for (const v of variants) {
    if (tcgplayer.prices[v]?.market) return tcgplayer.prices[v].market;
  }
  // fallback: first available market price
  for (const v of Object.values(tcgplayer.prices)) {
    if (v?.market) return v.market;
  }
  return null;
}

// GET /api/pricesync/preview — show what prices would change (no DB update)
router.get('/preview', requireAuth, requireAdmin, async (req, res) => {
  const { rows: items } = await req.db.query(
    `SELECT id, name, set_name, price FROM inventory WHERE category = 'singles' ORDER BY name`
  );
  res.json({ total: items.length, message: `${items.length} singles will be checked for price updates` });
});

// POST /api/pricesync/run — sync prices for all singles
router.post('/run', requireAuth, requireAdmin, async (req, res) => {
  const { rows: items } = await req.db.query(
    `SELECT id, name, set_name, price FROM inventory WHERE category = 'singles' ORDER BY name`
  );

  if (!items.length) return res.json({ updated: 0, skipped: 0, total: 0 });

  let updated = 0, skipped = 0, errors = [];
  const results = [];

  for (const item of items) {
    try {
      // Build search query
      const namePart = `name:"${item.name.replace(/"/g, '')}"`;
      const setPart  = item.set_name ? ` set.name:"${item.set_name.replace(/"/g, '')}"` : '';
      const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(namePart + setPart)}&pageSize=5&select=name,set,tcgplayer,images`;

      const data = await fetchPokemonTCG(url);

      if (!data?.data?.length) {
        // Try name only if set search failed
        const urlNameOnly = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(namePart)}&pageSize=3&select=name,set,tcgplayer,images`;
        const data2 = await fetchPokemonTCG(urlNameOnly);
        if (!data2?.data?.length) { skipped++; continue; }
        data.data = data2.data;
      }

      const card = data.data[0];
      const marketPrice = extractMarketPrice(card.tcgplayer);
      const imgUrl = card.images?.large || card.images?.small || null;

      if (!marketPrice && !imgUrl) { skipped++; continue; }

      const oldPrice = parseFloat(item.price);
      const newPrice = marketPrice ? parseFloat(marketPrice.toFixed(2)) : oldPrice;

      await req.db.query(
        'UPDATE inventory SET price = $1, img_url = COALESCE($2, img_url) WHERE id = $3',
        [newPrice, imgUrl, item.id]
      );

      results.push({ name: item.name, set_name: item.set_name, old_price: oldPrice, new_price: newPrice, img_url: imgUrl });
      updated++;

      // Small delay to respect rate limits
      await new Promise(r => setTimeout(r, 100));

    } catch (err) {
      errors.push(`${item.name}: ${err.message}`);
      skipped++;
    }
  }

  res.json({ updated, skipped, total: items.length, results, errors: errors.slice(0, 10) });
});

// POST /api/pricesync/single/:id — sync price for one item
router.post('/single/:id', requireAuth, async (req, res) => {
  const { rows } = await req.db.query('SELECT * FROM inventory WHERE id = $1', [req.params.id]);
  const item = rows[0];
  if (!item) return res.status(404).json({ error: 'Item not found' });

  try {
    const namePart = `name:"${item.name.replace(/"/g, '')}"`;
    const setPart  = item.set_name ? ` set.name:"${item.set_name.replace(/"/g, '')}"` : '';
    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(namePart + setPart)}&pageSize=5&select=name,set,tcgplayer,images`;

    const data = await fetchPokemonTCG(url);
    const card = data?.data?.[0];
    const marketPrice = extractMarketPrice(card?.tcgplayer);
    const imgUrl = card?.images?.large || card?.images?.small || null;

    if (!marketPrice && !imgUrl) return res.status(404).json({ error: 'No data found for this card' });

    const newPrice = marketPrice ? parseFloat(marketPrice.toFixed(2)) : parseFloat(item.price);
    await req.db.query(
      'UPDATE inventory SET price = $1, img_url = COALESCE($2, img_url) WHERE id = $3',
      [newPrice, imgUrl, item.id]
    );

    res.json({ success: true, name: item.name, old_price: item.price, new_price: newPrice, img_url: imgUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
