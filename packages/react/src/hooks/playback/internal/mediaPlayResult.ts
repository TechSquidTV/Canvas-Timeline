import {
  TimelineMediaError,
  type TimelineMediaPlayFailureReason,
} from '@techsquidtv/canvas-timeline-core';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { withMediaCauseMessage } from '#react/hooks/playback/mediaError';

/** Result returned from a media-synchronized timeline play request. */
export type TimelineMediaPlayResult =
  /** Playback started successfully at the returned timeline time. */
  | { ok: true; time: RationalTime }
  /** Playback failed before the timeline and external media clock could run together. */
  | {
      /** Discriminant for a failed media play command. */
      ok: false;
      /** Machine-readable play failure category. */
      reason: TimelineMediaPlayFailureReason;
      /** Human-readable failure detail suitable for status UI or logs. */
      message: string;
      /** Underlying adapter or decoder failure, when one was thrown. */
      cause?: Error;
    };

export function createMediaPlayFailure(
  reason: TimelineMediaPlayFailureReason,
  message: string,
  onError: ((error: TimelineMediaError) => void) | undefined,
  cause?: Error
): TimelineMediaPlayResult {
  const error = new TimelineMediaError(reason, withMediaCauseMessage(message, cause), { cause });
  const result = {
    ok: false,
    reason,
    message: error.message,
    ...(cause !== undefined ? { cause } : {}),
  } as const;
  onError?.(error);
  return result;
}

export function createCancelledMediaPlayResult(): TimelineMediaPlayResult {
  return {
    ok: false,
    reason: 'cancelled',
    message: 'Media playback start was cancelled.',
  };
}
