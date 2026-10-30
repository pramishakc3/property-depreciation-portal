import bcrypt from 'bcryptjs';
import { Router, type RequestHandler } from 'express';
import { loginSchema, type User } from '@pdp/shared';
import { audit } from '../audit';
import { clearSession, issueSession, verifyPassword } from '../auth';
import type { Db } from '../db';
import { HttpError, parse } from '../errors';

// Compared against when the email is unknown, so response time does not reveal which emails exist
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

export function authRoutes(db: Db, limiter: RequestHandler): Router {
  const r = Router();

  r.post('/login', limiter, async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const { rows } = await db.query('SELECT id, name, email, role, password_hash FROM users WHERE email = $1', [
      email.toLowerCase(),
    ]);
    const row = rows[0];
    const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !ok) throw new HttpError(401, 'Incorrect email or password');

    const user: User = { id: row.id, name: row.name, email: row.email, role: row.role };
    issueSession(res, user);
    await audit(db, { userId: user.id, action: 'auth.login', entity: 'user', entityId: user.id });
    res.json(user);
  });

  r.post('/logout', (_req, res) => {
    clearSession(res);
    res.status(204).end();
  });

  // Always 200 so the web app can check for a session without logging errors
  r.get('/session', (req, res) => {
    res.json({ user: req.user ?? null });
  });

  return r;
}
