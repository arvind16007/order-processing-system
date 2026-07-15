/**
 * Core domain types for the Order Processing System.
 */

export enum OrderStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED'
}

/**
 * Allowed forward transitions for an order's lifecycle.
 * Keeping this centralized means every code path (API, background job)
 * enforces the same state machine instead of duplicating "if" checks.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: []
};

export interface OrderItemInput {
  productId: string;
  productName: string;
  quantity: number;
  /** Unit price in the smallest currency unit (cents) to avoid float rounding issues. */
  unitPriceCents: number;
}

export interface OrderItem extends OrderItemInput {
  lineTotalCents: number;
}

export interface CreateOrderInput {
  customerId: string;
  items: OrderItemInput[];
}

export interface Order {
  id: string;
  customerId: string;
  items: OrderItem[];
  totalCents: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  statusHistory: { status: OrderStatus; timestamp: string }[];
}
