import pg from 'pg';
import type { Asset, Job } from '@pdp/shared';
import { config } from './config';

// Return DATE columns as 'YYYY-MM-DD' strings and NUMERIC columns as numbers
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => Number(v));

export type Db = pg.Pool;

export function createPool(connectionString = config.databaseUrl): Db {
  return new pg.Pool({ connectionString, max: 10 });
}

type Row = Record<string, unknown>;

export function toJob(r: Row): Job {
  return {
    id: r.id as number,
    reference: r.reference as string,
    ownerName: r.owner_name as string,
    ownerEmail: r.owner_email as string,
    ownerPhone: r.owner_phone as string,
    propertyAddress: r.property_address as string,
    suburb: r.suburb as string,
    state: r.state as string,
    postcode: r.postcode as string,
    propertyType: r.property_type as Job['propertyType'],
    purchaseDate: r.purchase_date as string,
    purchasePrice: r.purchase_price as number,
    constructionYear: r.construction_year as number,
    isNewBuild: r.is_new_build as boolean,
    notes: r.notes as string,
    status: r.status as Job['status'],
    assignedTo: (r.assigned_to as number | null) ?? null,
    assignedName: (r.assigned_name as string | null) ?? null,
    inspectionDate: (r.inspection_date as string | null) ?? null,
    createdAt: (r.created_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
  };
}

export function toAsset(r: Row): Asset {
  return {
    id: r.id as number,
    jobId: r.job_id as number,
    category: r.category as Asset['category'],
    name: r.name as string,
    cost: r.cost as number,
    effectiveLife: (r.effective_life as number | null) ?? null,
    method: r.method as Asset['method'],
    startDate: r.start_date as string,
    previouslyUsed: r.previously_used as boolean,
  };
}
