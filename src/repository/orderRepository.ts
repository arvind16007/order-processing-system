import { Order, OrderStatus } from '../types';

/**
 * In-memory repository behind a small interface so the storage engine
 * can be swapped for a real database (Postgres, Mongo, etc.) without
 * touching the service layer. Methods are async on purpose, even though
 * the current implementation is synchronous, so callers already treat
 * this as I/O -- a future DB-backed implementation is a drop-in replacement.
 */
export interface IOrderRepository {
  save(order: Order): Promise<Order>;
  findById(id: string): Promise<Order | undefined>;
  findAll(status?: OrderStatus): Promise<Order[]>;
  findByStatus(status: OrderStatus): Promise<Order[]>;
  update(order: Order): Promise<Order>;
}

export class InMemoryOrderRepository implements IOrderRepository {
  private orders: Map<string, Order> = new Map();

  async save(order: Order): Promise<Order> {
    this.orders.set(order.id, order);
    return order;
  }

  async findById(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async findAll(status?: OrderStatus): Promise<Order[]> {
    const all = Array.from(this.orders.values());
    if (!status) return all;
    return all.filter((o) => o.status === status);
  }

  async findByStatus(status: OrderStatus): Promise<Order[]> {
    return this.findAll(status);
  }

  async update(order: Order): Promise<Order> {
    if (!this.orders.has(order.id)) {
      throw new Error(`Cannot update non-existent order ${order.id}`);
    }
    this.orders.set(order.id, order);
    return order;
  }

  /** Test/debug helper to reset state between test cases. */
  clear(): void {
    this.orders.clear();
  }
}
