import request from 'supertest';
import { buildApp } from '../src/app';
import { OrderStatus } from '../src/types';

describe('Order API', () => {
  const { app } = buildApp();

  const sampleOrderPayload = {
    customerId: 'cust-123',
    items: [
      { productId: 'sku-1', productName: 'Keyboard', quantity: 1, unitPriceCents: 4999 },
      { productId: 'sku-2', productName: 'Mouse', quantity: 2, unitPriceCents: 1999 }
    ]
  };

  describe('POST /orders', () => {
    it('creates an order and returns 201', async () => {
      const res = await request(app).post('/orders').send(sampleOrderPayload);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(OrderStatus.PENDING);
      expect(res.body.totalCents).toBe(4999 + 2 * 1999);
      expect(res.body.id).toBeDefined();
    });

    it('returns 400 for missing items', async () => {
      const res = await request(app)
        .post('/orders')
        .send({ customerId: 'cust-123', items: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });

    it('returns 400 for a negative quantity', async () => {
      const res = await request(app)
        .post('/orders')
        .send({
          customerId: 'cust-123',
          items: [{ productId: 'sku-1', productName: 'Keyboard', quantity: -1, unitPriceCents: 100 }]
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /orders/:id', () => {
    it('fetches an order by id', async () => {
      const created = await request(app).post('/orders').send(sampleOrderPayload);
      const res = await request(app).get(`/orders/${created.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.body.id);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app).get('/orders/does-not-exist');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NotFoundError');
    });
  });

  describe('GET /orders', () => {
    it('lists orders, optionally filtered by status', async () => {
      const created = await request(app).post('/orders').send(sampleOrderPayload);
      await request(app).patch(`/orders/${created.body.id}/status`).send({
        status: OrderStatus.PROCESSING
      });
      await request(app).post('/orders').send(sampleOrderPayload); // stays PENDING

      const processingRes = await request(app).get('/orders').query({ status: 'PROCESSING' });
      expect(processingRes.status).toBe(200);
      expect(processingRes.body.every((o: { status: string }) => o.status === 'PROCESSING')).toBe(
        true
      );

      const allRes = await request(app).get('/orders');
      expect(allRes.body.length).toBeGreaterThanOrEqual(2);
    });

    it('returns 400 for an invalid status filter', async () => {
      const res = await request(app).get('/orders').query({ status: 'NOT_A_STATUS' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /orders/:id/cancel', () => {
    it('cancels a PENDING order', async () => {
      const created = await request(app).post('/orders').send(sampleOrderPayload);
      const res = await request(app).post(`/orders/${created.body.id}/cancel`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(OrderStatus.CANCELLED);
    });

    it('returns 409 when cancelling a non-PENDING order', async () => {
      const created = await request(app).post('/orders').send(sampleOrderPayload);
      await request(app).patch(`/orders/${created.body.id}/status`).send({
        status: OrderStatus.PROCESSING
      });

      const res = await request(app).post(`/orders/${created.body.id}/cancel`);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('InvalidStateTransitionError');
    });
  });

  describe('PATCH /orders/:id/status', () => {
    it('rejects an invalid status value', async () => {
      const created = await request(app).post('/orders').send(sampleOrderPayload);
      const res = await request(app)
        .patch(`/orders/${created.body.id}/status`)
        .send({ status: 'NOT_REAL' });

      expect(res.status).toBe(400);
    });

    it('rejects skipping a stage', async () => {
      const created = await request(app).post('/orders').send(sampleOrderPayload);
      const res = await request(app)
        .patch(`/orders/${created.body.id}/status`)
        .send({ status: OrderStatus.SHIPPED });

      expect(res.status).toBe(409);
    });
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
