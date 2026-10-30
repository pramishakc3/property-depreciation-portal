import { Link } from 'react-router-dom';
import { JOB_STATUSES, STATUS_LABELS, type Dashboard as DashboardData } from '@pdp/shared';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { JobTable } from './Jobs';

export function Dashboard() {
  const { user } = useAuth();
  const { data, error } = useApi<DashboardData>('/dashboard');
  if (error) return <div className="alert">{error}</div>;
  if (!data) return <p className="page-loading">Loading…</p>;

  const max = Math.max(1, ...Object.values(data.byStatus));
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Good to see you, {user?.name.split(' ')[0]}</h1>
          <p className="muted">Depreciation report jobs across the team</p>
        </div>
        <Link className="btn primary" to="/app/jobs?mine=true">My jobs</Link>
      </div>

      <div className="stats">
        <Stat label="Open jobs" value={data.openJobs} />
        <Stat label="Unassigned" value={data.unassigned} tone={data.unassigned > 0 ? 'warn' : undefined} />
        <Stat label="Completed this month" value={data.completedThisMonth} />
        <Stat label="All jobs" value={data.totalJobs} />
      </div>

      <div className="grid two">
        <section className="card">
          <h2>Pipeline</h2>
          <ul className="pipeline">
            {JOB_STATUSES.map((s) => (
              <li key={s}>
                <Link to={`/app/jobs?status=${s}`}>{STATUS_LABELS[s]}</Link>
                <div className="bar"><div className={`bar-fill status-${s}`} style={{ width: `${(data.byStatus[s] / max) * 100}%` }} /></div>
                <strong>{data.byStatus[s]}</strong>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>Latest requests</h2>
          <JobTable jobs={data.recent} compact />
        </section>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div className={`stat card${tone ? ` ${tone}` : ''}`}>
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
