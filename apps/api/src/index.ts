import { createApp } from './app';
import { assertSafeConfig, config } from './config';
import { createPool } from './db';
import { migrate } from './migrate';
import { createNotifier } from './services/notifier';

assertSafeConfig();
const db = createPool();
await migrate(db);

const app = createApp({ db, notifier: createNotifier() });
const server = app.listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`));

const shutdown = () => server.close(() => db.end().then(() => process.exit(0)));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
