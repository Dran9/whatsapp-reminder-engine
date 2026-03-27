import { useState, useEffect, useCallback, useMemo, useReducer } from 'react';
import { useSearchParams } from 'react-router-dom';
import Calendar from '../components/Calendar';
import {
  TIMEZONE_GROUPS, ALL_TIMEZONES, DEFAULT_TZ,
  convertLaPazTimeToTz, getCurrentTimeInTz, detectTimezoneFromIP,
} from '../utils/timezones';
import {
  ArrowRight, ArrowLeft, ChevronDown, Calendar as CalendarIcon,
  Clock, CalendarClock, CalendarCheck, Check, Sun, Sunset,
  Coffee, Globe, Info, TriangleAlert, MessageCircle, AlertCircle, Search, RefreshCw, Heart
} from 'lucide-react';

const COUNTRY_CODES = [
  { code: '+591', flag: '\u{1F1E7}\u{1F1F4}', name: 'Bolivia', digits: 8 },
  { code: '+54', flag: '\u{1F1E6}\u{1F1F7}', name: 'Argentina', digits: 10 },
  { code: '+56', flag: '\u{1F1E8}\u{1F1F1}', name: 'Chile', digits: 9 },
  { code: '+57', flag: '\u{1F1E8}\u{1F1F4}', name: 'Colombia', digits: 10 },
  { code: '+51', flag: '\u{1F1F5}\u{1F1EA}', name: 'Peru', digits: 9 },
  { code: '+593', flag: '\u{1F1EA}\u{1F1E8}', name: 'Ecuador', digits: 9 },
  { code: '+52', flag: '\u{1F1F2}\u{1F1FD}', name: 'Mexico', digits: 10 },
  { code: '+34', flag: '\u{1F1EA}\u{1F1F8}', name: 'España', digits: 9 },
  { code: '+1', flag: '\u{1F1FA}\u{1F1F8}', name: 'USA', digits: 10 },
];

const CITIES = ['Cochabamba', 'Santa Cruz', 'La Paz', 'Sucre', 'Otro'];
const SOURCES = ['Referencia de amigos', 'Redes sociales', 'Otro'];

const DAY_NAMES_ES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MONTH_NAMES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function formatDateES(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = DAY_NAMES_ES[d.getDay()];
  const num = d.getDate();
  const month = MONTH_NAMES_ES[d.getMonth()];
  const year = d.getFullYear();
  return `${day.charAt(0).toUpperCase() + day.slice(1)}, ${num} de ${month} de ${year}`;
}

function Logo({ width = 90 }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }} className={width >= 120 ? 'logo' : 'logo-small'}>
      <img src="/logo.svg" alt="Daniel MacLean" style={{ width, height: 'auto' }} />
    </div>
  );
}

