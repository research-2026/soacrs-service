# SOACRS Architecture

## 1. Overview

SOACRS (Self-Optimizing Agent Coordination & Response Service) is a TypeScript/Node.js
microservice responsible for:

- Receiving **structured tasks** from the NL→Task translator.
- Building **Task Routing Plans (TRP)** for the Orchestrator.
- Storing **plans**, **tool metrics**, and **execution events**.
- Learning from telemetry to improve routing decisions over time.

SOACRS does **not** execute tools directly. It only coordinates and plans.

---

## 2. High-Level Position in the System

```text
[User / UI]
      │
      ▼
[NL→Task Translator (Mufthi)]
      │  (SemanticTask)
      ▼
[SOACRS Coordinator (this service)]
      │  (TaskRoutingPlan)
      ▼
[Orchestrator (Ayyash)]
      │
      ├──> [Agent / Tools / RPA (Rashad)]
      └──> [Legacy Systems]

- Input to SOACRS: SemanticTask (tenant, requester, goal, constraints).
- Output from SOACRS: TaskRoutingPlan (planId, context, candidates, steps, retry, etc.).

---

## 3. Layered Architecture

  SOACRS follows a layered / hexagonal-style architecture:

### 3.1 Domain Layer (`src/coordination/domain/`)
  **Responsibility:** Pure business models and contracts.

- `SemanticTask` – input from NL→Task.
- `TaskRoutingPlan` – full plan specification for the Orchestrator.
- `Tool`, `ToolMetrics`, `ToolExecutionEvent` – models used for scoring and learning.
- Interfaces:
  - `IToolRegistry`
  - `IMetricsRepository`
  - `IPlanStore`

  No framework or database code lives here.

### 3.2 Application Layer (`src/coordination/application/`)
  **Responsibility:** Use cases and coordination logic.

- `PlanBuilderService` – builds TaskRoutingPlan from a SemanticTask.
- `ScoringEngine` – computes candidate scores from tools + metrics.
- `MetricsService` – aggregates telemetry into ToolMetrics.
- `TelemetryHandler` – handles incoming telemetry requests.

  Application layer depends only on the domain layer, not on Express or Prisma directly.

### 3.3 Infrastructure Layer (`src/coordination/infrastructure/`)
  **Responsibility:** Adapters for external systems.

- Database-backed repositories:
  - `PostgresPlanStore`
  - `PostgresToolRegistry`
  - `PostgresMetricsRepository`
- HTTP/Express route wiring (e.g. `/v1/plan`, `/v1/telemetry`).

This layer depends on:
- Domain interfaces (`IToolRegistry`, etc.).
- Shared infrastructure: Prisma client, logger.

### 3.4 Shared Utilities (`src/shared/`)
  **Responsibility:** Cross-cutting concerns.

  - `config/Config.ts` – environment/configuration loading.
  - `logging/Logger.ts` – pino-based structured logger.
  - `db/PrismaClient.ts` – Prisma client singleton.

---

## 4. Inputs and Outputs

### 4.1 Input: `SemanticTask`

SOACRS receives a JSON payload like:

- `context` (tenant, correlationId, locale, region)
- `requester` (type, id, scopes)
- `goal` (capability, input, description)
- `constraints` (overallTimeoutMs, maxParallel, costBudget, privacyTags)

### 4.2 Output: TaskRoutingPlan

SOACRS returns a JSON plan that Orchestrator can execute:

- `planId`, `schemaVersion`, `createdAt`
- `coordinator` (service, version, instance)
- `context` (including tenant + requester)
- `goal` and `constraints`
- `policy` (preconditions, decision, postConditions schema)
- `candidates[]` (tools and scores)
- `selected` (primary tool)
- `retry`, `telemetry`, `security`
- `steps[]` (graph of actions like invoke_tool with transitions)

The Orchestrator uses this plan to:

- Call tools/agents,
- Handle fallbacks,
- Emit telemetry back to SOACRS.


```
