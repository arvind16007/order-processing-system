import { InMemoryOrderRepository } from '../src/repository/orderRepository';
import { OrderService } from '../src/services/orderService';
import { OrderStatusUpdateJob } from '../src/jobs/orderStatusUpdateJob';
import { OrderStatus } from '../src/types';

describe('OrderStatusUpdateJob', () => {
  let repository: InMemoryOrderRepository;
  let service: OrderService;

  beforeEach(() => {
    repository = new InMemoryOrderRepository();
    service = new OrderService(repository);
  });

  it('promotes all PENDING orders to PROCESSING when run', async () => {
    await service.createOrder({
      customerId: 'c1',
      items: [{ productId: 'p1', productName: 'A', quantity: 1, unitPriceCents: 100 }]
    });
    await service.createOrder({
      customerId: 'c2',
      items: [{ productId: 'p2', productName: 'B', quantity: 1, unitPriceCents: 100 }]
    });

    const job = new OrderStatusUpdateJob(service);
    const promotedCount = await job.runOnce();

    expect(promotedCount).toBe(2);
    const orders = await service.listOrders();
    expect(orders.every((o) => o.status === OrderStatus.PROCESSING)).toBe(true);
  });

  it('invokes the onRun callback with the number of promoted orders', async () => {
    await service.createOrder({
      customerId: 'c1',
      items: [{ productId: 'p1', productName: 'A', quantity: 1, unitPriceCents: 100 }]
    });

    const onRun = jest.fn();
    const job = new OrderStatusUpdateJob(service, '*/5 * * * *', onRun);

    await job.runOnce();

    expect(onRun).toHaveBeenCalledWith(1);
  });

  it('does not re-promote orders that are already past PENDING', async () => {
    const order = await service.createOrder({
      customerId: 'c1',
      items: [{ productId: 'p1', productName: 'A', quantity: 1, unitPriceCents: 100 }]
    });
    await service.updateStatus(order.id, OrderStatus.PROCESSING);
    await service.updateStatus(order.id, OrderStatus.SHIPPED);

    const job = new OrderStatusUpdateJob(service);
    const promotedCount = await job.runOnce();

    expect(promotedCount).toBe(0);
    const refetched = await service.getOrderById(order.id);
    expect(refetched.status).toBe(OrderStatus.SHIPPED);
  });

  it('prevents overlapping runs from processing concurrently', async () => {
    await service.createOrder({
      customerId: 'c1',
      items: [{ productId: 'p1', productName: 'A', quantity: 1, unitPriceCents: 100 }]
    });

    const job = new OrderStatusUpdateJob(service);

    // Fire two runs back-to-back without awaiting the first. The second
    // should observe isRunning=true and short-circuit to 0, proving the
    // overlap guard works rather than double-processing the same order.
    const [firstCount, secondCount] = await Promise.all([job.runOnce(), job.runOnce()]);

    expect([firstCount, secondCount].sort()).toEqual([0, 1]);
  });

  it('start() schedules a cron task and stop() tears it down cleanly', () => {
    const job = new OrderStatusUpdateJob(service, '*/5 * * * *');
    expect(() => job.start()).not.toThrow();
    expect(() => job.stop()).not.toThrow();
    // starting twice should be a no-op, not throw or double-schedule
    job.start();
    expect(() => job.start()).not.toThrow();
    job.stop();
  });
});
