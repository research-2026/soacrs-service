# SOACRS Telemetry API (Contracts)

This document defines the telemetry payloads consumed by SOACRS for learning and self-optimization.

> Note: HTTP endpoints are implemented in later stories (SOA-S17).
> This file is the source-of-truth for payload structure shared across middleware components.

---

## 1. Schema Version

All telemetry payloads include:

- `schemaVersion`: `"1.0"`
- `type`: `"execution"` or `"feedback"`

---

## 2. Execution Telemetry (type = "execution")

### Purpose

Reports the outcome of a single tool execution attempt (per TRP step).  
Used to update:

- success/failure counts
- total latency (avg latency is derived)

### Payload

```json
{
  "schemaVersion": "1.0",
  "type": "execution",
  "tenantId": "acme-health",
  "planId": "tr_p5juylwbaxsmgqpiwab",
  "stepId": "step-1",
  "toolId": "ehr-patient-api",
  "capability": "patient.search",
  "success": true,
  "latencyMs": 487,
  "errorCode": null,
  "timestamp": "2026-02-18T10:10:10.000Z",
  "correlationId": "c-55c8a7ef"
}
```
