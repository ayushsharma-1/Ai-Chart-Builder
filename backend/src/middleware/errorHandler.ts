import { NextFunction, Request, Response } from 'express';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error('Unhandled error:', err?.message || err);
  res.status(500).json({
    success: false,
    message: 'An unexpected error occurred.',
  });
}