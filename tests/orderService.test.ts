import { InMemoryOrderRepository } from '../src/repository/orderRepository';
import { OrderService } from '../src/services/orderService';
import { OrderStatus } from '../src/types';
import { InvalidStateTransitionError, NotFoundError, ValidationError } from '../src/errors';

describe('OrderService', () => {
  let repository: InMemoryOrderRepository;
  let service: OrderService;

  beforeEach(() => {
    repository = new InMemoryOrderRepository();
    service = new OrderService(repository);
  });

  describe('createOrder', () => {
    it('creates an order with PENDING status and computed totals', async () => {
      const order = await service.createOrder({
        customerId: 'cust-1',
        items: [
          { productId: 'p1', productName: 'Widget', quantity: 2, unitPriceCents: 500 },
          { productId: 'p2', productName: 'Gadget', quantity: 1, unitPriceCents: 1500 }
        ]
      });

      expect(order.id).toBeDefined();
      expect(order.status).toBe(OrderStatus.PENDING);
      expect(order.totalCents).toBe(2 * 500 + 1 * 1500);
      expect(order.items[0].lineTotalCents).toBe(1000);
      expect(order.statusHistory).toHaveLength(1);
      expect(order.statusHistory[0].status).toBe(OrderStatus.PENDING);
    });

    it('rejects an order with no items', async () => {
      await expect(
        service.createOrder({ customerId: 'cust-1', items: [] })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getOrderById', () => {
    it('returns the order when found', async () => {
      const created = await service.createOrder({
        customerId: 'cust-1',
        items: [{ productId: 'p1', productName: 'Widget', quantity: 1, unitPriceCents: 100 }]
      });
      const fetched = await service.getOrderById(created.id);
      expect(fetched).toEqual(created);
    });

    it('throws NotFoundError for an unknown id', async () => {
      await expect(service.getOrderById('does-not-exist')).rejects.toThrow(NotFoundError);
    });
  });

  describe('listOrders', () => {
    it('lists all orders when no status filter is given', async () => {
      await service.createOrder({
        customerId: 'c1',
        items: [{ productId: 'p1', productName: 'A', quantity: 1, unitPriceCents: 100 }]
      });
      await service.createOrder({
        customerId: 'c2',
        items: [{ productId: 'p2', productName: 'B', quantity: 1, unitPriceCents: 200 }]
      });

      const all = await service.listOrders();
      expect(all).toHaveLength(2);
    });

    it('filters orders by status', async () => {
      const order1 = await service.createOrder({
        customerId: 'c1',
        items: [{ productId: 'p1', productName: 'A', quantity: 1, unitPriceCents: 100 }]
      });
      await service.createOrder({
        customerId: 'c2',
        items: [{ productId: 'p2', productName: 'B', quantity: 1, unitPriceCents: 200 }]
      });

      await service.updateStatus(order1.id, OrderStatus.PROCESSING);

      const processing = await service.listOrders(OrderStatus.PROCESSING);
      const pending = await service.listOrders(OrderStatus.PENDING);

      expect(processing).toHaveLength(1);
      expect(processing[0].id).toBe(order1.id);
      expect(pending).toHaveLength(1);
    });
  });

  describe('cancelOrder', () => {
    it('cancels a PENDING order', async () => {
      const order = await service.createOrder({
        customerId: 'c1',
        items: [{ productId: 'p1', productName: 'A', quantity: 1, unitPriceCents: 100 }]
      });

      const cancelled = await service.cancelOrder(order.id);
      expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    });

    it('rejects cancelling a non-PENDING order', async () => {
      const order = await service.createOrder({
        customerId: 'c1',
        items: [{ productId: 'p1', productName: 'A', quantity: 1, unitPriceCents: 100 }]
      });
      await service.updateStatus(order.id, OrderStatus.PROCESSING);

      await expect(service.cancelOrder(order.id)).rejects.toThrow(InvalidStateTransitionError);
    });

    it('throws NotFoundError when cancelling an unknown order', async () => {
      await expect(service.cancelOrder('nope')).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateStatus', () => {
    it('allows valid forward transitions', async () => {
      const order = await service.createOrder({
        customerId: 'c1',
        items: [{ productId: 'p1', productName: 'A', quantity: 1, unitPriceCents: 100 }]
      });

      const processing = await service.updateStatus(order.id, OrderStatus.PROCESSING);
      expect(processing.status).toBe(OrderStatus.PROCESSING);

      const shipped = await service.updateStatus(order.id, OrderStatus.SHIPPED);
      expect(shipped.status).toBe(OrderStatus.SHIPPED);

      const delivered = await service.updateStatus(order.id, OrderStatus.DELIVERED);
      expect(delivered.status).toBe(OrderStatus.DELIVERED);

      expect(delivered.statusHistory.map((h) => h.status)).toEqual([
        OrderStatus.PENDING,
        OrderStatus.PROCESSING,
        OrderStatus.SHIPPED,
        OrderStatus.DELIVERED
      ]);
    });

    it('rejects skipping a stage (e.g. PENDING -> SHIPPED)', async () => {
      const order = await service.createOrder({
        customerId: 'c1',
        items: [{ productId: 'p1', productName: 'A', quantity: 1, unitPriceCents: 100 }]
      });

      await expect(service.updateStatus(order.id, OrderStatus.SHIPPED)).rejects.toThrow(
        InvalidStateTransitionError
      );
    });

    it('rejects transitions out of a terminal state', async () => {
      const order = await service.createOrder({
        customerId: 'c1',
        items: [{ productId: 'p1', productName: 'A', quantity: 1, unitPriceCents: 100 }]
      });
      await service.cancelOrder(order.id);

      await expect(service.updateStatus(order.id, OrderStatus.PROCESSING)).rejects.toThrow(
        InvalidStateTransitionError
      );
    });
  });

  describe('promotePendingOrders', () => {
    it('promotes every PENDING order to PROCESSING and leaves others untouched', async () => {
      const p1 = await service.createOrder({
        customerId: 'c1',
        items: [{ productId: 'p1', productName: 'A', quantity: 1, unitPriceCents: 100 }]
      });
      const p2 = await service.createOrder({
        customerId: 'c2',
        items: [{ productId: 'p2', productName: 'B', quantity: 1, unitPriceCents: 100 }]
      });
      const alreadyShipped = await service.createOrder({
        customerId: 'c3',
        items: [{ productId: 'p3', productName: 'C', quantity: 1, unitPriceCents: 100 }]
      });
      await service.updateStatus(alreadyShipped.id, OrderStatus.PROCESSING);
      await service.updateStatus(alreadyShipped.id, OrderStatus.SHIPPED);

      const promoted = await service.promotePendingOrders();

      expect(promoted).toHaveLength(2);
      expect(promoted.map((o) => o.id).sort()).toEqual([p1.id, p2.id].sort());

      const refetchedShipped = await service.getOrderById(alreadyShipped.id);
      expect(refetchedShipped.status).toBe(OrderStatus.SHIPPED);
    });

    it('is a no-op when there are no PENDING orders', async () => {
      const promoted = await service.promotePendingOrders();
      expect(promoted).toHaveLength(0);
    });
  });
});
