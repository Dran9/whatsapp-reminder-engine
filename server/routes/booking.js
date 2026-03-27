const { Router } = require('express');
const { query } = require('../db');
const { listEvents, createEvent, deleteEvent } = require('../services/calendar');
const { sendConfirmationTemplate } = require('../services/whatsapp');

const router = Router();

// ─── Helper: verify slot is free and create booking ─────────────
async function createBooking(client, date_time) {
  const calendarId = process.env.CALENDAR_ID || 'danielmacleann@gmail.com';
  const cfgRows = await query('SELECT appointment_duration FROM config WHERE id = 1');
  const duration = cfgRows[0]?.appointment_duration || 60;

  // Verify slot is still free (race condition check)
  const startDT = new Date(date_time);
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
    return { error: 'El horario ya no está disponible', status: 409 };
  }

  // Create GCal event — both times in -04:00 (La Paz) format
  const startISO = `${date_time}:00-04:00`;
  const [dateStr, timeStr] = date_time.split('T');
  const [hh, mm] = timeStr.split(':').map(Number);
  const totalMin = hh * 60 + mm + duration;
  const endH = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
  const endM = String(totalMin % 60).padStart(2, '0');
  const endISO = `${dateStr}T${endH}:${endM}:00-04:00`;

  let gcalEvent;
  try {
    gcalEvent = await createEvent(calendarId, {
      summary: `Terapia ${client.first_name} ${client.last_name} - ${client.phone}`,
      description: `Teléfono: ${client.phone}`,
      startDateTime: startISO,
      endDateTime: endISO,
    });
    console.log(`[booking] GCal event created: ${gcalEvent.id} for ${date_time}`);
  } catch (gcalErr) {
    console.error('[booking] GCal create FAILED:', gcalErr.message, gcalErr.response?.data || '');
    throw new Error('No se pudo crear el evento en Google Calendar');
  }

  // Count previous appointments for session_number
  const prevAppts = await query('SELECT COUNT(*) as cnt FROM appointments WHERE client_id = ?', [client.id]);
  const sessionNumber = (prevAppts[0]?.cnt || 0) + 1;
  const isFirst = sessionNumber === 1;

  // Insert appointment
  const result = await query(
    `INSERT INTO appointments (client_id, date_time, gcal_event_id, status, confirmed_at, is_first, session_number, phone)
     VALUES (?, ?, ?, 'Confirmada', NOW(), ?, ?, ?)`,
    [client.id, date_time, gcalEvent.id, isFirst, sessionNumber, client.phone]
  );

  // Update client status to Activo
  await query(
    `UPDATE clients SET status = 'Activo' WHERE id = ? AND status IN ('Nuevo', 'Prospecto')`,
    [client.id]
  );

  // WhatsApp confirmation disabled — will be replaced by QR-based flow
  // try {
  //   await sendConfirmationTemplate(client.phone, client.first_name, date_time);
  // } catch (waErr) {
  //   console.error('[booking] WhatsApp send failed:', waErr.message);
  // }

  return {
    success: true,
    appointment: {
      id: result.insertId,
      date_time,
      gcal_event_id: gcalEvent.id,
      session_number: sessionNumber,
    },
  };
}

// ─── Helper: create client from onboarding data ─────────────────
async function createClient(phone, onboarding) {
  const { first_name, last_name, age, city, country, source } = onboarding;

  const configRows = await query('SELECT default_fee, capital_fee, capital_cities FROM config WHERE id = 1');
  const cfg = configRows[0];
  const capitalCities = (cfg.capital_cities || '').split(',').map(c => c.trim());
  const fee = capitalCities.includes(city) ? cfg.capital_fee : cfg.default_fee;

  const result = await query(
    `INSERT INTO clients (phone, first_name, last_name, age, city, country, source, fee, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Nuevo')`,
    [phone, first_name, last_name, age || null, city || 'Cochabamba', country || 'Bolivia', source || 'Otro', fee]
  );

  const clients = await query('SELECT * FROM clients WHERE id = ?', [result.insertId]);
  return clients[0];
}

