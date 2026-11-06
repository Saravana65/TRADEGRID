import { Router } from 'express';
import { registerSchema, loginSchema, refreshTokenSchema } from '@tradegrid/validation';
import { authController as defaultAuthController, AuthController } from './auth.controller';
import { validateBody } from '../../middleware/validate.middleware';
import { authenticate } from '../../middleware/auth.middleware';

export function createAuthRouter(controller: AuthController = defaultAuthController): Router {
  const router = Router();

  // Public Authentication Endpoints
  router.post('/register', validateBody(registerSchema), controller.register);
  router.post('/login', validateBody(loginSchema), controller.login);
  router.post('/refresh', validateBody(refreshTokenSchema), controller.refresh);
  router.post('/logout', controller.logout);

  // Protected Identity Endpoint
  router.get('/me', authenticate, controller.me);

  return router;
}

export const authRouter = createAuthRouter();
