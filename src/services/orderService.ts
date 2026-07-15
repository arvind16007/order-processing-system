import { v4 as uuidv4 } from 'uuid';
import { IOrderRepository } from '../repository/orderRepository';
import {
  ALLOWED_TRANSITIONS,
  CreateOrderInput,
  Order,
  OrderItem,
  OrderStatus
} from '../types';
import { InvalidStateTransitionError, NotFoundError, ValidationError } from '../errors';

export class OrderService {
  constructor(private readonly repository: IOrderRepository) {}

  async createOrder(input: CreateOrderInput): Promise<Order> {
    if (!input.items || input.items.length === 0) {
      throw new ValidationError('Order must contain at least one item');
    }

    const items: OrderItem[] = input.items.map((item) => ({
      ...item,
      lineTotalCents: item.quantity * item.unitPriceCents
    }));

    const totalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
    const now = new Date().toISOString();

    const order: Order = {
      id: uuidv4(),
      customerId: input.customerId,
      items,
      totalCents,
      status: OrderStatus.PENDING,
      createdAt: now,
      updatedAt: now,
      statusHistory: [{ status: OrderStatus.PENDING, timestamp: now }]
    };

    return this.repository.save(order);
  }

  async getOrderById(id: string): Promise<Order> {
    const order = await this.repository.findById(id);
    if (!order) {
      throw new NotFoundError(`Order ${id} not found`);
    }
    return order;
  }

  async listOrders(status?: OrderStatus): Promise<Order[]> {
    return this.repository.findAll(status);
  }

  async cancelOrder(id: string): Promise<Order> {
    const order = await this.getOrderById(id);
    if (order.status !== OrderStatus.PENDING) {
      throw new InvalidStateTransitionError(
        `Order ${id} cannot be cancelled because it is in status ${order.status}. Only PENDING orders can be cancelled.`
      );
    }
    return this.transitionStatus(order, OrderStatus.CANCELLED);
  }

  /**
   * Explicit status update endpoint, enforcing the same state machine
   * used by the background job so manual and automated transitions can
   * never diverge or produce inconsistent states.
   */
  async updateStatus(id: string, newStatus: OrderStatus): Promise<Order> {
    const order = await this.getOrderById(id);
    return this.transitionStatus(order, newStatus);
  }

  /**
   * Moves every PENDING order to PROCESSING. Used by the scheduled
   * background job. Returns the list of orders that were transitioned,
   * primarily so it can be observed/logged/tested.
   */
  async promotePendingOrders(): Promise<Order[]> {
    const pendingOrders = await this.repository.findByStatus(OrderStatus.PENDING);
    const promoted: Order[] = [];
    for (const order of pendingOrders) {
      promoted.push(await this.transitionStatus(order, OrderStatus.PROCESSING));
    }
    return promoted;
  }

  private async transitionStatus(order: Order, newStatus: OrderStatus): Promise<Order> {
    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(newStatus)) {
      throw new InvalidStateTransitionError(
        `Cannot transition order ${order.id} from ${order.status} to ${newStatus}`
      );
    }
    const now = new Date().toISOString();
    const updated: Order = {
      ...order,
      status: newStatus,
      updatedAt: now,
      statusHistory: [...order.statusHistory, { status: newStatus, timestamp: now }]
    };
    return this.repository.update(updated);
  }
}
