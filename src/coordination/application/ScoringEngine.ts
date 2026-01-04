// src/coordination/application/ScoringEngine.ts

import type { Tool } from '../domain/Tool';
import type { ToolMetrics } from '../domain/Metrics';

export type ScoringWeights = {
  fit: number;
  sla: number;
  reward: number;
  cost: number;
};

export type ScoringConfig = {
  weights: ScoringWeights;

  defaultSuccessRate: number;
  defaultLatencyMs: number;
  defaultReward: number;

  maxReasonableLatencyMs: number;

  slaSuccessWeight: number;
  slaLatencyWeight: number;
};

export type CandidateExplain = {
  capabilityFit: number;
  slaLikelihood: number;
  pastReward: number;
  normalizedCost: number;
  weights: ScoringWeights;
};

export type CandidateScore = {
  toolId: string;
  score: number;
  explain: CandidateExplain;
};

export interface IScoringEngine {
  rankCandidates(
    tools: Tool[],
    getMetrics: (toolId: string) => ToolMetrics | null,
    config: ScoringConfig,
    capability: string,
  ): CandidateScore[];
}

export const defaultScoringConfig: ScoringConfig = {
  weights: { fit: 0.5, sla: 0.25, reward: 0.15, cost: 0.1 },
  defaultSuccessRate: 0.8,
  defaultLatencyMs: 800,
  defaultReward: 0.5,
  maxReasonableLatencyMs: 2000,
  slaSuccessWeight: 0.7,
  slaLatencyWeight: 0.3,
};

export const DEFAULT_SCORING_CONFIG = defaultScoringConfig;

export class ScoringEngine implements IScoringEngine {
  public constructor(private readonly config: ScoringConfig = defaultScoringConfig) {}

  /**
   * Test-friendly method: uses a metrics map.
   */
  public scoreCandidates(
    tools: Tool[],
    metricsByToolId: Map<string, ToolMetrics | null>,
    capability: string,
  ): CandidateScore[] {
    return this.rankCandidates(
      tools,
      (toolId) => metricsByToolId.get(toolId) ?? null,
      this.config,
      capability,
    );
  }

  /**
   * Primary method used by PlanBuilderService.
   */
  public rankCandidates(
    tools: Tool[],
    getMetrics: (toolId: string) => ToolMetrics | null,
    config: ScoringConfig,
    capability: string,
  ): CandidateScore[] {
    const candidateCount = tools.length;

    const scored = tools.map((tool) => {
      const metrics = getMetrics(tool.id);

      const capabilityFit = this.computeCapabilityFit(tool, capability);

      // ✅ Key fix: single candidate should have neutral cost = 0.5
      const normalizedCost = this.computeNormalizedCost(tool.baseCost, candidateCount);

      const { successRate, avgLatencyMs } = this.computeSlaInputs(metrics, config);
      const slaLikelihood = this.computeSlaLikelihood(successRate, avgLatencyMs, config);
      const pastReward = this.computePastReward(metrics, config);

      const w = config.weights;

      const score =
        w.fit * capabilityFit +
        w.sla * slaLikelihood +
        w.reward * pastReward +
        w.cost * (1 - normalizedCost);

      return {
        toolId: tool.id,
        score: clamp01(score),
        explain: {
          capabilityFit: clamp01(capabilityFit),
          slaLikelihood: clamp01(slaLikelihood),
          pastReward: clamp01(pastReward),
          normalizedCost: clamp01(normalizedCost),
          weights: { ...w },
        },
      };
    });

    // Deterministic ordering
    scored.sort((a, b) => b.score - a.score || a.toolId.localeCompare(b.toolId));

    return scored;
  }

  private computeCapabilityFit(tool: Tool, capability: string): number {
    return tool.capabilities.some((c) => c.name === capability) ? 1 : 0;
  }

  /**
   * Normalized cost behavior:
   * - If only 1 candidate: neutral cost = 0.5 (prevents unfair penalty)
   * - Otherwise: treat baseCost as already-normalized [0..1]
   * - Missing cost: neutral = 0.5
   */
  private computeNormalizedCost(
    baseCost: number | null | undefined,
    candidateCount: number,
  ): number {
    if (candidateCount <= 1) {
      return 0.5;
    }

    if (baseCost === null || baseCost === undefined || Number.isNaN(baseCost)) {
      return 0.5;
    }

    return clamp01(baseCost);
  }

  private computeSlaInputs(
    metrics: ToolMetrics | null,
    config: ScoringConfig,
  ): { successRate: number; avgLatencyMs: number } {
    if (!metrics) {
      return {
        successRate: clamp01(config.defaultSuccessRate),
        avgLatencyMs: positiveOrFallback(config.defaultLatencyMs, config.defaultLatencyMs),
      };
    }

    const totalRuns = metrics.successCount + metrics.failureCount;

    const successRate =
      totalRuns > 0
        ? clamp01(metrics.successCount / totalRuns)
        : clamp01(config.defaultSuccessRate);

    const avgLatencyMs =
      totalRuns > 0
        ? positiveOrFallback(metrics.totalLatencyMs / totalRuns, config.defaultLatencyMs)
        : positiveOrFallback(config.defaultLatencyMs, config.defaultLatencyMs);

    return { successRate, avgLatencyMs };
  }

  private computeSlaLikelihood(
    successRate: number,
    avgLatencyMs: number,
    config: ScoringConfig,
  ): number {
    const maxLatency = positiveOrFallback(config.maxReasonableLatencyMs, 2000);
    const latencyScore = clamp01(1 - avgLatencyMs / maxLatency);

    return clamp01(
      config.slaSuccessWeight * clamp01(successRate) +
        config.slaLatencyWeight * clamp01(latencyScore),
    );
  }

  private computePastReward(metrics: ToolMetrics | null, config: ScoringConfig): number {
    if (!metrics) return clamp01(config.defaultReward);

    // avgReward assumed [-1..+1]
    return clamp01(0.5 + metrics.avgReward / 2);
  }
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function positiveOrFallback(value: number, fallback: number): number {
  if (Number.isNaN(value) || value <= 0) return fallback;
  return value;
}
