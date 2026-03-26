const { Router } = require('express');
const { query } = require('../db');
const { listEvents, createEvent } = require('../services/calendar');
const { sendConfirmationTemplate } = require('../services/whatsapp');

const router = Router();

// Get client by phone (public)
router.get('/client/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const clients = await query('SELECT * FROM clients WHERE phone = ?', [phone]);
    if (clients.length === 0) return res.json({ found: false });

    const client = clients[0];
    // Check for active appointment
    const appointments = await query(
      `SELECT * FROM appointments WHERE client_id = ? AND status = 'Confirmada' AND date_time > NOW() ORDER BY date_time ASC LIMIT 1`,
      [client.id]
    );

    res.json({
      found: true,
      client,
      activeAppointment: appointments.length > 0 ? appointments[0] : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create client (onboarding)
router.post('/client', async (req, res) => {
  try {
    const { phone, first_name, last_name, age, city, country, source } = req.body;

    if (!phone || !first_name || !last_name) {
      return res.status(400).json({ error: 'Campos requeridos: phone, first_name, last_name' });
    }

    // Check if already exists
    const existing = await query('SELECT id FROM clients WHERE phone = ?', [phone]);
    if (existing.length > 0) {
      return res.json({ client_id: existing[0].id, existing: true });
    }

    // Determine fee based on city
    const configRows = await query('SELECT default_fee, capital_fee, capital_cities FROM config WHERE id = 1');
    const cfg = configRows[0];
    const capitalCities = (cfg.capital_cities || '').split(',').map(c => c.trim());
    const fee = capitalCities.includes(city) ? cfg.capital_fee : cfg.default_fee;

    const result = await query(
      `INSERT INTO clients (phone, first_name, last_name, age, city, country, source, fee, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Nuevo')`,
      [phone, first_name, last_name, age || null, city || 'Cochabamba', country || 'Bolivia', source || 'Otro', fee]
    );

    res.json({ client_id: result.insertId, existing: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Book appointment
router.post('/book', async (req, res) => {
  try {
    const { client_id, date_time } = req.body;
    if (!client_id || !date_time) {
      return res.status(400).json({ error: 'Campos requeridos: client_id, date_time' });
    }

    const calendarId = process.env.CALENDAR_ID || 'danielmacleann@gmail.com';

    // Get client
    const clients = await query('SELECT * FROM clients WHERE id = ?', [client_id]);
    if (clients.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    const client = clients[0];

    // Get config for duration
    const cfgRows = await query('SELECT appointment_duration FROM config WHERE id = 1');
    const duration = cfgRows[0]?.appointment_duration || 60;

    // Verify slot is still free (race condition check)
    const startDT = new Date(date_time);
    const endDT = new Date(startDT.getTime() + duration * 60 * 1000);
    const dayStr = date_time.split('T')[0];
    const timeMin = new Date(`${dayStr}T00:00:00-04:00`).toISOString();
    const timeMax = new Date(`${dayStr}T23:59:59-04:00`).toISOString();
    const events = await listEvents(calendarId, timeMin, timeMax);

    const slotStartMin = startDT.getHours() * 60 + startDT.getMinutes();
    const slotEndMin = slotStartMin + duration;
    const conflict = events.some(e => {
      const es = new Date(e.start.dateTime || e.start.date);
      const ee = new Date(e.end.dateTime || e.end.date);
      const esLP = new Date(es.toLocaleString('en-US', { timeZone: 'America/La_Paz' }));
      const eeLP = new Date(ee.toLocaleString('en-US', { timeZone: 'America/La_Paz' }));
      const eStart = esLP.getHours() * 60 + esLP.getMinutes();
      const eEnd = eeLP.getHours() * 60 + eeLP.getMinutes();
      return slotStartMin < eEnd && slotEndMin > eStart;
    });

    if (conflict) {
      return res.status(409).json({ error: 'El horario ya no está disponible' });
    }

    // Create GCal event
    const startISO = `${date_time}:00-04:00`;
    const endISO = new Date(new Date(`${date_time}:00-04:00`).getTime() + duration * 60 * 1000);
    const endISOStr = endISO.toISOString().replace('Z', '-04:00');

    const gcalEvent = await createEvent(calendarId, {
      summary: `Sesión - ${client.first_name} ${client.last_name}`,
      description: `Teléfono: ${client.phone}`,
      startDateTime: startISO,
      endDateTime: endISOStr,
    });

    // Count previous appointments for session_number
    const prevAppts = await query(
      'SELECT COUNT(*) as cnt FROM appointments WHERE client_id = ?',
      [client_id]
    );
    const sessionNumber = (prevAppts[0]?.cnt || 0) + 1;
    const isFirst = sessionNumber === 1;

    // Insert appointment
    const result = await query(
      `INSERT INTO appointments (client_id, date_time, gcal_event_id, status, confirmed_at, is_first, session_number, phone)
       VALUES (?, ?, ?, 'Confirmada', NOW(), ?, ?, ?)`,
      [client_id, date_time, gcalEvent.id, isFirst, sessionNumber, client.phone]
    );

    // Update client status to Activo
    await query(
      `UPDATE clients SET status = 'Activo' WHERE id = ? AND status IN ('Nuevo', 'Prospecto')`,
      [client_id]
    );

    // Try to send WhatsApp confirmation (non-blocking)
    try {
      await sendConfirmationTemplate(client.phone, client.first_name, date_time);
    } catch (waErr) {
      console.error('[booking] WhatsApp send failed:', waErr.message);
    }

    res.json({
      success: true,
      appointment: {
        id: result.insertId,
        date_time,
        gcal_event_id: gcalEvent.id,
        session_number: sessionNumber,
      },
    });
  } catch (err) {
    console.error('[booking] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Reschedule
router.post('/reschedule', async (req, res) => {
  try {
    const { client_id, old_appointment_id, date_time } = req.body;
    if (!client_id || !old_appointment_id || !date_time) {
      return res.status(400).json({ error: 'Campos requeridos: client_id, old_appointment_id, date_time' });
    }

    const calendarId = process.env.CALENDAR_ID || 'danielmacleann@gmail.com';

    // Get old appointment
    const oldAppts = await query('SELECT * FROM appointments WHERE id = ? AND client_id = ?', [old_appointment_id, client_id]);
    if (oldAppts.length === 0) return res.status(404).json({ error: 'Cita no encontrada' });
    const oldAppt = oldAppts[0];

    // Cancel old GCal event
    if (oldAppt.gcal_event_id) {
      try {
        const { deleteEvent } = require('../services/calendar');
        await deleteEvent(calendarId, oldAppt.gcal_event_id);
      } catch (delErr) {
        console.error('[reschedule] Failed to delete GCal event:', delErr.message);
      }
    }

    // Mark old as Reagendada
    await query(`UPDATE appointments SET status = 'Reagendada' WHERE id = ?`, [old_appointment_id]);

    // Book new (reuse /book logic via internal call)
    // Get client
    const clients = await query('SELECT * FROM clients WHERE id = ?', [client_id]);
    const client = clients[0];
    const cfgRows = await query('SELECT appointment_duration FROM config WHERE id = 1');
    const duration = cfgRows[0]?.appointment_duration || 60;

    const { createEvent } = require('../services/calendar');
    const startISO = `${date_time}:00-04:00`;
    const endDT = new Date(new Date(`${date_time}:00-04:00`).getTime() + duration * 60 * 1000);

    const gcalEvent = await createEvent(calendarId, {
      summary: `Sesión - ${client.first_name} ${client.last_name}`,
      description: `Teléfono: ${client.phone}`,
      startDateTime: startISO,
      endDateTime: endDT.toISOString(),
    });

    const prevAppts = await query('SELECT COUNT(*) as cnt FROM appointments WHERE client_id = ?', [client_id]);
    const sessionNumber = (prevAppts[0]?.cnt || 0) + 1;

    const result = await query(
      `INSERT INTO appointments (client_id, date_time, gcal_event_id, status, confirmed_at, session_number, phone)
       VALUES (?, ?, ?, 'Confirmada', NOW(), ?, ?)`,
      [client_id, date_time, gcalEvent.id, sessionNumber, client.phone]
    );

    await query(`UPDATE clients SET wants_reschedule = FALSE WHERE id = ?`, [client_id]);

    res.json({
      success: true,
      appointment: {
        id: result.insertId,
        date_time,
        gcal_event_id: gcalEvent.id,
      },
    });
  } catch (err) {
    console.error('[reschedule] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
