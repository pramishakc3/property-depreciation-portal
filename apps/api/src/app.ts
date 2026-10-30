import cookieParser from 'cookie-parser';
import express, { type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { authenticate } from './auth';
import { config } from './config';
import type { Db } from './db';
import { errorHandler, HttpError } from './errors';
import { authRoutes } from './routes/auth';
import { jobRoutes } from './routes/jobs';
import { publicRoutes } from './routes/public';
import { userRoutes } from './routes/users';
import { ConsoleNotifier, type Notifier } from './services/notifier';

export interface AppOptions {
  db: Db;
  notifier?: Notifier;
  /** Requests allowed per IP per 15 minutes on login and the public form. */
  rateLimit?: number;
  webDist?: string;
}

export function createApp({ db, notifier = new ConsoleNotifier(), rateLimit: limit = 20, webDist }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Behind Railway / load balancer proxies
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(authenticate(db));

  const limiter: RequestHandler = rateLimit({ windowMs: 15 * 60_000, limit, standardHeaders: 'draft-8', legacyHeaders: false });

  app.get('/api/health', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  });
  app.use('/api', publicRoutes(db, notifier, limiter));
  app.use('/api/auth', authRoutes(db, limiter));
  app.use('/api', jobRoutes(db));
  app.use('/api', userRoutes(db));
  app.use('/api', () => {
    throw new HttpError(404, 'Not found');
  });

  // Serve the React app for single-service deployments
  const distSetting = webDist ?? config.webDist;
  const dist = distSetting ? path.resolve(distSetting) : undefined;
  if (dist && existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
