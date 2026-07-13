import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type { ActiveLayerResult, MaybePromise } from '#core/types';

/** Reason an external media surface is being synchronized. */
export type TimelineMediaSyncReason = 'play' | 'tick' | 'rate' | 'gap' | 'pause';

/** Status emitted while timeline content is coordinated with an external clock. */
export type TimelineContentPlaybackStatus = 'idle' | 'playing' | 'paused' | 'content-gap';

/** Details passed to external media synchronization callbacks. */
export interface TimelineLayerSyncDetails<LayerName extends string = string> {
  timelineTime: RationalTime;
  reason: TimelineMediaSyncReason;
  activeLayers: ActiveLayerResult<LayerName>;
}

/**
 * Framework-neutral contract implemented by an external media clock and renderer.
 *
 * @remarks
 *
 * Adapters own decoding, rendering, and clock control while timeline hooks own
 * active-layer selection and transport policy through {@link ActiveLayerResult}
 * snapshots. The contract lives in core so imperative adapters do not depend
 * on React.
 *
 * @template LayerName - Named media layer keys received in active-layer snapshots.
 */
export interface TimelineMediaSyncAdapter<LayerName extends string = string> {
  getClockTime: () => number;
  startClock: (timelineTime: RationalTime, playbackRate: number) => MaybePromise<boolean>;
  stopClock?: () => void;
  requestClockActivation?: (playbackRate: number) => void;
  setClockRate?: (playbackRate: number) => void;
  seek?: (
    timelineTime: RationalTime,
    activeLayers: ActiveLayerResult<LayerName>
  ) => MaybePromise<void>;
  syncLayers?: (details: TimelineLayerSyncDetails<LayerName>) => MaybePromise<void>;
  onStatus?: (status: TimelineContentPlaybackStatus) => void;
}

/** Timestamp anchor between a logical timeline source and its resolved media. */
export interface TimelineMediaSourceTiming {
  sourceTimeSeconds: number;
  mediaTimeSeconds: number;
}

/** One app-resolved media choice and its equivalent transport fallbacks. */
export interface TimelineMediaSource<TInput> {
  sourceId: string;
  input: TInput;
  fallbacks?: readonly TInput[];
  timing?: TimelineMediaSourceTiming;
}

/** One preferred or fallback input attempt for a resolved source. */
export interface TimelineMediaSourceAttempt {
  inputIndex: number;
  status: 'ready' | 'failed';
  error: Error | null;
}

/** Observable lifecycle state shared by packaged timeline media adapters. */
export type TimelineMediaSourceStatus = 'idle' | 'loading' | 'recovering' | 'ready' | 'failed';

/** Reason a packaged adapter source operation could not be accepted. */
export type TimelineMediaSourceOperationFailureReason =
  | 'unknown-source'
  | 'invalid-source'
  | 'load-failed';

/** Result of configuring or loading one packaged adapter source. */
export type TimelineMediaSourceOperationResult =
  | {
      ok: true;
      sourceId: string;
      state: 'configured' | 'ready';
    }
  | {
      ok: false;
      sourceId: string;
      reason: TimelineMediaSourceOperationFailureReason;
      error: Error;
    };

/** Reason media-synchronized playback could not begin. */
export type TimelineMediaPlayFailureReason =
  | 'not-ready'
  | 'no-content'
  | 'no-active-content'
  | 'clock-failed'
  | 'timeline-failed';

/** Machine-readable category for a media transport or synchronization failure. */
export type TimelineMediaErrorReason =
  | TimelineMediaPlayFailureReason
  | 'seek-failed'
  | 'loop-failed'
  | 'sync-failed';

/** Structured media error delivered to application error handlers. */
export class TimelineMediaError extends Error {
  override readonly name = 'TimelineMediaError';

  constructor(
    readonly reason: TimelineMediaErrorReason,
    message: string,
    options?: { cause?: Error }
  ) {
    super(message, options);
  }
}
