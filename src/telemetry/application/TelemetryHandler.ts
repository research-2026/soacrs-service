/**
 * TelemetryHandler (SOA-S14)
 * -------------------------
 * Converts raw payloads -> validated DTOs -> domain signals -> metrics updates.
 *
 * This is NOT an HTTP controller.
 * Later (SOA-S17), routes will call these methods.
 */

import type { ToolExecutionEvent } from '../../coordination/domain/Metrics';

import { parseExecutionTelemetryDto } from '../dto/ExecutionTelemetryDto';
import { parseFeedbackTelemetryDto } from '../dto/FeedbackTelemetryDto';
import { MetricsService } from './MetricsService';

export class TelemetryHandler {
  public constructor(private readonly metricsService: MetricsService) {}

  /**
   * Handle execution telemetry:
   * - validates payload
   * - maps DTO -> ToolExecutionEvent
   * - updates success/failure + latency totals
   */
  public async handleExecutionTelemetry(payload: unknown): Promise<void> {
    const dto = parseExecutionTelemetryDto(payload);

    const event: ToolExecutionEvent = {
      planId: dto.planId,
      stepId: dto.stepId,
      tenantId: dto.tenantId,
      toolId: dto.toolId,
      capability: dto.capability,
      latencyMs: dto.latencyMs,
      success: dto.success,
      errorCode: dto.errorCode ?? undefined,
      timestamp: dto.timestamp,
    };

    await this.metricsService.recordExecutionTelemetry(event);
  }

  /**
   * Handle feedback telemetry:
   * - validates payload
   * - maps DTO -> FeedbackSignal
   * - updates avgReward
   */
  public async handleFeedbackTelemetry(payload: unknown): Promise<void> {
    const dto = parseFeedbackTelemetryDto(payload);

    await this.metricsService.recordFeedbackTelemetry({
      tenantId: dto.tenantId,
      toolId: dto.toolId,
      capability: dto.capability,
      reward: dto.reward,
      timestamp: dto.timestamp,
    });
  }
}
