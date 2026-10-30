import { createPool } from '../db';
import { migrate } from '../migrate';
import { DEMO_PASSWORD, DEMO_USERS, seed } from '../seed';

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
  console.error('Refusing to load demo users in production. Set ALLOW_DEMO_SEED=true for a demo deployment.');
  process.exit(1);
}

const db = createPool();
await migrate(db);
await seed(db);
console.log(`Demo logins: ${DEMO_USERS.map((u) => u.email).join(', ')} (password: ${DEMO_PASSWORD})`);
await db.end();
