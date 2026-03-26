import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import Logo from '../components/Logo';
import Calendar from '../components/Calendar';

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

  // Check URL params on mount
  useEffect(() => {
    const t = params.get('t');
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
      const isReschedule = activeAppointment && screen === 3;

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

  // ─── Screens ──────────────────────────────────────────────

  // Screen 1: Phone input
  if (screen === 1) {
    return (
      <Layout>
        <Logo className="mb-8" />
        <h1 className="text-3xl font-bold text-center mb-2">Agenda tu sesión</h1>
        <p className="text-gris-medio text-center mb-8 text-sm">Ingresa tu número de teléfono para comenzar</p>

        <div className="card">
          <form onSubmit={handlePhoneSubmit}>
            <label className="block text-xs font-medium uppercase tracking-widest text-gris-medio mb-2">
              Teléfono
            </label>
            <div className="flex gap-2 mb-4">
              <select
                value={countryCode}
                onChange={e => setCountryCode(e.target.value)}
                className="input-field !w-28 text-sm"
              >
                {COUNTRY_CODES.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                ))}
              </select>
              <input
                type="tel"
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                placeholder="71234567"
                className="input-field flex-1"
                autoFocus
              />
            </div>
            {error && <p className="text-terracota text-sm mb-3">{error}</p>}
            <button type="submit" disabled={loading || !phoneNumber.trim()} className="btn-primary w-full">
              {loading ? 'Buscando...' : 'Continuar \u2192'}
            </button>
          </form>
        </div>
      </Layout>
    );
  }

  // Screen 2: Onboarding
  if (screen === 2) {
    const minAge = config?.min_age || 23;
    const maxAge = config?.max_age || 75;

    return (
      <Layout>
        <Logo className="mb-6" />
        <h1 className="text-2xl font-bold text-center mb-1">
          Para darte un mejor servicio, déjanos hacerte algunas preguntas.
        </h1>
        <p className="text-terracota/70 text-center text-sm mb-6">* Todos los campos son obligatorios</p>

        <div className="card">
          <form onSubmit={handleOnboardingSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-widest text-gris-medio mb-1">Nombre *</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} required className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-widest text-gris-medio mb-1">Apellido *</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} required className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-widest text-gris-medio mb-1">Edad *</label>
              <input
                type="number"
                value={age}
                onChange={e => setAge(e.target.value)}
                min={minAge}
                max={maxAge}
                required
                className="input-field"
                placeholder={`${minAge}–${maxAge}`}
              />
              {age && (Number(age) < minAge || Number(age) > maxAge) && (
                <p className="text-terracota text-xs mt-1">La edad debe estar entre {minAge} y {maxAge}</p>
              )}
            </div>

            {isInternational ? (
              <div>
                <label className="block text-xs font-medium uppercase tracking-widest text-gris-medio mb-1">País *</label>
                <input value={country} onChange={e => setCountry(e.target.value)} required className="input-field" />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium uppercase tracking-widest text-gris-medio mb-1">Ciudad *</label>
                <select value={city} onChange={e => setCity(e.target.value)} required className="input-field">
                  {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium uppercase tracking-widest text-gris-medio mb-2">
                ¿Cómo supiste de Daniel? *
              </label>
              <div className="space-y-2">
                {SOURCES.map(s => (
                  <label key={s} className="flex items-center gap-3 cursor-pointer group">
                    <span className={`
                      w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors
                      ${source === s ? 'border-azul-acero bg-azul-acero' : 'border-arena group-hover:border-gris-medio'}
                    `}>
                      {source === s && <span className="w-2 h-2 bg-white rounded-full" />}
                    </span>
                    <span className="text-sm">{s}</span>
                    <input
                      type="radio"
                      name="source"
                      value={s}
                      checked={source === s}
                      onChange={e => setSource(e.target.value)}
                      className="sr-only"
                    />
                  </label>
                ))}
              </div>
            </div>

            {error && <p className="text-terracota text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !firstName || !lastName || !age || !source || (Number(age) < minAge || Number(age) > maxAge)}
              className="btn-primary w-full"
            >
              {loading ? 'Guardando...' : 'Continuar \u2192'}
            </button>
          </form>
        </div>
      </Layout>
    );
  }

  // Screen 3: Calendar + Slots
  if (screen === 3) {
    const morningSlots = slots.filter(s => s.block === 'morning');
    const afternoonSlots = slots.filter(s => s.block === 'afternoon');

    return (
      <Layout>
        <Logo className="mb-6" />
        {client && !activeAppointment && (
          <p className="text-center text-gris-medio mb-1 text-sm">
            ¡Qué gusto verte de nuevo!
          </p>
        )}
        <h1 className="text-2xl font-bold text-center mb-6">
          Elige una fecha y hora para tu sesión
        </h1>

        <div className="card mb-4">
          <Calendar
            onSelectDate={handleDateSelect}
            selectedDate={selectedDate}
            availableDays={config?.available_days || []}
            windowDays={config?.window_days || 10}
          />
        </div>

        {selectedDate && (
          <div className="card">
            <h2 className="font-semibold text-lg mb-4">{formatDateES(selectedDate)}</h2>

            {slotsLoading ? (
              <p className="text-center text-gris-medio py-6">Consultando disponibilidad...</p>
            ) : slots.length === 0 ? (
              <p className="text-center text-gris-medio py-6">No hay horarios disponibles este día</p>
            ) : (
              <>
                {morningSlots.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium uppercase tracking-widest text-gris-medio mb-2">Mañana</p>
                    <div className="flex flex-wrap gap-2">
                      {morningSlots.map(s => (
                        <button
                          key={s.time}
                          onClick={() => setSelectedSlot(s.time)}
                          className={`
                            py-3 px-5 rounded-xl text-sm font-medium transition-all duration-150 min-w-[72px]
                            ${selectedSlot === s.time
                              ? 'bg-azul-acero text-white shadow-sm'
                              : 'bg-blanco-gris text-negro hover:bg-azul-acero/10 hover:text-azul-acero'
                            }
                          `}
                        >
                          {s.time}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {afternoonSlots.length > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-gris-medio mb-2">Tarde</p>
                    <div className="flex flex-wrap gap-2">
                      {afternoonSlots.map(s => (
                        <button
                          key={s.time}
                          onClick={() => setSelectedSlot(s.time)}
                          className={`
                            py-3 px-5 rounded-xl text-sm font-medium transition-all duration-150 min-w-[72px]
                            ${selectedSlot === s.time
                              ? 'bg-azul-acero text-white shadow-sm'
                              : 'bg-blanco-gris text-negro hover:bg-azul-acero/10 hover:text-azul-acero'
                            }
                          `}
                        >
                          {s.time}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedSlot && (
                  <button
                    onClick={() => setScreen(4)}
                    className="btn-primary w-full mt-5"
                  >
                    Continuar con {selectedSlot} hs &rarr;
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <p className="text-center text-xs text-gris-medio mt-4">
          🌐 Bolivia (UTC-4)
        </p>
      </Layout>
    );
  }

  // Screen 4: Confirmation
  if (screen === 4) {
    return (
      <Layout>
        <Logo className="mb-6" />
        <h1 className="text-2xl font-bold text-center mb-1">Confirma tu sesión</h1>
        <p className="text-terracota/70 text-center text-sm mb-6">Revisa los detalles antes de confirmar</p>

        <div className="card mb-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xl">📅</span>
              <span className="text-lg font-medium">{formatDateES(selectedDate)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xl">🕐</span>
              <span className="text-lg font-medium">{selectedSlot} hs</span>
            </div>
          </div>
        </div>

        {error && <p className="text-terracota text-sm text-center mb-3">{error}</p>}

        <button
          onClick={handleConfirmBooking}
          disabled={loading}
          className="btn-primary w-full mb-3"
        >
          {loading ? 'Confirmando...' : '\u2713 Confirmar cita'}
        </button>
        <button
          onClick={() => setScreen(3)}
          className="btn-secondary w-full"
        >
          Elegir otra hora
        </button>
      </Layout>
    );
  }

  // Screen 5: Confirmed
  if (screen === 5) {
    return (
      <Layout>
        <Logo className="mb-6" />
        <div className="flex justify-center mb-4">
          <div className="w-20 h-20 rounded-full bg-azul-acero/10 flex items-center justify-center animate-checkmark">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4E769B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center mb-1">¡Tu cita está confirmada!</h1>
        <p className="text-center text-gris-medio mb-6">💚 Gracias por tu confianza</p>

        {bookedAppointment && (
          <div className="card mb-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">📅</span>
                <span className="font-medium">{formatDateES(bookedAppointment.date)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xl">🕐</span>
                <span className="font-medium">{bookedAppointment.time} hs</span>
              </div>
            </div>
          </div>
        )}

        <div className="card mb-6">
          <p className="text-sm text-gris-medio leading-relaxed">
            Recibirás un mensaje de confirmación por WhatsApp. Si necesitas reagendar o tienes alguna duda, escribe a Daniel directamente por WhatsApp.
          </p>
        </div>

        <button onClick={() => { setScreen(1); setClient(null); setSelectedDate(null); setSelectedSlot(null); }} className="btn-secondary w-full">
          &larr; Volver al inicio
        </button>
      </Layout>
    );
  }

  // Screen 6: Active appointment
  if (screen === 6 && activeAppointment) {
    const apptDate = activeAppointment.date_time.split('T')[0];
    const apptTime = activeAppointment.date_time.split('T')[1]?.substring(0, 5) || '';

    return (
      <Layout>
        <Logo className="mb-6" />
        <h1 className="text-2xl font-bold text-center mb-1">
          Hola {client?.first_name} 👋
        </h1>
        <p className="text-center text-gris-medio mb-6">⭕ Ya tienes una cita agendada</p>

        <div className="card mb-6">
          <p className="text-sm text-gris-medio mb-2">Tu cita está agendada para el:</p>
          <p className="text-lg font-semibold">{formatDateES(apptDate)}</p>
          <p className="text-lg font-semibold">{apptTime} hs</p>
        </div>

        <p className="text-center font-medium mb-4">✋ ¿Qué deseas hacer?</p>

        <button
          onClick={() => setScreen(3)}
          className="btn-primary w-full mb-3"
        >
          📅 Reagendar mi cita
        </button>
        <button
          onClick={() => {
            setScreen(1);
            setClient(null);
            setActiveAppointment(null);
          }}
          className="btn-secondary w-full"
        >
          📋 Conservar mi cita
        </button>
      </Layout>
    );
  }

  return <Layout><p className="text-center text-gris-medio">Cargando...</p></Layout>;
}

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-hueso flex items-start justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
