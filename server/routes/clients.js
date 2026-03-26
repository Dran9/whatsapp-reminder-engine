const { Router } = require('express');
const { query } = require('../db');
const adminAuth = require('../middleware/adminAuth');

const router = Router();

// List clients with filters
router.get('/', adminAuth, async (req, res) => {
  try {
    const { status, city, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let sql = 'SELECT * FROM clients WHERE 1=1';
    const params = [];

    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (city) { sql += ' AND city = ?'; params.push(city); }
    if (search) {
      sql += ' AND (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    // Count total
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const countResult = await query(countSql, params);
    const total = countResult[0]?.total || 0;

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const clients = await query(sql, params);
    res.json({ clients, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single client
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const clients = await query('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    if (clients.length === 0) return res.status(404).json({ error: 'No encontrado' });

    const appointments = await query(
      'SELECT * FROM appointments WHERE client_id = ? ORDER BY date_time DESC',
      [req.params.id]
    );

    res.json({ client: clients[0], appointments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create client manually
router.post('/', adminAuth, async (req, res) => {
  try {
    const { phone, first_name, last_name, age, city, country, source, status, fee, notes } = req.body;
    if (!phone || !first_name || !last_name) {
      return res.status(400).json({ error: 'Campos requeridos: phone, first_name, last_name' });
    }

    const result = await query(
      `INSERT INTO clients (phone, first_name, last_name, age, city, country, source, status, fee, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [phone, first_name, last_name, age || null, city || 'Cochabamba', country || 'Bolivia',
       source || 'Otro', status || 'Nuevo', fee || 250, notes || null]
    );

    res.json({ id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'El teléfono ya existe' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Update client
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const fields = ['first_name','last_name','age','city','country','source','status','fee','notes','wants_reschedule','phone'];
    const updates = [];
    const params = [];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(req.body[f]);
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

    params.push(req.params.id);
    await query(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete client
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    await query('DELETE FROM clients WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
