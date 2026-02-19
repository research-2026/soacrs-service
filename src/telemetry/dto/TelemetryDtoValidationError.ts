/**
 * TelemetryDtoValidationError
 *
 * Thrown when an incoming telemetry payload does not match the expected DTO contract.
 * We keep validation errors structured to make HTTP error handling easy later (SOA-S17/S19).
 */
export class TelemetryDtoValidationError extends Error {
  public readonly issues: string[];

  public constructor(message: string, issues: string[]) {
    super(message);
    this.name = 'TelemetryDtoValidationError';
    this.issues = issues;
  }
}
