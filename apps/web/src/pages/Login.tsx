import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Brand } from '../components/Brand';
import { Field } from '../components/Field';

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/app';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="card login" onSubmit={submit}>
        <Brand />
        <h1>Staff sign in</h1>
        {error && <div className="alert" role="alert">{error}</div>}
        <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></Field>
        <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
        <button className="btn primary wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="hint">Demo: surveyor@example.com / demo-password-2026</p>
      </form>
    </div>
  );
}
