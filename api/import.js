const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse');
const router = express.Router();
const { requireAuth, requireAdmin } = require('./auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Map Collector condition to DB condition
function mapCondition(c) {
  const s = (c || '').toLowerCase().trim();
  if (s.includes('near mint') || s === 'nm') return 'NM';
  if (s.includes('lightly') || s === 'lp') return 'LP';
  if (s.includes('moderately') || s === 'mp') return 'MP';
  if (s.includes('heavily') || s === 'hp') return 'HP';
  if (s.includes('damage') || s === 'dmg') return 'DMG';
  return 'NM';
}

// Parse price string — handles "1,025.24" format
function parsePrice(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace(/,/g, '')) || 0;
}

// Parse grade info from Grade field e.g. "PSA 10.0 GEM - MT"
function parseGrade(grade) {
  if (!grade || grade.toLowerCase() === 'ungraded') return null;
  const companies = ['PSA', 'BGS', 'CGC'];
  const company = companies.find(c => grade.toUpperCase().startsWith(c)) || null;
  const match = grade.match(/(\d+(\.\d+)?)/);
  const gradeNum = match ? match[1] : null;
  return { company, gradeNum, raw: grade };
}

// POST /api/import/collector
router.post('/collector', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const records = await new Promise((resolve, reject) => {
    parse(req.file.buffer.toString('utf8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }, (err, data) => err ? reject(err) : resolve(data));
  }).catch(err => res.status(400).json({ error: 'Invalid CSV: ' + err.message }));

  if (!records) return;

  let imported = 0, skipped = 0, errors = [];

  for (const row of records) {
    try {
      const name      = row['Product Name']?.trim();
      if (!name) { skipped++; continue; }

      const set_name  = row['Set']?.trim() || null;
      const rarity    = row['Rarity']?.trim() || '';
      const variance  = row['Variance']?.trim() || '';
      const variant   = [rarity, variance].filter(Boolean).join(' — ') || null;
      const condition = mapCondition(row['Card Condition']);
      const quantity  = parseInt(row['Quantity']) || 0;
      const marketPrice = parsePrice(row['Market Price (As of 2026-04-15)'] || row['Market Price']);
      const override  = parsePrice(row['Price Override']);
      const price     = override > 0 ? override : marketPrice;
      const gradeInfo = parseGrade(row['Grade']);
      const category  = gradeInfo ? 'graded' : 'singles';

      // Check if item already exists (by name + set + condition)
      const { rows: existing } = await req.db.query(
        'SELECT id FROM inventory WHERE name = $1 AND set_name IS NOT DISTINCT FROM $2 AND condition = $3',
        [name, set_name, condition]
      );

      const grade = gradeInfo ? gradeInfo.raw : null;

      if (existing.length > 0) {
        // Update stock, price and grade
        await req.db.query(
          'UPDATE inventory SET online_stock = online_stock + $1, price = $2, grade = $3 WHERE id = $4',
          [quantity, price, grade, existing[0].id]
        );
      } else {
        // Insert new item
        await req.db.query(
          `INSERT INTO inventory (name, set_name, variant, category, condition, price, online_stock, instore_stock, grade)
           VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8)`,
          [name, set_name, variant, category, condition, price, quantity, grade]
        );
      }
      imported++;
    } catch (err) {
      errors.push(`Row "${row['Product Name']}": ${err.message}`);
      skipped++;
    }
  }

  res.json({
    success: true,
    imported,
    skipped,
    total: records.length,
    errors: errors.slice(0, 10),
  });
});

module.exports = router;
