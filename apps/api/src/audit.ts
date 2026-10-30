import type { Db } from './db';

export async function audit(
  db: Db,
  entry: { userId: number | null; action: string; entity: string; entityId?: number | null; detail?: Record<string, unknown> },
): Promise<void> {
  await db.query('INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES ($1, $2, $3, $4, $5)', [
    entry.userId, entry.action, entry.entity, entry.entityId ?? null, JSON.stringify(entry.detail ?? {}),
  ]);
}
