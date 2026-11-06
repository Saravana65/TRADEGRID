import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import { sendError } from '../utils/response';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Zod Validation Errors (checked with instanceof, name, or presence of issues/errors array)
  if (
    err instanceof ZodError ||
    err.name === 'ZodError' ||
    Array.isArray((err as any).issues) ||
    Array.isArray((err as any).errors)
  ) {
    const issues = (err as any).issues || (err as any).errors || [];
    const formattedErrors = issues.map((e: any) => ({
      path: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
      message: e.message,
    }));
    sendError(res, 'VALIDATION_ERROR', 'Invalid request payload', 400, formattedErrors);
    return;
  }

  // 2. Custom App Domain Errors
  if (err instanceof AppError) {
    sendError(res, err.code, err.message, err.statusCode, err.details);
    return;
  }

  // 3. MySQL / Database Duplicate Key Error (e.g. ER_DUP_ENTRY)
  if ((err as any).code === 'ER_DUP_ENTRY') {
    sendError(res, 'CONFLICT', 'A record with these details already exists', 409);
    return;
  }

  // 4. Unexpected / Unhandled Errors
  logger.error('Unhandled Server Error:', {
    message: err.message,
    stack: err.stack,
  });

  sendError(
    res,
    'INTERNAL_SERVER_ERROR',
    process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred on the exchange platform'
      : err.message,
    500
  );
}
