import type { ErrorRequestHandler } from 'express';
import { ZodError, type ZodType } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Parses a request body with a shared contract schema, or throws a 400 with field-level issues. */
export function parse<T>(schema: ZodType<T>, body: unknown): T {
  return schema.parse(body);
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Please check the highlighted fields',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
};
