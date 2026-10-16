import { Counter, Histogram, Summary, Gauge } from '@prometheus-io/client';
import { Request, Response, NextFunction } from 'express';
import { registry } from './registry.js';
import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Custom HTTP metrics (FR-4)
// ---------------------------------------------------------------------------

/** Total number of HTTP requests — used for request rate + error rate (RED) */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests, partitioned by method, route, and status code',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

/** Request duration histogram — used for P50/P95/P99 latency (RED) */
export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds, partitioned by method, route, and status code',
  labelNames: ['method', 'route', 'status_code'] as const,
  // Buckets suitable for web APIs (5ms → 10s)
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

/** Request payload size summary */
export const httpRequestSizeBytes = new Summary({
  name: 'http_request_size_bytes',
  help: 'Size of HTTP request payloads in bytes, partitioned by method and route',
  labelNames: ['method', 'route'] as const,
  registers: [registry],
});

/** Response payload size summary */
export const httpResponseSizeBytes = new Summary({
  name: 'http_response_size_bytes',
  help: 'Size of HTTP response payloads in bytes, partitioned by method and route',
  labelNames: ['method', 'route'] as const,
  registers: [registry],
});

/** Currently in-flight requests */
export const httpActiveRequests = new Gauge({
  name: 'http_active_requests',
  help: 'Number of HTTP requests currently being processed',
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Business metrics (FR-4)
// ---------------------------------------------------------------------------

/** Current number of users in the in-memory store */
export const appUsersTotal = new Gauge({
  name: 'app_users_total',
  help: 'Current number of users held in the in-memory store',
  registers: [registry],
});

/** Build/deployment metadata — useful for fleet-wide version tracking */
export const appInfo = new Gauge({
  name: 'app_info',
  help: 'Application build and runtime metadata',
  labelNames: ['version', 'node_version'] as const,
  registers: [registry],
});

/** Unix timestamp (seconds) when the process started */
export const appStartupTimestamp = new Gauge({
  name: 'app_startup_timestamp_seconds',
  help: 'Unix timestamp in seconds at which the process started',
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Initialise static metrics once at startup
// ---------------------------------------------------------------------------
appInfo.labels({ version: config.VERSION, node_version: process.version }).set(1);
appStartupTimestamp.set(Date.now() / 1000);

// ---------------------------------------------------------------------------
// Route normalisation helper
// ---------------------------------------------------------------------------

/**
 * Returns the Express route pattern (/api/v1/users/:id) rather than the raw
 * URL (/api/v1/users/abc-123), preventing high-cardinality label explosion.
 * Walks req.route.stack to reconstruct the full matched path.
 */
function normaliseRoute(req: Request): string {
  if (req.route?.path) {
    // Strip trailing slash from baseUrl, ensure route path starts with /
    const base = (req.baseUrl ?? '').replace(/\/$/, '');
    const routePath = req.route.path as string;
    // For the root handler '/', just return the base
    const full = routePath === '/' ? base || '/' : `${base}${routePath}`;
    return full;
  }
  // Fallback for unmatched routes (404s etc.)
  return req.path;
}

// ---------------------------------------------------------------------------
// Metrics middleware (FR-5.2)
// ---------------------------------------------------------------------------

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startTime = process.hrtime.bigint();
  const reqSize = parseInt(req.headers['content-length'] ?? '0', 10);

  httpActiveRequests.inc();

  res.on('finish', () => {
    const durationSeconds =
      Number(process.hrtime.bigint() - startTime) / 1e9;
    const route = normaliseRoute(req);
    const method = req.method;
    const statusCode = String(res.statusCode);
    const resSize = parseInt(res.getHeader('content-length') as string ?? '0', 10);

    httpActiveRequests.dec();
    httpRequestsTotal.labels({ method, route, status_code: statusCode }).inc();
    httpRequestDurationSeconds
      .labels({ method, route, status_code: statusCode })
      .observe(durationSeconds);
    httpRequestSizeBytes.labels({ method, route }).observe(reqSize);
    httpResponseSizeBytes.labels({ method, route }).observe(resSize);
  });

  next();
}
