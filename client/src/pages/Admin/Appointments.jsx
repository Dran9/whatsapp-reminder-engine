import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';

const STATUSES = ['Confirmada', 'Reagendada', 'Cancelada', 'Completada', 'No-show'];

function authHeaders(token) {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export default function Appointments() {
  const { token } = useOutletContext();
  const [appointments, setAppointments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page, limit: 20 });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (status) params.set('status', status);

    const res = await fetch(`/api/admin/appointments?${params}`, { headers: authHeaders(token) });
    const data = await res.json();
    setAppointments(data.appointments || []);
    setTotal(data.total || 0);
  }, [token, page, from, to, status]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(id, newStatus) {
    await fetch(`/api/admin/appointments/${id}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Citas ({total})</h1>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs text-gris-medio mb-1">Desde</label>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} className="input-field !w-40" />
        </div>
        <div>
          <label className="block text-xs text-gris-medio mb-1">Hasta</label>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} className="input-field !w-40" />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="input-field !w-40">
          <option value="">Todos</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-arena text-left">
              <th className="py-2 font-medium text-gris-medio">Fecha/Hora</th>
              <th className="py-2 font-medium text-gris-medio">Cliente</th>
              <th className="py-2 font-medium text-gris-medio">Teléfono</th>
              <th className="py-2 font-medium text-gris-medio">Estado</th>
              <th className="py-2 font-medium text-gris-medio">GCal ID</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map(a => (
              <tr key={a.id} className="border-b border-blanco-gris hover:bg-hueso/50">
                <td className="py-2.5 font-medium">
                  {a.date_time?.split('T')[0]} {a.date_time?.split('T')[1]?.substring(0, 5)}
                </td>
                <td className="py-2.5">{a.first_name} {a.last_name}</td>
                <td className="py-2.5 text-gris-medio">{a.client_phone || a.phone}</td>
                <td className="py-2.5">
                  <select
                    value={a.status}
                    onChange={e => changeStatus(a.id, e.target.value)}
                    className={`text-xs border rounded px-1.5 py-1 ${
                      a.status === 'Confirmada' ? 'border-azul-acero text-azul-acero bg-azul-acero/5' :
                      a.status === 'Cancelada' ? 'border-terracota text-terracota bg-terracota/5' :
                      a.status === 'Completada' ? 'border-turquesa text-turquesa bg-turquesa/5' :
                      'border-arena bg-white'
                    }`}
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="py-2.5 text-xs text-gris-claro max-w-[120px] truncate">{a.gcal_event_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {appointments.length === 0 && <p className="text-center text-gris-medio py-6">Sin citas</p>}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={`w-8 h-8 rounded-lg text-sm ${page === i + 1 ? 'bg-azul-acero text-white' : 'bg-blanco-gris text-gris-medio hover:bg-arena'}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
