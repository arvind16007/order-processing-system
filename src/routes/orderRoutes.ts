import { Router } from 'express';
import { OrderController } from '../controllers/orderController';

export function createOrderRouter(controller: OrderController): Router {
  const router = Router();

  router.post('/', controller.createOrder);
  router.get('/', controller.listOrders);
  router.get('/:id', controller.getOrder);
  router.patch('/:id/status', controller.updateStatus);
  router.post('/:id/cancel', controller.cancelOrder);

  return router;
}
