import express, { Application } from 'express';
import { requestIdMiddleware } from './middleware/requestId.js';
import { loggingMiddleware } from './middleware/logging.js';
import {
  errorHandler,
  jsonParseErrorHandler,
} from './middleware/errorHandler.js';
import observabilityRouter from './routes/observability.js';
import usersRouter from './routes/users.js';

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

  // FR-1 — User CRUD endpoints
  app.use('/api/v1/users', usersRouter);

  // Placeholder for future routes (Phase 3, 4)
  // app.use('/metrics', metricsRouter);
  // app.use('/api/v1/admin', adminRouter);

  // FR-5.4 — Error handlers (must be last)
  app.use(jsonParseErrorHandler);
  app.use(errorHandler);

  return app;
}
