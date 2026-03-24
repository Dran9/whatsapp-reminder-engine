const { google } = require('googleapis');

function getCalendarClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Parsea el summary del evento con formato: "<PREFIX> Nombre Apellido - 591XXXXXXXXX"
 * @param {string} summary
 * @returns {{ name: string, phone: string } | null}
 */
function parseSummary(summary) {
  const prefix = process.env.SUMMARY_PREFIX || '';
  let text = summary || '';

  if (prefix && text.startsWith(prefix)) {
    text = text.slice(prefix.length).trimStart();
  }

  const dashIndex = text.lastIndexOf('-');
  if (dashIndex === -1) return null;

  const name = text.slice(0, dashIndex).trim();
  const phone = text.slice(dashIndex + 1).trim().replace(/\D/g, '');

  if (!name || !phone) return null;
  return { name, phone };
}

/**
 * Obtiene eventos proximos dentro de una ventana de tiempo.
 * @param {number} minutesBefore — minutos antes del evento para considerarlo "proximo"
 * @returns {Promise<Array>} lista de eventos
 */
async function getUpcomingEvents(minutesBefore) {
  const calendar = getCalendarClient();
  const calendarIds = process.env.CALENDAR_IDS.split(',').map(id => id.trim());
  const now = new Date();
  const windowEnd = new Date(now.getTime() + minutesBefore * 60 * 1000);

  const allEvents = [];

  for (const calendarId of calendarIds) {
    const res = await calendar.events.list({
      calendarId,
      timeMin: now.toISOString(),
      timeMax: windowEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    for (const evt of res.data.items || []) {
      const parsed = parseSummary(evt.summary);
      allEvents.push({
        id: evt.id,
        summary: evt.summary || '(Sin titulo)',
        start: evt.start.dateTime || evt.start.date,
        contactName: parsed?.name || null,
        contactPhone: parsed?.phone || null,
      });
    }
  }

  return allEvents;
}

module.exports = { getUpcomingEvents, parseSummary };
