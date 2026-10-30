import type { JobStatus } from '@pdp/shared';
import { hashPassword } from './auth';
import type { Db } from './db';

export const DEMO_PASSWORD = 'demo-password-2026';
export const DEMO_USERS = [
  { name: 'Alex Admin', email: 'admin@example.com', role: 'admin' },
  { name: 'Sam Surveyor', email: 'surveyor@example.com', role: 'surveyor' },
  { name: 'Priya Surveyor', email: 'priya@example.com', role: 'surveyor' },
  { name: 'Victor Viewer', email: 'viewer@example.com', role: 'viewer' },
] as const;

type DemoJob = [owner: string, address: string, suburb: string, type: string, purchase: string, price: number, built: number, newBuild: boolean, status: JobStatus, assignee: string | null];

// Fictional demo data
const JOBS: DemoJob[] = [
  ['Mia Chen', '12 Parkview Ave', 'Homebush', 'unit', '2025-08-14', 820000, 2019, false, 'in_progress', 'surveyor@example.com'],
  ['Liam Patel', '5/48 Railway Pde', 'Strathfield', 'unit', '2026-02-03', 690000, 2026, true, 'qa', 'surveyor@example.com'],
  ['Olivia Nguyen', '33 Gardenia St', 'Parramatta', 'house', '2026-05-20', 1350000, 1995, false, 'inspection_booked', 'priya@example.com'],
  ['Noah Smith', '9 Harbour Rd', 'Rhodes', 'townhouse', '2025-11-11', 1120000, 2012, false, 'completed', 'priya@example.com'],
  ['Ava Williams', '2/17 King St', 'Burwood', 'unit', '2026-07-01', 760000, 2008, false, 'new', null],
  ['Ethan Brown', '41 Station St', 'Ryde', 'house', '2026-09-15', 1580000, 1984, false, 'new', null],
  ['Zara Ali', 'Shop 3, 100 George St', 'Parramatta', 'commercial', '2025-06-30', 2100000, 2001, false, 'in_progress', 'priya@example.com'],
  ['Jack Taylor', '7 Wattle Cres', 'Concord', 'house', '2026-03-28', 1890000, 2026, true, 'completed', 'surveyor@example.com'],
];

export async function seed(db: Db, log: (m: string) => void = console.log): Promise<void> {
  const hash = await hashPassword(DEMO_PASSWORD);
  const ids = new Map<string, number>();
  for (const u of DEMO_USERS) {
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [u.name, u.email, hash, u.role],
    );
    ids.set(u.email, rows[0].id);
  }

  const existing = await db.query('SELECT COUNT(*)::int AS n FROM jobs');
  if (existing.rows[0].n > 0) {
    log('Jobs already exist, skipping demo jobs');
    return;
  }

  for (const [owner, address, suburb, type, purchase, price, built, newBuild, status, assignee] of JOBS) {
    const email = owner.toLowerCase().replace(' ', '.') + '@example.com';
    const { rows } = await db.query(
      `INSERT INTO jobs (owner_name, owner_email, owner_phone, property_address, suburb, state, postcode, property_type,
         purchase_date, purchase_price, construction_year, is_new_build, status, assigned_to, inspection_date)
       VALUES ($1, $2, '0400 000 000', $3, $4, 'NSW', '2140', $5, $6, $7, $8, $9, $10, $11,
         CASE WHEN $10 = 'new' THEN NULL ELSE ($6::date + 21) END)
       RETURNING id`,
      [owner, email, address, suburb, type, purchase, price, built, newBuild, status, assignee ? ids.get(assignee) : null],
    );
    const jobId = rows[0].id;
    if (status === 'new' || status === 'inspection_booked') continue;

    const buildCost = Math.round(price * (type === 'unit' ? 0.35 : 0.3));
    const assets: [string, string, number, number | null, string, boolean][] = [
      ['capital_works', 'Building construction', buildCost, null, `${built}-01-15`, false],
      ['plant', 'Carpet', 4200, 8, purchase, !newBuild],
      ['plant', 'Split system air conditioner', 2600, 10, purchase, !newBuild],
      ['plant', 'Hot water system (electric)', 1800, 12, purchase, !newBuild],
      ['plant', 'Dishwasher', 950, 8, purchase, false],
      ['plant', 'Window blinds', 1500, 10, purchase, !newBuild],
    ];
    for (const [category, name, cost, life, start, used] of assets) {
      await db.query(
        `INSERT INTO assets (job_id, category, name, cost, effective_life, method, start_date, previously_used)
         VALUES ($1, $2, $3, $4, $5, 'diminishing_value', $6, $7)`,
        [jobId, category, name, cost, life, start, used],
      );
    }
  }
  log(`Seeded ${DEMO_USERS.length} users and ${JOBS.length} demo jobs`);
}
