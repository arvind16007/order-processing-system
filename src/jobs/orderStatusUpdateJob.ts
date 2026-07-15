import cron, { ScheduledTask } from 'node-cron';
import { OrderService } from '../services/orderService';

/**
 * Background job responsible for the "PENDING -> PROCESSING every 5 minutes"
 * requirement.
 *
 * Design notes:
 * - Runs on a standard cron expression ("*\/5 * * * *") via node-cron, which
 *   is a thin wrapper around the well-known cron syntax rather than a raw
 *   setInterval. This makes the schedule self-documenting and easy to change
 *   (e.g. swap to hourly) without touching any logic.
 * - The actual work (`runOnce`) is a plain async function decoupled from the
 *   cron scheduling itself. This is deliberate: tests call `runOnce()`
 *   directly instead of waiting on / mocking the cron scheduler, which keeps
 *   the test suite fast and deterministic.
 * - Overlap protection: if a previous run is still in flight when the next
 *   tick fires (e.g. a slow DB in a future real implementation), we skip the
 *   new tick rather than run two promotions concurrently.
 */
export class OrderStatusUpdateJob {
  private task: ScheduledTask | undefined;
  private isRunning = false;

  constructor(
    private readonly orderService: OrderService,
    private readonly cronExpression: string = '*/5 * * * *',
    private readonly onRun?: (promotedCount: number) => void
  ) {}

  /** Executes a single promotion pass. Safe to call directly (e.g. in tests). */
  async runOnce(): Promise<number> {
    if (this.isRunning) {
      return 0;
    }
    this.isRunning = true;
    try {
      const promoted = await this.orderService.promotePendingOrders();
      if (this.onRun) this.onRun(promoted.length);
      return promoted.length;
    } finally {
      this.isRunning = false;
    }
  }

  /** Starts the recurring cron schedule. No-op if already started. */
  start(): void {
    if (this.task) return;
    this.task = cron.schedule(this.cronExpression, () => {
      void this.runOnce();
    });
  }

  /** Stops the recurring schedule. Mainly used to clean up in tests. */
  stop(): void {
    this.task?.stop();
    this.task = undefined;
  }
}
