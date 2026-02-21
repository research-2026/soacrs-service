// src/coordination/dto/SemanticTaskDto.ts

/**
 * SemanticTask DTO parser/validator
 *
 * This is the HTTP boundary validator for /v1/plan inputs.
 *
 * Standards applied:
 * - Validate at boundaries (do not trust external JSON).
 * - Return a strongly typed domain object or throw a structured error.
 * - No domain changes: aligns to src/coordination/domain/SemanticTask.ts.
 */

import type { NetworkDenyMode, RequesterType, SemanticTask } from '../domain/SemanticTask';

export class SemanticTaskDtoValidationError extends Error {
  public readonly issues: string[];

  public constructor(message: string, issues: string[]) {
    super(message);
    this.name = 'SemanticTaskDtoValidationError';
    this.issues = issues;
  }
}

export function parseSemanticTaskDto(payload: unknown): SemanticTask {
  const issues: string[] = [];

  if (!isRecord(payload)) {
    throw new SemanticTaskDtoValidationError('Invalid SemanticTask payload', [
      'Payload must be a JSON object.',
    ]);
  }

  const context = readRecord(payload, 'context', issues);
  const requester = readRecord(payload, 'requester', issues);
  const goal = readRecord(payload, 'goal', issues);

  const tenant = readNonEmptyString(context, 'tenant', issues);

  // Optional context fields (if present -> must be non-empty string)
  const correlationId = readOptionalNonEmptyString(context, 'correlationId', issues);
  const idempotencyKey = readOptionalNonEmptyString(context, 'idempotencyKey', issues);
  const locale = readOptionalNonEmptyString(context, 'locale', issues);
  const region = readOptionalNonEmptyString(context, 'region', issues);

  const requesterType = readRequesterType(requester, 'type', issues);
  const requesterId = readNonEmptyString(requester, 'id', issues);
  const scopes = readOptionalStringArray(requester, 'scopes', issues);

  const capability = readNonEmptyString(goal, 'capability', issues);
  const input = readPlainObject(goal, 'input', issues);
  const description = readOptionalString(goal, 'description', issues);

  const constraints = readOptionalRecord(payload, 'constraints', issues);
  const parsedConstraints = constraints ? parseConstraints(constraints, issues) : undefined;

  if (issues.length > 0) {
    throw new SemanticTaskDtoValidationError('Invalid SemanticTask payload', issues);
  }

  return {
    context: {
      tenant,
      ...(correlationId ? { correlationId } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(locale ? { locale } : {}),
      ...(region ? { region } : {}),
    },
    requester: {
      type: requesterType,
      id: requesterId,
      ...(scopes ? { scopes } : {}),
    },
    goal: {
      capability,
      input,
      ...(description ? { description } : {}),
    },
    ...(parsedConstraints ? { constraints: parsedConstraints } : {}),
  };
}

/* ------------------------- constraints parsing ------------------------- */

function parseConstraints(obj: Record<string, unknown>, issues: string[]) {
  const overallTimeoutMs = readOptionalNonNegativeNumber(obj, 'overallTimeoutMs', issues);
  const maxParallel = readOptionalPositiveNumber(obj, 'maxParallel', issues);
  const costBudget = readOptionalNonNegativeNumber(obj, 'costBudget', issues);
  const privacyTags = readOptionalStringArray(obj, 'privacyTags', issues);
  const denyNetworkWhen = readOptionalNetworkDenyMode(obj, 'denyNetworkWhen', issues);

  return {
    ...(overallTimeoutMs !== undefined ? { overallTimeoutMs } : {}),
    ...(maxParallel !== undefined ? { maxParallel } : {}),
    ...(costBudget !== undefined ? { costBudget } : {}),
    ...(privacyTags ? { privacyTags } : {}),
    ...(denyNetworkWhen ? { denyNetworkWhen } : {}),
  };
}

/* ------------------------- small internal helpers ------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(obj: Record<string, unknown>, key: string, issues: string[]) {
  const value = obj[key];
  if (!isRecord(value)) {
    issues.push(`"${key}" must be an object.`);
    return {};
  }
  return value;
}

function readOptionalRecord(obj: Record<string, unknown>, key: string, issues: string[]) {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push(`"${key}" must be an object when provided.`);
    return undefined;
  }
  return value;
}

function readPlainObject(obj: Record<string, unknown>, key: string, issues: string[]) {
  const value = obj[key];
  if (!isRecord(value)) {
    issues.push(`"${key}" must be a JSON object.`);
    return {};
  }
  return value;
}

function readNonEmptyString(obj: Record<string, unknown>, key: string, issues: string[]) {
  const value = obj[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`"${key}" must be a non-empty string.`);
    return '';
  }
  return value;
}

function readOptionalNonEmptyString(obj: Record<string, unknown>, key: string, issues: string[]) {
  const value = obj[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`"${key}" must be a non-empty string when provided.`);
    return undefined;
  }
  return value;
}

function readOptionalString(obj: Record<string, unknown>, key: string, issues: string[]) {
  const value = obj[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    issues.push(`"${key}" must be a string when provided.`);
    return undefined;
  }
  return value;
}

function readOptionalStringArray(obj: Record<string, unknown>, key: string, issues: string[]) {
  const value = obj[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    issues.push(`"${key}" must be an array of strings when provided.`);
    return undefined;
  }
  return value;
}

function readOptionalNonNegativeNumber(
  obj: Record<string, unknown>,
  key: string,
  issues: string[],
) {
  const value = obj[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    issues.push(`"${key}" must be a non-negative number when provided.`);
    return undefined;
  }
  return value;
}

function readOptionalPositiveNumber(obj: Record<string, unknown>, key: string, issues: string[]) {
  const value = obj[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    issues.push(`"${key}" must be a positive number when provided.`);
    return undefined;
  }
  return value;
}

function readRequesterType(
  obj: Record<string, unknown>,
  key: string,
  issues: string[],
): RequesterType {
  const value = obj[key];
  if (value !== 'user' && value !== 'service') {
    issues.push(`"${key}" must be "user" or "service".`);
    return 'user';
  }
  return value;
}

function readOptionalNetworkDenyMode(
  obj: Record<string, unknown>,
  key: string,
  issues: string[],
): NetworkDenyMode | undefined {
  const value = obj[key];
  if (value === undefined || value === null) return undefined;
  if (value !== 'never' && value !== 'on-sensitive' && value !== 'always') {
    issues.push(`"${key}" must be "never", "on-sensitive" or "always" when provided.`);
    return undefined;
  }
  return value;
}
