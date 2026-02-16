import { Request, Response, NextFunction } from 'express';

/**
 * Request logging middleware for podcast API.
 * Logs: method, path, statusCode, duration, ip.
 * - 5xx: ERROR level
 * - 4xx: WARN level
 * - 2xx/3xx: INFO level
 */
export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, originalUrl } = req;
    const statusCode = res.statusCode;
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const msg = `${method} ${originalUrl} ${statusCode} ${duration}ms`;
    if (statusCode >= 500) {
      console.error(`[ERROR] ${msg} ip=${ip}`);
    } else if (statusCode >= 400) {
      console.warn(`[WARN] ${msg} ip=${ip}`);
    } else {
      console.log(`[INFO] ${msg} ip=${ip}`);
    }
  });
  next();
}
