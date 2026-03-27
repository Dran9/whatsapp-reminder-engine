const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { query } = require('../db');
const adminAuth = require('../middleware/adminAuth');

const router = Router();

// QR upload setup
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const qrStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const fieldName = file.fieldname; // qr_default or qr_capital
    const ext = path.extname(file.originalname) || '.png';
    // Remove old files with different extensions
    for (const oldExt of ['.png', '.jpg', '.jpeg', '.webp']) {
      const oldPath = path.join(uploadsDir, `${fieldName}${oldExt}`);
      if (fs.existsSync(oldPath)) try { fs.unlinkSync(oldPath); } catch {}
    }
    cb(null, `${fieldName}${ext}`);
  },
});
const qrUpload = multer({
  storage: qrStorage,
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpeg|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Solo imágenes PNG, JPG o WebP'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// POST /qr — upload QR image (admin only)
router.post('/qr', adminAuth, qrUpload.any(), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No se recibió archivo' });
  }
  res.json({ success: true, files: req.files.map(f => f.filename) });
});

// GET /qr/:type — serve QR image (public)
router.get('/qr/:type', (req, res) => {
  const type = req.params.type;
  const validTypes = ['default', 'capital', 'qr_300', 'qr_250', 'qr_150', 'qr_generico'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: 'Tipo inválido' });
  }
  const prefix = type.startsWith('qr_') ? type : `qr_${type}`;
  // Find file with any image extension
  const exts = ['.png', '.jpg', '.jpeg', '.webp'];
  for (const ext of exts) {
    const filePath = path.join(uploadsDir, `${prefix}${ext}`);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }
  res.status(404).json({ error: 'QR no encontrado' });
});

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
