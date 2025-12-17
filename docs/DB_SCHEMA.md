# SOACRS – Database Schema (PostgreSQL)

## 1. Overview

The SOACRS service uses PostgreSQL as a central store for:

- Tool registry and tenant configuration
- Aggregated performance metrics for tools
- Full Task Routing Plan (TRP) documents for auditability
- Execution events (telemetry) for the learning loop

This document defines the relational schema in PostgreSQL terms. The ORM
(Prisma/TypeORM) will map to these tables without changing the logical design.

---

## 2. Entity overview

Main entities:

1. `tools`  
   Global registry of tools/agents (EHR APIs, RPA bots, etc.).

2. `tenant_tools`  
   Tenant-specific activation and configuration of tools.

3. `tool_metrics`  
   Aggregated performance metrics for tools.

4. `plan_documents`  
   Stored TaskRoutingPlan JSON documents for audit, debugging, and learning.

5. `execution_events`  
   Step-level telemetry emitted by the Orchestrator and ingested by SOACRS.

