import { Router } from 'express';
import {
  createInstrumentSchema,
  updateInstrumentSchema,
  updateInstrumentStatusSchema,
} from '@tradegrid/validation';
import {
  instrumentController as defaultInstrumentController,
  InstrumentController,
} from './instrument.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validateBody } from '../../middleware/validate.middleware';

export function createAdminInstrumentRouter(
  controller: InstrumentController = defaultInstrumentController
): Router {
  const router = Router();

  // All instrument management routes require ADMIN privileges
  router.use(authenticate, requireRole('ADMIN'));

  router.post('/', validateBody(createInstrumentSchema), controller.create);
  router.patch('/:id', validateBody(updateInstrumentSchema), controller.update);
  router.patch('/:id/status', validateBody(updateInstrumentStatusSchema), controller.updateStatus);

  return router;
}

export const adminInstrumentRouter = createAdminInstrumentRouter();
