import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';

export function loggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startTime = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    logger.info({
      msg: 'request completed',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
      requestId: req.requestId,
    });
  });

  next();
}
