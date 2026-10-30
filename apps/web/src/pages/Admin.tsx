import { useState, type FormEvent } from 'react';
import { ROLES, userCreateSchema, type AuditEntry, type User } from '@pdp/shared';
import { api, ApiRequestError, useApi } from '../api';
import { Field } from '../components/Field';

const EMPTY = { name: '', email: '', password: '', role: 'surveyor' };

export function Admin() {
  const users = useApi<User[]>('/users');
  const log = useApi<AuditEntry[]>('/audit');
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState('');

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaved('');
    const parsed = userCreateSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    try {
      await api.post('/users', parsed.data);
      setErrors({});
      setForm(EMPTY);
      setSaved(`${parsed.data.name} can now sign in.`);
      users.reload();
      log.reload();
    } catch (err) {
      setErrors(err instanceof ApiRequestError ? { ...err.fieldErrors, form: err.message } : { form: 'Could not save' });
    }
  }

  return (
    <>
      <div className="page-head"><h1>Admin</h1></div>
      <div className="grid two">
        <section className="card">
          <h2>Team</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
              <tbody>
                {users.data?.map((u) => (
                  <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td><span className="tag">{u.role}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <form className="card" onSubmit={create} noValidate>
          <h2>Add a team member</h2>
          {errors.form && <div className="alert">{errors.form}</div>}
          {saved && <div className="ok">{saved}</div>}
          <Field label="Name" error={errors.name}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email" error={errors.email}><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Temporary password" error={errors.password} hint="At least 12 characters with a letter and a number">
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="Role">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <button className="btn primary">Add user</button>
        </form>
      </div>

      <section className="card">
        <h2>Audit log</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>
              {log.data?.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.createdAt).toLocaleString('en-AU')}</td>
                  <td>{e.userName ?? <span className="muted">Customer</span>}</td>
                  <td><code>{e.action}</code></td>
                  <td className="small">{Object.entries(e.detail).map(([k, v]) => `${k}: ${String(v)}`).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
