import express, { Application } from 'express';
import { requestIdMiddleware } from './middleware/requestId.js';
import { loggingMiddleware } from './middleware/logging.js';
import {
  errorHandler,
  jsonParseErrorHandler,
} from './middleware/errorHandler.js';
import observabilityRouter from './routes/observability.js';

export function createApp(): Application {
  const app = express();

  // FR-5.5 — Body parser with 1MB limit
  app.use(express.json({ limit: '1mb' }));

  // FR-5.1 — Attach a unique request ID to every request
  app.use(requestIdMiddleware);

  // FR-5.3 — Structured JSON logging
  app.use(loggingMiddleware);

  // FR-2 — Observability endpoints (health, ready, version, metrics)
  app.use(observabilityRouter);

  // Placeholder for future routes (Phase 2, 3, 4)
  // app.use('/api/v1/users', usersRouter);
  // app.use('/metrics', metricsRouter);
  // app.use('/api/v1/admin', adminRouter);

  // FR-5.4 — Error handlers (must be last)
  app.use(jsonParseErrorHandler);
  app.use(errorHandler);

  return app;
}
