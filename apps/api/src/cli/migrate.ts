import { createPool } from '../db';
import { migrate } from '../migrate';

const db = createPool();
await migrate(db);
console.log('Migrations up to date');
await db.end();
