import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@tradegrid/shared-types';
import { verifyAccessToken, TokenUserPayload } from '../utils/jwt';
import { sendError } from '../utils/response';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        username: string;
        role: UserRole;
      };
    }
  }
}

/**
 * Authentication Middleware
 * Extracts and verifies JWT Access Token from the Authorization header.
 * Attaches verified user context to req.user.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(res, 'UNAUTHORIZED', 'Authentication token required', 401);
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload: TokenUserPayload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
      role: payload.role,
    };
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      sendError(res, 'TOKEN_EXPIRED', 'Access token has expired. Please refresh your session.', 401);
      return;
    }
    sendError(res, 'INVALID_TOKEN', 'Access token is invalid or corrupted.', 401);
  }
}
