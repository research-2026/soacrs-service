// src/http/errors/errorEnvelope.ts

/**
 * Standard error envelope (SOA-S19)
 *
 * All error responses should follow this structure so the Orchestrator can parse reliably.
 */

export type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    correlationId?: string;
    issues?: string[];
    details?: unknown;
  };
};

export function buildErrorEnvelope(params: {
  code: string;
  message: string;
  correlationId?: string;
  issues?: string[];
  details?: unknown;
}): ErrorEnvelope {
  return {
    error: {
      code: params.code,
      message: params.message,
      ...(params.correlationId ? { correlationId: params.correlationId } : {}),
      ...(params.issues ? { issues: params.issues } : {}),
      ...(params.details !== undefined ? { details: params.details } : {}),
    },
  };
}
