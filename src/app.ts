import express, { Express } from 'express';
import { InMemoryOrderRepository } from './repository/orderRepository';
import { OrderService } from './services/orderService';
import { OrderController } from './controllers/orderController';
import { createOrderRouter } from './routes/orderRoutes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { OrderStatusUpdateJob } from './jobs/orderStatusUpdateJob';

export interface AppBundle {
  app: Express;
  orderService: OrderService;
  statusUpdateJob: OrderStatusUpdateJob;
}

/**
 * Builds a fresh app + service + job graph. Used by both the real server
 * entrypoint and the test suite, so tests never share state with each other
 * (each call creates its own InMemoryOrderRepository) and never accidentally
 * depend on a globally running cron schedule.
 */
export function buildApp(): AppBundle {
  const app = express();
  app.use(express.json());

  const repository = new InMemoryOrderRepository();
  const orderService = new OrderService(repository);
  const controller = new OrderController(orderService);
  const statusUpdateJob = new OrderStatusUpdateJob(orderService);

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.use('/orders', createOrderRouter(controller));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, orderService, statusUpdateJob };
}
