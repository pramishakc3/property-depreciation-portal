/**
 * API contracts shared by the API and the web app.
 * The API validates every request body with these schemas, and the web app
 * uses the same schemas and types, so both sides always agree on the shape of the data.
 */
import { z } from 'zod';

export const ROLES = ['admin', 'surveyor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const PROPERTY_TYPES = ['house', 'unit', 'townhouse', 'commercial'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;

export const JOB_STATUSES = ['new', 'inspection_booked', 'in_progress', 'qa', 'completed', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const STATUS_LABELS: Record<JobStatus, string> = {
  new: 'New request',
  inspection_booked: 'Inspection booked',
  in_progress: 'In progress',
  qa: 'Quality check',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Allowed workflow moves. A job can only move forward one step, back from QA, or be cancelled. */
export const STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  new: ['inspection_booked', 'cancelled'],
  inspection_booked: ['in_progress', 'cancelled'],
  in_progress: ['qa', 'cancelled'],
  qa: ['completed', 'in_progress'],
  completed: [],
  cancelled: ['new'],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export const ASSET_CATEGORIES = ['plant', 'capital_works'] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const METHODS = ['diminishing_value', 'prime_cost'] as const;
export type Method = (typeof METHODS)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');
const money = z.coerce.number().positive('Must be more than 0').max(100_000_000);

/** Public form: a property investor requests a depreciation report. */
export const reportRequestSchema = z.object({
  ownerName: z.string().trim().min(2, 'Please enter your name').max(120),
  ownerEmail: z.email('Please enter a valid email').max(200),
  ownerPhone: z.string().trim().regex(/^[0-9 +()-]{8,20}$/, 'Please enter a valid phone number'),
  propertyAddress: z.string().trim().min(5, 'Please enter the street address').max(200),
  suburb: z.string().trim().min(2).max(80),
  state: z.enum(STATES),
  postcode: z.string().regex(/^\d{4}$/, 'Postcode must be 4 digits'),
  propertyType: z.enum(PROPERTY_TYPES),
  purchaseDate: isoDate,
  purchasePrice: money,
  constructionYear: z.coerce.number().int().min(1800).max(2100),
  isNewBuild: z.boolean(),
  notes: z.string().trim().max(2000).optional().default(''),
});
export type ReportRequest = z.infer<typeof reportRequestSchema>;

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const jobUpdateSchema = z
  .object({
    status: z.enum(JOB_STATUSES).optional(),
    assignedTo: z.number().int().positive().nullable().optional(),
    inspectionDate: isoDate.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type JobUpdate = z.infer<typeof jobUpdateSchema>;

export const assetSchema = z
  .object({
    category: z.enum(ASSET_CATEGORIES),
    name: z.string().trim().min(2).max(120),
    cost: money,
    effectiveLife: z.coerce.number().positive().max(100).nullable().optional(),
    method: z.enum(METHODS).default('diminishing_value'),
    startDate: isoDate,
    previouslyUsed: z.boolean().default(false),
  })
  .refine((a) => a.category === 'capital_works' || (a.effectiveLife ?? 0) > 0, {
    message: 'Plant and equipment needs an effective life',
    path: ['effectiveLife'],
  });
export type AssetInput = z.infer<typeof assetSchema>;

export const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email(),
  password: z
    .string()
    .min(12, 'Use at least 12 characters')
    .regex(/[A-Za-z]/, 'Include a letter')
    .regex(/\d/, 'Include a number'),
  role: z.enum(ROLES),
});
export type UserCreate = z.infer<typeof userCreateSchema>;

/* Response types */

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface Job {
  id: number;
  reference: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  propertyAddress: string;
  suburb: string;
  state: string;
  postcode: string;
  propertyType: PropertyType;
  purchaseDate: string;
  purchasePrice: number;
  constructionYear: number;
  isNewBuild: boolean;
  notes: string;
  status: JobStatus;
  assignedTo: number | null;
  assignedName: string | null;
  inspectionDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Asset extends AssetInput {
  id: number;
  jobId: number;
}

export interface JobDetail extends Job {
  assets: Asset[];
}

export interface Dashboard {
  totalJobs: number;
  openJobs: number;
  completedThisMonth: number;
  unassigned: number;
  byStatus: Record<JobStatus, number>;
  recent: Job[];
}

export interface AuditEntry {
  id: number;
  userName: string | null;
  action: string;
  entity: string;
  entityId: number | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface ApiError {
  error: string;
  issues?: { path: string; message: string }[];
}
