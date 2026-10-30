import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Brand } from './Brand';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="shell">
      <header className="topbar">
        <Brand to="/app" />
        <nav>
          <NavLink to="/app" end>Dashboard</NavLink>
          <NavLink to="/app/jobs">Jobs</NavLink>
          {user?.role === 'admin' && <NavLink to="/app/admin">Admin</NavLink>}
        </nav>
        <div className="user">
          <span>
            {user?.name} <small className="role">{user?.role}</small>
          </span>
          <button
            className="btn ghost small"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
