// src/http/middleware/notFound.ts

import type { Request, Response } from 'express';
import { buildErrorEnvelope } from '../errors/errorEnvelope';

export function notFound(req: Request, res: Response): Response {
  return res.status(404).json(
    buildErrorEnvelope({
      code: 'NOT_FOUND',
      message: 'Route not found',
      correlationId: req.correlationId,
    }),
  );
}
