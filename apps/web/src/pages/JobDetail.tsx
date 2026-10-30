import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  assetSchema,
  aud,
  EFFECTIVE_LIFE_PRESETS,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  type JobDetail as JobDetailData,
  type JobStatus,
  type Schedule,
  type User,
} from '@pdp/shared';
import { api, ApiRequestError, useApi } from '../api';
import { canEdit, useAuth } from '../auth';
import { Field } from '../components/Field';
import { StatusBadge } from '../components/StatusBadge';

export function JobDetail() {
  const id = Number(useParams().id);
  const { user } = useAuth();
  const job = useApi<JobDetailData>(`/jobs/${id}`);
  const [years, setYears] = useState(10);
  const schedule = useApi<Schedule>(`/jobs/${id}/schedule?years=${years}`);

  if (job.error) return <div className="alert">{job.error}</div>;
  if (!job.data) return <p className="page-loading">Loading…</p>;
  const j = job.data;
  const editable =
    canEdit(user) && (user?.role === 'admin' || j.assignedTo === null || j.assignedTo === user?.id) &&
    j.status !== 'completed' && j.status !== 'cancelled';
  const refresh = () => {
    job.reload();
    schedule.reload();
  };

  return (
    <>
      <p className="crumbs"><Link to="/app/jobs">Jobs</Link> / {j.reference}</p>
      <div className="page-head">
        <div>
          <h1>{j.propertyAddress}, {j.suburb}</h1>
          <p className="muted">{j.reference} · requested {new Date(j.createdAt).toLocaleDateString('en-AU')}</p>
        </div>
        <StatusBadge status={j.status} />
      </div>

      <div className="grid two">
        <section className="card">
          <h2>Property and owner</h2>
          <dl className="details">
            <dt>Owner</dt><dd>{j.ownerName}</dd>
            <dt>Contact</dt><dd>{j.ownerEmail} · {j.ownerPhone}</dd>
            <dt>Address</dt><dd>{j.propertyAddress}, {j.suburb} {j.state} {j.postcode}</dd>
            <dt>Type</dt><dd className="cap">{j.propertyType}{j.isNewBuild ? ' (new build)' : ''}</dd>
            <dt>Settlement</dt><dd>{new Date(j.purchaseDate).toLocaleDateString('en-AU')} for {aud(j.purchasePrice)}</dd>
            <dt>Year built</dt><dd>{j.constructionYear}</dd>
            {j.notes && <><dt>Notes</dt><dd>{j.notes}</dd></>}
          </dl>
        </section>
        <Workflow key={j.updatedAt} job={j} user={user ?? null} onChange={refresh} />
      </div>

      <Assets job={j} editable={editable} onChange={refresh} />

      <section className="card">
        <div className="card-head">
          <h2>Depreciation schedule</h2>
          <div className="row">
            <select value={years} onChange={(e) => setYears(Number(e.target.value))} aria-label="Years">
              {[5, 10, 20, 40].map((y) => <option key={y} value={y}>{y} years</option>)}
            </select>
            <a className="btn small" href={`/api/jobs/${id}/schedule.csv?years=${years}`}>Download CSV</a>
          </div>
        </div>
        {schedule.data ? <ScheduleView schedule={schedule.data} /> : <p className="page-loading">Calculating…</p>}
      </section>
    </>
  );
}

