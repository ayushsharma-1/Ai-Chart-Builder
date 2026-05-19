import { NextFunction, Request, Response } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const duration = Date.now() - startedAt;
    console.log(`${method} ${originalUrl} ${res.statusCode} ${duration}ms`);
  });

  next();
}