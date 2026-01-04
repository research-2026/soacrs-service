// tests/application/scoringEngine.application.test.ts

/**
 * ScoringEngine application tests.
 *
 * Purpose:
 * - Verify the scoring formula and explain breakdown are correct.
 * - Ensure cold-start defaults behave correctly.
 * - Ensure metrics-driven decisions produce expected ranking.
 */

import {
  DEFAULT_SCORING_CONFIG,
  ScoringEngine,
} from '../../src/coordination/application/ScoringEngine';
import type { Tool } from '../../src/coordination/domain/Tool';
import type { ToolMetrics } from '../../src/coordination/domain/Metrics';

function makeTool(params: { id: string; baseCost: number; capabilities: string[] }): Tool {
  return {
    id: params.id,
    name: `Tool ${params.id}`,
    version: '1.0.0',
    region: 'us-east-1',
    baseCost: params.baseCost,
    meta: {}, // IMPORTANT: meta is Record<string, unknown> | undefined (NOT null)
    capabilities: params.capabilities.map((name) => ({
      name,
      inputsSchema: { type: 'object' } as Record<string, unknown>,
      outputsSchema: { type: 'object' } as Record<string, unknown>,
    })),
  };
}

function makeMetrics(params: {
  tenantId: string;
  toolId: string;
  capability: string;
  successCount: number;
  failureCount: number;
  totalLatencyMs: number;
  avgReward: number; // [-1..+1]
}): ToolMetrics {
  return {
    tenantId: params.tenantId,
    toolId: params.toolId,
    capability: params.capability,
    successCount: params.successCount,
    failureCount: params.failureCount,
    totalLatencyMs: params.totalLatencyMs,
    avgReward: params.avgReward,
    lastUpdated: new Date().toISOString(),
  };
}

describe('ScoringEngine', () => {
  it('should prefer a tool with higher SLA when costs and fit are equal', () => {
    const engine = new ScoringEngine(DEFAULT_SCORING_CONFIG);

    const capability = 'patient.search';

    const toolA = makeTool({ id: 'tool-a', baseCost: 0.5, capabilities: [capability] });
    const toolB = makeTool({ id: 'tool-b', baseCost: 0.5, capabilities: [capability] });

    // Tool A: higher success rate and faster latency
    const metricsA = makeMetrics({
      tenantId: 'acme-health',
      toolId: 'tool-a',
      capability,
      successCount: 90,
      failureCount: 10,
      totalLatencyMs: 20000, // avg = 200ms
      avgReward: 0,
    });

    // Tool B: lower success rate and slower latency
    const metricsB = makeMetrics({
      tenantId: 'acme-health',
      toolId: 'tool-b',
      capability,
      successCount: 70,
      failureCount: 30,
      totalLatencyMs: 90000, // avg = 900ms
      avgReward: 0,
    });

    const metricsMap = new Map<string, ToolMetrics | null>([
      ['tool-a', metricsA],
      ['tool-b', metricsB],
    ]);

    const ranked = engine.scoreCandidates([toolA, toolB], metricsMap, capability);

    expect(ranked).toHaveLength(2);
    expect(ranked[0].toolId).toBe('tool-a');

    // Explain must exist and be within [0..1]
    expect(ranked[0].explain.slaLikelihood).toBeGreaterThan(ranked[1].explain.slaLikelihood);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('should slightly prefer cheaper tools on cold start when everything else is equal', () => {
    const engine = new ScoringEngine(DEFAULT_SCORING_CONFIG);

    const capability = 'patient.search';

    const cheapTool = makeTool({ id: 'cheap', baseCost: 0.1, capabilities: [capability] });
    const expensiveTool = makeTool({ id: 'expensive', baseCost: 0.9, capabilities: [capability] });

    // Cold start: no metrics yet
    const metricsMap = new Map<string, ToolMetrics | null>([
      ['cheap', null],
      ['expensive', null],
    ]);

    const ranked = engine.scoreCandidates([cheapTool, expensiveTool], metricsMap, capability);

    expect(ranked[0].toolId).toBe('cheap');
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);

    // Confirm cost normalization is behaving as expected:
    // cheap should have normalizedCost closer to 0, expensive closer to 1
    expect(ranked[0].explain.normalizedCost).toBeLessThan(ranked[1].explain.normalizedCost);
  });

  it('should use cold-start defaults when metrics are missing', () => {
    const engine = new ScoringEngine(DEFAULT_SCORING_CONFIG);

    const capability = 'patient.search';
    const tool = makeTool({ id: 'tool-cold', baseCost: 0.2, capabilities: [capability] });

    const metricsMap = new Map<string, ToolMetrics | null>([['tool-cold', null]]);

    const ranked = engine.scoreCandidates([tool], metricsMap, capability);

    expect(ranked).toHaveLength(1);

    const candidate = ranked[0];

    // Capability fit must be 1 because tool declares capability
    expect(candidate.explain.capabilityFit).toBe(1);

    // Past reward must be defaultReward
    expect(candidate.explain.pastReward).toBeCloseTo(DEFAULT_SCORING_CONFIG.defaultReward, 6);

    // SLA likelihood must be derived from defaultSuccessRate and defaultLatencyMs.
    // defaultSuccessRate=0.8, defaultLatencyMs=800, maxReasonableLatencyMs=2000
    // latencyScore = 1 - 800/2000 = 0.6
    // sla = 0.7*0.8 + 0.3*0.6 = 0.56 + 0.18 = 0.74
    expect(candidate.explain.slaLikelihood).toBeCloseTo(0.74, 6);

    // With only one tool, normalizedCost is neutral (0.5)
    expect(candidate.explain.normalizedCost).toBeCloseTo(0.5, 6);

    // Score sanity check: should be within [0..1]
    expect(candidate.score).toBeGreaterThanOrEqual(0);
    expect(candidate.score).toBeLessThanOrEqual(1);
  });

  it('should set capabilityFit=0 for tools that do not declare the requested capability', () => {
    const engine = new ScoringEngine(DEFAULT_SCORING_CONFIG);

    const requested = 'patient.search';
    const tool = makeTool({ id: 'wrong-cap', baseCost: 0.2, capabilities: ['patient.update'] });

    const metricsMap = new Map<string, ToolMetrics | null>([['wrong-cap', null]]);

    const ranked = engine.scoreCandidates([tool], metricsMap, requested);

    expect(ranked[0].explain.capabilityFit).toBe(0);
  });
});
