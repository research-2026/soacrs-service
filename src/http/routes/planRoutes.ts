// src/http/routes/planRoutes.ts

/**
 * /v1/plan route (SOA-S16)
 *
 * Standards applied:
 * - Keep HTTP boundary thin (validate -> call application service -> return JSON).
 * - No domain/scoring changes.
 */

import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';

import type { SemanticTask } from '../../coordination/domain/SemanticTask';
import type { TaskRoutingPlan } from '../../coordination/domain/Plan';
import { parseSemanticTaskDto } from '../../coordination/dto/SemanticTaskDto';

export interface PlanBuilderPort {
  buildPlan(task: SemanticTask): Promise<TaskRoutingPlan>;
}

export function createPlanRoutes(planBuilder: PlanBuilderPort): Router {
  const router = Router();

  router.post('/v1/plan', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task = parseSemanticTaskDto(req.body);
      const plan = await planBuilder.buildPlan(task);
      return res.status(200).json(plan);
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
