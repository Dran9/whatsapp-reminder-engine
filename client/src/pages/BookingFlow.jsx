import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import Calendar from '../components/Calendar';
import {
  ArrowRight, ArrowLeft, ChevronDown, Calendar as CalendarIcon,
  Clock, CalendarClock, CalendarCheck, Check, Sun, Sunset,
  Coffee, Globe, Info, TriangleAlert, MessageCircle, AlertCircle
} from 'lucide-react';

const COUNTRY_CODES = [
  { code: '+591', flag: '\ud83c\udde7\ud83c\uddf4', name: 'Bolivia' },
  { code: '+54', flag: '\ud83c\udde6\ud83c\uddf7', name: 'Argentina' },
  { code: '+56', flag: '\ud83c\udde8\ud83c\uddf1', name: 'Chile' },
  { code: '+57', flag: '\ud83c\udde8\ud83c\uddf4', name: 'Colombia' },
  { code: '+51', flag: '\ud83c\uddf5\ud83c\uddea', name: 'Perú' },
  { code: '+593', flag: '\ud83c\uddea\ud83c\udde8', name: 'Ecuador' },
  { code: '+52', flag: '\ud83c\uddf2\ud83c\uddfd', name: 'México' },
  { code: '+34', flag: '\ud83c\uddea\ud83c\uddf8', name: 'España' },
  { code: '+1', flag: '\ud83c\uddfa\ud83c\uddf8', name: 'USA' },
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

// Logo component with configurable width
function Logo({ width = 90 }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }} className={width >= 120 ? 'logo' : 'logo-small'}>
      <img src="/logo.svg" alt="Daniel MacLean" style={{ width, height: 'auto' }} />
    </div>
  );
}

// Progress dots component
function ProgressDots({ current, total = 4, done = false }) {
  return (
    <div className="progress-dots">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`progress-dot ${done ? 'done' : i < current ? 'active' : ''}`}
        />
      ))}
    </div>
  );
}