function ProgressDots({ current, total = 4, done = false }) {
  return (
    <div className="progress-dots">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`progress-dot ${done ? 'done' : i < current ? 'active' : ''}`} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// REDUCER — atomic state transitions, no race conditions
// ═══════════════════════════════════════════════════════════════════
const initialFlowState = {
  screen: 1,
  loading: false,
  error: '',
  // Client
  clientId: null,
  clientName: '',
  activeAppointment: null,
  // Onboarding
  showOnboarding: false,
  isReturning: false,
  // Reschedule
  rescheduleMode: false,
  oldAppointment: null,
  wasRescheduled: false,
  // Result
  bookedAppointment: null,
};

function flowReducer(state, action) {
  console.log(`[FLOW] ${action.type}`, { prevScreen: state.screen, rescheduleMode: state.rescheduleMode, oldAppt: !!state.oldAppointment, action });
  const next = _flowReducer(state, action);
  console.log(`[FLOW] => screen=${next.screen}, rescheduleMode=${next.rescheduleMode}, oldAppt=${!!next.oldAppointment}, booked=${!!next.bookedAppointment}`);
  return next;
}

function _flowReducer(state, action) {
  switch (action.type) {
    // ─── Slot picked on calendar ─────────────────────────
    case 'PICK_SLOT':
      // If in reschedule mode, go to confirm reschedule (screen 7)
      // Otherwise, go to phone input (screen 2)
      return {
        ...state,
        screen: state.rescheduleMode ? 7 : 2,
        error: '',
      };

    // ─── Phone check ─────────────────────────────────────
    case 'PHONE_CHECK_START':
      return { ...state, loading: true, error: '' };

    case 'PHONE_HAS_APPOINTMENT':
      return {
        ...state,
        loading: false,
        screen: 6,
        activeAppointment: action.appointment,
        clientId: action.clientId,
        clientName: action.clientName,
      };

    case 'PHONE_RETURNING':
      return {
        ...state,
        loading: false,
        screen: 3,
        isReturning: true,
        clientName: action.clientName,
        clientId: action.clientId,
      };

    case 'PHONE_NEW':
      return {
        ...state,
        loading: false,
        screen: 3,
        showOnboarding: true,
      };

    case 'PHONE_ERROR':
      return { ...state, loading: false, error: action.error };

    // ─── Booking ─────────────────────────────────────────
    case 'BOOK_START':
      return { ...state, loading: true, error: '' };

    case 'BOOK_SUCCESS':
      return {
        ...state,
        loading: false,
        screen: 5,
        bookedAppointment: action.appointment,
        clientName: action.clientName || state.clientName,
      };

    case 'BOOK_NEEDS_ONBOARDING':
      return { ...state, loading: false, showOnboarding: true };

    case 'BOOK_HAS_APPOINTMENT':
      return {
        ...state,
        loading: false,
        screen: 6,
        activeAppointment: action.appointment,
        clientId: action.clientId,
        clientName: action.clientName || state.clientName,
      };

    case 'BOOK_ERROR':
      return { ...state, loading: false, error: action.error };

    // ─── Reschedule ──────────────────────────────────────
    case 'ENTER_RESCHEDULE':
      // ATOMIC: save old appointment AND flip to screen 1 AND set mode
      return {
        ...state,
        screen: 1,
        rescheduleMode: true,
        oldAppointment: action.oldAppointment,
        error: '',
      };

    case 'RESCHEDULE_START':
      return { ...state, loading: true, error: '' };

    case 'RESCHEDULE_SUCCESS':
      // ATOMIC: set screen 5 + clear all reschedule state + set result
      return {
        ...state,
        loading: false,
        screen: 5,
        wasRescheduled: true,
        bookedAppointment: action.appointment,
        rescheduleMode: false,
        oldAppointment: null,
        activeAppointment: null,
      };

    case 'RESCHEDULE_ERROR':
      return { ...state, loading: false, error: action.error };

    // ─── Keep existing appointment ───────────────────────
    case 'KEEP_APPOINTMENT':
      return {
        ...state,
        screen: 5,
        bookedAppointment: action.appointment,
      };

    // ─── Navigation ──────────────────────────────────────
    case 'GO_BACK':
      return { ...state, screen: action.screen, error: '' };

    case 'CLEAR_ERROR':
      return { ...state, error: '' };

    default:
      return state;
  }
}

export default function BookingFlow() {
  const [params] = useSearchParams();
  const devMode = params.get('devmode') === '1';

  // Atomic flow state — all screen transitions go through reducer
  const [flow, dispatch] = useReducer(flowReducer, initialFlowState);

  const [config, setConfig] = useState(null);

  // Timezone
  const [selectedTz, setSelectedTz] = useState(DEFAULT_TZ);
  const [showTzDropdown, setShowTzDropdown] = useState(false);
  const [tzSearch, setTzSearch] = useState('');

  // Phone input (UI only — not part of flow transitions)
  const [countryCode, setCountryCode] = useState('+591');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  // Onboarding fields (UI only)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [city, setCity] = useState('Cochabamba');
  const [country, setCountry] = useState('Bolivia');
  const [source, setSource] = useState('');
  const [isInternational, setIsInternational] = useState(false);

  // Calendar/slots (UI only)
  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsCache, setSlotsCache] = useState(new Map());
  const [prefetchDone, setPrefetchDone] = useState(false);

  // Current country info
  const currentCountry = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];
  const phoneDigits = phoneNumber.replace(/\D/g, '');
  const expectedDigits = currentCountry.digits;
  const phoneComplete = phoneDigits.length === expectedDigits;

  // ─── Load config ──────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/config/public')
      .then(r => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  // ─── Auto-detect timezone by IP ───────────────────────────────
  useEffect(() => {
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(data => {
        if (data.country_calling_code) {
          const match = COUNTRY_CODES.find(c => c.code === data.country_calling_code);
          if (match) setCountryCode(match.code);
        }
        const detectedTz = detectTimezoneFromIP(data);
        if (detectedTz) setSelectedTz(detectedTz);
      })
      .catch(() => {});
  }, []);

  // ─── Pre-fetch 7 days of slots on mount ───────────────────────
  useEffect(() => {
    if (!config) return;
    const today = new Date();
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }

    Promise.all(
      dates.map(date =>
        fetch(`/api/slots?date=${date}`)
          .then(r => r.json())
          .then(data => ({ date, slots: data.slots || [] }))
          .catch(() => ({ date, slots: [] }))
      )
    ).then(results => {
      const cache = new Map();
      results.forEach(r => cache.set(r.date, r.slots));
      setSlotsCache(cache);
      setPrefetchDone(true);
      const todayStr = dates[0];
      setSelectedDate(todayStr);
      setSlots(cache.get(todayStr) || []);
    });
  }, [config]);

  // ─── URL params for pre-fill ──────────────────────────────────
  useEffect(() => {
    const name = params.get('name');
    const last = params.get('last');
    const ageParam = params.get('age');
    const cityParam = params.get('city');
    const sourceParam = params.get('source');
    if (name) setFirstName(name);
    if (last) setLastName(last);
    if (ageParam) setAge(ageParam);
    if (cityParam) setCity(cityParam);
    if (sourceParam) setSource(sourceParam);
  }, []);

  // Derived: daysWithSlots for Calendar bold styling
  const daysWithSlots = useMemo(() => {
    const set = new Set();
    for (const [date, dateSlots] of slotsCache) {
      if (dateSlots.length > 0) set.add(date);
    }
    return set;
  }, [slotsCache]);

  // ─── Fetch slots for a date ───────────────────────────────────
  const fetchSlots = useCallback(async (date) => {
    setSlotsLoading(true);
    setSelectedSlot(null);
    try {
      if (slotsCache.has(date)) {
        setSlots(slotsCache.get(date));
        return;
      }
      const res = await fetch(`/api/slots?date=${date}`);
      const data = await res.json();
      const fetchedSlots = data.slots || [];
      setSlots(fetchedSlots);
      setSlotsCache(prev => new Map(prev).set(date, fetchedSlots));
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [slotsCache]);

  function handleDateSelect(date) {
    setSelectedDate(date);
    fetchSlots(date);
  }

  // Helper to build fetch URL with devmode
  function apiUrl(path) {
    return devMode ? `${path}${path.includes('?') ? '&' : '?'}devmode=1` : path;
  }

  // ─── Check client status after phone entry ──────────────────────
  async function handlePhoneSubmit() {
    dispatch({ type: 'PHONE_CHECK_START' });
    try {
      const phone = countryCode.replace('+', '') + phoneDigits;
      const res = await fetch(apiUrl('/api/client/check'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.status === 'has_appointment') {
        dispatch({
          type: 'PHONE_HAS_APPOINTMENT',
          appointment: data.appointment,
          clientId: data.client_id,
          clientName: data.client_name,
        });
        return;
      }

      if (data.status === 'returning') {
        dispatch({
          type: 'PHONE_RETURNING',
          clientName: data.client_name,
          clientId: data.client_id,
        });
        return;
      }

      // status === 'new'
      dispatch({ type: 'PHONE_NEW' });
    } catch (err) {
      dispatch({ type: 'PHONE_ERROR', error: err.message });
    }
  }

  // ─── Book (unified endpoint) ──────────────────────────────────
  async function handleBook(onboarding = null) {
    dispatch({ type: 'BOOK_START' });
    try {
      const phone = countryCode.replace('+', '') + phoneDigits;
      const dateTime = `${selectedDate}T${selectedSlot}`;
      const body = { phone, date_time: dateTime };
      if (onboarding) body.onboarding = onboarding;

      const res = await fetch(apiUrl('/api/book'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.status === 'needs_onboarding') {
        dispatch({ type: 'BOOK_NEEDS_ONBOARDING' });
        return;
      }

      if (data.status === 'has_appointment') {
        dispatch({
          type: 'BOOK_HAS_APPOINTMENT',
          appointment: data.appointment,
          clientId: data.client_id,
          clientName: data.client_name,
        });
        return;
      }

      if (data.status === 'booked') {
        dispatch({
          type: 'BOOK_SUCCESS',
          appointment: { date: selectedDate, time: selectedSlot },
          clientName: onboarding?.first_name || flow.clientName,
        });
      }
    } catch (err) {
      dispatch({ type: 'BOOK_ERROR', error: err.message });
    }
  }

  // ─── Reschedule ───────────────────────────────────────────────
  async function handleReschedule() {
    console.log('[RESCHED] Starting. flow:', { screen: flow.screen, clientId: flow.clientId, oldAppt: flow.oldAppointment, activeAppt: flow.activeAppointment });
    dispatch({ type: 'RESCHEDULE_START' });
    try {
      const dateTime = `${selectedDate}T${selectedSlot}`;
      const appt = flow.oldAppointment || flow.activeAppointment;
      console.log('[RESCHED] appt:', appt, 'dateTime:', dateTime);
      if (!appt) throw new Error('No se encontro la cita original');

      const body = {
        client_id: flow.clientId,
        old_appointment_id: appt.id,
        date_time: dateTime,
      };
      console.log('[RESCHED] Sending to /api/reschedule:', body);

      const res = await fetch(apiUrl('/api/reschedule'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      console.log('[RESCHED] Response:', res.status, data);
      if (data.error) throw new Error(data.error);

      console.log('[RESCHED] SUCCESS — dispatching RESCHEDULE_SUCCESS');
      dispatch({
        type: 'RESCHEDULE_SUCCESS',
        appointment: { date: selectedDate, time: selectedSlot },
      });
    } catch (err) {
      console.error('[RESCHED] ERROR:', err.message);
      dispatch({ type: 'RESCHEDULE_ERROR', error: err.message });
    }
  }

  useEffect(() => {
    setIsInternational(countryCode !== '+591');
  }, [countryCode]);

  useEffect(() => {
    if (!showCountryDropdown) return;
    const handler = () => setShowCountryDropdown(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showCountryDropdown]);

  useEffect(() => {
    if (!showTzDropdown) return;
    const handler = () => setShowTzDropdown(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showTzDropdown]);

  // Convert a La Paz time to selected timezone for display
  function displayTime(time) {
    if (!selectedDate || !selectedTz) return time;
    return convertLaPazTimeToTz(time, selectedDate, selectedTz.tz);
  }

  // ─── Timezone dropdown component ──────────────────────────────
  function TimezoneSelector() {
    const filtered = tzSearch.trim()
      ? TIMEZONE_GROUPS.map(g => ({
          ...g,
          zones: g.zones.filter(z => z.label.toLowerCase().includes(tzSearch.toLowerCase())),
        })).filter(g => g.zones.length > 0)
      : TIMEZONE_GROUPS;

    return (
      <div style={{ width: '100%', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            className="timezone-selector"
            onClick={(e) => { e.stopPropagation(); setShowTzDropdown(!showTzDropdown); }}
          >
            <Globe size={14} />
            <span>{selectedTz.flag} {selectedTz.label} ({getCurrentTimeInTz(selectedTz.tz)})</span>
            <ChevronDown size={12} />
          </button>
        </div>
        <p style={{ fontSize: 14, color: 'var(--gris-medio)', textAlign: 'center', marginTop: 6 }}>
          Horarios en tu zona
        </p>

        {showTzDropdown && (
          <div className="timezone-dropdown" onClick={e => e.stopPropagation()}>
            <div style={{ position: 'relative' }}>
              <Search size={14} color="var(--gris-medio)" style={{ position: 'absolute', left: 14, top: 14 }} />
              <input
                className="timezone-search"
                style={{ paddingLeft: 36 }}
                placeholder="Buscar pais..."
                value={tzSearch}
                onChange={e => setTzSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="timezone-list">
              {filtered.map(group => (
                <div key={group.label}>
                  <div className="timezone-group-label">{group.label}</div>
                  {group.zones.map(z => (
                    <div
                      key={z.tz + z.label}
                      className={`timezone-item ${selectedTz.tz === z.tz && selectedTz.label === z.label ? 'active' : ''}`}
                      onClick={() => { setSelectedTz(z); setShowTzDropdown(false); setTzSearch(''); }}
                    >
                      <span>{z.flag}</span>
                      <span style={{ flex: 1 }}>{z.label}</span>
                      <span style={{ color: 'var(--gris-medio)', fontSize: 14 }}>{getCurrentTimeInTz(z.tz)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // SCREEN 1: Calendar + Slots
  // ═══════════════════════════════════════════════════════════════
  if (flow.screen === 1) {
    const freeSlots = slots;
    const morningSlots = freeSlots.filter(s => s.block === 'morning');
    const afternoonSlots = freeSlots.filter(s => s.block === 'afternoon');

    function handleSlotClick(time) {
      setSelectedSlot(time);
      dispatch({ type: 'PICK_SLOT' });
    }

    return (
      <Layout devMode={devMode}>
        <Logo width={120} />
        <h1 style={{ fontSize: 32, fontWeight: 600, textAlign: 'center', color: 'var(--negro)', marginBottom: 6 }}>
          {flow.rescheduleMode ? 'Elige tu nueva hora' : 'Encuentra el momento para tu sesion'}
        </h1>
        <p style={{ fontSize: 18, color: 'var(--gris-medio)', textAlign: 'center', marginBottom: 24 }}>
          {flow.rescheduleMode ? 'Selecciona una fecha y hora para reagendar' : 'Elige una fecha y hora disponible'}
        </p>

        <div className="card" style={{ marginBottom: 16 }}>
          <Calendar
            onSelectDate={handleDateSelect}
            selectedDate={selectedDate}
            availableDays={config?.available_days || []}
            windowDays={config?.window_days || 10}
            daysWithSlots={daysWithSlots}
          />
        </div>

        {selectedDate && (
          <div className="card">
            <TimezoneSelector />

            <h2 style={{ fontSize: 19, fontWeight: 600, color: 'var(--negro)', marginBottom: 16 }}>
              {formatDateES(selectedDate)}
            </h2>

            {(slotsLoading || (!prefetchDone && slots.length === 0)) ? (
              <p style={{ textAlign: 'center', color: 'var(--gris-medio)', padding: '24px 0', fontSize: 18 }}>
                Consultando disponibilidad...
              </p>
            ) : freeSlots.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--gris-medio)', padding: '24px 0', fontSize: 18 }}>
                No hay horarios disponibles este dia
              </p>
            ) : (
              <>
                {morningSlots.length > 0 && (
                  <div style={{ marginBottom: afternoonSlots.length > 0 ? 0 : 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <Sun size={12} color="var(--dorado)" />
                      <span style={{ fontSize: 15, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--gris-medio)' }}>
                        Mañana
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {morningSlots.map(s => (
                        <button key={s.time} onClick={() => handleSlotClick(s.time)} className="slot-btn">
                          {displayTime(s.time)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {morningSlots.length > 0 && afternoonSlots.length > 0 && (
                  <div className="break-divider">
                    <Coffee size={11} />
                    <span>Descanso</span>
                  </div>
                )}

                {afternoonSlots.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <Sunset size={12} color="var(--terracota)" />
                      <span style={{ fontSize: 15, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--gris-medio)' }}>
                        Tarde
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {afternoonSlots.map(s => (
                        <button key={s.time} onClick={() => handleSlotClick(s.time)} className="slot-btn">
                          {displayTime(s.time)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <ProgressDots current={1} />
      </Layout>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // SCREEN 2: Phone Input
  // ═══════════════════════════════════════════════════════════════
  if (flow.screen === 2) {
    return (
      <Layout devMode={devMode}>
        <Logo width={90} />

        <div className="summary-card">
          <div className="summary-card-icon">
            <CalendarIcon size={20} color="var(--azul-acero)" />
          </div>
          <div>
            <div className="summary-card-text">{formatDateES(selectedDate)}</div>
            <div className="summary-card-sub">{displayTime(selectedSlot)} hs</div>
          </div>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 600, textAlign: 'center', color: 'var(--negro)', marginBottom: 6 }}>
          Ingresa tu numero
        </h1>
        <p style={{ fontSize: 18, color: 'var(--gris-medio)', textAlign: 'center', marginBottom: 24 }}>
          Para confirmar tu sesion
        </p>

        <div className="card">
          <form onSubmit={(e) => { e.preventDefault(); if (phoneComplete) handlePhoneSubmit(); }}>
            <span className="field-label">NUMERO DE WHATSAPP</span>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <div style={{ position: 'relative' }}>
                <div
                  className="country-selector"
                  onClick={(e) => { e.stopPropagation(); setShowCountryDropdown(!showCountryDropdown); }}
                >
                  <span>{currentCountry.flag}</span>
                  <span style={{ fontWeight: 500 }}>{currentCountry.code}</span>
                  <ChevronDown size={14} color="var(--gris-medio)" />
                </div>
                {showCountryDropdown && (
                  <div className="country-dropdown" onClick={e => e.stopPropagation()}>
                    {COUNTRY_CODES.map(c => (
                      <div
                        key={c.code}
                        className="country-dropdown-item"
                        onClick={() => { setCountryCode(c.code); setShowCountryDropdown(false); }}
                      >
                        <span>{c.flag}</span>
                        <span>{c.name}</span>
                        <span style={{ color: 'var(--gris-medio)', marginLeft: 'auto' }}>{c.code}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="tel"
                value={phoneNumber}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  if (val.length <= expectedDigits) setPhoneNumber(val);
                }}
                placeholder="71234567"
                className="input-field"
                style={{ flex: 1 }}
                autoFocus
                maxLength={expectedDigits}
              />
            </div>

            {/* Digit counter */}
            <p className="phone-digit-hint" style={{
              color: phoneComplete ? 'var(--turquesa)' : phoneDigits.length > 0 ? 'var(--gris-medio)' : 'transparent',
              marginBottom: 16,
            }}>
              {phoneComplete
                ? `${expectedDigits}/${expectedDigits} digitos`
                : `${phoneDigits.length}/${expectedDigits} digitos`
              }
            </p>

            {flow.error && <p style={{ color: 'var(--terracota)', fontSize: 16, marginBottom: 12 }}>{flow.error}</p>}

            <button type="submit" disabled={!phoneComplete || flow.loading} className="btn-primary" style={{ marginBottom: 12 }}>
              {flow.loading ? 'Verificando...' : 'Continuar'}
              {!flow.loading && <ArrowRight size={18} />}
            </button>
            <button type="button" onClick={() => dispatch({ type: 'GO_BACK', screen: 1 })} className="btn-secondary">
              <ArrowLeft size={18} />
              Elegir otra hora
            </button>
          </form>
        </div>

        <ProgressDots current={2} />
      </Layout>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // SCREEN 3: Confirmation + Onboarding
  // ═══════════════════════════════════════════════════════════════
  if (flow.screen === 3) {
    const minAge = config?.min_age || 23;
    const maxAge = config?.max_age || 75;
    const ageNum = Number(age);
    const ageOutOfRange = age !== '' && (ageNum < minAge || ageNum > maxAge);

    function handleConfirm() {
      if (flow.showOnboarding) {
        handleBook({
          first_name: firstName,
          last_name: lastName,
          age: ageNum,
          city: isInternational ? 'Otro' : city,
          country: isInternational ? country : 'Bolivia',
          source,
        });
      } else {
        handleBook();
      }
    }

    return (
      <Layout devMode={devMode}>
        <Logo width={90} />
        <h1 style={{ fontSize: 28, fontWeight: 600, textAlign: 'center', color: 'var(--negro)', marginBottom: 6 }}>
          {flow.showOnboarding
            ? 'Completa tus datos'
            : flow.isReturning
              ? `${flow.clientName}, que bueno verte de nuevo`
              : 'Confirma tu sesion'}
        </h1>
        <p style={{ fontSize: 18, color: flow.showOnboarding ? 'var(--gris-medio)' : flow.isReturning ? 'var(--turquesa)' : 'var(--terracota)', textAlign: 'center', marginBottom: 24 }}>
          {flow.showOnboarding ? 'Es tu primera vez, necesitamos algunos datos' : 'Revisa los detalles antes de confirmar'}
        </p>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="detail-row" style={{ paddingTop: 0 }}>
            <div className="detail-icon">
              <CalendarIcon size={18} color="var(--gris-medio)" />
            </div>
            <div>
              <div className="detail-label">Fecha</div>
              <div className="detail-value">{formatDateES(selectedDate)}</div>
            </div>
          </div>
          <div className="detail-row" style={{ paddingBottom: flow.showOnboarding ? 16 : 0 }}>
            <div className="detail-icon">
              <Clock size={18} color="var(--gris-medio)" />
            </div>
            <div>
              <div className="detail-label">Hora</div>
              <div className="detail-value">{displayTime(selectedSlot)} hs</div>
              {selectedTz.tz !== 'America/La_Paz' && (
                <div style={{ fontSize: 14, color: 'var(--gris-medio)', marginTop: 2 }}>
                  Zona: {selectedTz.flag} {selectedTz.label}
                </div>
              )}
            </div>
          </div>

          {/* Onboarding fields */}
          <div className={`onboarding-slide ${flow.showOnboarding ? 'open' : ''}`}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, marginBottom: 16,
            }}>
              <Info size={12} color="var(--terracota)" />
              <span style={{ fontSize: 16, color: 'var(--terracota)' }}>Todos los campos son obligatorios</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <span className="field-label">NOMBRE *</span>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} className="input-field" placeholder="Tu nombre" />
              </div>
              <div>
                <span className="field-label">APELLIDO *</span>
                <input value={lastName} onChange={e => setLastName(e.target.value)} className="input-field" placeholder="Tu apellido" />
              </div>
              <div>
                <span className="field-label">EDAD *</span>
                <input
                  type="number"
                  value={age}
                  onChange={e => setAge(e.target.value)}
                  min={minAge}
                  max={maxAge}
                  className="input-field"
                  style={{ width: 120 }}
                  placeholder={`${minAge}`}
                />
                {ageOutOfRange ? (
                  <p style={{ fontSize: 16, color: 'var(--terracota)', marginTop: 6, fontWeight: 600 }}>
                    Solo atiendo pacientes entre {minAge} y {maxAge} años
                  </p>
                ) : (
                  <p style={{ fontSize: 14, color: 'var(--gris-medio)', marginTop: 6 }}>Entre {minAge} y {maxAge} años</p>
                )}
              </div>

              {isInternational ? (
                <div>
                  <span className="field-label">PAIS *</span>
                  <input value={country} onChange={e => setCountry(e.target.value)} className="input-field" placeholder="Tu pais" />
                </div>
              ) : (
                <div>
                  <span className="field-label">CIUDAD *</span>
                  <div style={{ position: 'relative' }}>
                    <select value={city} onChange={e => setCity(e.target.value)} className="input-field" style={{ appearance: 'none', paddingRight: 40 }}>
                      {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown size={16} color="var(--gris-medio)" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                </div>
              )}

              <div>
                <span className="field-label" style={{ marginBottom: 10 }}>¿COMO SUPISTE DE DANIEL? *</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {SOURCES.map(s => (
                    <label key={s} className="radio-option">
                      <div className={`radio-circle ${source === s ? 'active' : ''}`}>
                        {source === s && <div className="radio-circle-inner" />}
                      </div>
                      <span style={{ fontSize: 18 }}>{s}</span>
                      <input type="radio" name="source" value={s} checked={source === s} onChange={e => setSource(e.target.value)} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {flow.error && <p style={{ color: 'var(--terracota)', fontSize: 16, textAlign: 'center', marginBottom: 12 }}>{flow.error}</p>}

        <button
          onClick={handleConfirm}
          disabled={flow.loading || (flow.showOnboarding && (!firstName || !lastName || !age || !source || ageOutOfRange))}
          className="btn-primary"
          style={{ marginBottom: 12 }}
        >
          <Check size={18} />
          {flow.loading ? 'Confirmando...' : 'Confirmar cita'}
        </button>
        <button onClick={() => dispatch({ type: 'GO_BACK', screen: 2 })} className="btn-secondary">
          <ArrowLeft size={18} />
          Volver
        </button>

        <ProgressDots current={3} />
      </Layout>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // SCREEN 5: Success
  // ═══════════════════════════════════════════════════════════════
  if (flow.screen === 5) {
    const displayName = flow.clientName || firstName || '';

    return (
      <Layout devMode={devMode}>
        <Logo width={90} />

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div className="animate-checkmark" style={{
            width: 72, height: 72, borderRadius: '50%', background: 'var(--cian-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Check size={32} color="var(--petroleo)" />
          </div>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 600, textAlign: 'center', color: 'var(--negro)', marginBottom: 6 }}>
          {flow.wasRescheduled
            ? (displayName ? `Perfecto ${displayName}, tu cita ha sido reagendada` : 'Tu cita ha sido reagendada')
            : (displayName ? `${displayName}, tu cita esta confirmada` : 'Tu cita esta confirmada')}
        </h1>
        <p style={{ fontSize: 22, fontWeight: 600, color: 'var(--turquesa)', textAlign: 'center', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Heart size={20} color="var(--turquesa)" fill="var(--turquesa)" strokeWidth={2.5} /> Gracias por tu confianza
        </p>

        {flow.bookedAppointment && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="detail-row" style={{ paddingTop: 0 }}>
              <div className="detail-icon">
                <CalendarIcon size={18} color="var(--gris-medio)" />
              </div>
              <div>
                <div className="detail-label">Fecha</div>
                <div className="detail-value">{formatDateES(flow.bookedAppointment.date)}</div>
              </div>
            </div>
            <div className="detail-row" style={{ paddingBottom: 0 }}>
              <div className="detail-icon">
                <Clock size={18} color="var(--gris-medio)" />
              </div>
              <div>
                <div className="detail-label">Hora</div>
                <div className="detail-value">{displayTime(flow.bookedAppointment.time)} hs</div>
              </div>
            </div>
          </div>
        )}

        <div className="notice-box" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <MessageCircle size={18} color="var(--grafito)" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 17, color: 'var(--grafito)', lineHeight: 1.5 }}>
              Te llegara un recordatorio el dia antes de tu cita.
            </p>
          </div>
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', marginTop: 12, paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <TriangleAlert size={18} color="var(--terracota)" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 17, color: 'var(--grafito)', lineHeight: 1.5 }}>
                Toda cancelacion o cambio se debe hacer con minimo <strong>6 horas</strong> de anticipacion, caso contrario se cobrara el <strong>50%</strong> del monto de la sesion.
              </p>
            </div>
          </div>
        </div>

        <ProgressDots current={4} done={true} />
      </Layout>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // SCREEN 6: Already Has Appointment
  // ═══════════════════════════════════════════════════════════════
  if (flow.screen === 6 && flow.activeAppointment) {
    const apptDT = flow.activeAppointment.date_time || '';
    const apptDateObj = new Date(apptDT);
    const apptDate = apptDT ? apptDateObj.toLocaleDateString('sv-SE', { timeZone: 'America/La_Paz' }) : '';
    const apptTime = apptDT ? apptDateObj.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/La_Paz' }) : '';

    return (
      <Layout devMode={devMode}>
        <Logo width={90} />

        <h1 style={{ fontSize: 26, fontWeight: 600, textAlign: 'center', color: 'var(--negro)', marginBottom: 6 }}>
          {flow.clientName ? `${flow.clientName}, ya tienes una cita` : 'Ya tienes una cita'}
        </h1>
        <p style={{ fontSize: 18, color: 'var(--gris-medio)', textAlign: 'center', marginBottom: 20 }}>
          Tu cita actual es:
        </p>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="detail-row" style={{ paddingTop: 0, borderTop: 'none' }}>
            <div className="detail-icon">
              <CalendarIcon size={18} color="var(--gris-medio)" />
            </div>
            <div>
              <div className="detail-label" style={{ fontSize: 16, color: '#737375' }}>Cita actual</div>
              <div className="detail-value">{formatDateES(apptDate)}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--azul-acero)', marginTop: 2 }}>
                {apptTime} hs
              </div>
            </div>
          </div>
        </div>

        <p style={{ fontSize: 18, color: 'var(--gris-medio)', textAlign: 'center', marginBottom: 12 }}>
          Acabas de elegir:
        </p>
        <div className="card" style={{ marginBottom: 24, border: '1.5px solid var(--azul-acero)', background: '#FDF0AD' }}>
          <div className="detail-row" style={{ paddingTop: 0, borderTop: 'none' }}>
            <div className="detail-icon" style={{ background: 'var(--cian-light)' }}>
              <CalendarClock size={18} color="var(--petroleo)" />
            </div>
            <div>
              <div className="detail-label" style={{ fontSize: 16, color: '#737375' }}>Nueva fecha</div>
              <div className="detail-value">{formatDateES(selectedDate)}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--petroleo)', marginTop: 2 }}>
                {displayTime(selectedSlot)} hs
              </div>
            </div>
          </div>
        </div>

        <p style={{ fontSize: 22, fontWeight: 500, textAlign: 'center', color: 'var(--negro)', marginBottom: 16 }}>
          ¿Que deseas hacer?
        </p>

        <button
          onClick={() => dispatch({ type: 'ENTER_RESCHEDULE', oldAppointment: flow.activeAppointment })}
          className="btn-primary"
          style={{ marginBottom: 12 }}
        >
          <RefreshCw size={18} />
          Reagendar mi cita
        </button>
        <button
          onClick={() => dispatch({
            type: 'KEEP_APPOINTMENT',
            appointment: { date: apptDate, time: apptTime },
          })}
          className="btn-secondary"
        >
          <CalendarCheck size={18} />
          Conservar mi cita actual
        </button>
      </Layout>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // SCREEN 7: Confirm Reschedule
  // ═══════════════════════════════════════════════════════════════
  if (flow.screen === 7) {
    const appt = flow.oldAppointment || flow.activeAppointment;

    if (!appt) {
      return (
        <Layout devMode={devMode}>
          <Logo width={90} />
          <p style={{ textAlign: 'center', color: 'var(--terracota)', paddingTop: 48, fontSize: 18 }}>
            No se encontro la cita. Por favor intenta de nuevo.
          </p>
          <button onClick={() => dispatch({ type: 'GO_BACK', screen: 1 })} className="btn-primary" style={{ marginTop: 16 }}>
            Volver al calendario
          </button>
        </Layout>
      );
    }

    const apptDT = appt.date_time || '';
    const apptDateObj = new Date(apptDT);
    const apptDate = apptDT ? apptDateObj.toLocaleDateString('sv-SE', { timeZone: 'America/La_Paz' }) : '';
    const apptTime = apptDT ? apptDateObj.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/La_Paz' }) : '';

    return (
      <Layout devMode={devMode}>
        <Logo width={90} />

        <h1 style={{ fontSize: 28, fontWeight: 600, textAlign: 'center', color: 'var(--negro)', marginBottom: 6 }}>
          Confirmar reagendamiento
        </h1>
        <p style={{ fontSize: 18, color: 'var(--gris-medio)', textAlign: 'center', marginBottom: 20 }}>
          Tu cita sera movida a la nueva fecha
        </p>

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--gris-medio)' }}>Cita actual</span>
            <p style={{ fontSize: 18, color: 'var(--gris-claro)', textDecoration: 'line-through', marginTop: 4 }}>
              {formatDateES(apptDate)} &middot; {apptTime} hs
            </p>
          </div>
          <div style={{ borderTop: '1px solid var(--platino)', paddingTop: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--petroleo)' }}>Nueva cita</span>
            <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--negro)', marginTop: 4 }}>
              {formatDateES(selectedDate)} &middot; {displayTime(selectedSlot)} hs
            </p>
          </div>
        </div>

        {flow.error && <p style={{ color: 'var(--terracota)', fontSize: 16, textAlign: 'center', marginBottom: 12 }}>{flow.error}</p>}

        <button
          onClick={handleReschedule}
          disabled={flow.loading}
          className="btn-primary"
          style={{ marginBottom: 12 }}
        >
          <RefreshCw size={18} />
          {flow.loading ? 'Reagendando...' : 'Confirmar reagendamiento'}
        </button>
        <button onClick={() => dispatch({ type: 'GO_BACK', screen: 1 })} className="btn-secondary">
          <ArrowLeft size={18} />
          Elegir otra hora
        </button>
      </Layout>
    );
  }

  return (
    <Layout devMode={devMode}>
      <p style={{ textAlign: 'center', color: 'var(--gris-medio)', paddingTop: 48, fontSize: 18 }}>Cargando...</p>
    </Layout>
  );
}

function Layout({ children, devMode }) {
  return (
    <div className="booking-container" style={{ paddingBottom: 32 }}>
      {devMode && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          background: 'var(--dorado)', textAlign: 'center',
          padding: '4px 0', fontSize: 14, fontWeight: 600,
          color: 'var(--negro)', zIndex: 100,
        }}>
          DEV v2 (useReducer) — Sin limite de intentos
        </div>
      )}
      {children}
    </div>
  );
}