function Workflow({ job, user, onChange }: { job: JobDetailData; user: User | null; onChange: () => void }) {
  const team = useApi<User[]>('/users');
  const [inspectionDate, setInspectionDate] = useState(job.inspectionDate ?? '');
  const [error, setError] = useState('');
  const editor = canEdit(user);
  const ownsJob = user?.role === 'admin' || job.assignedTo === null || job.assignedTo === user?.id;

  async function update(body: Record<string, unknown>) {
    setError('');
    try {
      await api.patch(`/jobs/${job.id}`, body);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const next = STATUS_TRANSITIONS[job.status];
  return (
    <section className="card">
      <h2>Workflow</h2>
      {error && <div className="alert">{error}</div>}
      <dl className="details">
        <dt>Surveyor</dt><dd>{job.assignedName ?? <span className="muted">Unassigned</span>}</dd>
        <dt>Inspection</dt><dd>{job.inspectionDate ? new Date(job.inspectionDate).toLocaleDateString('en-AU') : <span className="muted">Not booked</span>}</dd>
      </dl>

      {editor && ownsJob ? (
        <>
          {user?.role === 'admin' ? (
            <Field label="Assign to">
              <select value={job.assignedTo ?? ''} onChange={(e) => update({ assignedTo: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Unassigned</option>
                {team.data?.filter((u) => u.role !== 'viewer').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
          ) : job.assignedTo === null ? (
            <button className="btn" onClick={() => update({ assignedTo: user!.id })}>Assign to me</button>
          ) : null}

          {job.status === 'new' && (
            <Field label="Inspection date">
              <input type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} />
            </Field>
          )}
          <div className="row wrap">
            {next.map((s: JobStatus) => (
              <button
                key={s}
                className={`btn ${s === 'cancelled' ? 'danger' : 'primary'}`}
                onClick={() => update(s === 'inspection_booked' ? { status: s, inspectionDate: inspectionDate || null } : { status: s })}
              >
                {s === 'cancelled' ? 'Cancel job' : `Move to ${STATUS_LABELS[s]}`}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="muted small">{editor ? 'This job is assigned to another surveyor.' : 'You have read-only access.'}</p>
      )}
    </section>
  );
}

const NEW_ASSET = { category: 'plant', name: '', cost: '', effectiveLife: '', method: 'diminishing_value', startDate: '', previouslyUsed: false };

function Assets({ job, editable, onChange }: { job: JobDetailData; editable: boolean; onChange: () => void }) {
  const [form, setForm] = useState({ ...NEW_ASSET, startDate: job.purchaseDate });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isPlant = form.category === 'plant';

  async function add(e: FormEvent) {
    e.preventDefault();
    const parsed = assetSchema.safeParse({ ...form, effectiveLife: isPlant && form.effectiveLife ? form.effectiveLife : null });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    try {
      await api.post(`/jobs/${job.id}/assets`, parsed.data);
      setErrors({});
      setForm({ ...NEW_ASSET, startDate: job.purchaseDate });
      onChange();
    } catch (err) {
      setErrors(err instanceof ApiRequestError ? { ...err.fieldErrors, form: err.message } : { form: 'Could not save' });
    }
  }

  async function remove(assetId: number) {
    await api.delete(`/jobs/${job.id}/assets/${assetId}`);
    onChange();
  }

  return (
    <section className="card">
      <h2>Schedule items</h2>
      {job.assets.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Item</th><th>Type</th><th className="num">Cost</th><th className="num">Effective life</th><th>Method</th><th>From</th>{editable && <th />}</tr>
            </thead>
            <tbody>
              {job.assets.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}{a.previouslyUsed && <span className="tag">second-hand</span>}</td>
                  <td>{a.category === 'plant' ? 'Plant & equipment' : 'Capital works'}</td>
                  <td className="num">{aud(a.cost)}</td>
                  <td className="num">{a.effectiveLife ? `${a.effectiveLife} yrs` : '40 yrs'}</td>
                  <td>{a.category === 'plant' ? (a.method === 'diminishing_value' ? 'Diminishing value' : 'Prime cost') : 'Div 43'}</td>
                  <td>{new Date(a.startDate).toLocaleDateString('en-AU')}</td>
                  {editable && <td><button className="btn ghost small" onClick={() => remove(a.id)} aria-label={`Remove ${a.name}`}>Remove</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted empty">No items yet. Add the building and the plant and equipment found at inspection.</p>
      )}

      {editable && (
        <form className="asset-form" onSubmit={add} noValidate>
          <h3>Add item</h3>
          {errors.form && <div className="alert">{errors.form}</div>}
          <div className="grid four">
            <Field label="Type">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="plant">Plant & equipment (Div 40)</option>
                <option value="capital_works">Capital works (Div 43)</option>
              </select>
            </Field>
            <Field label="Item" error={errors.name}>
              <input
                list="presets"
                value={form.name}
                onChange={(e) => {
                  const preset = EFFECTIVE_LIFE_PRESETS.find((p) => p.name === e.target.value);
                  setForm({ ...form, name: e.target.value, effectiveLife: preset ? String(preset.effectiveLife) : form.effectiveLife });
                }}
                placeholder={isPlant ? 'e.g. Carpet' : 'e.g. Building construction'}
              />
              <datalist id="presets">{EFFECTIVE_LIFE_PRESETS.map((p) => <option key={p.name} value={p.name} />)}</datalist>
            </Field>
            <Field label="Cost ($)" error={errors.cost}>
              <input value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} inputMode="decimal" />
            </Field>
            <Field label={isPlant ? 'Install date' : 'Construction start'} error={errors.startDate}>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </Field>
          </div>
          {isPlant && (
            <div className="grid four">
              <Field label="Effective life (years)" error={errors.effectiveLife}>
                <input value={form.effectiveLife} onChange={(e) => setForm({ ...form, effectiveLife: e.target.value })} inputMode="decimal" />
              </Field>
              <Field label="Method">
                <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                  <option value="diminishing_value">Diminishing value</option>
                  <option value="prime_cost">Prime cost</option>
                </select>
              </Field>
              <label className="check align-end">
                <input type="checkbox" checked={form.previouslyUsed} onChange={(e) => setForm({ ...form, previouslyUsed: e.target.checked })} />
                Second-hand (came with the property)
              </label>
            </div>
          )}
          <button className="btn primary">Add item</button>
        </form>
      )}
    </section>
  );
}

function ScheduleView({ schedule }: { schedule: Schedule }) {
  const max = Math.max(1, ...schedule.rows.map((r) => r.total));
  const excluded = schedule.assets.filter((a) => a.excluded);
  return (
    <>
      <div className="stats">
        <div className="stat"><span className="muted">First year</span><strong>{aud(schedule.rows[0]?.total ?? 0)}</strong></div>
        <div className="stat"><span className="muted">First 5 years</span><strong>{aud(schedule.totals.firstFiveYears)}</strong></div>
        <div className="stat"><span className="muted">{schedule.rows.length}-year total</span><strong>{aud(schedule.totals.total)}</strong></div>
      </div>

      {schedule.totals.total > 0 && (
        <div className="chart" role="img" aria-label="Deductions by financial year">
          {schedule.rows.map((r) => (
            <div className="chart-col" key={r.financialYear} title={`${r.financialYear}: ${aud(r.total)}`}>
              <div className="chart-bar" style={{ height: `${(r.total / max) * 100}%` }}>
                <div className="seg plant" style={{ flexGrow: r.plant }} />
                <div className="seg works" style={{ flexGrow: r.capitalWorks }} />
              </div>
              <span>{r.financialYear.slice(2)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="legend"><i className="plant" /> Plant & equipment <i className="works" /> Capital works</p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Financial year</th><th className="num">Plant & equipment</th><th className="num">Capital works</th><th className="num">Total</th><th className="num">Cumulative</th></tr>
          </thead>
          <tbody>
            {schedule.rows.map((r) => (
              <tr key={r.financialYear}>
                <td>{r.financialYear}</td>
                <td className="num">{aud(r.plant, 2)}</td>
                <td className="num">{aud(r.capitalWorks, 2)}</td>
                <td className="num"><strong>{aud(r.total, 2)}</strong></td>
                <td className="num">{aud(r.cumulative, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {excluded.length > 0 && (
        <div className="notice">
          <strong>Excluded items</strong>
          <ul>{excluded.map((a) => <li key={a.name}>{a.name}: {a.reason}</li>)}</ul>
        </div>
      )}
      <ul className="notes">{schedule.notes.map((n) => <li key={n}>{n}</li>)}</ul>
    </>
  );
}
