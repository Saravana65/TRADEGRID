import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@tradegrid/shared-types';
import { sendError } from '../utils/response';

/**
 * Role-Based Access Control Middleware
 * Requires the authenticated user to possess at least one of the specified roles.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      sendError(
        res,
        'FORBIDDEN',
        `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]`,
        403
      );
      return;
    }

    next();
  };
}
