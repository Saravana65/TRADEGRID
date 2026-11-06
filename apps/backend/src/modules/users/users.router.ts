import { Router } from 'express';
import { updateUserStatusSchema } from '@tradegrid/validation';
import { usersController as defaultUsersController, UsersController } from './users.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validateBody } from '../../middleware/validate.middleware';

export function createUsersRouter(controller: UsersController = defaultUsersController): Router {
  const router = Router();

  // All users administrative routes require ADMIN role
  router.use(authenticate, requireRole('ADMIN'));

  router.get('/', controller.getAllUsers);
  router.patch('/:id/status', validateBody(updateUserStatusSchema), controller.updateUserStatus);

  return router;
}

export const usersRouter = createUsersRouter();
