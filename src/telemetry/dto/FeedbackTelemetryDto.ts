import { TelemetryDtoValidationError } from './TelemetryDtoValidationError';

/**
 * FeedbackTelemetryDto
 *
 * Represents a "quality" signal after execution.
 * Used to update avgReward and influence future routing decisions.
 */
export interface FeedbackTelemetryDto {
  schemaVersion: '1.0';
  type: 'feedback';

  tenantId: string;

  planId: string;

  /**
   * Optional step reference (some feedback is plan-level).
   */
  stepId?: string;

  toolId: string;
  capability: string;

  /**
   * Reward signal in [-1.0, +1.0]
   *  +1 = very good outcome
   *   0 = neutral
   *  -1 = bad outcome
   */
  reward: number;

  /**
   * ISO timestamp for the feedback event.
   */
  timestamp: string;

  /**
   * Optional feedback source (helps analysis).
   */
  source?: 'user' | 'system' | 'validator';

  /**
   * Optional comment/notes.
   */
  comment?: string;
}

/**
 * Runtime validation helper (no external libs).
 * Returns a strongly-typed DTO or throws TelemetryDtoValidationError.
 */
export function parseFeedbackTelemetryDto(payload: unknown): FeedbackTelemetryDto {
  const issues: string[] = [];

  if (!isRecord(payload)) {
    throw new TelemetryDtoValidationError('Invalid feedback telemetry payload', [
      'Payload must be a JSON object.',
    ]);
  }

  const schemaVersion = readLiteral(payload, 'schemaVersion', '1.0', issues);
  const type = readLiteral(payload, 'type', 'feedback', issues);

  const tenantId = readNonEmptyString(payload, 'tenantId', issues);
  const planId = readNonEmptyString(payload, 'planId', issues);
  const toolId = readNonEmptyString(payload, 'toolId', issues);
  const capability = readNonEmptyString(payload, 'capability', issues);

  const reward = readReward(payload, 'reward', issues);
  const timestamp = readIsoTimestamp(payload, 'timestamp', issues);

  const stepId = readOptionalString(payload, 'stepId', issues);
  const comment = readOptionalString(payload, 'comment', issues);
  const source = readOptionalEnum(payload, 'source', ['user', 'system', 'validator'], issues);

  if (issues.length > 0) {
    throw new TelemetryDtoValidationError('Invalid feedback telemetry payload', issues);
  }

  return {
    schemaVersion,
    type,
    tenantId,
    planId,
    toolId,
    capability,
    reward,
    timestamp,
    ...(stepId ? { stepId } : {}),
    ...(source ? { source } : {}),
    ...(comment ? { comment } : {}),
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

function readOptionalEnum<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  issues: string[],
): T | undefined {
  const value = obj[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    issues.push(`"${key}" must be a string when provided.`);
    return undefined;
  }
  if (!allowed.includes(value as T)) {
    issues.push(`"${key}" must be one of: ${allowed.join(', ')}.`);
    return undefined;
  }
  return value as T;
}

function readReward(obj: Record<string, unknown>, key: string, issues: string[]): number {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -1 || value > 1) {
    issues.push(`"${key}" must be a number in range [-1.0, +1.0].`);
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
