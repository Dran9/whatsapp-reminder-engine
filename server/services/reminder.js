const { query } = require('../db');
const { listEvents } = require('./calendar');

async function checkAndSendReminders({ date } = {}) {
  try {
    const calendarId = process.env.CALENDAR_ID || 'danielmacleann@gmail.com';

    const pad = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    let targetDay;
    if (date === 'today') {
      targetDay = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/La_Paz' }));
      targetDay.setHours(0, 0, 0, 0);
    } else {
      targetDay = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/La_Paz' }));
      targetDay.setDate(targetDay.getDate() + 1);
      targetDay.setHours(0, 0, 0, 0);
    }

    const dayAfter = new Date(targetDay);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const timeMin = new Date(`${pad(targetDay)}T00:00:00-04:00`).toISOString();
    const timeMax = new Date(`${pad(dayAfter)}T00:00:00-04:00`).toISOString();

    const label = date === 'today' ? 'today' : 'tomorrow';
    const events = await listEvents(calendarId, timeMin, timeMax);
    console.log(`[reminder] Found ${events.length} events for ${label}`);

    for (const event of events) {
      const summary = event.summary || '';
      // Try to find appointment by gcal_event_id
      const appts = await query(
        `SELECT a.*, c.phone, c.first_name FROM appointments a
         JOIN clients c ON a.client_id = c.id
         WHERE a.gcal_event_id = ? AND a.status = 'Confirmada'`,
        [event.id]
      );

      if (appts.length === 0) continue;

      const appt = appts[0];
      // Check if reminder already sent (within last 24h)
      const logs = await query(
        `SELECT id FROM webhooks_log WHERE client_phone = ? AND type = 'cita_confirmada' AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
        [appt.phone]
      );

      if (logs.length > 0) {
        console.log(`[reminder] Already sent reminder to ${appt.phone}, skipping`);
        continue;
      }

      // Send WhatsApp reminder
      try {
        const { sendConfirmationTemplate } = require('./whatsapp');
        await sendConfirmationTemplate(appt.phone, appt.first_name, appt.date_time);
        await query(
          `INSERT INTO webhooks_log (event, type, payload, status, client_phone) VALUES (?, 'cita_confirmada', ?, 'enviado', ?)`,
          [event.id, JSON.stringify({ appointment_id: appt.id }), appt.phone]
        );
        console.log(`[reminder] Sent reminder to ${appt.phone}`);
      } catch (waErr) {
        console.error(`[reminder] Failed to send to ${appt.phone}:`, waErr.message);
      }
    }
  } catch (err) {
    console.error('[reminder] Error:', err.message);
  }
}

module.exports = { checkAndSendReminders };
