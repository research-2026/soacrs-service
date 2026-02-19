# SOACRS Scoring Strategy (SOA-S10)

**Component:** Self-Optimizing Agent Coordination & Response System (SOACRS)  
**Scope:** Candidate tool/agent selection and fallback planning for `TaskRoutingPlan (TRP)` generation  
**Owner:** IT22311436 – D. N. Rajapaksha  
**Audience:** SOACRS developers + Orchestrator (Ayyash) + NL→Task (Mufthi) + RPA connectors (Rashad)

---

## 1. Purpose

SOACRS must select the _best_ tool(s) for a given **SemanticTask** and output a **TaskRoutingPlan (TRP)** that the Orchestrator can execute.

The scoring strategy ensures decisions are:

- **Explainable** (each score has a breakdown)
- **Tunable** (weights & defaults configurable)
- **Self-optimizing** (scores improve using telemetry and feedback over time)
- **Safe for cold-start** (reasonable defaults when no history exists)

---

## 2. Where This Fits in the Middleware

SOACRS sits between:

1. **NL→Task Translator (Mufthi)**  
   Produces a structured `SemanticTask` (capability + input + constraints + context).

2. **SOACRS (this service)**
   - Fetches available tools for a capability from the Tool Registry
   - Fetches historical performance metrics
   - Scores candidates
   - Generates a TRP including **primary + fallback steps** and explanation

3. **Orchestrator (Ayyash)**  
   Executes TRP steps, then logs execution/feedback telemetry back to SOACRS.

---

## 3. Inputs & Outputs

### 3.1 Input: SemanticTask (from NL→Task)

A `SemanticTask` is already modeled in SOACRS domain. At minimum:

- `tenant`
- `requester`
- `goal.capability` (e.g., `"patient.search"`)
- `goal.input` (JSON payload)
- optional `constraints` and `context`

### 3.2 Output: TaskRoutingPlan (TRP) (to Orchestrator)

The TRP includes:

- `candidates[]` with `score` and `explain` breakdown
- `selected` tool
- `steps[]` (primary step + fallback step)

Your target TRP shape (example):

- Each candidate contains:
  - `toolId`
  - `score`
  - `explain.{capabilityFit,slaLikelihood,pastReward,normalizedCost,weights}`

---

## 4. Core Scoring Factors

Each candidate tool receives a final score computed using four factors:

1. **Capability Fit (`capabilityFit`)**
2. **SLA Likelihood (`slaLikelihood`)**
3. **Past Reward (`pastReward`)**
4. **Normalized Cost (`normalizedCost`)**

All factors are normalized into `[0.0, 1.0]` so scoring is consistent.

---

## 5. Tool & Metrics Models (Conceptual)

### 5.1 Tool (from registry)

A candidate tool includes:

- `id`
- `capabilities[]`
- `baseCost` (relative cost indicator)
- optional `region`, `meta`

### 5.2 ToolMetrics (from telemetry aggregation)

Aggregated performance and reward:

- `successCount`
- `failureCount`
- `totalLatencyMs`
- `avgReward` (feedback value, typically `[-1.0, +1.0]`, or `0` if none)
- `lastUpdated`

> Note: `avgLatencyMs` is derived, not necessarily stored in the domain model:
>
> `avgLatencyMs = totalLatencyMs / max(1, executions)`

---

## 6. Computing Each Factor

### 6.1 Capability Fit (`capabilityFit`)

For now we use a **binary match** (simple and explainable):

- If `goal.capability` exists in `tool.capabilities` → `capabilityFit = 1.0`
- Else → `capabilityFit = 0.0`

> **Important:** Tools with `capabilityFit = 0` are excluded from selection.

**Future extension:** partial/semantic match (weights per capability, similarity scores).

---

### 6.2 SLA Likelihood (`slaLikelihood`)

This factor estimates how likely the tool is to succeed **within acceptable time** using historical metrics.

Definitions:

- `executions = successCount + failureCount`
- `successRate = executions > 0 ? successCount / executions : defaultSuccessRate`
- `avgLatencyMs = executions > 0 ? totalLatencyMs / executions : defaultLatencyMs`

We convert latency into a normalized `latencyScore`:

```text
latencyScore = clamp(1 - (avgLatencyMs / maxReasonableLatencyMs), 0.0, 1.0)

Then combine success rate and latency:

slaLikelihood =
  slaSuccessWeight * successRate +
  slaLatencyWeight * latencyScore
```
