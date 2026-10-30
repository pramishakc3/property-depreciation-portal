import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PROPERTY_TYPES, reportRequestSchema, STATES } from '@pdp/shared';
import { api, ApiRequestError } from '../api';
import { Brand } from '../components/Brand';
import { Field } from '../components/Field';

const EMPTY = {
  ownerName: '', ownerEmail: '', ownerPhone: '', propertyAddress: '', suburb: '', state: 'NSW', postcode: '',
  propertyType: 'unit', purchaseDate: '', purchasePrice: '', constructionYear: '', isNewBuild: false, notes: '',
};

export function RequestForm() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [serverError, setServerError] = useState('');

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError('');
    // Validate in the browser with the same schema the API uses
    const parsed = reportRequestSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const res = await api.post<{ reference: string }>('/requests', parsed.data);
      setReference(res.reference);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrors(err.fieldErrors);
        setServerError(err.message);
      } else setServerError('Could not send your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="public">
      <header className="public-header">
        <Brand />
        <Link to="/login" className="btn ghost small">Staff sign in</Link>
      </header>
      <section className="hero">
        <h1>Request a tax depreciation report</h1>
        <p>Tell us about your investment property and a quantity surveyor will contact you to book an inspection.</p>
      </section>

      {reference ? (
        <div className="card success" role="status">
          <h2>Thank you, we have your request</h2>
          <p>Your reference number is <strong data-testid="reference">{reference}</strong>. We will be in touch within one business day.</p>
          <button className="btn" onClick={() => { setForm(EMPTY); setReference(null); }}>Submit another property</button>
        </div>
      ) : (
        <form className="card form" onSubmit={submit} noValidate>
          {serverError && <div className="alert">{serverError}</div>}
          <h2>Your details</h2>
          <div className="grid three">
            <Field label="Full name" error={errors.ownerName}><input value={form.ownerName} onChange={set('ownerName')} autoComplete="name" /></Field>
            <Field label="Email" error={errors.ownerEmail}><input type="email" value={form.ownerEmail} onChange={set('ownerEmail')} autoComplete="email" /></Field>
            <Field label="Phone" error={errors.ownerPhone}><input value={form.ownerPhone} onChange={set('ownerPhone')} autoComplete="tel" /></Field>
          </div>

          <h2>Property</h2>
          <div className="grid four">
            <Field label="Street address" error={errors.propertyAddress}><input value={form.propertyAddress} onChange={set('propertyAddress')} /></Field>
            <Field label="Suburb" error={errors.suburb}><input value={form.suburb} onChange={set('suburb')} /></Field>
            <Field label="State" error={errors.state}>
              <select value={form.state} onChange={set('state')}>{STATES.map((s) => <option key={s}>{s}</option>)}</select>
            </Field>
            <Field label="Postcode" error={errors.postcode}><input value={form.postcode} onChange={set('postcode')} inputMode="numeric" maxLength={4} /></Field>
          </div>
          <div className="grid four">
            <Field label="Property type" error={errors.propertyType}>
              <select value={form.propertyType} onChange={set('propertyType')}>
                {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}
              </select>
            </Field>
            <Field label="Settlement date" error={errors.purchaseDate}><input type="date" value={form.purchaseDate} onChange={set('purchaseDate')} /></Field>
            <Field label="Purchase price ($)" error={errors.purchasePrice}><input value={form.purchasePrice} onChange={set('purchasePrice')} inputMode="decimal" /></Field>
            <Field label="Year built" error={errors.constructionYear}><input value={form.constructionYear} onChange={set('constructionYear')} inputMode="numeric" maxLength={4} /></Field>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.isNewBuild} onChange={(e) => setForm({ ...form, isNewBuild: e.target.checked })} />
            This is a brand-new property (I am the first owner)
          </label>
          <Field label="Anything else we should know? (optional)" error={errors.notes} hint="For example renovations, access instructions or a tenant's contact details.">
            <textarea rows={3} value={form.notes} onChange={set('notes')} />
          </Field>
          <div className="actions">
            <button className="btn primary" disabled={submitting}>{submitting ? 'Sending…' : 'Request my report'}</button>
          </div>
        </form>
      )}
      <p className="disclaimer">Demo application with fictional data. Not affiliated with any real quantity surveying firm.</p>
    </div>
  );
}
