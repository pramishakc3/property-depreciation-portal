import { existsSync } from 'node:fs';
import path from 'node:path';

// Load .env for local development (npm workspace scripts run from apps/api, so also look in the repo root)
if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
  const file = ['.env', '../../.env'].map((f) => path.resolve(f)).find((f) => existsSync(f));
  if (file) process.loadEnvFile(file);
}

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 4000),
  databaseUrl: env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/depreciation',
  jwtSecret: env.JWT_SECRET ?? 'dev-only-secret-change-me',
  sessionHours: Number(env.SESSION_HOURS ?? 8),
  isProduction: env.NODE_ENV === 'production',
  /** Secure cookies need HTTPS. Defaults to on in production; set SECURE_COOKIES=false for plain-HTTP local Docker. */
  secureCookies: env.SECURE_COOKIES ? env.SECURE_COOKIES === 'true' : env.NODE_ENV === 'production',
  /** Serve the built React app from the API (single-service deploys such as Railway). */
  webDist: env.WEB_DIST,
  graph: {
    tenantId: env.GRAPH_TENANT_ID,
    clientId: env.GRAPH_CLIENT_ID,
    clientSecret: env.GRAPH_CLIENT_SECRET,
    sender: env.GRAPH_SENDER,
    notifyTo: env.NOTIFY_TO,
  },
};

export function assertSafeConfig(): void {
  if (config.isProduction && (config.jwtSecret.startsWith('dev-only') || config.jwtSecret.length < 32)) {
    throw new Error('Set a strong JWT_SECRET (32+ characters) before running in production.');
  }
}
