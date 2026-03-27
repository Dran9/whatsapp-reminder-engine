require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { initDB } = require('./db');
const { checkAndSendReminders } = require('./services/reminder');

const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Rate limiting ──────────────────────────────────────────────
const devBypass = (req) => req.query.devmode === '1' || req.headers['x-devmode'] === '1';
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: 'Demasiados intentos. Intenta en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: devBypass,
});
const clientLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiados intentos. Intenta en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: devBypass,
});
app.use('/api/book', bookingLimiter);
app.use('/api/reschedule', bookingLimiter);
app.use('/api/client', clientLimiter);

// Serve React build in production
const distPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

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

app.post('/api/webhook', (req, res) => {
  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return res.sendStatus(404);

  // CRITICAL: Respond 200 to Meta IMMEDIATELY — before any async work.
  // Meta requires a response within ~10s or it marks delivery as failed
  // and enters exponential backoff (delays grow to minutes/hours).
  res.sendStatus(200);

  // Log incoming messages (auto-reply disabled — will be replaced by QR confirmation flow)
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
});

// ─── SPA fallback ────────────────────────────────────────────
const indexHtml = path.join(distPath, 'index.html');
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
  res.status(503).send('Client not built yet. Run: npm run build');
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
