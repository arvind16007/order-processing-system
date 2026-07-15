import { buildApp } from './app';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const { app, statusUpdateJob } = buildApp();

statusUpdateJob.start();

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Order Processing System listening on port ${PORT}`);
  // eslint-disable-next-line no-console
  console.log('Background job scheduled: PENDING -> PROCESSING every 5 minutes (*/5 * * * *)');
});

function shutdown(): void {
  // eslint-disable-next-line no-console
  console.log('Shutting down gracefully...');
  statusUpdateJob.stop();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
