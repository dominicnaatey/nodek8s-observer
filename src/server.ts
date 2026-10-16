import http from 'http';
import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';

const app = createApp();
const server = http.createServer(app);

// FR-5.6 — Graceful shutdown
function shutdown(signal: string): void {
  logger.info({ msg: `${signal} received, starting graceful shutdown` });

  // Stop accepting new connections
  server.close(() => {
    logger.info({ msg: 'HTTP server closed, exiting process' });
    process.exit(0);
  });

  // Force exit if shutdown takes too long
  setTimeout(() => {
    logger.error({
      msg: `Graceful shutdown timed out after ${config.SHUTDOWN_TIMEOUT_MS}ms, forcing exit`,
    });
    process.exit(1);
  }, config.SHUTDOWN_TIMEOUT_MS);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// FR-6 — Handle unexpected errors so Kubernetes can restart the pod
process.on('uncaughtException', (err: Error) => {
  logger.fatal({ msg: 'Uncaught exception', error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.fatal({ msg: 'Unhandled promise rejection', reason });
  process.exit(1);
});

// Start listening
server.listen(config.PORT, () => {
  logger.info({
    msg: 'Server started',
    port: config.PORT,
    version: config.VERSION,
    nodeEnv: config.NODE_ENV,
    pid: process.pid,
  });
});
