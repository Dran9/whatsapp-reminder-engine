const { Router } = require('express');
const { query } = require('../db');
const { listEvents } = require('../services/calendar');

const router = Router();

const DAY_NAMES = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Falta parámetro: date' });

    const calendarId = process.env.CALENDAR_ID || 'danielmacleann@gmail.com';

    // Load config
    const rows = await query('SELECT * FROM config WHERE id = 1');
    if (rows.length === 0) return res.status(500).json({ error: 'Config no encontrada' });
    const cfg = rows[0];
    const availableHours = typeof cfg.available_hours === 'string' ? JSON.parse(cfg.available_hours) : cfg.available_hours;
    const availableDays = typeof cfg.available_days === 'string' ? JSON.parse(cfg.available_days) : cfg.available_days;
    const duration = cfg.appointment_duration || 60;
    const bufferHours = cfg.buffer_hours || 3;
    const windowDays = cfg.window_days || 10;
    const breakStart = timeToMinutes(cfg.break_start || '13:00');
    const breakEnd = timeToMinutes(cfg.break_end || '15:59');

    // Check if date is within window
    const now = new Date();
    const targetDate = new Date(date + 'T00:00:00-04:00');
    const today = new Date(now.toLocaleString('en-US', { timeZone: 'America/La_Paz' }));
    today.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((targetDate - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return res.json({ slots: [] });
    if (diffDays > windowDays) return res.json({ slots: [] });

    // Check if day is available
    const dayIndex = targetDate.getUTCDay();
    // Adjust: targetDate was created with -04:00 so getUTCDay gives La Paz day
    const dayName = DAY_NAMES[dayIndex === 0 ? 0 : dayIndex]; // Sunday=0
    if (!availableDays.includes(dayName)) return res.json({ slots: [] });

    // Get hours for this day
    const hoursForDay = availableHours[dayName] || [];
    if (hoursForDay.length === 0) return res.json({ slots: [] });

    // Fetch GCal events for this day
    const timeMin = new Date(`${date}T00:00:00-04:00`).toISOString();
    const timeMax = new Date(`${date}T23:59:59-04:00`).toISOString();
    const events = await listEvents(calendarId, timeMin, timeMax);

    // Parse events to La Paz time ranges
    const busyRanges = events.map(e => {
      const start = new Date(e.start.dateTime || e.start.date);
      const end = new Date(e.end.dateTime || e.end.date);
      // Convert to La Paz minutes
      const startLP = new Date(start.toLocaleString('en-US', { timeZone: 'America/La_Paz' }));
      const endLP = new Date(end.toLocaleString('en-US', { timeZone: 'America/La_Paz' }));
      return {
        start: startLP.getHours() * 60 + startLP.getMinutes(),
        end: endLP.getHours() * 60 + endLP.getMinutes(),
      };
    });

    // Current time in La Paz
    const nowLP = new Date(now.toLocaleString('en-US', { timeZone: 'America/La_Paz' }));
    const nowMinutes = nowLP.getHours() * 60 + nowLP.getMinutes();
    const isToday = diffDays === 0;

    // Filter slots
    const freeSlots = [];
    for (const hour of hoursForDay) {
      const slotStart = timeToMinutes(hour);
      const slotEnd = slotStart + duration;

      // Skip if in break
      if (slotStart >= breakStart && slotStart < breakEnd) continue;

      // Skip if too soon (buffer)
      if (isToday && slotStart < nowMinutes + bufferHours * 60) continue;

      // Skip if busy in GCal
      const isBusy = busyRanges.some(r => slotStart < r.end && slotEnd > r.start);
      if (isBusy) continue;

      freeSlots.push({
        time: hour,
        block: slotStart < breakStart ? 'morning' : 'afternoon',
      });
    }

    res.json({ slots: freeSlots, date });
  } catch (err) {
    console.error('[slots] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
