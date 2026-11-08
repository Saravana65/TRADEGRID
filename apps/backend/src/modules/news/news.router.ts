import { Router } from 'express';
import { NewsController, newsController as defaultNewsController } from './news.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';

/**
 * Public news routes: accessible to traders and guests.
 */
export function createNewsRouter(controller: NewsController = defaultNewsController): Router {
  const router = Router();

  router.get('/active-catalysts', controller.getActiveCatalysts);
  router.get('/', controller.listNews);
  router.get('/:id', controller.getNewsById);

  return router;
}

/**
 * Administrative news management routes: guarded by ADMIN role.
 */
export function createAdminNewsRouter(controller: NewsController = defaultNewsController): Router {
  const router = Router();

  router.use(authenticate);
  router.use(requireRole('ADMIN'));

  router.get('/metrics', controller.getMetricsSummary);
  router.get('/:id/executions', controller.getExecutions);
  router.post('/:id/publish', controller.publishNews);
  router.post('/:id/schedule', controller.scheduleNews);
  router.post('/:id/cancel', controller.cancelNews);

  router.get('/', controller.listNews);
  router.post('/', controller.createNews);
  router.get('/:id', controller.getNewsById);
  router.patch('/:id', controller.updateNews);
  router.delete('/:id', controller.deleteNews);

  return router;
}

export const newsRouter = createNewsRouter();
export const adminNewsRouter = createAdminNewsRouter();
