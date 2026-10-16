import { Router, Request, Response } from 'express';
import { registry } from '../metrics/registry.js';
import { config } from '../config.js';

const router = Router();

/**
 * FR-2.1 — GET /metrics
 * Prometheus exposition format scrape endpoint.
 * Disabled when METRICS_ENABLED=false.
 */
router.get('/metrics', async (_req: Request, res: Response) => {
  if (!config.METRICS_ENABLED) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Metrics endpoint is disabled' } });
    return;
  }

  try {
    const metrics = await registry.metrics();
    res.setHeader('Content-Type', registry.contentType);
    res.status(200).send(metrics);
  } catch (err) {
    res.status(500).json({ error: { code: 'METRICS_ERROR', message: 'Failed to collect metrics' } });
  }
});

export default router;
