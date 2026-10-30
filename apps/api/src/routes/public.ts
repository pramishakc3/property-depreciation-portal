import { Router, type RequestHandler } from 'express';
import { reportRequestSchema } from '@pdp/shared';
import { audit } from '../audit';
import { toJob, type Db } from '../db';
import { parse } from '../errors';
import type { Notifier } from '../services/notifier';

/** Public endpoints used by the customer request form. */
export function publicRoutes(db: Db, notifier: Notifier, limiter: RequestHandler): Router {
  const r = Router();

  r.post('/requests', limiter, async (req, res) => {
    const input = parse(reportRequestSchema, req.body);
    const { rows } = await db.query(
      `INSERT INTO jobs (owner_name, owner_email, owner_phone, property_address, suburb, state, postcode,
         property_type, purchase_date, purchase_price, construction_year, is_new_build, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [input.ownerName, input.ownerEmail.toLowerCase(), input.ownerPhone, input.propertyAddress, input.suburb,
        input.state, input.postcode, input.propertyType, input.purchaseDate, input.purchasePrice,
        input.constructionYear, input.isNewBuild, input.notes],
    );
    const job = toJob(rows[0]);
    await audit(db, { userId: null, action: 'request.created', entity: 'job', entityId: job.id, detail: { reference: job.reference } });

    // A failed notification must never lose the customer's request
    notifier.requestReceived(job).catch((err) => console.error('Notification failed:', err.message));

    res.status(201).json({ reference: job.reference });
  });

  return r;
}
