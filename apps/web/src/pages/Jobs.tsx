import { Link, useSearchParams } from 'react-router-dom';
import { JOB_STATUSES, STATUS_LABELS, type Job } from '@pdp/shared';
import { useApi } from '../api';
import { StatusBadge } from '../components/StatusBadge';

export function Jobs() {
  const [params, setParams] = useSearchParams();
  const query = new URLSearchParams();
  for (const key of ['status', 'q', 'mine']) {
    const v = params.get(key);
    if (v) query.set(key, v);
  }
  const { data, error } = useApi<Job[]>(`/jobs?${query}`);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <>
      <div className="page-head">
        <h1>Jobs</h1>
      </div>
      <div className="card filters">
        <input
          type="search"
          placeholder="Search reference, owner, address or suburb"
          defaultValue={params.get('q') ?? ''}
          onChange={(e) => update('q', e.target.value)}
          aria-label="Search jobs"
        />
        <select value={params.get('status') ?? ''} onChange={(e) => update('status', e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {JOB_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={params.get('mine') === 'true'} onChange={(e) => update('mine', e.target.checked ? 'true' : '')} />
          Assigned to me
        </label>
      </div>
      <section className="card">
        {error && <div className="alert">{error}</div>}
        {data ? <JobTable jobs={data} /> : <p className="page-loading">Loading…</p>}
      </section>
    </>
  );
}

export function JobTable({ jobs, compact = false }: { jobs: Job[]; compact?: boolean }) {
  if (!jobs.length) return <p className="muted empty">No jobs found.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Property</th>
            {!compact && <th>Owner</th>}
            <th>Status</th>
            {!compact && <th>Surveyor</th>}
            {!compact && <th>Requested</th>}
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td><Link to={`/app/jobs/${j.id}`} className="ref">{j.reference}</Link></td>
              <td>{j.propertyAddress}, {j.suburb}<span className="muted small block">{j.propertyType}</span></td>
              {!compact && <td>{j.ownerName}</td>}
              <td><StatusBadge status={j.status} /></td>
              {!compact && <td>{j.assignedName ?? <span className="muted">Unassigned</span>}</td>}
              {!compact && <td>{new Date(j.createdAt).toLocaleDateString('en-AU')}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
