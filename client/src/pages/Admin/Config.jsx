import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

const DAYS_ORDER = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const DAYS_LABELS = { lunes:'Lunes', martes:'Martes', miercoles:'Miércoles', jueves:'Jueves', viernes:'Viernes', sabado:'Sábado', domingo:'Domingo' };
const ALL_HOURS = [];
for (let h = 6; h <= 21; h++) ALL_HOURS.push(`${String(h).padStart(2,'0')}:00`);

function authHeaders(token) {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export default function Config() {
  const { token } = useOutletContext();
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [copyFrom, setCopyFrom] = useState(null);
  const [copyTargets, setCopyTargets] = useState([]);

  useEffect(() => {
    fetch('/api/admin/config', { headers: authHeaders(token) })
      .then(r => r.json()).then(setCfg).catch(() => {});
  }, [token]);

  if (!cfg) return <p className="text-gris-medio">Cargando...</p>;

  const hours = cfg.available_hours || {};
  const days = cfg.available_days || [];

  function toggleDay(day) {
    const newDays = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
    setCfg({ ...cfg, available_days: newDays });
  }

  function addHour(day, hour) {
    const current = hours[day] || [];
    if (current.includes(hour)) return;
    const updated = [...current, hour].sort();
    setCfg({ ...cfg, available_hours: { ...hours, [day]: updated } });
  }

  function removeHour(day, hour) {
    const updated = (hours[day] || []).filter(h => h !== hour);
    setCfg({ ...cfg, available_hours: { ...hours, [day]: updated } });
  }

  function applyCopy() {
    if (!copyFrom) return;
    const sourceHours = hours[copyFrom] || [];
    const newHours = { ...hours };
    for (const target of copyTargets) {
      newHours[target] = [...sourceHours];
    }
    setCfg({ ...cfg, available_hours: newHours });
    setCopyFrom(null);
    setCopyTargets([]);
  }

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error('Error al guardar');
      setMsg('Guardado');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Configuración</h1>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
      {msg && <p className={`text-sm ${msg === 'Guardado' ? 'text-turquesa' : 'text-terracota'}`}>{msg}</p>}

      {/* Schedule by day */}
      <div className="card">
        <h2 className="font-semibold text-lg mb-4">Horarios por día</h2>
        <div className="space-y-4">
          {DAYS_ORDER.map(day => (
            <div key={day} className="border-b border-blanco-gris pb-4 last:border-0">
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={days.includes(day)}
                    onChange={() => toggleDay(day)}
                    className="w-5 h-5 rounded accent-azul-acero"
                  />
                  <span className="font-medium">{DAYS_LABELS[day]}</span>
                </label>
                <button
                  onClick={() => { setCopyFrom(day); setCopyTargets([]); }}
                  className="text-xs text-azul-acero hover:underline"
                >
                  Copiar a otros días
                </button>
              </div>

              {days.includes(day) && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(hours[day] || []).map(h => (
                    <span key={h} className="inline-flex items-center gap-1 bg-azul-acero/10 text-azul-acero text-xs font-medium px-2.5 py-1.5 rounded-lg">
                      {h}
                      <button onClick={() => removeHour(day, h)} className="hover:text-terracota ml-0.5">&times;</button>
                    </span>
                  ))}
                  <select
                    onChange={e => { if (e.target.value) addHour(day, e.target.value); e.target.value = ''; }}
                    className="text-xs border border-arena rounded-lg px-2 py-1.5 bg-white"
                    defaultValue=""
                  >
                    <option value="">+ Agregar</option>
                    {ALL_HOURS.filter(h => !(hours[day] || []).includes(h)).map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Copy modal */}
      {copyFrom && (
        <div className="fixed inset-0 bg-negro/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-semibold mb-3">Copiar horario de {DAYS_LABELS[copyFrom]} a:</h3>
            <div className="space-y-2 mb-4">
              {DAYS_ORDER.filter(d => d !== copyFrom).map(d => (
                <label key={d} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={copyTargets.includes(d)}
                    onChange={() => setCopyTargets(prev =>
                      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
                    )}
                    className="w-4 h-4 accent-azul-acero"
                  />
                  <span className="text-sm">{DAYS_LABELS[d]}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={applyCopy} disabled={copyTargets.length === 0} className="btn-primary flex-1 !py-2 text-sm">
                Aplicar
              </button>
              <button onClick={() => setCopyFrom(null)} className="btn-secondary flex-1 !py-2 text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* General params */}
      <div className="card">
        <h2 className="font-semibold text-lg mb-4">Parámetros generales</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-gris-medio mb-1">Ventana de días</label>
            <input type="number" value={cfg.window_days} onChange={e => setCfg({...cfg, window_days: Number(e.target.value)})} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-gris-medio mb-1">Buffer (horas)</label>
            <input type="number" value={cfg.buffer_hours} onChange={e => setCfg({...cfg, buffer_hours: Number(e.target.value)})} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-gris-medio mb-1">Duración cita (min)</label>
            <input type="number" value={cfg.appointment_duration} onChange={e => setCfg({...cfg, appointment_duration: Number(e.target.value)})} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-gris-medio mb-1">Edad mínima</label>
            <input type="number" value={cfg.min_age} onChange={e => setCfg({...cfg, min_age: Number(e.target.value)})} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-gris-medio mb-1">Edad máxima</label>
            <input type="number" value={cfg.max_age} onChange={e => setCfg({...cfg, max_age: Number(e.target.value)})} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-gris-medio mb-1">Descanso inicio</label>
            <input type="text" value={cfg.break_start} onChange={e => setCfg({...cfg, break_start: e.target.value})} className="input-field" placeholder="13:00" />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-gris-medio mb-1">Descanso fin</label>
            <input type="text" value={cfg.break_end} onChange={e => setCfg({...cfg, break_end: e.target.value})} className="input-field" placeholder="15:59" />
          </div>
        </div>
      </div>

      {/* Fees */}
      <div className="card">
        <h2 className="font-semibold text-lg mb-4">Aranceles</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-gris-medio mb-1">Arancel default (Bs)</label>
            <input type="number" value={cfg.default_fee} onChange={e => setCfg({...cfg, default_fee: Number(e.target.value)})} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-gris-medio mb-1">Arancel capital (Bs)</label>
            <input type="number" value={cfg.capital_fee} onChange={e => setCfg({...cfg, capital_fee: Number(e.target.value)})} className="input-field" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium uppercase tracking-widest text-gris-medio mb-1">Ciudades capital</label>
            <input type="text" value={cfg.capital_cities} onChange={e => setCfg({...cfg, capital_cities: e.target.value})} className="input-field" placeholder="Santa Cruz,La Paz" />
          </div>
        </div>
      </div>
    </div>
  );
}
