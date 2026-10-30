import { Router } from 'express';
import { userCreateSchema, type AuditEntry } from '@pdp/shared';
import { audit } from '../audit';
import { hashPassword, requireRole, requireUser } from '../auth';
import type { Db } from '../db';
import { HttpError, parse } from '../errors';

export function userRoutes(db: Db): Router {
  const r = Router();

  // Any signed-in user can see the team list (used for assigning jobs)
  r.get('/users', requireUser, async (_req, res) => {
    const { rows } = await db.query('SELECT id, name, email, role FROM users ORDER BY name');
    res.json(rows);
  });

  r.post('/users', requireRole('admin'), async (req, res) => {
    const input = parse(userCreateSchema, req.body);
    const exists = await db.query('SELECT 1 FROM users WHERE email = $1', [input.email.toLowerCase()]);
    if (exists.rowCount) throw new HttpError(409, 'A user with that email already exists');
    const { rows } = await db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [input.name, input.email.toLowerCase(), await hashPassword(input.password), input.role],
    );
    await audit(db, { userId: req.user!.id, action: 'user.created', entity: 'user', entityId: rows[0].id, detail: { role: input.role } });
    res.status(201).json(rows[0]);
  });

  r.get('/audit', requireRole('admin'), async (_req, res) => {
    const { rows } = await db.query(
      `SELECT a.id, u.name AS user_name, a.action, a.entity, a.entity_id, a.detail, a.created_at
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC, a.id DESC LIMIT 100`,
    );
    const entries: AuditEntry[] = rows.map((r) => ({
      id: r.id, userName: r.user_name, action: r.action, entity: r.entity, entityId: r.entity_id,
      detail: r.detail, createdAt: (r.created_at as Date).toISOString(),
    }));
    res.json(entries);
  });

  return r;
}
