import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { GraphMailNotifier } from '../src/services/notifier';
import { app, createJob, db, loginAs, notifier, resetDb, validRequest } from './helpers';

beforeEach(resetDb);
afterAll(() => db.end());

describe('health', () => {
  it('reports ok when the database is reachable', async () => {
    await request(app).get('/api/health').expect(200, { status: 'ok' });
  });
});

describe('public report request form', () => {
  it('creates a job with a reference and notifies the team', async () => {
    const res = await request(app).post('/api/requests').send(validRequest()).expect(201);
    expect(res.body.reference).toMatch(/^PD-\d{4}-\d{5}$/);
    const { rows } = await db.query('SELECT owner_email, status FROM jobs WHERE reference = $1', [res.body.reference]);
    expect(rows[0]).toEqual({ owner_email: 'investor@example.com', status: 'new' });
    await vi.waitFor(() => expect(notifier.sent.map((j) => j.reference)).toContain(res.body.reference));
  });

  it('returns field-level errors for invalid input', async () => {
    const res = await request(app)
      .post('/api/requests')
      .send(validRequest({ ownerEmail: 'not-an-email', postcode: '21' }))
      .expect(400);
    expect(res.body.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(['ownerEmail', 'postcode']));
  });

  it('rejects malformed JSON cleanly', async () => {
    await request(app).post('/api/requests').set('Content-Type', 'application/json').send('{bad').expect(400);
  });
});

describe('authentication', () => {
  it('rejects a wrong password without revealing whether the email exists', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'wrong' }).expect(401);
    const b = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrong' }).expect(401);
    expect(a.body).toEqual(b.body);
  });

  it('sets an httpOnly session cookie and signs out', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ADMIN@example.com', password: 'demo-password-2026' })
      .expect(200);
    expect(res.body).toMatchObject({ email: 'admin@example.com', role: 'admin' });
    expect(res.body.password_hash).toBeUndefined();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');

    const agent = await loginAs('viewer@example.com');
    expect((await agent.get('/api/auth/session').expect(200)).body.user.role).toBe('viewer');
    await agent.post('/api/auth/logout').expect(204);
    expect((await agent.get('/api/auth/session').expect(200)).body.user).toBeNull();
  });

  it('blocks staff endpoints for signed-out users and tampered tokens', async () => {
    await request(app).get('/api/jobs').expect(401);
    await request(app).get('/api/jobs').set('Cookie', 'pdp_session=not.a.token').expect(401);
  });

  it('rate limits repeated login attempts', async () => {
    const limited = createApp({ db, rateLimit: 2 });
    const attempt = () => request(limited).post('/api/auth/login').send({ email: 'a@b.com', password: 'x' });
    await attempt().expect(401);
    await attempt().expect(401);
    await attempt().expect(429);
  });
});

describe('access control', () => {
  it('lets viewers read but not change jobs', async () => {
    const id = await createJob();
    const viewer = await loginAs('viewer@example.com');
    await viewer.get(`/api/jobs/${id}`).expect(200);
    await viewer.patch(`/api/jobs/${id}`).send({ status: 'cancelled' }).expect(403);
  });

  it('lets surveyors claim unassigned jobs but not assign others', async () => {
    const id = await createJob();
    const sam = await loginAs('surveyor@example.com');
    const me = (await sam.get('/api/auth/session')).body.user;
    const priyaId = (await db.query(`SELECT id FROM users WHERE email = 'priya@example.com'`)).rows[0].id;

    await sam.patch(`/api/jobs/${id}`).send({ assignedTo: priyaId }).expect(403);
    const res = await sam.patch(`/api/jobs/${id}`).send({ assignedTo: me.id }).expect(200);
    expect(res.body.assignedName).toBe('Sam Surveyor');

    const priya = await loginAs('priya@example.com');
    await priya.patch(`/api/jobs/${id}`).send({ status: 'cancelled' }).expect(403);
  });

  it('only allows admins to manage users and read the audit log', async () => {
    const sam = await loginAs('surveyor@example.com');
    await sam.post('/api/users').send({ name: 'X', email: 'x@example.com', password: 'longpassword123', role: 'admin' }).expect(403);
    await sam.get('/api/audit').expect(403);

    const admin = await loginAs('admin@example.com');
    await admin.post('/api/users').send({ name: 'New Person', email: 'new@example.com', password: 'short', role: 'viewer' }).expect(400);
    await admin.post('/api/users').send({ name: 'New Person', email: 'new@example.com', password: 'a-long-password-1', role: 'viewer' }).expect(201);
    await admin.post('/api/users').send({ name: 'New Person', email: 'new@example.com', password: 'a-long-password-1', role: 'viewer' }).expect(409);
    await request(app).post('/api/auth/login').send({ email: 'new@example.com', password: 'a-long-password-1' }).expect(200);
  });
});