// ─── GET /client/:phone (kept for admin panel & Render) ─────────
router.get('/client/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const clients = await query('SELECT * FROM clients WHERE phone = ?', [phone]);
    if (clients.length === 0) return res.json({ found: false });

    const client = clients[0];
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

// ─── POST /client (kept for admin panel) ────────────────────────
router.post('/client', async (req, res) => {
  try {
    const { phone, first_name, last_name, age, city, country, source } = req.body;

    if (!phone || !first_name || !last_name) {
      return res.status(400).json({ error: 'Campos requeridos: phone, first_name, last_name' });
    }

    const existing = await query('SELECT id FROM clients WHERE phone = ?', [phone]);
    if (existing.length > 0) {
      return res.json({ client_id: existing[0].id, existing: true });
    }

    const client = await createClient(phone, { first_name, last_name, age, city, country, source });
    res.json({ client_id: client.id, existing: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /client/check — Check client status before booking ────
// Returns client status WITHOUT creating anything
router.post('/client/check', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Campo requerido: phone' });

    const clients = await query('SELECT * FROM clients WHERE phone = ?', [phone]);

    if (clients.length === 0) {
      return res.json({ status: 'new' });
    }

    const client = clients[0];

    // Check for active future appointment
    const appointments = await query(
      `SELECT * FROM appointments WHERE client_id = ? AND status = 'Confirmada' AND date_time > NOW() ORDER BY date_time ASC LIMIT 1`,
      [client.id]
    );

    if (appointments.length > 0) {
      return res.json({
        status: 'has_appointment',
        client_name: client.first_name,
        client_id: client.id,
        appointment: { id: appointments[0].id, date_time: appointments[0].date_time },
      });
    }

    return res.json({
      status: 'returning',
      client_name: client.first_name,
      client_id: client.id,
    });
  } catch (err) {
    console.error('[client/check] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /book — Unified booking endpoint ──────────────────────
// Accepts EITHER { phone, date_time, onboarding? } (public flow)
// OR { client_id, date_time } (admin/legacy flow)
router.post('/book', async (req, res) => {
  try {
    const { phone, date_time, onboarding, client_id } = req.body;

    // Legacy flow (admin panel): uses client_id directly
    if (client_id && !phone) {
      if (!date_time) return res.status(400).json({ error: 'Campos requeridos: client_id, date_time' });
      const clients = await query('SELECT * FROM clients WHERE id = ?', [client_id]);
      if (clients.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
      const result = await createBooking(clients[0], date_time);
      if (result.error) return res.status(result.status).json({ error: result.error });
      return res.json(result);
    }

    // New public flow: uses phone
    if (!phone || !date_time) {
      return res.status(400).json({ error: 'Campos requeridos: phone, date_time' });
    }

    // Look up client by phone
    const clients = await query('SELECT * FROM clients WHERE phone = ?', [phone]);

    if (clients.length === 0) {
      // Client not found
      if (!onboarding || !onboarding.first_name || !onboarding.last_name) {
        // Need onboarding data
        return res.json({ status: 'needs_onboarding' });
      }
      // Create client and book
      const newClient = await createClient(phone, onboarding);
      const result = await createBooking(newClient, date_time);
      if (result.error) return res.status(result.status).json({ error: result.error });
      return res.json({ status: 'booked', ...result });
    }

    const client = clients[0];

    // Check for active appointment
    const appointments = await query(
      `SELECT * FROM appointments WHERE client_id = ? AND status = 'Confirmada' AND date_time > NOW() ORDER BY date_time ASC LIMIT 1`,
      [client.id]
    );

    if (appointments.length > 0) {
      return res.json({
        status: 'has_appointment',
        appointment: { id: appointments[0].id, date_time: appointments[0].date_time },
        client_id: client.id,
        client_name: client.first_name,
      });
    }

    // Book directly
    const result = await createBooking(client, date_time);
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.json({ status: 'booked', ...result });
  } catch (err) {
    console.error('[booking] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /reschedule ───────────────────────────────────────────
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
        await deleteEvent(calendarId, oldAppt.gcal_event_id);
      } catch (delErr) {
        console.error('[reschedule] Failed to delete GCal event:', delErr.message);
      }
    }

    // Mark old as Reagendada
    await query(`UPDATE appointments SET status = 'Reagendada' WHERE id = ?`, [old_appointment_id]);

    // Book new using shared helper
    const clients = await query('SELECT * FROM clients WHERE id = ?', [client_id]);
    const client = clients[0];
    const result = await createBooking(client, date_time);
    if (result.error) return res.status(result.status).json({ error: result.error });

    await query(`UPDATE clients SET wants_reschedule = FALSE WHERE id = ?`, [client_id]);

    res.json({ status: 'rescheduled', ...result });
  } catch (err) {
    console.error('[reschedule] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
