const { Router } = require('express');
const { query } = require('../db');
const adminAuth = require('../middleware/adminAuth');

const router = Router();

// List appointments with filters
router.get('/', adminAuth, async (req, res) => {
  try {
    const { from, to, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let sql = `
      SELECT a.*, c.first_name, c.last_name, c.phone as client_phone
      FROM appointments a
      JOIN clients c ON a.client_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (from) { sql += ' AND a.date_time >= ?'; params.push(from); }
    if (to) { sql += ' AND a.date_time <= ?'; params.push(to + ' 23:59:59'); }
    if (status) { sql += ' AND a.status = ?'; params.push(status); }

    const countSql = sql.replace(/SELECT a\.\*.*FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await query(countSql, params);
    const total = countResult[0]?.total || 0;

    sql += ' ORDER BY a.date_time DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const appointments = await query(sql, params);
    res.json({ appointments, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update appointment status
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const updates = [];
    const params = [];

    if (status) { updates.push('status = ?'); params.push(status); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }

    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

    params.push(req.params.id);
    await query(`UPDATE appointments SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
