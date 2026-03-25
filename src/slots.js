const { google } = require('googleapis');

const MORNING = [];
const AFTERNOON = [];
for (let h = 8; h < 13; h++) {
  MORNING.push(`${String(h).padStart(2,'0')}:00`);
  MORNING.push(`${String(h).padStart(2,'0')}:30`);
}
for (let h = 16; h < 20; h++) {
  AFTERNOON.push(`${String(h).padStart(2,'0')}:00`);
  AFTERNOON.push(`${String(h).padStart(2,'0')}:30`);
}

function getOAuthClient() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oAuth2Client;
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function isSlotBusy(slot, events) {
  const slotStart = timeToMinutes(slot);
  const slotEnd = slotStart + 30;
  return events.some(e => {
    const eStart = timeToMinutes(e.start);
    const eEnd = timeToMinutes(e.end);
    return slotStart < eEnd && slotEnd > eStart;
  });
}

async function getAvailableSlots(calendarId, date) {
  const auth = getOAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const timeMin = new Date(`${date}T00:00:00-04:00`).toISOString();
  const timeMax = new Date(`${date}T23:59:59-04:00`).toISOString();

  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = (res.data.items || []).map(e => ({
    title: e.summary || 'Sin título',
    start: new Date(e.start.dateTime || e.start.date)
      .toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/La_Paz' }),
    end: new Date(e.end.dateTime || e.end.date)
      .toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/La_Paz' }),
  }));

  const allSlots = [
    ...MORNING.map(s => ({ time: s, block: 'morning', busy: isSlotBusy(s, events) })),
    ...AFTERNOON.map(s => ({ time: s, block: 'afternoon', busy: isSlotBusy(s, events) })),
  ];

  return { slots: allSlots, events };
}

module.exports = { getAvailableSlots };
