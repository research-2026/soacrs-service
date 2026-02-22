// src/http/routes/telemetryRoutes.ts

/**
 * Telemetry Routes (SOA-S17)
 * -------------------------
 * Exposes HTTP endpoints for telemetry submission.
 *
 * Design principles used:
 * - Thin HTTP layer: routes only accept payloads and delegate processing.
 * - Validation at the boundary is handled by TelemetryHandler (DTO parsers),
 *   so routes stay simple and consistent.
 * - Errors bubble to the global error handler for standard envelopes (SOA-S19 style).
 */

import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

/**
 * Port interface (Dependency Inversion Principle):
 * App routes depend on an abstract contract rather than a concrete implementation.
 */
export type TelemetryHandlerPort = {
  handleExecutionTelemetry(payload: unknown): Promise<void>;
  handleFeedbackTelemetry(payload: unknown): Promise<void>;
};

export function createTelemetryRoutes(handler: TelemetryHandlerPort): Router {
  const router = Router();

  /**
   * POST /v1/telemetry/execution
   * Receives: ExecutionTelemetryDto JSON
   * Behavior: Validate + update success/failure + latency aggregates.
   */
  router.post(
    '/v1/telemetry/execution',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await handler.handleExecutionTelemetry(req.body);
        // 202 is appropriate: event accepted for processing (even if processed immediately).
        return res.status(202).json({ status: 'accepted' });
      } catch (err) {
        return next(err);
      }
    },
  );

  /**
   * POST /v1/telemetry/feedback
   * Receives: FeedbackTelemetryDto JSON
   * Behavior: Validate + update avgReward (EWMA).
   */
  router.post('/v1/telemetry/feedback', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler.handleFeedbackTelemetry(req.body);
      return res.status(202).json({ status: 'accepted' });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
