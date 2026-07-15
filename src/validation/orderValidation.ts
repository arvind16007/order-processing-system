import { z } from 'zod';
import { OrderStatus } from '../types';

export const orderItemSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  productName: z.string().min(1, 'productName is required'),
  quantity: z.number().int().positive('quantity must be a positive integer'),
  unitPriceCents: z.number().int().nonnegative('unitPriceCents must be a non-negative integer')
});

export const createOrderSchema = z.object({
  customerId: z.string().min(1, 'customerId is required'),
  items: z.array(orderItemSchema).min(1, 'order must contain at least one item')
});

export const listOrdersQuerySchema = z.object({
  status: z.nativeEnum(OrderStatus).optional()
});

export type CreateOrderPayload = z.infer<typeof createOrderSchema>;
