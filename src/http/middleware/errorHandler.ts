// src/http/middleware/errorHandler.ts

/**
 * Global error handler (SOA-S19)
 *
 * - Converts known DTO validation errors into HTTP 400
 * - Converts unknown errors into HTTP 500
 * - Always returns the standard error envelope
 * - Includes correlationId so upstream services can trace failures
 */

import type { NextFunction, Request, Response } from 'express';
import { buildErrorEnvelope } from '../errors/errorEnvelope';

import { SemanticTaskDtoValidationError } from '../../coordination/dto/SemanticTaskDto';
import { TelemetryDtoValidationError } from '../../telemetry/dto/TelemetryDtoValidationError';
import { logger } from '../../shared/logging/Logger';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): Response {
  // 400: request payload validation failures (boundary protection)
  if (err instanceof SemanticTaskDtoValidationError) {
    logger.debug(
      { correlationId: req.correlationId, issues: err.issues },
      'SemanticTask validation failed',
    );

    return res.status(400).json(
      buildErrorEnvelope({
        code: 'VALIDATION_ERROR',
        message: err.message,
        correlationId: req.correlationId,
        issues: err.issues,
      }),
    );
  }

  if (err instanceof TelemetryDtoValidationError) {
    logger.debug(
      { correlationId: req.correlationId, issues: err.issues },
      'Telemetry validation failed',
    );

    return res.status(400).json(
      buildErrorEnvelope({
        code: 'VALIDATION_ERROR',
        message: err.message,
        correlationId: req.correlationId,
        issues: err.issues,
      }),
    );
  }

  // 500: unknown/unexpected failures
  logger.error({ correlationId: req.correlationId, err }, 'Unhandled error in request pipeline');

  return res.status(500).json(
    buildErrorEnvelope({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
      correlationId: req.correlationId,
    }),
  );
}
