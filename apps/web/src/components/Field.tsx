import type { ReactNode } from 'react';

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className={`field${error ? ' has-error' : ''}`}>
      <span className="label">{label}</span>
      {children}
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}
