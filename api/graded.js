const express = require('express');
const router = express.Router();
const { requireAuth } = require('./auth');

// GET /api/graded
router.get('/', requireAuth, async (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM graded_cards WHERE 1=1';
  const params = [];
  if (status) { params.push(status); query += ` AND status = $${params.length}`; }
  query += ' ORDER BY created_at DESC';
  try {
    const { rows } = await req.db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/graded
router.post('/', requireAuth, async (req, res) => {
  const { name, set_name, sent_date, grading_company, expected_return, raw_value } = req.body;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO graded_cards (name, set_name, sent_date, grading_company, expected_return, raw_value)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, set_name, sent_date, grading_company, expected_return, raw_value]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/graded/:id
router.put('/:id', requireAuth, async (req, res) => {
  const { name, set_name, sent_date, grading_company, expected_return, grade_received, raw_value, graded_value, status } = req.body;
  try {
    const { rows } = await req.db.query(
      `UPDATE graded_cards SET name=$1, set_name=$2, sent_date=$3, grading_company=$4,
       expected_return=$5, grade_received=$6, raw_value=$7, graded_value=$8, status=$9
       WHERE id=$10 RETURNING *`,
      [name, set_name, sent_date, grading_company, expected_return, grade_received, raw_value, graded_value, status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/graded/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await req.db.query('DELETE FROM graded_cards WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
