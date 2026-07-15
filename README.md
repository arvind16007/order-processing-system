# Order Processing System

A backend service for an e-commerce order processing system: create orders,
fetch and list them, cancel them, and automatically progress `PENDING`
orders to `PROCESSING` on a cron schedule.

Built with **Node.js + TypeScript + Express**. See [`AI_USAGE.md`](./AI_USAGE.md)
for a disclosure of how AI assistance was used to build this project, what
issues came up, and how they were fixed.

## Why this stack

The requirements said "any language." I chose Node/TypeScript over Java or
.NET for a practical reason as well as a technical one: it lets me ship a
fully working, tested, runnable system with zero external infrastructure
(no DB server, no JVM/CLR setup) — `npm install && npm test` is the whole
story. TypeScript's type system also gives most of the safety benefits
people reach for Java for, without the ceremony.

## Project structure

```
src/
  types.ts                 Domain types, OrderStatus enum, allowed state transitions
  errors.ts                Typed application errors (NotFound, Validation, InvalidStateTransition)
  repository/
    orderRepository.ts     Storage interface + in-memory implementation
  services/
    orderService.ts        All business logic (the state machine lives here)
  jobs/
    orderStatusUpdateJob.ts  Cron job: PENDING -> PROCESSING every 5 minutes
  controllers/
    orderController.ts     HTTP request/response handling
  routes/
    orderRoutes.ts         Route definitions
  validation/
    orderValidation.ts     Zod schemas for request validation
  middleware/
    errorHandler.ts        Central error -> HTTP response mapping
  app.ts                   Express app factory (used by both server.ts and tests)
  server.ts                Process entrypoint: starts HTTP server + cron job

tests/
  orderService.test.ts         Unit tests for business logic
  orderApi.test.ts             Integration tests against real HTTP endpoints
  orderStatusUpdateJob.test.ts Tests for the background job
```

The layering (`routes -> controller -> service -> repository`) is the main
design decision worth calling out. The service layer has zero knowledge of
Express (no `req`/`res` anywhere in it), and the repository is hidden behind
an `IOrderRepository` interface. That means:

- The service layer is unit-testable without spinning up HTTP at all.
- Swapping the in-memory store for Postgres/Mongo later is a matter of
  writing one new class that implements `IOrderRepository` — no changes to
  business logic, controllers, or routes.

## Running it

```bash
npm install
npm run dev      # ts-node-dev, auto-restarts on changes, http://localhost:3000
# or
npm run build && npm start   # compiled JS
```

Run the test suite:

```bash
npm test
# or with coverage
npm run test:coverage
```

## API

All request/response bodies are JSON. Money is represented as integer
**cents** (`unitPriceCents`, `totalCents`) rather than floats, to avoid
floating-point rounding bugs in totals — a real client would render
`totalCents / 100` for display.

### `POST /orders` — create an order

Request:
```json
{
  "customerId": "cust-123",
  "items": [
    { "productId": "sku-1", "productName": "Keyboard", "quantity": 1, "unitPriceCents": 4999 },
    { "productId": "sku-2", "productName": "Mouse", "quantity": 2, "unitPriceCents": 1999 }
  ]
}
```
`201 Created` with the full order (status `PENDING`, computed `totalCents`
and per-line `lineTotalCents`). `400` if `items` is empty or any field is
invalid (e.g. negative quantity).

### `GET /orders/:id` — fetch one order

`200` with the order, or `404` if the id doesn't exist.

### `GET /orders?status=PENDING` — list orders

`status` query param is optional; omit it to get every order. `400` if
`status` isn't one of the valid enum values.

### `PATCH /orders/:id/status` — manually move an order forward

Body: `{ "status": "PROCESSING" }`. Enforces the same state machine as
everything else (see below) — `409` if the transition isn't legal, `404` if
the order doesn't exist, `400` if the status value is invalid.

### `POST /orders/:id/cancel` — cancel an order

Only allowed while `status` is `PENDING`. `200` with the cancelled order, or
`409 Conflict` if the order has already moved past `PENDING`.

### `GET /health`

Basic liveness check.

## Order status state machine

```
PENDING ──► PROCESSING ──► SHIPPED ──► DELIVERED
   │
   └──► CANCELLED
```

`SHIPPED`, `DELIVERED`, and `CANCELLED` are terminal — no transitions out of
them. This table lives in one place (`ALLOWED_TRANSITIONS` in `types.ts`)
and every transition, whether triggered by the API or the background job,
goes through the same `transitionStatus()` method in `OrderService`. That
was a deliberate choice: I didn't want "can this order be cancelled?" logic
duplicated between the manual status-update endpoint and the cron job,
where it could silently drift out of sync.

## Background job: PENDING → PROCESSING every 5 minutes

Implemented with **node-cron** (`src/jobs/orderStatusUpdateJob.ts`) using
the cron expression `*/5 * * * *`, rather than a raw `setInterval`. A few
things worth noting about the implementation:

- **The scheduling is decoupled from the work.** `runOnce()` does the actual
  promotion and can be called directly; `start()`/`stop()` just wire it to
  the cron schedule. This is what makes the job testable — the test suite
  calls `runOnce()` directly instead of waiting on (or mocking) a 5-minute
  timer, so the tests run in milliseconds and are deterministic.
- **Overlap protection.** If a run is still in progress when the next tick
  fires, the new tick is skipped rather than running two promotions
  concurrently. With an in-memory store this can't happen, but it's the
  kind of bug that shows up the moment the repository is backed by a real,
  sometimes-slow database, so I built the guard in from the start rather
  than waiting to hit it.
- **Started/stopped explicitly.** `server.ts` calls `statusUpdateJob.start()`
  after building the app, and stops it on `SIGINT`/`SIGTERM` for a clean
  shutdown. The test suite never calls `start()` — it only exercises
  `runOnce()` — so tests never have a real cron ticking in the background.

## Known limitations / things I'd change for production

- **In-memory storage.** State doesn't survive a restart, and nothing here
  is safe across multiple server instances (no shared state, no locking
  beyond the single-process overlap guard on the job). The repository
  interface is there specifically so this is easy to fix without touching
  business logic.
- **No auth.** There's no concept of "this customer can only see their own
  orders" — anyone can fetch any order by id. A real system needs
  authentication/authorization in front of this.
- **No pagination on `GET /orders`.** Fine for a take-home, not fine at
  scale.
- **Idempotency isn't handled on `POST /orders`.** A retried request (e.g.
  after a network blip) would create a duplicate order. A production
  version would accept an idempotency key.
