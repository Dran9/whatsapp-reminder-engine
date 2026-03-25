const { google } = require('googleapis');

const MORNING = [];
const AFTERNOON = [];
for (let h = 8; h < 13; h++) {
  MORNING.push(`${String(h).padStart(2,'0')}:00`);
}
for (let h = 16; h < 20; h++) {
  AFTERNOON.push(`${String(h).padStart(2,'0')}:00`);
}

function getOAuthClient() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oAuth2Client;
}

function toHHMM(dateObj) {
  const h = String(dateObj.getUTCHours()).padStart(2, '0');
  const m = String(dateObj.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function toLaPazDate(date) {
  // America/La_Paz is UTC-4, no DST
  return new Date(date.getTime() - 4 * 60 * 60 * 1000);
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function isSlotBusy(slot, events) {
  const slotStart = timeToMinutes(slot);
  const slotEnd = slotStart + 60;
  return events.some(e => {
    const eStart = timeToMinutes(e.start);
    const eEnd = timeToMinutes(e.end);
    return slotStart < eEnd && slotEnd > eStart;
  });
}

function getSlotEvent(slot, events) {
  const slotStart = timeToMinutes(slot);
  const slotEnd = slotStart + 60;
  return events.find(e => {
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

  console.log(`[slots] calendarId=${calendarId}, date=${date}, timeMin=${timeMin}, timeMax=${timeMax}`);

  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const rawItems = res.data.items || [];
  console.log(`[slots] Raw events from GCal: ${rawItems.length}`);

  const events = rawItems.map(e => {
    const startDt = new Date(e.start.dateTime || e.start.date);
    const endDt = new Date(e.end.dateTime || e.end.date);
    const startLaPaz = toLaPazDate(startDt);
    const endLaPaz = toLaPazDate(endDt);
    return {
      title: e.summary || 'Sin título',
      start: toHHMM(startLaPaz),
      end: toHHMM(endLaPaz),
    };
  });

  console.log(`[slots] Parsed events:`, events.map(e => `${e.start}-${e.end} "${e.title}"`).join(', '));

  const allSlots = [
    ...MORNING.map(s => {
      const busy = isSlotBusy(s, events);
      const evt = busy ? getSlotEvent(s, events) : null;
      return { time: s, block: 'morning', busy, event: evt ? evt.title : null };
    }),
    ...AFTERNOON.map(s => {
      const busy = isSlotBusy(s, events);
      const evt = busy ? getSlotEvent(s, events) : null;
      return { time: s, block: 'afternoon', busy, event: evt ? evt.title : null };
    }),
  ];

  return { slots: allSlots, events };
}

module.exports = { getAvailableSlots };
