import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Role } from '@pdp/shared';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { Admin } from './pages/Admin';
import { Dashboard } from './pages/Dashboard';
import { JobDetail } from './pages/JobDetail';
import { Jobs } from './pages/Jobs';
import { Login } from './pages/Login';
import { RequestForm } from './pages/RequestForm';

function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) return <p className="page-loading">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<RequestForm />} />
      <Route path="/login" element={<Login />} />
      <Route path="/app" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="admin" element={<RequireAuth roles={['admin']}><Admin /></RequireAuth>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
