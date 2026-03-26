import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/config', label: 'Configuración' },
  { to: '/admin/clients', label: 'Clientes' },
  { to: '/admin/appointments', label: 'Citas' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => localStorage.getItem('admin_token'));

  useEffect(() => {
    if (!token) navigate('/admin/login');
  }, [token, navigate]);

  if (!token) return null;

  return (
    <div className="min-h-screen bg-hueso">
      <nav className="bg-white border-b border-arena px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="font-semibold text-negro">Admin Panel</span>
          <div className="flex gap-1">
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-azul-acero text-white' : 'text-gris-medio hover:text-negro hover:bg-blanco-gris'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
          <button
            onClick={() => { localStorage.removeItem('admin_token'); setToken(null); }}
            className="text-sm text-terracota hover:underline"
          >
            Salir
          </button>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto p-4 md:p-6">
        <Outlet context={{ token }} />
      </main>
    </div>
  );
}
