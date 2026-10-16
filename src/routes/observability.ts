import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import { getReadiness, activateReadiness } from '../chaos/state.js';

const router = Router();

const startupTime = Date.now();

// Activate readiness after the startup grace period
setTimeout(() => {
  activateReadiness();
}, config.STARTUP_GRACE_MS);

/**
 * FR-2.2 — Liveness probe
 * Always returns 200 as long as the event loop is alive.
 * Never checks downstream dependencies.
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * FR-2.3 — Readiness probe
 * Returns 503 during startup grace period, then 200.
 * Toggled by POST /api/v1/admin/toggle-ready.
 */
router.get('/ready', (_req: Request, res: Response) => {
  if (!getReadiness()) {
    res.status(503).json({ status: 'not ready' });
    return;
  }
  res.status(200).json({ status: 'ready' });
});

/**
 * FR-2.4 — Version info for deployment tracking
 */
router.get('/version', (_req: Request, res: Response) => {
  res.status(200).json({
    version: config.VERSION,
    commit: config.COMMIT,
    buildTime: config.BUILD_TIME,
    uptime: Math.floor((Date.now() - startupTime) / 1000),
  });
});

export default router;
