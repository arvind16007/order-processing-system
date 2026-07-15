import { Request, Response, NextFunction } from 'express';
import { OrderService } from '../services/orderService';
import { createOrderSchema, listOrdersQuerySchema } from '../validation/orderValidation';
import { ValidationError } from '../errors';
import { OrderStatus } from '../types';

export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  createOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = createOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid order payload', parsed.error.flatten());
      }
      const order = await this.orderService.createOrder(parsed.data);
      res.status(201).json(order);
    } catch (err) {
      next(err);
    }
  };

  getOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const order = await this.orderService.getOrderById(req.params.id);
      res.status(200).json(order);
    } catch (err) {
      next(err);
    }
  };

  listOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = listOrdersQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.flatten());
      }
      const orders = await this.orderService.listOrders(parsed.data.status);
      res.status(200).json(orders);
    } catch (err) {
      next(err);
    }
  };

  cancelOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const order = await this.orderService.cancelOrder(req.params.id);
      res.status(200).json(order);
    } catch (err) {
      next(err);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status } = req.body as { status?: string };
      if (!status || !Object.values(OrderStatus).includes(status as OrderStatus)) {
        throw new ValidationError(
          `status must be one of: ${Object.values(OrderStatus).join(', ')}`
        );
      }
      const order = await this.orderService.updateStatus(req.params.id, status as OrderStatus);
      res.status(200).json(order);
    } catch (err) {
      next(err);
    }
  };
}
