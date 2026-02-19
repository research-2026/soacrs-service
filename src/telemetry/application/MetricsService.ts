/**
 * MetricsService (SOA-S14)
 * -----------------------
 * Application-layer service that updates aggregated ToolMetrics using telemetry.
 *
 * Why it's here:
 * - Keeps business logic (metrics update rules) out of controllers/routes.
 * - Reuses IMetricsRepository so infra can be Postgres/Prisma later.
 * - Deterministic and easy to test (no DB required).
 *
 * Responsibilities:
 * 1) Execution telemetry -> delegate to repo.recordExecution()
 *    (success/failure counts + totalLatencyMs aggregation)
 * 2) Feedback telemetry  -> update avgReward (in [-1, +1]) and persist via repo.saveMetrics()
 */

import type {
  IMetricsRepository,
  ToolExecutionEvent,
  ToolMetrics,
} from '../../coordination/domain/Metrics';

export type MetricsServiceConfig = {
  /**
   * Reward update strategy:
   * We use EWMA (exponential moving average) because it's lightweight online learning.
   *
   * newAvg = (1 - alpha) * oldAvg + alpha * reward
   *
   * Alpha in [0..1]:
   * - 0.1 = slow change
   * - 0.2 = balanced
   * - 0.5 = fast change
   */
  rewardEwmaAlpha?: number;

  /**
   * Clock injection for deterministic tests.
   */
  now?: () => Date;
};

export type FeedbackSignal = {
  tenantId: string;
  toolId: string;
  capability: string;

  /**
   * Reward in [-1, +1].
   * +1 = great outcome, 0 = neutral, -1 = bad outcome.
   */
  reward: number;

  /**
   * ISO timestamp from payload.
   */
  timestamp: string;
};

export class MetricsService {
  private readonly alpha: number;
  private readonly now: () => Date;

  public constructor(
    private readonly repo: IMetricsRepository,
    config: MetricsServiceConfig = {},
  ) {
    this.alpha = clamp01(config.rewardEwmaAlpha ?? 0.2);
    this.now = config.now ?? (() => new Date());
  }

  /**
   * Execution telemetry:
   * - success/failure counts
   * - totalLatencyMs (avg latency derived later)
   *
   * Delegated to repository because your PostgresMetricsRepository already
   * implements the correct aggregation rules.
   */
  public async recordExecutionTelemetry(event: ToolExecutionEvent): Promise<void> {
    await this.repo.recordExecution(event);
  }

  /**
   * Feedback telemetry:
   * - update avgReward in [-1, +1]
   * - persist updated metrics
   *
   * If metrics do not exist yet, create a new baseline metrics record.
   */
  public async recordFeedbackTelemetry(signal: FeedbackSignal): Promise<void> {
    const reward = clampReward(signal.reward);

    const existing = await this.repo.getMetrics(signal.tenantId, signal.toolId, signal.capability);

    const next: ToolMetrics = existing
      ? {
          ...existing,
          avgReward: ewma(existing.avgReward, reward, this.alpha),
          lastUpdated: this.now().toISOString(),
        }
      : {
          tenantId: signal.tenantId,
          toolId: signal.toolId,
          capability: signal.capability,
          successCount: 0,
          failureCount: 0,
          totalLatencyMs: 0,
          avgReward: reward,
          lastUpdated: this.now().toISOString(),
        };

    await this.repo.saveMetrics(next);
  }
}

/* ----------------------------- helper functions ----------------------------- */

function ewma(oldValue: number, newValue: number, alpha: number): number {
  return clampReward((1 - alpha) * clampReward(oldValue) + alpha * clampReward(newValue));
}

function clampReward(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < -1) return -1;
  if (value > 1) return 1;
  return value;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
