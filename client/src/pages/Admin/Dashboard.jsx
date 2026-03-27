import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

function authHeaders(token) {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function toBoliviaTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/La_Paz' });
}

function toBoliviaDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/La_Paz' });
}

export default function Dashboard() {
  const { token } = useOutletContext();
  const [todayAppts, setTodayAppts] = useState([]);
  const [weekAppts, setWeekAppts] = useState([]);
  const [recentClients, setRecentClients] = useState([]);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    fetch(`/api/admin/appointments?from=${today}&to=${today}&limit=50`, { headers: authHeaders(token) })
      .then(r => r.json()).then(d => setTodayAppts(d.appointments || [])).catch(() => {});

    fetch(`/api/admin/appointments?from=${today}&to=${weekEnd}&limit=50`, { headers: authHeaders(token) })
      .then(r => r.json()).then(d => setWeekAppts(d.appointments || [])).catch(() => {});

    fetch('/api/admin/clients?limit=5', { headers: authHeaders(token) })
      .then(r => r.json()).then(d => setRecentClients(d.clients || [])).catch(() => {});
  }, [token]);

  // Group week by day
  const weekByDay = {};
  for (const a of weekAppts) {
    const day = toBoliviaDate(a.date_time) || 'unknown';
    weekByDay[day] = (weekByDay[day] || 0) + 1;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Today */}
      <div className="card">
        <h2 className="font-semibold text-lg mb-3">Citas de hoy</h2>
        {todayAppts.length === 0 ? (
          <p className="text-gris-medio text-sm">No hay citas para hoy</p>
        ) : (
          <div className="space-y-2">
            {todayAppts.map(a => (
              <div key={a.id} className="flex justify-between items-center py-2 border-b border-blanco-gris last:border-0">
                <span className="font-medium">{toBoliviaTime(a.date_time)} hs</span>
                <span>{a.first_name} {a.last_name}</span>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  a.status === 'Confirmada' ? 'bg-azul-acero/10 text-azul-acero' :
                  a.status === 'Cancelada' ? 'bg-terracota/10 text-terracota' :
                  'bg-arena/50 text-gris-medio'
                }`}>{a.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Week summary */}
      <div className="card">
        <h2 className="font-semibold text-lg mb-3">Próximos 7 días</h2>
        {Object.keys(weekByDay).length === 0 ? (
          <p className="text-gris-medio text-sm">Sin citas esta semana</p>
        ) : (
          <div className="flex gap-3 flex-wrap">
            {Object.entries(weekByDay).sort().map(([day, count]) => (
              <div key={day} className="bg-blanco-gris rounded-lg px-4 py-2 text-center">
                <p className="text-xs text-gris-medio">{day}</p>
                <p className="text-xl font-semibold text-azul-acero">{count}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent clients */}
      <div className="card">
        <h2 className="font-semibold text-lg mb-3">Últimos clientes</h2>
        {recentClients.length === 0 ? (
          <p className="text-gris-medio text-sm">Sin clientes registrados</p>
        ) : (
          <div className="space-y-2">
            {recentClients.map(c => (
              <div key={c.id} className="flex justify-between items-center py-2 border-b border-blanco-gris last:border-0">
                <span className="font-medium">{c.first_name} {c.last_name}</span>
                <span className="text-sm text-gris-medio">{c.phone}</span>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  c.status === 'Activo' ? 'bg-turquesa/10 text-turquesa' :
                  c.status === 'Nuevo' ? 'bg-dorado/20 text-negro' :
                  'bg-arena/50 text-gris-medio'
                }`}>{c.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
