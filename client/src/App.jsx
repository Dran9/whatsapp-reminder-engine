import { Routes, Route, Navigate } from 'react-router-dom';
import BookingFlow from './pages/BookingFlow';
import Dashboard from './pages/Admin/Dashboard';
import Config from './pages/Admin/Config';
import Clients from './pages/Admin/Clients';
import Appointments from './pages/Admin/Appointments';
import AdminLogin from './pages/Admin/AdminLogin';
import AdminLayout from './components/AdminLayout';

export default function App() {
  return (
    <Routes>
      {/* Public booking */}
      <Route path="/" element={<BookingFlow />} />

      {/* Admin */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="config" element={<Config />} />
        <Route path="clients" element={<Clients />} />
        <Route path="appointments" element={<Appointments />} />
      </Route>
    </Routes>
  );
}
