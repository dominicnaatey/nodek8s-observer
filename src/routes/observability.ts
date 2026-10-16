import { Router, Request, Response } from 'express';
import { config } from '../config.js';

const router = Router();

// Track readiness state — will be controlled by chaos endpoints in Phase 4
let isReady = false;
const startupTime = Date.now();

// Allow readiness state to be toggled externally (used by chaos state in Phase 4)
export function setReadiness(value: boolean): void {
  isReady = value;
}

// Activate readiness after the startup grace period
setTimeout(() => {
  isReady = true;
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
 * Can be toggled by chaos endpoint (Phase 4).
 */
router.get('/ready', (_req: Request, res: Response) => {
  if (!isReady) {
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
