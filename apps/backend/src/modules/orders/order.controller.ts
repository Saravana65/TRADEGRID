import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response';
import {
  createOrderSchema,
  orderQuerySchema,
  orderIdParamSchema,
} from '@tradegrid/validation';
import { OrderService, orderService as defaultOrderService } from './order.service';

export class OrderController {
  constructor(private readonly service: OrderService = defaultOrderService) {}

  /**
   * POST /api/v1/orders
   * Submit a new buy or sell order.
   */
  createOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedInput = createOrderSchema.parse(req.body);
      const userId = (req as any).user.id;

      const order = await this.service.createOrder(userId, validatedInput);

      sendSuccess(res, order, 'Order submitted successfully', 201);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/orders
   * List paginated orders for the authenticated user.
   */
  getOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedQuery = orderQuerySchema.parse(req.query);
      const userId = (req as any).user.id;

      const result = await this.service.getUserOrders(userId, validatedQuery);

      sendSuccess(res, result, 'User orders retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/orders/:id
   * Retrieve order details by ID for the authenticated owner.
   */
  getOrderById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = orderIdParamSchema.parse(req.params);
      const userId = (req as any).user.id;

      const order = await this.service.getOrderById(userId, id);

      sendSuccess(res, order, 'Order details retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/orders/:id
   * Cancel an eligible open order owned by the user.
   */
  cancelOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = orderIdParamSchema.parse(req.params);
      const userId = (req as any).user.id;

      const cancelledOrder = await this.service.cancelOrder(userId, id);

      sendSuccess(res, cancelledOrder, `Order #${id} cancelled successfully`);
    } catch (error) {
      next(error);
    }
  };
}

export const orderController = new OrderController();