export default function BookingFlow() {
  const [params] = useSearchParams();
  const [screen, setScreen] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState(null);

  // Client data
  const [countryCode, setCountryCode] = useState('+591');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [client, setClient] = useState(null);
  const [activeAppointment, setActiveAppointment] = useState(null);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  // Reschedule toggle
  const [wantsReschedule, setWantsReschedule] = useState(false);

  // Onboarding
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [city, setCity] = useState('Cochabamba');
  const [country, setCountry] = useState('Bolivia');
  const [source, setSource] = useState('');
  const [isInternational, setIsInternational] = useState(false);

  // Booking
  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Result
  const [bookedAppointment, setBookedAppointment] = useState(null);

  // Load config
  useEffect(() => {
    fetch('/api/config/public')
      .then(r => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  // Auto-detect country by IP
  useEffect(() => {
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(data => {
        if (data.country_calling_code) {
          const match = COUNTRY_CODES.find(c => c.code === data.country_calling_code);
          if (match) setCountryCode(match.code);
        }
      })
      .catch(() => {});
  }, []);

  // Check URL params on mount
  useEffect(() => {
    const t = params.get('t');
    const code = params.get('code');
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

    if (t) {
      setPhoneNumber(t);
      lookupClient(t);
    }
  }, []); // eslint-disable-line

  async function lookupClient(phone) {
    setLoading(true);
    setError('');
    try {
      const fullPhone = phone.startsWith('+') ? phone.replace('+', '') : phone;
      const res = await fetch(`/api/client/${fullPhone}`);
      const data = await res.json();
      if (data.found) {
        setClient(data.client);
        if (data.activeAppointment) {
          setActiveAppointment(data.activeAppointment);
          setScreen(6);
        } else {
          setScreen(3);
        }
      } else {
        setScreen(2);
      }
    } catch {
      setError('Error al buscar cliente');
    } finally {
      setLoading(false);
    }
  }

  async function handlePhoneSubmit(e) {
    e.preventDefault();
    if (!phoneNumber.trim()) return;
    const full = countryCode.replace('+', '') + phoneNumber.trim();
    await lookupClient(full);
  }

  async function handleOnboardingSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const phone = countryCode.replace('+', '') + phoneNumber.trim();
      const res = await fetch('/api/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          first_name: firstName,
          last_name: lastName,
          age: Number(age),
          city: isInternational ? 'Otro' : city,
          country: isInternational ? country : 'Bolivia',
          source,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setClient({ id: data.client_id, first_name: firstName, last_name: lastName, phone });
      setScreen(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const fetchSlots = useCallback(async (date) => {
    setSlotsLoading(true);
    setSelectedSlot(null);
    try {
      const res = await fetch(`/api/slots?date=${date}`);
      const data = await res.json();
      setSlots(data.slots || []);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  function handleDateSelect(date) {
    setSelectedDate(date);
    fetchSlots(date);
  }

  async function handleConfirmBooking() {
    setLoading(true);
    setError('');
    try {
      const dateTime = `${selectedDate}T${selectedSlot}`;
      const isReschedule = activeAppointment && screen === 4;

      const endpoint = isReschedule ? '/api/reschedule' : '/api/book';
      const body = isReschedule
        ? { client_id: client.id, old_appointment_id: activeAppointment.id, date_time: dateTime }
        : { client_id: client.id, date_time: dateTime };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBookedAppointment({ date: selectedDate, time: selectedSlot });
      setActiveAppointment(null);
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

  // Close country dropdown on outside click
  useEffect(() => {
    if (!showCountryDropdown) return;
    const handler = () => setShowCountryDropdown(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showCountryDropdown]);

  const currentCountry = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];

  // ─── Screen 1: Phone Input ──────────────────────────────────
  if (screen === 1) {
    return (
      <Layout>
        <Logo width={120} />
        <h1 style={{ fontSize: 30, fontWeight: 600, textAlign: 'center', color: 'var(--negro)', marginBottom: 6 }}>
          Agenda tu sesión
        </h1>
        <p style={{ fontSize: 14, color: 'var(--gris-medio)', textAlign: 'center', marginBottom: 32 }}>
          Elige el horario que mejor te funcione
        </p>

        <div className="card">
          <form onSubmit={handlePhoneSubmit}>
            <span className="field-label">NÚMERO DE WHATSAPP</span>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {/* Country prefix selector */}
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
                onChange={e => setPhoneNumber(e.target.value)}
                placeholder="71234567"
                className="input-field"
                style={{ flex: 1 }}
                autoFocus
              />
            </div>

            {/* Reschedule toggle */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  padding: '8px 0',
                }}
                onClick={() => setWantsReschedule(!wantsReschedule)}
              >
                <div className={`radio-circle ${wantsReschedule ? 'active' : ''}`}>
                  {wantsReschedule && <div className="radio-circle-inner" />}
                </div>
                <CalendarClock size={16} color="var(--azul-acero)" />
                <span style={{ fontSize: 14, color: 'var(--grafito)' }}>Deseo reagendar</span>
              </div>
              <div className={`reschedule-content ${wantsReschedule ? 'open' : ''}`}>
                <p style={{
                  paddingLeft: 28,
                  fontSize: 13,
                  color: 'var(--gris-medio)',
                  lineHeight: 1.5,
                  paddingTop: 4,
                }}>
                  Ingresa tu número y presiona continuar. Te mostraremos tu cita actual con opciones para cambiarla.
                </p>
              </div>
            </div>

            {error && <p style={{ color: 'var(--terracota)', fontSize: 14, marginBottom: 12 }}>{error}</p>}

            <button type="submit" disabled={loading || !phoneNumber.trim()} className="btn-primary">
              {loading ? 'Buscando...' : 'Continuar'}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>
        </div>

        <ProgressDots current={1} />
      </Layout>
    );
  }

  // ─── Screen 2: Onboarding ──────────────────────────────────
  if (screen === 2) {
    const minAge = config?.min_age || 23;
    const maxAge = config?.max_age || 75;

    return (
      <Layout>
        <Logo width={90} />
        <h1 style={{ fontSize: 26, fontWeight: 600, textAlign: 'center', color: 'var(--negro)', marginBottom: 6 }}>
          Cuéntanos de ti
        </h1>
        <p style={{ fontSize: 14, color: 'var(--gris-medio)', textAlign: 'center', marginBottom: 12 }}>
          Para brindarte la mejor experiencia
        </p>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          marginBottom: 24,
        }}>
          <Info size={12} color="var(--terracota)" />
          <span style={{ fontSize: 12, color: 'var(--terracota)' }}>Todos los campos son obligatorios</span>
        </div>

        <div className="card">
          <form onSubmit={handleOnboardingSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Nombre */}
              <div>
                <span className="field-label">NOMBRE *</span>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} required className="input-field" placeholder="Tu nombre" />
              </div>

              {/* Apellido */}
              <div>
                <span className="field-label">APELLIDO *</span>
                <input value={lastName} onChange={e => setLastName(e.target.value)} required className="input-field" placeholder="Tu apellido" />
              </div>

              {/* Edad */}
              <div>
                <span className="field-label">EDAD *</span>
                <input
                  type="number"
                  value={age}
                  onChange={e => setAge(e.target.value)}
                  min={minAge}
                  max={maxAge}
                  required
                  className="input-field"
                  style={{ width: 120 }}
                  placeholder={`${minAge}`}
                />
                <p style={{ fontSize: 12, color: 'var(--gris-medio)', marginTop: 6 }}>
                  Entre {minAge} y {maxAge} años
                </p>
                {age && (Number(age) < minAge || Number(age) > maxAge) && (
                  <p style={{ color: 'var(--terracota)', fontSize: 12, marginTop: 4 }}>
                    La edad debe estar entre {minAge} y {maxAge}
                  </p>
                )}
              </div>

              {/* Ciudad / País */}
              {isInternational ? (
                <div>
                  <span className="field-label">PAÍS *</span>
                  <input value={country} onChange={e => setCountry(e.target.value)} required className="input-field" placeholder="Tu país" />
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <span className="field-label">CIUDAD *</span>
                  <div style={{ position: 'relative' }}>
                    <select
                      value={city}
                      onChange={e => setCity(e.target.value)}
                      required
                      className="input-field"
                      style={{ appearance: 'none', paddingRight: 40 }}
                    >
                      {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown
                      size={16}
                      color="var(--gris-medio)"
                      style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                    />
                  </div>
                </div>
              )}

              {/* Source */}
              <div>
                <span className="field-label" style={{ marginBottom: 10 }}>¿CÓMO SUPISTE DE DANIEL? *</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {SOURCES.map(s => (
                    <label key={s} className="radio-option">
                      <div className={`radio-circle ${source === s ? 'active' : ''}`}>
                        {source === s && <div className="radio-circle-inner" />}
                      </div>
                      <span style={{ fontSize: 14 }}>{s}</span>
                      <input
                        type="radio"
                        name="source"
                        value={s}
                        checked={source === s}
                        onChange={e => setSource(e.target.value)}
                        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                      />
                    </label>
                  ))}
                </div>
              </div>

              {error && <p style={{ color: 'var(--terracota)', fontSize: 14 }}>{error}</p>}

              <button
                type="submit"
                disabled={loading || !firstName || !lastName || !age || !source || (Number(age) < minAge || Number(age) > maxAge)}
                className="btn-primary"
              >
                {loading ? 'Guardando...' : 'Continuar'}
                {!loading && <ArrowRight size={18} />}
              </button>
            </div>
          </form>
        </div>

        <ProgressDots current={2} />
      </Layout>
    );
  }

  // ─── Screen 3: Calendar + Slots ──────────────────────────────────
  if (screen === 3) {
    const freeSlots = slots.filter(s => s.status === 'free' || !s.status);
    const morningSlots = freeSlots.filter(s => s.block === 'morning');
    const afternoonSlots = freeSlots.filter(s => s.block === 'afternoon');

    return (
      <Layout>
        <Logo width={90} />
        <h1 style={{ fontSize: 24, fontWeight: 600, textAlign: 'center', color: 'var(--negro)', marginBottom: 6 }}>
          Elige fecha y hora
        </h1>
        <p style={{ fontSize: 14, color: 'var(--gris-medio)', textAlign: 'center', marginBottom: 24 }}>
          Para tu sesión con Daniel
        </p>

        <div className="card" style={{ marginBottom: 16 }}>
          <Calendar
            onSelectDate={handleDateSelect}
            selectedDate={selectedDate}
            availableDays={config?.available_days || []}
            windowDays={config?.window_days || 10}
          />
        </div>

        {selectedDate && (
          <div className="card">
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--negro)', marginBottom: 16 }}>
              {formatDateES(selectedDate)}
            </h2>

            {slotsLoading ? (
              <p style={{ textAlign: 'center', color: 'var(--gris-medio)', padding: '24px 0' }}>
                Consultando disponibilidad...
              </p>
            ) : freeSlots.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--gris-medio)', padding: '24px 0' }}>
                No hay horarios disponibles este día
              </p>
            ) : (
              <>
                {morningSlots.length > 0 && (
                  <div style={{ marginBottom: afternoonSlots.length > 0 ? 0 : 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <Sun size={12} color="var(--dorado)" />
                      <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--gris-medio)' }}>
                        Mañana
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {morningSlots.map(s => (
                        <button
                          key={s.time}
                          onClick={() => { setSelectedSlot(s.time); setScreen(4); }}
                          className={`slot-btn ${selectedSlot === s.time ? 'selected' : ''}`}
                        >
                          {s.time}
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
                      <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--gris-medio)' }}>
                        Tarde
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {afternoonSlots.map(s => (
                        <button
                          key={s.time}
                          onClick={() => { setSelectedSlot(s.time); setScreen(4); }}
                          className={`slot-btn ${selectedSlot === s.time ? 'selected' : ''}`}
                        >
                          {s.time}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          marginTop: 16,
        }}>
          <Globe size={13} color="var(--gris-claro)" />
          <span style={{ fontSize: 12, color: 'var(--gris-claro)' }}>Bolivia (BOT)</span>
        </div>

        <ProgressDots current={3} />
      </Layout>
    );
  }

  // ─── Screen 4: Confirmation ──────────────────────────────────
  if (screen === 4) {
    return (
      <Layout>
        <Logo width={90} />
        <h1 style={{ fontSize: 24, fontWeight: 600, textAlign: 'center', color: 'var(--negro)', marginBottom: 6 }}>
          Confirma tu sesión
        </h1>
        <p style={{ fontSize: 14, color: 'var(--terracota)', textAlign: 'center', marginBottom: 24 }}>
          Revisa los detalles antes de confirmar
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
          <div className="detail-row" style={{ paddingBottom: 0 }}>
            <div className="detail-icon">
              <Clock size={18} color="var(--gris-medio)" />
            </div>
            <div>
              <div className="detail-label">Hora</div>
              <div className="detail-value">{selectedSlot} hs</div>
            </div>
          </div>
        </div>

        {error && <p style={{ color: 'var(--terracota)', fontSize: 14, textAlign: 'center', marginBottom: 12 }}>{error}</p>}

        <button
          onClick={handleConfirmBooking}
          disabled={loading}
          className="btn-primary"
          style={{ marginBottom: 12 }}
        >
          <Check size={18} />
          {loading ? 'Confirmando...' : 'Confirmar cita'}
        </button>
        <button onClick={() => setScreen(3)} className="btn-secondary">
          <ArrowLeft size={18} />
          Elegir otra hora
        </button>

        <ProgressDots current={4} />
      </Layout>
    );
  }

  // ─── Screen 5: Confirmed ──────────────────────────────────
  if (screen === 5) {
    return (
      <Layout>
        <Logo width={90} />

        {/* Check circle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div className="animate-checkmark" style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'var(--cian-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Check size={32} color="var(--petroleo)" />
          </div>
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 600, textAlign: 'center', color: 'var(--negro)', marginBottom: 6 }}>
          Tu cita está confirmada
        </h1>
        <p style={{ fontSize: 14, color: 'var(--turquesa)', textAlign: 'center', marginBottom: 24 }}>
          Gracias por tu confianza
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
                <div className="detail-value">{bookedAppointment.time} hs</div>
              </div>
            </div>
          </div>
        )}

        {/* Notice box */}
        <div className="notice-box" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <MessageCircle size={18} color="var(--grafito)" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, color: 'var(--grafito)', lineHeight: 1.5 }}>
              Te llegará un recordatorio el día antes de tu cita.
            </p>
          </div>
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', marginTop: 12, paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <TriangleAlert size={18} color="var(--terracota)" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 13, color: 'var(--grafito)', lineHeight: 1.5 }}>
                Toda cancelación o cambio se debe hacer con mínimo <strong>6 horas</strong> de anticipación, caso contrario se cobrará el <strong>50%</strong> del monto de la sesión.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setScreen(1);
            setClient(null);
            setSelectedDate(null);
            setSelectedSlot(null);
            setBookedAppointment(null);
            setPhoneNumber('');
            setWantsReschedule(false);
          }}
          className="btn-secondary"
        >
          <ArrowLeft size={18} />
          Volver al inicio
        </button>

        <ProgressDots current={4} done={true} />
      </Layout>
    );
  }

  // ─── Screen 6: Already Has Appointment ──────────────────────────────────
  if (screen === 6 && activeAppointment) {
    const apptDate = activeAppointment.date_time.split('T')[0];
    const apptTime = activeAppointment.date_time.split('T')[1]?.substring(0, 5) || '';

    return (
      <Layout>
        <Logo width={90} />

        <h1 style={{ fontSize: 22, fontWeight: 600, textAlign: 'center', color: 'var(--negro)', marginBottom: 12 }}>
          Hola {client?.first_name}
        </h1>

        {/* Alert badge */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div className="alert-badge">
            <AlertCircle size={14} color="var(--terracota)" />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--terracota)' }}>
              Ya tienes una cita agendada
            </span>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: 'var(--gris-medio)', marginBottom: 12 }}>
            Tu cita está agendada para el:
          </p>
          <div className="detail-row" style={{ paddingTop: 0, borderTop: 'none' }}>
            <div className="detail-icon">
              <CalendarIcon size={18} color="var(--gris-medio)" />
            </div>
            <div>
              <div className="detail-value">{formatDateES(apptDate)}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--azul-acero)', marginTop: 2 }}>
                {apptTime} hs
              </div>
            </div>
          </div>
        </div>

        <p style={{ fontSize: 15, fontWeight: 500, textAlign: 'center', color: 'var(--negro)', marginBottom: 16 }}>
          ¿Qué deseas hacer?
        </p>

        <button
          onClick={() => setScreen(3)}
          className="btn-primary"
          style={{ marginBottom: 12 }}
        >
          <CalendarClock size={18} />
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
          Conservar mi cita
        </button>
      </Layout>
    );
  }

  return (
    <Layout>
      <p style={{ textAlign: 'center', color: 'var(--gris-medio)', paddingTop: 48 }}>Cargando...</p>
    </Layout>
  );
}

function Layout({ children }) {
  return (
    <div className="booking-container" style={{ paddingBottom: 32 }}>
      {children}
    </div>
  );
}
