/**
 * Machine-readable reason a timeline command could not be applied.
 */
export type TimelineCommandFailureReason =
  | 'not-found'
  | 'locked'
  | 'invalid-range'
  | 'invalid-duration'
  | 'invalid-input'
  | 'invalid-track'
  | 'incompatible-track-kind'
  | 'duplicate-id'
  | 'disabled'
  | 'content-gap'
  | 'empty-selection'
  | 'empty-clipboard'
  | 'out-of-bounds'
  | 'policy-rejected'
  | 'source-bounds'
  | 'sync-failed'
  | 'unsupported';

/**
 * Consistent result returned by React hook command APIs.
 *
 * @template Value - Optional successful command payload.
 */
export interface TimelineCommandResult<Value = void> {
  /** Whether the command was applied. */
  ok: boolean;
  /** Reason the command was not applied. */
  reason?: TimelineCommandFailureReason;
  /** Optional human-readable failure detail for product UI and diagnostics. */
  message?: string;
  /** Original error that caused the failure, when available. */
  cause?: Error;
  /** Optional successful command payload. */
  value?: Value;
}

/**
 * Creates a successful timeline command result.
 *
 * @param value - Optional command payload.
 * @template Value - Successful command payload type.
 * @returns Successful command result.
 */
export function timelineCommandOk<Value = void>(value?: Value): TimelineCommandResult<Value> {
  return value === undefined ? { ok: true } : { ok: true, value };
}

/**
 * Creates a failed timeline command result.
 *
 * @param reason - Machine-readable failure reason.
 * @param message - Optional human-readable failure detail.
 * @param cause - Optional original error that caused the failure.
 * @template Value - Payload type expected by the matching successful command
 * result.
 * @returns Failed command result.
 */
export function timelineCommandFail<Value = void>(
  reason: TimelineCommandFailureReason,
  message?: string,
  cause?: Error
): TimelineCommandResult<Value> {
  return {
    ok: false,
    reason,
    ...(message !== undefined ? { message } : {}),
    ...(cause !== undefined ? { cause } : {}),
  };
}

function toTimelineCommandError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Creates a failed command result for malformed public command input.
 *
 * @param message - Human-readable failure detail.
 * @param cause - Original thrown validation error.
 * @returns Failed command result.
 */
export function timelineCommandInvalidInput<Value = void>(
  message: string,
  cause: unknown
): TimelineCommandResult<Value> {
  return timelineCommandFail('invalid-input', message, toTimelineCommandError(cause));
}
