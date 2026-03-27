import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Calendar from '../components/Calendar';
import {
  TIMEZONE_GROUPS, ALL_TIMEZONES, DEFAULT_TZ,
  convertLaPazTimeToTz, getCurrentTimeInTz, detectTimezoneFromIP,
} from '../utils/timezones';
import {
  ArrowRight, ArrowLeft, ChevronDown, Calendar as CalendarIcon,
  Clock, CalendarClock, CalendarCheck, Check, Sun, Sunset,
  Coffee, Globe, Info, TriangleAlert, MessageCircle, AlertCircle, Search, RefreshCw
} from 'lucide-react';

const COUNTRY_CODES = [
  { code: '+591', flag: '🇧🇴', name: 'Bolivia', digits: 8 },
  { code: '+54', flag: '🇦🇷', name: 'Argentina', digits: 10 },
  { code: '+56', flag: '🇨🇱', name: 'Chile', digits: 9 },
  { code: '+57', flag: '🇨🇴', name: 'Colombia', digits: 10 },
  { code: '+51', flag: '🇵🇪', name: 'Perú', digits: 9 },
  { code: '+593', flag: '🇪🇨', name: 'Ecuador', digits: 9 },
  { code: '+52', flag: '🇲🇽', name: 'México', digits: 10 },
  { code: '+34', flag: '🇪🇸', name: 'España', digits: 9 },
  { code: '+1', flag: '🇺🇸', name: 'USA', digits: 10 },
];

const CITIES = ['Cochabamba', 'Santa Cruz', 'La Paz', 'Sucre', 'Otro'];
const SOURCES = ['Referencia de amigos', 'Redes sociales', 'Otro'];

const DAY_NAMES_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
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

