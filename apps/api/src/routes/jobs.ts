import { Router, type Request } from 'express';
import {
  assetSchema,
  buildSchedule,
  canTransition,
  JOB_STATUSES,
  jobUpdateSchema,
  scheduleToCsv,
  STATUS_LABELS,
  type Dashboard,
  type Job,
  type JobStatus,
} from '@pdp/shared';
import { audit } from '../audit';
import { requireRole, requireUser } from '../auth';
import { toAsset, toJob, type Db } from '../db';
import { HttpError, parse } from '../errors';

const JOB_SELECT = `SELECT j.*, u.name AS assigned_name FROM jobs j LEFT JOIN users u ON u.id = j.assigned_to`;

function idParam(req: Request, name = 'id'): number {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  return id;
}

async function getJob(db: Db, id: number): Promise<Job> {
  const { rows } = await db.query(`${JOB_SELECT} WHERE j.id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Job not found');
  return toJob(rows[0]);
}

/** Surveyors may only change jobs that are unassigned or assigned to them. Admins can change any job. */
function assertCanEdit(req: Request, job: Job): void {
  const user = req.user!;
  if (user.role === 'admin') return;
  if (user.role === 'surveyor' && (job.assignedTo === null || job.assignedTo === user.id)) return;
  throw new HttpError(403, 'This job is assigned to another surveyor');
}

export function jobRoutes(db: Db): Router {
  const r = Router();
  const editors = requireRole('admin', 'surveyor');

  r.get('/dashboard', requireUser, async (_req, res) => {
    const [counts, totals, recent] = await Promise.all([
      db.query('SELECT status, COUNT(*)::int AS n FROM jobs GROUP BY status'),
      db.query(`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled'))::int AS open,
          COUNT(*) FILTER (WHERE status = 'completed' AND updated_at >= date_trunc('month', now()))::int AS completed_month,
          COUNT(*) FILTER (WHERE assigned_to IS NULL AND status NOT IN ('completed', 'cancelled'))::int AS unassigned
        FROM jobs`),
      db.query(`${JOB_SELECT} ORDER BY j.created_at DESC, j.id DESC LIMIT 6`),
    ]);
    const byStatus = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>;
    for (const row of counts.rows) byStatus[row.status as JobStatus] = row.n;
    const t = totals.rows[0];
    const body: Dashboard = {
      totalJobs: t.total, openJobs: t.open, completedThisMonth: t.completed_month, unassigned: t.unassigned,
      byStatus, recent: recent.rows.map(toJob),
    };
    res.json(body);
  });

  r.get('/jobs', requireUser, async (req, res) => {
    const where: string[] = [];
    const params: unknown[] = [];
    const { status, q, mine } = req.query;
    if (typeof status === 'string' && (JOB_STATUSES as readonly string[]).includes(status)) {
      params.push(status);
      where.push(`j.status = $${params.length}`);
    }
    if (typeof q === 'string' && q.trim()) {
      params.push(`%${q.trim()}%`);
      const p = `$${params.length}`;
      where.push(`(j.reference ILIKE ${p} OR j.owner_name ILIKE ${p} OR j.property_address ILIKE ${p} OR j.suburb ILIKE ${p})`);
    }
    if (mine === 'true') {
      params.push(req.user!.id);
      where.push(`j.assigned_to = $${params.length}`);
    }
    const sql = `${JOB_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY j.created_at DESC, j.id DESC LIMIT 200`;
    const { rows } = await db.query(sql, params);
    res.json(rows.map(toJob));
  });

  r.get('/jobs/:id', requireUser, async (req, res) => {
    const job = await getJob(db, idParam(req));
    const assets = await db.query('SELECT * FROM assets WHERE job_id = $1 ORDER BY category DESC, id', [job.id]);
    res.json({ ...job, assets: assets.rows.map(toAsset) });
  });

  r.patch('/jobs/:id', editors, async (req, res) => {
    const job = await getJob(db, idParam(req));
    assertCanEdit(req, job);
    const input = parse(jobUpdateSchema, req.body);

    if (input.status && input.status !== job.status && !canTransition(job.status, input.status)) {
      throw new HttpError(409, `A job can't move from "${STATUS_LABELS[job.status]}" to "${STATUS_LABELS[input.status]}"`);
    }
    if (input.assignedTo !== undefined && input.assignedTo !== null) {
      // Surveyors can pick up a job for themselves; only admins assign work to others
      if (req.user!.role !== 'admin' && input.assignedTo !== req.user!.id) {
        throw new HttpError(403, 'Only an admin can assign jobs to other people');
      }
      const target = await db.query(`SELECT 1 FROM users WHERE id = $1 AND role IN ('admin', 'surveyor')`, [input.assignedTo]);
      if (!target.rowCount) throw new HttpError(400, 'Jobs can only be assigned to surveyors or admins');
    }
    if (input.status === 'inspection_booked' && !(input.inspectionDate ?? job.inspectionDate)) {
      throw new HttpError(400, 'Add an inspection date before booking the inspection');
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (input.status !== undefined) set('status', input.status);
    if (input.assignedTo !== undefined) set('assigned_to', input.assignedTo);
    if (input.inspectionDate !== undefined) set('inspection_date', input.inspectionDate);
    params.push(job.id);
    await db.query(`UPDATE jobs SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);

    await audit(db, { userId: req.user!.id, action: 'job.updated', entity: 'job', entityId: job.id, detail: { ...input, from: job.status } });
    res.json(await getJob(db, job.id));
  });

  r.post('/jobs/:id/assets', editors, async (req, res) => {
    const job = await getJob(db, idParam(req));
    assertCanEdit(req, job);
    if (job.status === 'completed' || job.status === 'cancelled') throw new HttpError(409, 'This job is closed');
    const a = parse(assetSchema, req.body);
    const { rows } = await db.query(
      `INSERT INTO assets (job_id, category, name, cost, effective_life, method, start_date, previously_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [job.id, a.category, a.name, a.cost, a.category === 'plant' ? a.effectiveLife : null, a.method, a.startDate, a.previouslyUsed],
    );
    await audit(db, { userId: req.user!.id, action: 'asset.created', entity: 'job', entityId: job.id, detail: { name: a.name, cost: a.cost } });
    res.status(201).json(toAsset(rows[0]));
  });

  r.delete('/jobs/:id/assets/:assetId', editors, async (req, res) => {
    const job = await getJob(db, idParam(req));
    assertCanEdit(req, job);
    const { rows } = await db.query('DELETE FROM assets WHERE id = $1 AND job_id = $2 RETURNING name', [idParam(req, 'assetId'), job.id]);
    if (!rows[0]) throw new HttpError(404, 'Asset not found');
    await audit(db, { userId: req.user!.id, action: 'asset.deleted', entity: 'job', entityId: job.id, detail: { name: rows[0].name } });
    res.status(204).end();
  });

  async function schedule(req: Request) {
    const job = await getJob(db, idParam(req));
    const years = Math.min(40, Math.max(1, Number(req.query.years ?? 10) || 10));
    const assets = await db.query('SELECT * FROM assets WHERE job_id = $1 ORDER BY id', [job.id]);
    return {
      job,
      schedule: buildSchedule({ purchaseDate: job.purchaseDate, propertyType: job.propertyType, assets: assets.rows.map(toAsset), years }),
    };
  }

  r.get('/jobs/:id/schedule', requireUser, async (req, res) => {
    res.json((await schedule(req)).schedule);
  });

  r.get('/jobs/:id/schedule.csv', requireUser, async (req, res) => {
    const { job, schedule: s } = await schedule(req);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${job.reference}-schedule.csv"`);
    res.send(scheduleToCsv(s));
  });

  return r;
}
