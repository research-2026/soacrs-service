// src/coordination/application/ScoringEngine.ts

/**
 * ScoringEngine
 * -------------
 * Pure application-layer component that ranks candidate tools for a given capability.
 *
 * Why it's in the "application" layer:
 * - It contains business decision logic (how tools are scored and ranked),
 * - It has no infrastructure concerns (no DB, no HTTP, no Prisma),
 * - It is deterministic and easy to test.
 *
 * Output matches your TRP "candidates[].explain" structure.
 */

import type { Tool } from '../domain/Tool';
import type { ToolMetrics } from '../domain/Metrics';

export type ScoringWeights = {
  fit: number;
  sla: number;
  reward: number;
  cost: number;
};

export type ScoringConfig = {
  /**
   * Final score weights (must sum to 1.0 ideally, but we don't hard-require it).
   */
  weights: ScoringWeights;

  /**
   * Cold start defaults used when ToolMetrics is missing (null).
   */
  defaultSuccessRate: number; // e.g., 0.80
  defaultLatencyMs: number; // e.g., 800
  defaultReward: number; // e.g., 0.50 (already normalized to [0..1])

  /**
   * Latency normalization constant.
   * LatencyScore = 1 - (avgLatencyMs / maxReasonableLatencyMs).
   */
  maxReasonableLatencyMs: number; // e.g., 2000

  /**
   * Internal SLA composition weights.
   * slaLikelihood = slaSuccessWeight*successRate + slaLatencyWeight*latencyScore
   */
  slaSuccessWeight: number; // e.g., 0.70
  slaLatencyWeight: number; // e.g., 0.30
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

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: {
    fit: 0.5,
    sla: 0.25,
    reward: 0.15,
    cost: 0.1,
  },
  defaultSuccessRate: 0.8,
  defaultLatencyMs: 800,
  defaultReward: 0.5,
  maxReasonableLatencyMs: 2000,
  slaSuccessWeight: 0.7,
  slaLatencyWeight: 0.3,
};

export class ScoringEngine {
  public constructor(private readonly config: ScoringConfig = DEFAULT_SCORING_CONFIG) {}

  /**
   * Score and rank multiple candidate tools for a capability.
   *
   * @param tenantTools Candidate tools (already tenant-scoped).
   * @param metricsByToolId Map of toolId -> ToolMetrics (or null if missing).
   * @param capability Requested capability for the goal, e.g. "patient.search".
   */
  public scoreCandidates(
    tenantTools: Tool[],
    metricsByToolId: Map<string, ToolMetrics | null>,
    capability: string,
  ): CandidateScore[] {
    // Prepare base costs for cost normalization.
    // NOTE: baseCost may be null/undefined in some DB rows; treat missing as neutral.
    const costs: number[] = tenantTools.map((tool) => numberOrFallback(tool.baseCost, 1));

    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);

    const scored = tenantTools.map((tool) => {
      const metrics = metricsByToolId.get(tool.id) ?? null;

      const capabilityFit = this.computeCapabilityFit(tool, capability);
      const normalizedCost = this.computeNormalizedCost(
        numberOrFallback(tool.baseCost, 1),
        minCost,
        maxCost,
      );

      return this.scoreCandidateInternal(tool, metrics, capabilityFit, normalizedCost);
    });

    // Highest score first
    scored.sort((a, b) => b.score - a.score);