describe('job workflow', () => {
  it('enforces the status workflow', async () => {
    const id = await createJob();
    const admin = await loginAs('admin@example.com');
    await admin.patch(`/api/jobs/${id}`).send({ status: 'completed' }).expect(409);
    await admin.patch(`/api/jobs/${id}`).send({ status: 'inspection_booked' }).expect(400);
    const res = await admin.patch(`/api/jobs/${id}`).send({ status: 'inspection_booked', inspectionDate: '2026-11-10' }).expect(200);
    expect(res.body).toMatchObject({ status: 'inspection_booked', inspectionDate: '2026-11-10' });
  });

  it('searches and filters jobs with parameterised SQL', async () => {
    await createJob({ ownerName: 'Unique Owner', suburb: 'Lidcombe' });
    const admin = await loginAs('admin@example.com');
    const found = await admin.get('/api/jobs').query({ q: 'lidcombe' }).expect(200);
    expect(found.body).toHaveLength(1);
    expect(found.body[0].ownerName).toBe('Unique Owner');

    const injection = await admin.get('/api/jobs').query({ q: "' OR 1=1; DROP TABLE jobs; --" }).expect(200);
    expect(injection.body).toHaveLength(0);
    const newJobs = await admin.get('/api/jobs').query({ status: 'new' }).expect(200);
    expect(newJobs.body.every((j: { status: string }) => j.status === 'new')).toBe(true);
  });

  it('returns dashboard totals', async () => {
    const viewer = await loginAs('viewer@example.com');
    const res = await viewer.get('/api/dashboard').expect(200);
    expect(res.body.totalJobs).toBe(8);
    expect(Object.values(res.body.byStatus as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(8);
    expect(res.body.recent).toHaveLength(6);
  });
});

describe('assets and depreciation schedule', () => {
  it('builds a schedule from saved assets and exports CSV', async () => {
    const id = await createJob({ purchaseDate: '2025-07-01' });
    const sam = await loginAs('surveyor@example.com');
    await sam.post(`/api/jobs/${id}/assets`).send({
      category: 'plant', name: 'Carpet', cost: 4000, effectiveLife: 8, method: 'diminishing_value', startDate: '2025-07-01',
    }).expect(201);
    await sam.post(`/api/jobs/${id}/assets`).send({
      category: 'capital_works', name: 'Building', cost: 300000, method: 'prime_cost', startDate: '2020-01-01',
    }).expect(201);
    await sam.post(`/api/jobs/${id}/assets`).send({ category: 'plant', name: 'Oven', cost: 900, startDate: '2025-07-01' }).expect(400);

    const s = await sam.get(`/api/jobs/${id}/schedule`).query({ years: 2 }).expect(200);
    expect(s.body.rows[0]).toMatchObject({ financialYear: '2025-26', plant: 1000, capitalWorks: 7500, total: 8500 });

    const csv = await sam.get(`/api/jobs/${id}/schedule.csv`).query({ years: 2 }).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('2025-26,1000.00,7500.00,8500.00,8500.00');

    const detail = await sam.get(`/api/jobs/${id}`).expect(200);
    expect(detail.body.assets).toHaveLength(2);
    await sam.delete(`/api/jobs/${id}/assets/${detail.body.assets[0].id}`).expect(204);
  });

  it('records changes in the audit log', async () => {
    const id = await createJob();
    const admin = await loginAs('admin@example.com');
    await admin.patch(`/api/jobs/${id}`).send({ status: 'cancelled' }).expect(200);
    const log = await admin.get('/api/audit').expect(200);
    const actions = log.body.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['request.created', 'auth.login', 'job.updated']));
    expect(log.body[0]).toMatchObject({ action: 'job.updated', userName: 'Alex Admin' });
  });
});

describe('Microsoft Graph notifier', () => {
  it('gets an app token and sends mail through Graph', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(String(url).includes('/token') ? JSON.stringify({ access_token: 'abc' }) : null, {
        status: String(url).includes('/token') ? 200 : 202,
      });
    }) as typeof fetch;
    const graph = new GraphMailNotifier(
      { tenantId: 't1', clientId: 'c1', clientSecret: 's1', sender: 'jobs@example.com', notifyTo: 'team@example.com' },
      fakeFetch,
    );
    const id = await createJob();
    const job = (await (await loginAs('admin@example.com')).get(`/api/jobs/${id}`)).body;
    await graph.requestReceived(job);

    expect(calls[0]!.url).toBe('https://login.microsoftonline.com/t1/oauth2/v2.0/token');
    expect(calls[1]!.url).toBe('https://graph.microsoft.com/v1.0/users/jobs%40example.com/sendMail');
    expect((calls[1]!.init!.headers as Record<string, string>).Authorization).toBe('Bearer abc');
    const body = JSON.parse(String(calls[1]!.init!.body));
    expect(body.message.toRecipients[0].emailAddress.address).toBe('team@example.com');
    expect(body.message.subject).toContain(job.reference);
  });
});
