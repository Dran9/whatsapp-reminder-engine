const express = require('express');
const { getUpcomingEvents } = require('./calendar');
const { sendTextMessage } = require('./whatsapp');
const { wasAlreadySent, markAsSent } = require('./db');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const REMINDER_MINUTES = parseInt(process.env.REMINDER_MINUTES_BEFORE || '30', 10);

// ─── Health check ───────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Enviar recordatorios ───────────────────────────────────
app.post('/send-reminders', async (req, res) => {
  try {
    const events = await getUpcomingEvents(REMINDER_MINUTES);
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

      const message =
        `Hola *${evt.contactName}*, te recordamos tu cita:\n` +
        `*${evt.summary}*\n` +
        `Inicio: ${evt.start}\n` +
        `No olvides asistir.`;

      await sendTextMessage(evt.contactPhone, message);
      markAsSent(evt.id, evt.contactPhone);
      results.push({ event: evt.id, phone: evt.contactPhone, name: evt.contactName, status: 'sent' });
    }

    res.json({ processed: events.length, results });
  } catch (err) {
    console.error('Error sending reminders:', err);
    res.status(500).json({ error: err.message });
  }
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

app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object !== 'whatsapp_business_account') {
    return res.sendStatus(404);
  }

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const messages = change.value?.messages || [];
      for (const msg of messages) {
        console.log(`Mensaje recibido de ${msg.from}: ${msg.text?.body || '[no text]'}`);
      }
    }
  }

  res.sendStatus(200);
});

// ─── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`whatsapp-reminder-engine running on port ${PORT}`);
});
