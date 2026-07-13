import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type { ActiveLayerResult, MaybePromise } from '#core/types';

/** Reason an external media surface is being synchronized with timeline state. */
export type TimelineMediaSyncReason = 'play' | 'tick' | 'rate' | 'gap' | 'pause';

/** Status emitted while timeline content is coordinated with an external clock. */
export type TimelineContentPlaybackStatus = 'idle' | 'playing' | 'paused' | 'content-gap';

/** Details passed to external media synchronization callbacks. */
export interface TimelineLayerSyncDetails<LayerName extends string = string> {
  /** Timeline position the external surface should represent. */
  timelineTime: RationalTime;
  /** Transport transition that caused this synchronization. */
  reason: TimelineMediaSyncReason;
  /** Active clips grouped by the adapter's named layer selectors. */
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
 * @see {@link https://canvastimeline.com/docs/media-adapters | Media adapter guide}
 */
export interface TimelineMediaSyncAdapter<LayerName extends string = string> {
  /** Read the external clock in timeline seconds. */
  getClockTime: () => number;
  /** Start the external clock at a timeline position and playback-rate multiplier. */
  startClock: (timelineTime: RationalTime, playbackRate: number) => MaybePromise<boolean>;
  /** Stop the external clock without disposing its loaded media. */
  stopClock?: () => void;
  /** Begin browser-gated clock or audio activation without blocking visual transport. */
  requestClockActivation?: (playbackRate: number) => void;
  /** Apply a playback-rate change to the running external clock. */
  setClockRate?: (playbackRate: number) => void;
  /** Seek the external surface to a timeline position and its active clips. */
  seek?: (
    timelineTime: RationalTime,
    activeLayers: ActiveLayerResult<LayerName>
  ) => MaybePromise<void>;
  /** Render or schedule the active media layers for a transport transition. */
  syncLayers?: (details: TimelineLayerSyncDetails<LayerName>) => MaybePromise<void>;
  /** Observe high-level synchronized playback status changes. */
  onStatus?: (status: TimelineContentPlaybackStatus) => void;
}

/**
 * Timestamp anchor between a logical timeline source and app-resolved media.
 *
 * @remarks
 *
 * The two values identify the same frame or sample in different time domains.
 * Omit the anchor when logical source time already matches media time.
 */
export interface TimelineMediaSourceTiming {
  /** Timestamp in the logical source domain used by timeline clips. */
  sourceTimeSeconds: number;
  /** Equivalent timestamp in the resolved input's media domain. */
  mediaTimeSeconds: number;
}

/**
 * One app-resolved media choice and its equivalent transport fallbacks.
 *
 * @remarks
 *
 * Applications choose originals, proxies, offline media, or review media before
 * constructing this descriptor. `fallbacks` are ordered ways to load the same
 * resolved choice, not alternate editorial representations.
 *
 * @template TInput - Adapter-specific URL, file, blob, input, or factory shape.
 * @see {@link https://canvastimeline.com/docs/media-adapters | Media adapter guide}
 */
export interface TimelineMediaSource<TInput> {
  /** Stable identifier matching timeline clip `sourceId` values. */
  sourceId: string;
  /** Preferred adapter-specific input for the app-resolved media choice. */
  input: TInput;
  /** Equivalent inputs attempted in order when the preferred input cannot load. */
  fallbacks?: readonly TInput[];
  /** Optional timestamp mapping when resolved media and logical source time differ. */
  timing?: TimelineMediaSourceTiming;
}

/** One preferred or fallback input attempt for a resolved source. */
export interface TimelineMediaSourceAttempt {
  /** Zero-based position in `[input, ...fallbacks]`. */
  inputIndex: number;
  /** Whether the input became ready or failed to load. */
  status: 'ready' | 'failed';
  /** Input failure, or `null` for a ready attempt. */
  error: Error | null;
}

/** Observable lifecycle state shared by packaged timeline media adapters. */
export type TimelineMediaSourceStatus = 'idle' | 'loading' | 'recovering' | 'ready' | 'failed';

/** Reason a packaged adapter source operation could not be accepted. */
export type TimelineMediaSourceOperationFailureReason =
  | 'unknown-source'
  | 'invalid-source'
  | 'load-failed';

/**
 * Result of configuring or loading one packaged adapter source.
 *
 * @remarks
 *
 * `configured` means the source definition was accepted; `ready` means its
 * media input completed loading before the operation resolved. Observe the
 * adapter's source-state map for later lifecycle transitions.
 */
export type TimelineMediaSourceOperationResult =
  | {
      /** Discriminant for an accepted source operation. */
      ok: true;
      /** Logical source affected by the operation. */
      sourceId: string;
      /** Furthest lifecycle state reached before the operation resolved. */
      state: 'configured' | 'ready';
    }
  | {
      /** Discriminant for a rejected or failed source operation. */
      ok: false;
      /** Logical source targeted by the operation. */
      sourceId: string;
      /** Machine-readable operation failure category. */
      reason: TimelineMediaSourceOperationFailureReason;
      /** Detailed operation failure. */
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

/**
 * Structured media error delivered to application error handlers.
 *
 * @remarks
 *
 * Use `reason` for program flow and `message` for logs or user-facing status.
 * The optional standard `cause` retains an underlying decoder or clock error.
 */
export class TimelineMediaError extends Error {
  override readonly name = 'TimelineMediaError';

  constructor(
    /** Machine-readable transport or synchronization failure category. */
    readonly reason: TimelineMediaErrorReason,
    message: string,
    options?: { cause?: Error }
  ) {
    super(message, options);
  }
}
