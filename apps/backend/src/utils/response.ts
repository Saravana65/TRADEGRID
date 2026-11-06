import { Response } from 'express';
import { ApiResponse, ApiErrorResponse } from '@tradegrid/shared-types';

/**
 * Sends a standardized success JSON response.
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode: number = 200
): Response<ApiResponse<T>> {
  return res.status(statusCode).json({
    success: true,
    data,
    ...(message && { message }),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Sends a standardized error JSON response.
 */
export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode: number = 400,
  details?: unknown
): Response<ApiErrorResponse> {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
    timestamp: new Date().toISOString(),
  });
}
