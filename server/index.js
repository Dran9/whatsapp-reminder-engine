require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { initDB } = require('./db');
const { checkAndSendReminders } = require('./services/reminder');

const app = express();
app.use(cors());
app.use(express.json());

// Serve React build in production
app.use(express.static(path.join(__dirname, '../client/dist')));

const PORT = process.env.PORT || 3000;

// ─── Health ──────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ──────────────────────────────────────────────────
app.use('/api/admin', require('./routes/auth'));
app.use('/api/slots', require('./routes/slots'));
app.use('/api', require('./routes/booking'));
app.use('/api/config', require('./routes/config'));
app.use('/api/admin/clients', require('./routes/clients'));
app.use('/api/admin/appointments', require('./routes/appointments'));

// ─── WhatsApp Webhook ────────────────────────────────────────
app.get('/api/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WA_VERIFY_TOKEN) {
    console.log('[webhook] Verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/api/webhook', async (req, res) => {
  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return res.sendStatus(404);

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const messages = change.value?.messages || [];
      for (const msg of messages) {
        const from = msg.from;
        const payload = msg.button?.payload || msg.interactive?.button_reply?.id || '';
        console.log(`[webhook] Message from ${from}, payload: ${payload}`);
      }
    }
  }
  res.sendStatus(200);
});

// ─── SPA fallback ────────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// ─── Start ───────────────────────────────────────────────────
async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`[server] Running on port ${PORT}`);
  });

  // Reminder check every hour
  setInterval(checkAndSendReminders, 60 * 60 * 1000);
}

start().catch(err => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