    return scored;
  }

  /**
   * Score a single tool (public helper) when you already know min/max costs.
   * This is useful if the caller computes cost normalization externally.
   */
  public scoreCandidate(
    tool: Tool,
    metrics: ToolMetrics | null,
    capability: string,
    minCost: number,
    maxCost: number,
  ): CandidateScore {
    const capabilityFit = this.computeCapabilityFit(tool, capability);
    const normalizedCost = this.computeNormalizedCost(
      numberOrFallback(tool.baseCost, 1),
      minCost,
      maxCost,
    );

    return this.scoreCandidateInternal(tool, metrics, capabilityFit, normalizedCost);
  }

  /**
   * Internal scoring implementation.
   * Keeps all scoring logic in one place for maintainability.
   */
  private scoreCandidateInternal(
    tool: Tool,
    metrics: ToolMetrics | null,
    capabilityFit: number,
    normalizedCost: number,
  ): CandidateScore {
    const { successRate, avgLatencyMs } = this.computeSlaInputs(metrics);
    const slaLikelihood = this.computeSlaLikelihood(successRate, avgLatencyMs);
    const pastReward = this.computePastReward(metrics);

    const weights = this.config.weights;

    // Final score formula (range [0..1] in typical configs)
    // score = wFit*cf + wSla*sla + wReward*pr + wCost*(1 - normalizedCost)
    const score =
      weights.fit * capabilityFit +
      weights.sla * slaLikelihood +
      weights.reward * pastReward +
      weights.cost * (1 - normalizedCost);

    return {
      toolId: tool.id,
      score: clamp01(score),
      explain: {
        capabilityFit: clamp01(capabilityFit),
        slaLikelihood: clamp01(slaLikelihood),
        pastReward: clamp01(pastReward),
        normalizedCost: clamp01(normalizedCost),
        weights: { ...weights },
      },
    };
  }

  /**
   * Capability fit:
   * - 1.0 if tool declares the capability
   * - 0.0 otherwise
   *
   * Even though the registry usually filters by capability, we keep this for safety.
   */
  private computeCapabilityFit(tool: Tool, capability: string): number {
    const supports = tool.capabilities.some((c) => c.name === capability);
    return supports ? 1 : 0;
  }

  /**
   * Normalized cost in [0..1] within a candidate set:
   * - 0.0 = cheapest
   * - 1.0 = most expensive
   * - 0.5 = neutral when all costs equal
   */
  private computeNormalizedCost(cost: number, minCost: number, maxCost: number): number {
    if (maxCost === minCost) {
      return 0.5;
    }
    return (cost - minCost) / (maxCost - minCost);
  }

  /**
   * SLA Inputs:
   * - successRate computed from success/failure counts
   * - avgLatencyMs computed from totalLatencyMs / totalRuns
   *
   * ToolMetrics does NOT include avgLatencyMs (by design); we derive it.
   */
  private computeSlaInputs(metrics: ToolMetrics | null): {
    successRate: number;
    avgLatencyMs: number;
  } {
    if (metrics === null) {
      return {
        successRate: clamp01(this.config.defaultSuccessRate),
        avgLatencyMs: positiveOrFallback(
          this.config.defaultLatencyMs,
          this.config.defaultLatencyMs,
        ),
      };
    }

    const totalRuns = metrics.successCount + metrics.failureCount;

    const successRate =
      totalRuns > 0
        ? clamp01(metrics.successCount / totalRuns)
        : clamp01(this.config.defaultSuccessRate);

    const avgLatencyMs =
      totalRuns > 0
        ? positiveOrFallback(metrics.totalLatencyMs / totalRuns, this.config.defaultLatencyMs)
        : positiveOrFallback(this.config.defaultLatencyMs, this.config.defaultLatencyMs);

    return { successRate, avgLatencyMs };
  }

  /**
   * SLA Likelihood (0..1):
   * - Uses both successRate and latencyScore.
   * - latencyScore = 1 - (avgLatencyMs / maxReasonableLatencyMs)
   */
  private computeSlaLikelihood(successRate: number, avgLatencyMs: number): number {
    const latencyScore = clamp01(
      1 - avgLatencyMs / positiveOrFallback(this.config.maxReasonableLatencyMs, 2000),
    );

    const sla =
      this.config.slaSuccessWeight * clamp01(successRate) +
      this.config.slaLatencyWeight * latencyScore;

    return clamp01(sla);
  }

  /**
   * Past reward:
   * - ToolMetrics.avgReward is assumed in [-1..+1]
   * - Convert to [0..1]: 0.5 + (avgReward / 2)
   * - If unknown (metrics null), use defaultReward.
   */
  private computePastReward(metrics: ToolMetrics | null): number {
    if (metrics === null) {
      return clamp01(this.config.defaultReward);
    }

    const normalized = 0.5 + metrics.avgReward / 2;
    return clamp01(normalized);
  }
}

/**
 * Clamp any numeric score into [0..1].
 */
function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Ensure a numeric is positive; otherwise return fallback.
 */
function positiveOrFallback(value: number, fallback: number): number {
  if (Number.isNaN(value) || value <= 0) return fallback;
  return value;
}

/**
 * Convert an optional/nullable number into a valid number with fallback.
 */
function numberOrFallback(value: number | null | undefined, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  if (Number.isNaN(value)) return fallback;
  return value;
}
