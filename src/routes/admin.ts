import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import {
  toggleReadiness,
  addLeakedBuffer,
  getLeakedMemoryMb,
  getLeakedBufferCount,
  resetChaosState,
} from '../chaos/state.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// ---------------------------------------------------------------------------
// Guard middleware — disable all chaos routes when CHAOS_ENABLED=false
// ---------------------------------------------------------------------------
router.use((_req: Request, res: Response, next: NextFunction) => {
  if (!config.CHAOS_ENABLED) {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Chaos endpoints are disabled in this environment',
      },
    });
    return;
  }
  next();
});

// ---------------------------------------------------------------------------
// FR-3.1 — GET /api/v1/admin/slow?ms=2000
// Sleeps ms milliseconds before responding. Max 30 000 ms.
// Aborts cleanly if the client disconnects before the timer fires.
// ---------------------------------------------------------------------------
const slowSchema = z.object({
  ms: z.coerce.number().int().min(0).max(30_000).default(1000),
});

router.get('/slow', (req: Request, res: Response) => {
  const result = slowSchema.safeParse(req.query);
  const ms = result.success ? result.data.ms : 1000;

  let timer: ReturnType<typeof setTimeout>;

  const cleanup = (): void => clearTimeout(timer);

  timer = setTimeout(() => {
    req.off('close', cleanup);
    res.status(200).json({ message: `Slept for ${ms}ms`, ms });
  }, ms);

  // If client disconnects early, cancel the timer — don't hold the process
  req.once('close', cleanup);
});

// ---------------------------------------------------------------------------
// FR-3.2 — GET /api/v1/admin/cpu-burn?ms=1000&intensity=1
// Runs setImmediate-based busy loops for ms milliseconds.
// intensity (1–10) controls how many parallel worker loops run.
// ---------------------------------------------------------------------------
const cpuBurnSchema = z.object({
  ms: z.coerce.number().int().min(0).max(30_000).default(1000),
  intensity: z.coerce.number().int().min(1).max(10).default(1),
});

function busyLoop(endTime: number): void {
  if (Date.now() >= endTime) return;
  // Tight loop for ~1ms then yield via setImmediate to avoid starving I/O
  const slice = Date.now() + 1;
  while (Date.now() < slice) {
    // intentional busy spin
  }
  setImmediate(() => busyLoop(endTime));
}

router.get('/cpu-burn', (req: Request, res: Response) => {
  const result = cpuBurnSchema.safeParse(req.query);
  const { ms, intensity } = result.success
    ? result.data
    : { ms: 1000, intensity: 1 };

  const endTime = Date.now() + ms;

  for (let i = 0; i < intensity; i++) {
    busyLoop(endTime);
  }

  res.status(200).json({
    message: `CPU burn started`,
    ms,
    intensity,
    workers: intensity,
  });
});

// ---------------------------------------------------------------------------
// FR-3.3 — POST /api/v1/admin/crash
// Responds 200 first, then calls process.exit(1) on the next tick.
// ---------------------------------------------------------------------------
router.post('/crash', (_req: Request, res: Response) => {
  res.status(200).json({ message: 'Crashing process on next tick' });
  // Flush the response before exiting
  res.once('finish', () => {
    process.nextTick(() => process.exit(1));
  });
});

// ---------------------------------------------------------------------------
// FR-3.4 — POST /api/v1/admin/toggle-ready
// Flips /ready between 200 and 503.
// ---------------------------------------------------------------------------
router.post('/toggle-ready', (_req: Request, res: Response) => {
  const newState = toggleReadiness();
  res.status(200).json({
    ready: newState,
    message: `Readiness set to ${newState}`,
  });
});

// ---------------------------------------------------------------------------
// FR-3.5 — GET /api/v1/admin/error?code=500&rate=1.0
// Returns an HTTP error with the given status code.
// rate (0–1) makes it probabilistic — below rate returns the error,
// above rate returns 200 (pass-through).
// ---------------------------------------------------------------------------
const errorSchema = z.object({
  code: z.coerce.number().int().min(400).max(599).default(500),
  rate: z.coerce.number().min(0).max(1).default(1.0),
});

router.get('/error', (req: Request, res: Response, next: NextFunction) => {
  const result = errorSchema.safeParse(req.query);
  const { code, rate } = result.success
    ? result.data
    : { code: 500, rate: 1.0 };

  if (Math.random() > rate) {
    res.status(200).json({ message: 'No error this time (rate miss)', rate });
    return;
  }

  const err: AppError = new Error(`Chaos error: intentional ${code}`);
  err.statusCode = code;
  err.code = 'CHAOS_ERROR';
  next(err);
});

// ---------------------------------------------------------------------------
// FR-3.6 — GET /api/v1/admin/leak?mb=50
// Allocates mb MB of memory and holds it to simulate a memory leak.
// ---------------------------------------------------------------------------
const leakSchema = z.object({
  mb: z.coerce.number().int().min(1).max(500).default(50),
});

router.get('/leak', (req: Request, res: Response) => {
  const result = leakSchema.safeParse(req.query);
  const mb = result.success ? result.data.mb : 50;

  const buf = Buffer.alloc(mb * 1024 * 1024, 0);
  addLeakedBuffer(buf);

  res.status(200).json({
    message: `Allocated ${mb}MB`,
    allocatedMb: mb,
    totalLeakedMb: Math.round(getLeakedMemoryMb()),
    bufferCount: getLeakedBufferCount(),
  });
});

// ---------------------------------------------------------------------------
// FR-3.7 — POST /api/v1/admin/reset
// Clears all chaos state: restores readiness, frees leaked memory.
// ---------------------------------------------------------------------------
router.post('/reset', (_req: Request, res: Response) => {
  resetChaosState();
  res.status(200).json({
    message: 'Chaos state reset',
    ready: true,
    leakedMemoryMb: 0,
  });
});

export default router;
