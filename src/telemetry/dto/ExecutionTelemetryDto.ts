import { TelemetryDtoValidationError } from './TelemetryDtoValidationError';

/**
 * ExecutionTelemetryDto
 *
 * Represents ONE execution attempt of a tool for a plan step.
 * This is the primary input to update success/failure + latency aggregates.
 */
export interface ExecutionTelemetryDto {
  /**
   * Schema version for this telemetry contract.
   * Keep stable across services.
   */
  schemaVersion: '1.0';

  /**
   * Discriminator for routing/validation.
   */
  type: 'execution';

  /**
   * Tenant scope (customer/org).
   */
  tenantId: string;

  /**
   * TRP identifier produced by SOACRS.
   */
  planId: string;

  /**
   * Step identifier inside TRP (e.g. "step-1").
   */
  stepId: string;

  /**
   * Tool invoked by the orchestrator.
   */
  toolId: string;

  /**
   * Capability the tool was invoked for.
   */
  capability: string;

  /**
   * Whether the tool invocation succeeded.
   */
  success: boolean;

  /**
   * Observed latency in milliseconds.
   */
  latencyMs: number;

  /**
   * Optional error code (e.g. TIMEOUT, HTTP_500, VALIDATION_FAILED).
   */
  errorCode?: string;

  /**
   * ISO timestamp for the event creation time.
   */
  timestamp: string;

  /**
   * Optional correlation id used across distributed tracing.
   */
  correlationId?: string;
}

/**
 * Runtime validation helper (no external libs).
 * Returns a strongly-typed DTO or throws TelemetryDtoValidationError.
 */
export function parseExecutionTelemetryDto(payload: unknown): ExecutionTelemetryDto {
  const issues: string[] = [];

  if (!isRecord(payload)) {
    throw new TelemetryDtoValidationError('Invalid execution telemetry payload', [
      'Payload must be a JSON object.',
    ]);
  }

  const schemaVersion = readLiteral(payload, 'schemaVersion', '1.0', issues);
  const type = readLiteral(payload, 'type', 'execution', issues);

  const tenantId = readNonEmptyString(payload, 'tenantId', issues);
  const planId = readNonEmptyString(payload, 'planId', issues);
  const stepId = readNonEmptyString(payload, 'stepId', issues);
  const toolId = readNonEmptyString(payload, 'toolId', issues);
  const capability = readNonEmptyString(payload, 'capability', issues);

  const success = readBoolean(payload, 'success', issues);
  const latencyMs = readNonNegativeNumber(payload, 'latencyMs', issues);

  const errorCode = readOptionalString(payload, 'errorCode', issues);
  const correlationId = readOptionalString(payload, 'correlationId', issues);

  const timestamp = readIsoTimestamp(payload, 'timestamp', issues);

  if (issues.length > 0) {
    throw new TelemetryDtoValidationError('Invalid execution telemetry payload', issues);
  }

  return {
    schemaVersion,
    type,
    tenantId,
    planId,
    stepId,
    toolId,
    capability,
    success,
    latencyMs,
    ...(errorCode ? { errorCode } : {}),
    timestamp,
    ...(correlationId ? { correlationId } : {}),
  };
}

/* ------------------------- small internal helpers ------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readLiteral<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  expected: T,
  issues: string[],
): T {
  const value = obj[key];
  if (value !== expected) {
    issues.push(`"${key}" must be "${expected}".`);
  }
  return expected;
}

function readNonEmptyString(obj: Record<string, unknown>, key: string, issues: string[]): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`"${key}" must be a non-empty string.`);
    return '';
  }
  return value;
}

function readOptionalString(
  obj: Record<string, unknown>,
  key: string,
  issues: string[],
): string | undefined {
  const value = obj[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    issues.push(`"${key}" must be a string when provided.`);
    return undefined;
  }
  return value;
}

function readBoolean(obj: Record<string, unknown>, key: string, issues: string[]): boolean {
  const value = obj[key];
  if (typeof value !== 'boolean') {
    issues.push(`"${key}" must be a boolean.`);
    return false;
  }
  return value;
}

function readNonNegativeNumber(
  obj: Record<string, unknown>,
  key: string,
  issues: string[],
): number {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    issues.push(`"${key}" must be a non-negative number.`);
    return 0;
  }
  return value;
}

function readIsoTimestamp(obj: Record<string, unknown>, key: string, issues: string[]): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`"${key}" must be an ISO timestamp string.`);
    return '';
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    issues.push(`"${key}" must be a valid ISO timestamp.`);
  }

  return value;
}
