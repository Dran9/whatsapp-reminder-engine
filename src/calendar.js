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
 * Calcula inicio y fin de "mañana" en America/La_Paz (UTC-4).
 */
function getTomorrowRangeLaPaz() {
  const LA_PAZ_OFFSET = -4;
  const now = new Date();
  const nowLaPaz = new Date(now.getTime() + LA_PAZ_OFFSET * 60 * 60 * 1000);

  const tomorrowLaPaz = new Date(nowLaPaz);
  tomorrowLaPaz.setUTCDate(tomorrowLaPaz.getUTCDate() + 1);
  tomorrowLaPaz.setUTCHours(0, 0, 0, 0);

  const endTomorrowLaPaz = new Date(tomorrowLaPaz);
  endTomorrowLaPaz.setUTCHours(23, 59, 59, 999);

  // Convertir de vuelta a UTC para la API
  const timeMin = new Date(tomorrowLaPaz.getTime() - LA_PAZ_OFFSET * 60 * 60 * 1000);
  const timeMax = new Date(endTomorrowLaPaz.getTime() - LA_PAZ_OFFSET * 60 * 60 * 1000);

  return { timeMin, timeMax };
}

/**
 * Obtiene eventos de "mañana" (America/La_Paz) de todos los calendarios configurados.
 * @returns {Promise<Array>} lista de eventos
 */
async function getUpcomingEvents() {
  const calendar = getCalendarClient();
  const calendarIds = process.env.CALENDAR_IDS.split(',').map(id => id.trim());
  const { timeMin, timeMax } = getTomorrowRangeLaPaz();

  console.log(`[calendar] Rango de busqueda: ${timeMin.toISOString()} → ${timeMax.toISOString()}`);

  const allEvents = [];

  for (const calendarId of calendarIds) {
    console.log(`[calendar] Consultando calendario: ${calendarId}`);

    const res = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const items = res.data.items || [];
    console.log(`[calendar] Eventos encontrados en ${calendarId}: ${items.length}`);

    for (const evt of items) {
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

  console.log(`[calendar] Total eventos recopilados: ${allEvents.length}`);
  return allEvents;
}

module.exports = { getUpcomingEvents, parseSummary };
