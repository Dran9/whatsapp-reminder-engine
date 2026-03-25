const express = require('express');
const path = require('path');
const { getUpcomingEvents, confirmEvent } = require('./calendar');
const { sendReminderTemplate } = require('./whatsapp');
const { wasAlreadySent, markAsSent, resetSent } = require('./db');
const { getAvailableSlots } = require('./slots');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const PORT = process.env.PORT || 3000;

// ─── Health check ───────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Enviar recordatorios ───────────────────────────────────
app.post('/send-reminders', async (req, res) => {
  try {
    const events = await getUpcomingEvents();
    const results = [];

    for (const evt of events) {
      if (!evt.contactPhone) {
        results.push({ event: evt.id, status: 'skipped_no_phone' });
        continue;
      }

      if (wasAlreadySent(evt.id, evt.contactPhone)) {
        results.push({ event: evt.id, phone: evt.contactPhone, status: 'already_sent' });
        continue;
      }

      await sendReminderTemplate(evt.contactPhone, evt.contactName, evt.start);
      markAsSent(evt.id, evt.contactPhone);
      results.push({ event: evt.id, phone: evt.contactPhone, name: evt.contactName, status: 'sent' });
    }

    res.json({ processed: events.length, results });
  } catch (err) {
    console.error('Error sending reminders:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Reset (dev only) ───────────────────────────────────────
app.get('/reset-sent', (_req, res) => {
  const deleted = resetSent();
  res.json({ status: 'ok', deleted });
});

// ─── Webhook de WhatsApp (verificacion + mensajes entrantes) ─
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('Webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return res.sendStatus(404);

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const messages = change.value?.messages || [];
      for (const msg of messages) {
        const from = msg.from;
        const payload = msg.button?.payload || msg.interactive?.button_reply?.id || '';
        console.log(`Mensaje de ${from}, payload: ${payload}`);
        if (payload === 'CONFIRM_NOW') {
          try {
            await confirmEvent(from);
            console.log(`Evento confirmado para ${from}`);
          } catch (e) {
            console.error(`Error confirmando para ${from}:`, e.message);
          }
        }
      }
    }
  }
  res.sendStatus(200);
});

// ─── Available slots ─────────────────────────────────────────
app.get('/available-slots', async (req, res) => {
  const { date, calendarId } = req.query;
  if (!date || !calendarId) {
    return res.status(400).json({ error: 'Faltan parámetros: date y calendarId' });
  }
  try {
    const data = await getAvailableSlots(calendarId, date);
    res.json(data);
  } catch (err) {
    console.error('Error GCal:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`whatsapp-reminder-engine running on port ${PORT}`);
});
