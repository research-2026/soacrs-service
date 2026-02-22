// src/http/middleware/correlationId.ts

/**
 * Correlation ID middleware (SOA-S19)
 *
 * Purpose:
 * - Ensure every request has a correlationId for cross-service tracing.
 *
 * Rules:
 * 1) Prefer header: x-correlation-id
 * 2) Fallback: body.context.correlationId (for /v1/plan)
 * 3) Otherwise generate a UUID
 *
 * Outputs:
 * - req.correlationId (typed via module augmentation)
 * - response header x-correlation-id
 */

import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

function readCorrelationIdFromBody(req: Request): string | undefined {
  const body = req.body;
  if (!body || typeof body !== 'object') return undefined;

  // Safe narrowing without assuming shape
  const maybeContext = (body as { context?: unknown }).context;
  if (!maybeContext || typeof maybeContext !== 'object') return undefined;

  const maybeCorrelationId = (maybeContext as { correlationId?: unknown }).correlationId;
  return typeof maybeCorrelationId === 'string' && maybeCorrelationId.trim().length > 0
    ? maybeCorrelationId
    : undefined;
}

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const headerId = req.header('x-correlation-id');
  const bodyId = readCorrelationIdFromBody(req);

  const correlationId =
    (typeof headerId === 'string' && headerId.trim().length > 0 ? headerId : undefined) ??
    bodyId ??
    randomUUID();

  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);

  next();
}