export default function BookingFlow() {
  const [params] = useSearchParams();
  const devMode = params.get('devmode') === '1';
  const [screen, setScreen] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState(null);

  // Timezone
  const [selectedTz, setSelectedTz] = useState(DEFAULT_TZ);
  const [showTzDropdown, setShowTzDropdown] = useState(false);
  const [tzSearch, setTzSearch] = useState('');

  // Client data
  const [countryCode, setCountryCode] = useState('+591');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [client, setClient] = useState(null);
  const [clientName, setClientName] = useState('');
  const [activeAppointment, setActiveAppointment] = useState(null);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  // Onboarding
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [city, setCity] = useState('Cochabamba');
  const [country, setCountry] = useState('Bolivia');
  const [source, setSource] = useState('');
  const [isInternational, setIsInternational] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Booking
  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsCache, setSlotsCache] = useState(new Map());
  const [prefetchDone, setPrefetchDone] = useState(false);

  // Result
  const [bookedAppointment, setBookedAppointment] = useState(null);
  const [clientId, setClientId] = useState(null);

  // Reschedule mode (from Screen 6)
  const [rescheduleMode, setRescheduleMode] = useState(false);

  // Returning client (known, no active appointment)
  const [isReturning, setIsReturning] = useState(false);

  // Rescheduled flag (for success screen message)
  const [wasRescheduled, setWasRescheduled] = useState(false);

  // Current country info
  const currentCountry = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];

  // Phone validation
  const phoneDigits = phoneNumber.replace(/\D/g, '');
  const expectedDigits = currentCountry.digits;
  const phoneComplete = phoneDigits.length === expectedDigits;
  const phoneTooLong = phoneDigits.length > expectedDigits;

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

      // Auto-select today and show its slots
      const todayStr = dates[0];
      setSelectedDate(todayStr);
      setSlots(cache.get(todayStr) || []);
    });
  }, [config]);

  // ─── Check URL params (for WhatsApp links with ?t=phone) ─────
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
    setLoading(true);
    setError('');
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
        setActiveAppointment(data.appointment);
        setClientId(data.client_id);
        setClientName(data.client_name);
        setScreen(6);
        return;
      }

      if (data.status === 'returning') {
        setClientName(data.client_name);
        setClientId(data.client_id);
        setIsReturning(true);
        setScreen(3);
        return;
      }

      // status === 'new' → needs onboarding
      setShowOnboarding(true);
      setScreen(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ─── Book (unified endpoint) ──────────────────────────────────
  async function handleBook(onboarding = null) {
    setLoading(true);
    setError('');
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
        setShowOnboarding(true);
        setLoading(false);
        return;
      }

      if (data.status === 'has_appointment') {
        setActiveAppointment(data.appointment);
        setClientId(data.client_id);
        if (data.client_name) setClientName(data.client_name);
        setScreen(6);
        setLoading(false);
        return;
      }

      if (data.status === 'booked') {
        // Save name for success screen
        if (onboarding) setClientName(onboarding.first_name);
        setBookedAppointment({ date: selectedDate, time: selectedSlot });
        setScreen(5);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ─── Reschedule ───────────────────────────────────────────────
  async function handleReschedule() {
    setLoading(true);
    setError('');
    try {
      const dateTime = `${selectedDate}T${selectedSlot}`;
      const res = await fetch(apiUrl('/api/reschedule'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          old_appointment_id: activeAppointment.id,
          date_time: dateTime,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBookedAppointment({ date: selectedDate, time: selectedSlot });
      setActiveAppointment(null);
      setRescheduleMode(false);
      setWasRescheduled(true);
      setScreen(5);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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
        <p style={{ fontSize: 12, color: 'var(--gris-medio)', textAlign: 'center', marginTop: 6 }}>
          Horarios en tu zona · Cambiar zona horaria
        </p>

        {showTzDropdown && (
          <div className="timezone-dropdown" onClick={e => e.stopPropagation()}>
            <div style={{ position: 'relative' }}>
              <Search size={14} color="var(--gris-medio)" style={{ position: 'absolute', left: 14, top: 14 }} />
              <input
                className="timezone-search"
                style={{ paddingLeft: 36 }}
                placeholder="Buscar país..."
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
  // SCREEN 1: Calendar + Slots (inverted flow — calendar first)
  // ═══════════════════════════════════════════════════════════════
  if (screen === 1) {
    const freeSlots = slots;
    const morningSlots = freeSlots.filter(s => s.block === 'morning');
    const afternoonSlots = freeSlots.filter(s => s.block === 'afternoon');

    // If in reschedule mode and user picks a slot, go to confirm reschedule (screen 7)
    function handleSlotClick(time) {
      setSelectedSlot(time);
      if (rescheduleMode) {
        setScreen(7);
      } else {
        setScreen(2);
      }
    }

    return (
      <Layout devMode={devMode}>
        <Logo width={120} />
        <h1 style={{ fontSize: 30, fontWeight: 600, textAlign: 'center', color: 'var(--negro)', marginBottom: 6 }}>
          Encuentra el momento para tu sesión
        </h1>
        <p style={{ fontSize: 16, color: 'var(--gris-medio)', textAlign: 'center', marginBottom: 24 }}>
          Elige una fecha y hora disponible
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
            {/* TIMEZONE-SELECTOR-POSITION — move this block to reposition */}
            <TimezoneSelector />

            <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--negro)', marginBottom: 16 }}>
              {formatDateES(selectedDate)}
            </h2>

            {(slotsLoading || (!prefetchDone && slots.length === 0)) ? (
              <p style={{ textAlign: 'center', color: 'var(--gris-medio)', padding: '24px 0', fontSize: 16 }}>
                Consultando disponibilidad...
              </p>
            ) : freeSlots.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--gris-medio)', padding: '24px 0', fontSize: 16 }}>
                No hay horarios disponibles este día
              </p>
            ) : (
              <>
                {morningSlots.length > 0 && (
                  <div style={{ marginBottom: afternoonSlots.length > 0 ? 0 : 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <Sun size={12} color="var(--dorado)" />
                      <span style={{ fontSize: 13, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--gris-medio)' }}>
                        Mañana
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {morningSlots.map(s => (
                        <button
                          key={s.time}
                          onClick={() => handleSlotClick(s.time)}
                          className="slot-btn"
                        >
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
                      <span style={{ fontSize: 13, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--gris-medio)' }}>
                        Tarde
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {afternoonSlots.map(s => (
                        <button
                          key={s.time}
                          onClick={() => handleSlotClick(s.time)}
                          className="slot-btn"
                        >
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
  // SCREEN 2: Phone Input (after selecting slot)
  // ═══════════════════════════════════════════════════════════════
  if (screen === 2) {
    return (
      <Layout devMode={devMode}>
        <Logo width={90} />

        {/* Summary of selected slot */}
        <div className="summary-card">
          <div className="summary-card-icon">
            <CalendarIcon size={20} color="var(--azul-acero)" />
          </div>
          <div>
            <div className="summary-card-text">{formatDateES(selectedDate)}</div>
            <div className="summary-card-sub">{displayTime(selectedSlot)} hs · {selectedTz.label}</div>
          </div>
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 600, textAlign: 'center', color: 'var(--negro)', marginBottom: 6 }}>
          Ingresa tu número
        </h1>
        <p style={{ fontSize: 16, color: 'var(--gris-medio)', textAlign: 'center', marginBottom: 24 }}>
          Para confirmar tu sesión
        </p>

        <div className="card">
          <form onSubmit={(e) => { e.preventDefault(); if (phoneComplete) handlePhoneSubmit(); }}>
            <span className="field-label">NÚMERO DE WHATSAPP</span>
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
                ? `✓ ${expectedDigits}/${expectedDigits} dígitos`
                : `${phoneDigits.length}/${expectedDigits} dígitos`
              }
            </p>

            {error && <p style={{ color: 'var(--terracota)', fontSize: 16, marginBottom: 12 }}>{error}</p>}

            <button type="submit" disabled={!phoneComplete || loading} className="btn-primary" style={{ marginBottom: 12 }}>
              {loading ? 'Verificando...' : 'Continuar'}
              {!loading && <ArrowRight size={18} />}
            </button>
            <button type="button" onClick={() => { setScreen(1); setError(''); }} className="btn-secondary">
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
  // SCREEN 3: Confirmation (+ onboarding if needed)
  // ═══════════════════════════════════════════════════════════════
  if (screen === 3) {
    const minAge = config?.min_age || 23;
    const maxAge = config?.max_age || 75;
    const ageNum = Number(age);
    const ageOutOfRange = age !== '' && (ageNum < minAge || ageNum > maxAge);

    function handleConfirm() {
      if (showOnboarding) {
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
        <h1 style={{ fontSize: 26, fontWeight: 600, textAlign: 'center', color: 'var(--negro)', marginBottom: 6 }}>
          {showOnboarding
            ? 'Cuéntanos de ti'
            : isReturning
              ? `${clientName}, qué bueno verte de nuevo`
              : 'Confirma tu sesión'}
        </h1>
        <p style={{ fontSize: 16, color: showOnboarding ? 'var(--gris-medio)' : isReturning ? 'var(--turquesa)' : 'var(--terracota)', textAlign: 'center', marginBottom: 24 }}>
          {showOnboarding ? 'Es tu primera vez, necesitamos algunos datos para darte mejor servicio' : 'Revisa los detalles antes de confirmar'}
        </p>

        {/* Appointment details + Onboarding in one card */}
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
          <div className="detail-row" style={{ paddingBottom: showOnboarding ? 16 : 0 }}>
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

          {/* Onboarding fields (slide in if needed) */}
          <div className={`onboarding-slide ${showOnboarding ? 'open' : ''}`}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, marginBottom: 16,
            }}>
              <Info size={12} color="var(--terracota)" />
              <span style={{ fontSize: 14, color: 'var(--terracota)' }}>Todos los campos son obligatorios</span>
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
                  <p style={{ fontSize: 14, color: 'var(--terracota)', marginTop: 6, fontWeight: 500 }}>
                    Solo atiendo pacientes entre {minAge} y {maxAge} años
                  </p>
                ) : (
                  <p style={{ fontSize: 14, color: 'var(--gris-medio)', marginTop: 6 }}>Entre {minAge} y {maxAge} años</p>
                )}
              </div>

              {isInternational ? (
                <div>
                  <span className="field-label">PAÍS *</span>
                  <input value={country} onChange={e => setCountry(e.target.value)} className="input-field" placeholder="Tu país" />
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
                <span className="field-label" style={{ marginBottom: 10 }}>¿CÓMO SUPISTE DE DANIEL? *</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {SOURCES.map(s => (
                    <label key={s} className="radio-option">
                      <div className={`radio-circle ${source === s ? 'active' : ''}`}>
                        {source === s && <div className="radio-circle-inner" />}
                      </div>
                      <span style={{ fontSize: 16 }}>{s}</span>
                      <input type="radio" name="source" value={s} checked={source === s} onChange={e => setSource(e.target.value)} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && <p style={{ color: 'var(--terracota)', fontSize: 16, textAlign: 'center', marginBottom: 12 }}>{error}</p>}

        <button
          onClick={handleConfirm}
          disabled={loading || (showOnboarding && (!firstName || !lastName || !age || !source || ageOutOfRange))}
          className="btn-primary"
          style={{ marginBottom: 12 }}
        >
          <Check size={18} />
          {loading ? 'Confirmando...' : 'Confirmar cita'}
        </button>
        <button onClick={() => { setScreen(2); setError(''); setShowOnboarding(false); }} className="btn-secondary">
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
  if (screen === 5) {
    const displayName = clientName || firstName || '';

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

        <h1 style={{ fontSize: 26, fontWeight: 600, textAlign: 'center', color: 'var(--negro)', marginBottom: 6 }}>
          {wasRescheduled
            ? (displayName ? `Perfecto ${displayName}, tu cita ha sido reagendada` : 'Tu cita ha sido reagendada')
            : (displayName ? `${displayName}, tu cita está confirmada` : 'Tu cita está confirmada')}
        </h1>
        <p style={{ fontSize: 16, color: 'var(--turquesa)', textAlign: 'center', marginBottom: 24 }}>
          {wasRescheduled ? 'Tu nueva cita queda así' : 'Gracias por tu confianza'}
        </p>

        {bookedAppointment && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="detail-row" style={{ paddingTop: 0 }}>
              <div className="detail-icon">
                <CalendarIcon size={18} color="var(--gris-medio)" />
              </div>
              <div>
                <div className="detail-label">Fecha</div>
                <div className="detail-value">{formatDateES(bookedAppointment.date)}</div>
              </div>
            </div>
            <div className="detail-row" style={{ paddingBottom: 0 }}>
              <div className="detail-icon">
                <Clock size={18} color="var(--gris-medio)" />
              </div>
              <div>
                <div className="detail-label">Hora</div>
                <div className="detail-value">{displayTime(bookedAppointment.time)} hs</div>
              </div>
            </div>
          </div>
        )}

        <div className="notice-box" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <MessageCircle size={18} color="var(--grafito)" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 15, color: 'var(--grafito)', lineHeight: 1.5 }}>
              Te llegará un recordatorio el día antes de tu cita.
            </p>
          </div>
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', marginTop: 12, paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <TriangleAlert size={18} color="var(--terracota)" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 15, color: 'var(--grafito)', lineHeight: 1.5 }}>
                Toda cancelación o cambio se debe hacer con mínimo <strong>6 horas</strong> de anticipación, caso contrario se cobrará el <strong>50%</strong> del monto de la sesión.
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
  if (screen === 6 && activeAppointment) {
    const apptDT = activeAppointment.date_time || '';
    const apptDate = apptDT.split('T')[0];
    const apptTime = apptDT.split('T')[1]?.substring(0, 5) || '';

    return (
      <Layout devMode={devMode}>
        <Logo width={90} />

        <h1 style={{ fontSize: 24, fontWeight: 600, textAlign: 'center', color: 'var(--negro)', marginBottom: 6 }}>
          {clientName ? `${clientName}, ya tienes una cita` : 'Ya tienes una cita'}
        </h1>
        <p style={{ fontSize: 16, color: 'var(--gris-medio)', textAlign: 'center', marginBottom: 20 }}>
          Tu cita actual es:
        </p>

        {/* Existing appointment */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="detail-row" style={{ paddingTop: 0, borderTop: 'none' }}>
            <div className="detail-icon">
              <CalendarIcon size={18} color="var(--gris-medio)" />
            </div>
            <div>
              <div className="detail-label" style={{ fontSize: 16, color: '#737375' }}>Cita actual</div>
              <div className="detail-value">{formatDateES(apptDate)}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--azul-acero)', marginTop: 2 }}>
                {apptTime} hs
              </div>
            </div>
          </div>
        </div>

        {/* New selection they just picked */}
        <p style={{ fontSize: 16, color: 'var(--gris-medio)', textAlign: 'center', marginBottom: 12 }}>
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
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--petroleo)', marginTop: 2 }}>
                {displayTime(selectedSlot)} hs
              </div>
            </div>
          </div>
        </div>

        <p style={{ fontSize: 20, fontWeight: 500, textAlign: 'center', color: 'var(--negro)', marginBottom: 16 }}>
          ¿Qué deseas hacer?
        </p>

        <button
          onClick={() => {
            setRescheduleMode(true);
            setScreen(1);
          }}
          className="btn-primary"
          style={{ marginBottom: 12 }}
        >
          <RefreshCw size={18} />
          Reagendar mi cita
        </button>
        <button
          onClick={() => {
            setBookedAppointment({ date: apptDate, time: apptTime });
            setScreen(5);
          }}
          className="btn-secondary"
        >
          <CalendarCheck size={18} />
          Conservar mi cita actual
        </button>
      </Layout>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // SCREEN 7: Confirm Reschedule (after picking new slot in reschedule mode)
  // ═══════════════════════════════════════════════════════════════
  if (screen === 7 && activeAppointment) {
    const apptDT = activeAppointment.date_time || '';
    const apptDate = apptDT.split('T')[0];
    const apptTime = apptDT.split('T')[1]?.substring(0, 5) || '';

    return (
      <Layout devMode={devMode}>
        <Logo width={90} />

        <h1 style={{ fontSize: 26, fontWeight: 600, textAlign: 'center', color: 'var(--negro)', marginBottom: 6 }}>
          Confirmar reagendamiento
        </h1>
        <p style={{ fontSize: 16, color: 'var(--gris-medio)', textAlign: 'center', marginBottom: 20 }}>
          Tu cita será movida a la nueva fecha
        </p>

        {/* Old → New comparison */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--gris-medio)' }}>Cita actual</span>
            <p style={{ fontSize: 16, color: 'var(--gris-claro)', textDecoration: 'line-through', marginTop: 4 }}>
              {formatDateES(apptDate)} · {apptTime} hs
            </p>
          </div>
          <div style={{ borderTop: '1px solid var(--platino)', paddingTop: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--petroleo)' }}>Nueva cita</span>
            <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--negro)', marginTop: 4 }}>
              {formatDateES(selectedDate)} · {displayTime(selectedSlot)} hs
            </p>
          </div>
        </div>

        {error && <p style={{ color: 'var(--terracota)', fontSize: 16, textAlign: 'center', marginBottom: 12 }}>{error}</p>}

        <button
          onClick={handleReschedule}
          disabled={loading}
          className="btn-primary"
          style={{ marginBottom: 12 }}
        >
          <RefreshCw size={18} />
          {loading ? 'Reagendando...' : 'Confirmar reagendamiento'}
        </button>
        <button onClick={() => { setScreen(1); setError(''); }} className="btn-secondary">
          <ArrowLeft size={18} />
          Elegir otra hora
        </button>
      </Layout>
    );
  }

  return (
    <Layout devMode={devMode}>
      <p style={{ textAlign: 'center', color: 'var(--gris-medio)', paddingTop: 48, fontSize: 16 }}>Cargando...</p>
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
          padding: '4px 0', fontSize: 12, fontWeight: 600,
          color: 'var(--negro)', zIndex: 100,
        }}>
          MODO DESARROLLO — Sin límite de intentos
        </div>
      )}
      {children}
    </div>
  );
}
