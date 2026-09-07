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
export type TimelineCommandResult<Value = void> =
  | ({ ok: true; reason?: never; message?: never; cause?: never } & ([Value] extends [void]
      ? { value?: never }
      : { value: Value }))
  | {
      ok: false;
      reason: TimelineCommandFailureReason;
      message?: string;
      cause?: Error;
      value?: never;
    };

/** Creates a successful command result without a payload. */
export function timelineCommandOk(): TimelineCommandResult;
/**
 * Creates a successful timeline command result with a payload.
 * @param value - Successful command payload.
 * @template Value - Successful command payload type.
 * @returns Successful command result.
 */
export function timelineCommandOk<Value>(value: Value): TimelineCommandResult<Value>;
export function timelineCommandOk<Value>(...args: [] | [Value]): { ok: true; value?: Value } {
  return args.length === 0 ? { ok: true } : { ok: true, value: args[0] };
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
