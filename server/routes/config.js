const { Router } = require('express');
const { query } = require('../db');
const adminAuth = require('../middleware/adminAuth');

const router = Router();

// Public config (for booking flow)
router.get('/public', async (req, res) => {
  try {
    const rows = await query('SELECT available_days, window_days, buffer_hours, break_start, break_end, min_age, max_age, appointment_duration, default_fee, capital_fee, capital_cities FROM config WHERE id = 1');
    if (rows.length === 0) return res.status(500).json({ error: 'Config no encontrada' });
    const cfg = rows[0];
    cfg.available_days = typeof cfg.available_days === 'string' ? JSON.parse(cfg.available_days) : cfg.available_days;
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: get full config
router.get('/', adminAuth, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM config WHERE id = 1');
    if (rows.length === 0) return res.status(500).json({ error: 'Config no encontrada' });
    const cfg = rows[0];
    cfg.available_hours = typeof cfg.available_hours === 'string' ? JSON.parse(cfg.available_hours) : cfg.available_hours;
    cfg.available_days = typeof cfg.available_days === 'string' ? JSON.parse(cfg.available_days) : cfg.available_days;
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: update config
router.put('/', adminAuth, async (req, res) => {
  try {
    const {
      available_hours, available_days, window_days, buffer_hours,
      min_age, max_age, appointment_duration, break_start, break_end,
      default_fee, capital_fee, capital_cities
    } = req.body;

    await query(
      `UPDATE config SET
        available_hours = ?, available_days = ?, window_days = ?, buffer_hours = ?,
        min_age = ?, max_age = ?, appointment_duration = ?, break_start = ?, break_end = ?,
        default_fee = ?, capital_fee = ?, capital_cities = ?
      WHERE id = 1`,
      [
        JSON.stringify(available_hours), JSON.stringify(available_days),
        window_days, buffer_hours, min_age, max_age, appointment_duration,
        break_start, break_end, default_fee, capital_fee, capital_cities
      ]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
