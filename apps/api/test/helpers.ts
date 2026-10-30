import request from 'supertest';
import type { ReportRequest } from '@pdp/shared';
import { createApp } from '../src/app';
import { createPool } from '../src/db';
import { migrate } from '../src/migrate';
import { DEMO_PASSWORD, seed } from '../src/seed';
import { MemoryNotifier } from '../src/services/notifier';

export const TEST_DB =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/depreciation_test';

export const db = createPool(TEST_DB);
export const notifier = new MemoryNotifier();
export const app = createApp({ db, notifier, rateLimit: 1000 });

/** Rebuilds the test database from the migrations and loads demo data. */
export async function resetDb(): Promise<void> {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db, () => {});
  await seed(db, () => {});
  notifier.sent = [];
}

export async function loginAs(email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: DEMO_PASSWORD }).expect(200);
  return agent;
}

export const validRequest = (overrides: Partial<ReportRequest> = {}): ReportRequest => ({
  ownerName: 'Test Investor',
  ownerEmail: 'Investor@Example.com',
  ownerPhone: '0412 345 678',
  propertyAddress: '1 Test Street',
  suburb: 'Homebush',
  state: 'NSW',
  postcode: '2140',
  propertyType: 'unit',
  purchaseDate: '2025-07-01',
  purchasePrice: 750000,
  constructionYear: 2020,
  isNewBuild: false,
  notes: '',
  ...overrides,
});

export async function createJob(overrides: Partial<ReportRequest> = {}): Promise<number> {
  const res = await request(app).post('/api/requests').send(validRequest(overrides)).expect(201);
  const { rows } = await db.query('SELECT id FROM jobs WHERE reference = $1', [res.body.reference]);
  return rows[0].id;
}
