import { Router } from 'express';
import { orderController as defaultOrderController, OrderController } from './order.controller';
import { authenticate } from '../../middleware/auth.middleware';

export function createOrderRouter(controller: OrderController = defaultOrderController): Router {
  const router = Router();

  // All order management routes require authentication
  router.use(authenticate);

  router.post('/', controller.createOrder);
  router.get('/', controller.getOrders);
  router.get('/:id', controller.getOrderById);
  router.delete('/:id', controller.cancelOrder);

  return router;
}

export const orderRouter = createOrderRouter();
