import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const code = err.code ?? 'INTERNAL_SERVER_ERROR';

  logger.error({
    msg: err.message,
    code,
    statusCode,
    requestId: req.requestId,
    // Only include stack in non-production
    ...(config.NODE_ENV !== 'production' && { stack: err.stack }),
  });

  res.status(statusCode).json({
    error: {
      code,
      message: err.message,
      requestId: req.requestId,
    },
  });
}

// Handle malformed JSON bodies (SyntaxError from express.json())
export function jsonParseErrorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON',
        requestId: req.requestId,
      },
    });
    return;
  }
  next(err);
}
