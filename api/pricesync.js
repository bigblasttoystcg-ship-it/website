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

// Pick the card result that best matches our set name
function findBestCard(cards, itemSetName) {
  if (!cards?.length) return null;
  if (cards.length === 1) return cards[0];
  if (!itemSetName) return cards[0];

  const setLower = itemSetName.toLowerCase().trim();

  const scored = cards.map(card => {
    const cardSet = (card.set?.name || '').toLowerCase().trim();
    let score = 0;
    if (cardSet === setLower) score = 100;
    else if (cardSet.includes(setLower) || setLower.includes(cardSet)) score = 60;
    else {
      // word overlap — ignore short words like "and", "the"
      const setWords  = setLower.split(/\s+/).filter(w => w.length > 2);
      const cardWords = cardSet.split(/\s+/);
      const overlap   = setWords.filter(w => cardWords.some(cw => cw.includes(w) || w.includes(cw))).length;
      score = overlap * 15;
    }
    return { card, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].card;
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

// GET /api/pricesync/search — search cards by name for the image picker
router.get('/search', requireAuth, async (req, res) => {
  const { name, set } = req.query;
  if (!name || name.length < 2) return res.json([]);
  try {
    const namePart = `name:"${name.replace(/"/g, '')}"`;
    const setPart  = set ? ` set.name:${set.replace(/"/g, '')}` : '';
    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(namePart + setPart)}&pageSize=12&select=name,set,tcgplayer,images`;
    const data = await fetchPokemonTCG(url);
    const cards = (data?.data || [])
      .map(c => ({
        name:         c.name,
        set:          c.set?.name || '',
        img_url:      c.images?.large || c.images?.small || null,
        market_price: extractMarketPrice(c.tcgplayer) || null,
      }))
      .filter(c => c.img_url);
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pricesync/preview — show what prices would change (no DB update)
router.get('/preview', requireAuth, requireAdmin, async (req, res) => {
  const { rows: items } = await req.db.query(
    `SELECT id, name, set_name, price, category FROM inventory WHERE category IN ('singles','graded') ORDER BY name`
  );
  res.json({ total: items.length, message: `${items.length} singles & graded cards will be checked for price updates` });
});

// POST /api/pricesync/run — sync prices for all singles
router.post('/run', requireAuth, requireAdmin, async (req, res) => {
  const { rows: items } = await req.db.query(
    `SELECT id, name, set_name, price, category FROM inventory WHERE category IN ('singles','graded') ORDER BY name`
  );

  if (!items.length) return res.json({ updated: 0, skipped: 0, total: 0 });

  let updated = 0, skipped = 0, errors = [];
  const results = [];

  for (const item of items) {
    try {
      // Build search query
      const namePart = `name:"${item.name.replace(/"/g, '')}"`;
      // No quotes on set name → API does partial match (e.g. "Obsidian Flames" matches "Scarlet & Violet—Obsidian Flames")
      const setPart  = item.set_name ? ` set.name:${item.set_name.replace(/"/g, '')}` : '';
      const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(namePart + setPart)}&pageSize=8&select=name,set,tcgplayer,images`;

      const data = await fetchPokemonTCG(url);

      if (!data?.data?.length) {
        // Try name only if set search failed
        const urlNameOnly = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(namePart)}&pageSize=10&select=name,set,tcgplayer,images`;
        const data2 = await fetchPokemonTCG(urlNameOnly);
        if (!data2?.data?.length) { skipped++; continue; }
        data.data = data2.data;
      }

      const card = findBestCard(data.data, item.set_name);
      const marketPrice = extractMarketPrice(card.tcgplayer);
      const imgUrl = card.images?.large || card.images?.small || null;

      if (!marketPrice && !imgUrl) { skipped++; continue; }

      const oldPrice = parseFloat(item.price);
      const newPrice = marketPrice ? parseFloat(marketPrice.toFixed(2)) : oldPrice;

      await req.db.query(
        'UPDATE inventory SET price = $1, img_url = COALESCE($2, img_url), updated_at = NOW() WHERE id = $3',
        [newPrice, imgUrl, item.id]
      );
      await req.db.query(
        'INSERT INTO price_history (inventory_id, price) VALUES ($1, $2)',
        [item.id, newPrice]
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
    const setPart  = item.set_name ? ` set.name:${item.set_name.replace(/"/g, '')}` : '';
    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(namePart + setPart)}&pageSize=8&select=name,set,tcgplayer,images`;

    let data = await fetchPokemonTCG(url);
    if (!data?.data?.length) {
      const urlNameOnly = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(namePart)}&pageSize=10&select=name,set,tcgplayer,images`;
      data = await fetchPokemonTCG(urlNameOnly);
    }
    const card = findBestCard(data?.data, item.set_name);
    const marketPrice = extractMarketPrice(card?.tcgplayer);
    const imgUrl = card?.images?.large || card?.images?.small || null;

    if (!marketPrice && !imgUrl) return res.status(404).json({ error: 'No data found for this card' });

    const newPrice = marketPrice ? parseFloat(marketPrice.toFixed(2)) : parseFloat(item.price);
    await req.db.query(
      'UPDATE inventory SET price = $1, img_url = COALESCE($2, img_url), updated_at = NOW() WHERE id = $3',
      [newPrice, imgUrl, item.id]
    );
    await req.db.query(
      'INSERT INTO price_history (inventory_id, price) VALUES ($1, $2)',
      [item.id, newPrice]
    );

    res.json({ success: true, name: item.name, old_price: item.price, new_price: newPrice, img_url: imgUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pricesync/debug/:id — test what the API returns for a card (no DB changes)
router.get('/debug/:id', requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await req.db.query('SELECT * FROM inventory WHERE id = $1', [req.params.id]);
  const item = rows[0];
  if (!item) return res.status(404).json({ error: 'Item not found' });

  try {
    const namePart = `name:"${item.name.replace(/"/g, '')}"`;
    const setPart  = item.set_name ? ` set.name:"${item.set_name.replace(/"/g, '')}"` : '';
    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(namePart + setPart)}&pageSize=3&select=name,set,tcgplayer,images`;

    const data = await fetchPokemonTCG(url);
    const urlNameOnly = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(namePart)}&pageSize=3&select=name,set,tcgplayer,images`;
    const dataNameOnly = await fetchPokemonTCG(urlNameOnly);

    res.json({
      item: { id: item.id, name: item.name, set_name: item.set_name, img_url: item.img_url },
      api_key_set: !!POKEMON_TCG_KEY,
      query_with_set: { url, results: data?.data?.length || 0, cards: data?.data?.map(c => ({ name: c.name, set: c.set?.name, img: c.images?.large, market: extractMarketPrice(c.tcgplayer) })) },
      query_name_only: { url: urlNameOnly, results: dataNameOnly?.data?.length || 0, cards: dataNameOnly?.data?.map(c => ({ name: c.name, set: c.set?.name, img: c.images?.large, market: extractMarketPrice(c.tcgplayer) })) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
