import bcrypt from 'bcryptjs';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role, User } from '@pdp/shared';
import { config } from './config';
import type { Db } from './db';
import { HttpError } from './errors';

export const SESSION_COOKIE = 'pdp_session';

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export function issueSession(res: Response, user: User): void {
  const token = jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, {
    expiresIn: `${config.sessionHours}h`,
  });
  // httpOnly: not readable from JavaScript; sameSite=lax: not sent on cross-site POSTs
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    maxAge: config.sessionHours * 3_600_000,
    path: '/',
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Loads the signed-in user from the session cookie. The user is re-read from the database so removed users lose access straight away. */
export function authenticate(db: Db): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return next();
    try {
      const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
      const { rows } = await db.query('SELECT id, name, email, role FROM users WHERE id = $1', [Number(payload.sub)]);
      if (rows[0]) req.user = rows[0] as User;
    } catch {
      // Invalid or expired token: treat as signed out
    }
    next();
  };
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw new HttpError(401, 'Please sign in');
    if (roles.length && !roles.includes(req.user.role)) throw new HttpError(403, 'You do not have access to do that');
    next();
  };
}

export const requireUser = requireRole();
