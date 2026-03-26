import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';

const STATUSES = ['Nuevo', 'Prospecto', 'Activo', 'Inactivo', 'Bloqueado'];
const CITIES = ['Cochabamba', 'Santa Cruz', 'La Paz', 'Sucre', 'Otro'];

function authHeaders(token) {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export default function Clients() {
  const { token } = useOutletContext();
  const [clients, setClients] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: '', city: '', search: '' });
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page, limit: 20 });
    if (filters.status) params.set('status', filters.status);
    if (filters.city) params.set('city', filters.city);
    if (filters.search) params.set('search', filters.search);

    const res = await fetch(`/api/admin/clients?${params}`, { headers: authHeaders(token) });
    const data = await res.json();
    setClients(data.clients || []);
    setTotal(data.total || 0);
  }, [token, page, filters]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    const method = creating ? 'POST' : 'PUT';
    const url = creating ? '/api/admin/clients' : `/api/admin/clients/${editing}`;
    await fetch(url, { method, headers: authHeaders(token), body: JSON.stringify(form) });
    setEditing(null);
    setCreating(false);
    setForm({});
    load();
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este cliente?')) return;
    await fetch(`/api/admin/clients/${id}`, { method: 'DELETE', headers: authHeaders(token) });
    load();
  }

  async function quickStatus(id, status) {
    await fetch(`/api/admin/clients/${id}`, {
      method: 'PUT', headers: authHeaders(token), body: JSON.stringify({ status }),
    });
    load();
  }

  function openEdit(client) {
    setEditing(client.id);
    setCreating(false);
    setForm({ ...client });
  }

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setForm({ phone: '', first_name: '', last_name: '', age: '', city: 'Cochabamba', source: 'Otro', status: 'Nuevo', fee: 250 });
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clientes ({total})</h1>
        <button onClick={openCreate} className="btn-primary !py-2 text-sm">+ Agregar cliente</button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Buscar nombre o teléfono..."
          value={filters.search}
          onChange={e => { setFilters(f => ({...f, search: e.target.value})); setPage(1); }}
          className="input-field !w-64"
        />
        <select value={filters.status} onChange={e => { setFilters(f => ({...f, status: e.target.value})); setPage(1); }} className="input-field !w-40">
          <option value="">Todos los status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.city} onChange={e => { setFilters(f => ({...f, city: e.target.value})); setPage(1); }} className="input-field !w-40">
          <option value="">Todas las ciudades</option>
          {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-arena text-left">
              <th className="py-2 font-medium text-gris-medio">Nombre</th>
              <th className="py-2 font-medium text-gris-medio">Teléfono</th>
              <th className="py-2 font-medium text-gris-medio">Ciudad</th>
              <th className="py-2 font-medium text-gris-medio">Status</th>
              <th className="py-2 font-medium text-gris-medio">Arancel</th>
              <th className="py-2 font-medium text-gris-medio">Registro</th>
              <th className="py-2 font-medium text-gris-medio">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {clients.map(c => (
              <tr key={c.id} className="border-b border-blanco-gris hover:bg-hueso/50">
                <td className="py-2.5 font-medium">{c.first_name} {c.last_name}</td>
                <td className="py-2.5 text-gris-medio">{c.phone}</td>
                <td className="py-2.5">{c.city}</td>
                <td className="py-2.5">
                  <select
                    value={c.status}
                    onChange={e => quickStatus(c.id, e.target.value)}
                    className="text-xs border border-arena rounded px-1.5 py-1 bg-white"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="py-2.5">Bs {c.fee}</td>
                <td className="py-2.5 text-gris-medio text-xs">{c.created_at?.split('T')[0]}</td>
                <td className="py-2.5 space-x-2">
                  <button onClick={() => openEdit(c)} className="text-azul-acero hover:underline text-xs">Editar</button>
                  <button onClick={() => handleDelete(c.id)} className="text-terracota hover:underline text-xs">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {clients.length === 0 && <p className="text-center text-gris-medio py-6">Sin resultados</p>}
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

      {/* Edit/Create Modal */}
      {(editing || creating) && (
        <div className="fixed inset-0 bg-negro/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-lg mb-4">{creating ? 'Nuevo cliente' : 'Editar cliente'}</h3>
            <div className="space-y-3">
              <input placeholder="Teléfono" value={form.phone || ''} onChange={e => setForm({...form, phone: e.target.value})} className="input-field" />
              <input placeholder="Nombre" value={form.first_name || ''} onChange={e => setForm({...form, first_name: e.target.value})} className="input-field" />
              <input placeholder="Apellido" value={form.last_name || ''} onChange={e => setForm({...form, last_name: e.target.value})} className="input-field" />
              <input type="number" placeholder="Edad" value={form.age || ''} onChange={e => setForm({...form, age: e.target.value})} className="input-field" />
              <select value={form.city || 'Cochabamba'} onChange={e => setForm({...form, city: e.target.value})} className="input-field">
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={form.status || 'Nuevo'} onChange={e => setForm({...form, status: e.target.value})} className="input-field">
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input type="number" placeholder="Arancel (Bs)" value={form.fee || ''} onChange={e => setForm({...form, fee: e.target.value})} className="input-field" />
              <textarea placeholder="Notas" value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} className="input-field !min-h-[80px]" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleSave} className="btn-primary flex-1">Guardar</button>
              <button onClick={() => { setEditing(null); setCreating(false); }} className="btn-secondary flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
