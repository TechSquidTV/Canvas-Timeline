import type {
  ActiveClip,
  ActiveLayerResult,
  MaybePromise,
  TimelineContentPlaybackStatus,
  TimelineLayerSyncDetails,
  TimelineMediaSource,
  TimelineMediaSourceAttempt,
  TimelineMediaSourceOperationResult,
  TimelineMediaSourceStatus,
  TimelineMediaSyncAdapter,
  TimelineMediaSyncReason,
} from '@techsquidtv/canvas-timeline-core';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type * as Mediabunny from 'mediabunny';

/**
 * Runtime shape of the Mediabunny module used by the timeline adapter.
 */
export type MediabunnyModule = typeof Mediabunny;
/**
 * Media asset descriptor that tells the adapter how to open a timeline source.
 */
export type MediabunnySourceInput =
  | string
  | URL
  | Request
  | Blob
  | File
  | {
      /** Discriminant for a URL-backed Mediabunny source. */
      kind: 'url';
      /** URL, URL object, or Request used to construct a Mediabunny `UrlSource`. */
      url: string | URL | Request;
      /** Explicit formats such as `HLS_FORMATS`; defaults to `ALL_FORMATS`. */
      formats?: readonly Mediabunny.InputFormat[];
      /** Cache, request, and parallel-loading options passed to `UrlSource`. */
      urlSourceOptions?: Mediabunny.UrlSourceOptions;
    }
  | {
      /** Discriminant for an already-created Mediabunny input. */
      kind: 'input';
      /** Caller-owned Mediabunny input; the adapter will not dispose it. */
      input: Mediabunny.Input;
    }
  | {
      /** Discriminant for a lazily-created Mediabunny input. */
      kind: 'input-factory';
      /** Create an adapter-owned input when the source first loads. */
      createInput: (mediabunny: MediabunnyModule) => MaybePromise<Mediabunny.Input>;
    };
/** One app-resolved media choice for a logical timeline source. */
export type MediabunnySource = TimelineMediaSource<MediabunnySourceInput>;
/** Tracks selected from a loaded resolved source input. */
export interface MediabunnyTrackSelection {
  /** Video track to decode, or `null` for an audio-only selection. */
  videoTrack: Mediabunny.InputVideoTrack | null;
  /** Audio track to schedule, or `null` for a video-only selection. */
  audioTrack: Mediabunny.InputAudioTrack | null;
}
/** Context passed to custom media-track selection. */
export interface MediabunnyTrackSelectionContext {
  /** Logical source definition currently being loaded. */
  source: MediabunnySource;
  /** Preferred or fallback descriptor selected for this load attempt. */
  sourceInput: MediabunnySourceInput;
  /** Open Mediabunny input whose tracks are being selected. */
  input: Mediabunny.Input;
  /** All decodable video tracks reported by the input. */
  videoTracks: readonly Mediabunny.InputVideoTrack[];
  /** All decodable audio tracks reported by the input. */
  audioTracks: readonly Mediabunny.InputAudioTrack[];
}
/** Video metadata for the selected source track. */
export interface MediabunnyVideoMetadata {
  /** Display width after applying track rotation, in pixels. */
  displayWidth: number;
  /** Display height after applying track rotation, in pixels. */
  displayHeight: number;
  /** Selected video track rotation. */
  rotation: Mediabunny.Rotation;
  /** Detected average frame rate, or `null` when it cannot be determined. */
  detectedFrameRate: number | null;
}
/** Audio metadata for the selected source track. */
export interface MediabunnyAudioMetadata {
  /** Selected audio track sample rate in hertz. */
  sampleRate: number;
}
/** Timing and selected-track metadata for a loaded source. */
export interface MediabunnySourceMetadata {
  /** First timestamp in the resolved media's time domain. */
  firstTimestampSeconds: number;
  /** First timestamp mapped into the logical source time domain. */
  sourceFirstTimestampSeconds: number;
  /** Earliest presentation timestamp across the selected audio and video tracks. */
  presentationStartTimestampSeconds: number;
  /** End timestamp mapped into the logical source time domain. */
  sourceEndTimestampSeconds: number;
  /** End timestamp in the resolved media's time domain. */
  endTimestampSeconds: number;
  /** Selected-track presentation duration in seconds. */
  durationSeconds: number;
  /** Selected video metadata, or `null` when no video track is selected. */
  video: MediabunnyVideoMetadata | null;
  /** Selected audio metadata, or `null` when no audio track is selected. */
  audio: MediabunnyAudioMetadata | null;
}

/** Observable loading and recovery state for a logical source. */
export interface MediabunnySourceState {
  /** Logical source identifier. */
  sourceId: string;
  /** Current lazy-loading or recovery lifecycle state. */
  status: TimelineMediaSourceStatus;
  /** Selected position in `[input, ...fallbacks]`, or `null` before/after loading. */
  selectedInputIndex: number | null;
  /** Ordered preferred and fallback input attempts. */
  attempts: readonly TimelineMediaSourceAttempt[];
  /** Selected-track timing and format metadata, or `null` until ready. */
  metadata: MediabunnySourceMetadata | null;
  /** Terminal source load error, or `null` outside the failed state. */
  error: Error | null;
}

/** Current availability of the adapter's optional Web Audio graph. */
export type MediabunnyAudioStatus =
  | { state: 'unavailable' }
  | { state: 'suspended' }
  | { state: 'running' }
  | { state: 'degraded'; error: Error | null };

/**
 * Web Audio options used when Mediabunny drives timeline audio playback.
 */
export interface MediabunnyTimelineAudioOptions {
  /** Caller-owned audio context used to decode and schedule source audio. */
  context?: AudioContext;
  /** Audio node that receives scheduled source playback. */
  destination?: AudioNode;
  /** Gain applied to scheduled audio, from 0 to 1. */
  volume?: number;
  /** Initial mute state. */
  muted?: boolean;
  /** Delay before a pending browser activation is reported as degraded. */
  activationTimeoutMs?: number;
}

/**
 * Options for creating a Mediabunny-backed timeline media sync adapter.
 */
export interface CreateMediabunnyAdapterOptions {
  /** Media sources keyed by the `sourceId` values used by timeline clips. */
  sources: readonly MediabunnySource[];
  /** Canvas that receives decoded video frames. */
  canvas?: HTMLCanvasElement | null;
  /** Mediabunny module instance or lazy browser loader. */
  mediabunny: MediabunnyModule | (() => Promise<MediabunnyModule>);
  /** Audio scheduling options for source playback. */
  audio?: MediabunnyTimelineAudioOptions;
  /** Track kinds the adapter should treat as visual frame sources. Defaults to `["visual"]`. */
  visualTrackKinds?: readonly string[];
  /** Track kinds the adapter should treat as audio scheduling sources. Defaults to `["audio"]`. */
  audioTrackKinds?: readonly string[];
  /** Selects the video/audio tracks used by each source input. */
  selectTracks?: (
    context: MediabunnyTrackSelectionContext
  ) => MaybePromise<MediabunnyTrackSelection>;
  /** Callback fired when adapter status, readiness, or frame state changes. */
  onChange?: () => void;
}

/**
 * Decoded video frame returned from a Mediabunny canvas sink.
 */
export interface MediabunnyFrame {
  /** Canvas containing the decoded frame pixels. */
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** Source-media timestamp for the decoded frame, in seconds. */
  timestamp: number;
}

/**
 * Adapter that connects Canvas Timeline playback and frame rendering to Mediabunny.
 *
 * @remarks
 * Disposal is terminal. Read-only state remains available afterward, while new
 * loading, decoding, rendering, or mutating work throws or rejects. Teardown
 * methods and unsubscribe callbacks remain idempotent.
 */
export interface MediabunnyAdapter extends TimelineMediaSyncAdapter<string> {
  /** Whether the adapter has at least one configured source available for lazy loading. */
  readonly ready: boolean;
  /** Human-readable loading, playback, or error status. */
  readonly status: string;
  /** Last source loading error, when one is active. */
  readonly error: Error | null;
  /** Timestamp of the last rendered video frame, in seconds. */
  readonly lastFrameTime: number | null;
  /** Immutable loading, input-attempt, metadata, and recovery snapshot by source id. */
  readonly sourceStateById: ReadonlyMap<string, MediabunnySourceState>;
  /** Current master output volume from 0 to 1. */
  readonly volume: number;
  /** Whether master audio output is muted. */
  readonly muted: boolean;
  /** Current optional Web Audio graph and browser activation state. */
  readonly audioStatus: MediabunnyAudioStatus;
  /** Subscribe to decoded preview frame timestamp changes. */
  subscribeFrame: (listener: () => void) => () => void;
  /** Update the canvas used for video preview rendering. */
  setCanvas: (canvas: HTMLCanvasElement | null) => void;
  /** Read the current timeline playback time from the active Mediabunny clock. */
  getClockTime: () => number;
  /** Start Mediabunny-driven playback at a timeline time and rate. */
  startClock: (timelineTime: RationalTime, playbackRate: number) => boolean;
  /** Stop Mediabunny-driven playback without disposing loaded sources. */
  stopClock: () => void;
  /**
   * Request browser audio activation without blocking visual transport.
   * Observe `audioStatus` for suspended or degraded activation.
   */
  requestClockActivation: (playbackRate: number) => void;
  /** Update master output volume without reloading sources. */
  setVolume: (volume: number) => void;
  /** Update master mute state without reloading sources. */
  setMuted: (muted: boolean) => void;
  /** Reconcile the complete logical source registry without recreating the adapter. */
  setSources: (sources: readonly MediabunnySource[]) => void;
  /** Load one source ahead of playback without making it an app-level media choice. */
  preloadSource: (sourceId: string) => Promise<TimelineMediaSourceOperationResult>;
  /** Release one loaded source while keeping its definition registered. */
  unloadSource: (sourceId: string) => boolean;
  /** Retry the configured inputs for one resolved source. */
  retrySource: (sourceId: string) => Promise<TimelineMediaSourceOperationResult>;
  /** Replace one logical source with another app-resolved media choice. */
  replaceSource: (source: MediabunnySource) => Promise<TimelineMediaSourceOperationResult>;
  /** Update the active playback rate while preserving timeline position. */
  setClockRate: (playbackRate: number) => void;
  /** Seek decoded media to the active clips for a timeline time. */
  seek: (timelineTime: RationalTime, activeLayers: ActiveLayerResult<string>) => Promise<void>;
  /** Render the active video clip at its source-mapped timeline time. */
  renderVideo: (activeVideo: ActiveClip, timelineTime: RationalTime) => Promise<void>;
  /** Synchronize audio scheduling for the active timeline audio clip. */
  syncAudio: (
    activeAudio: ActiveClip | undefined,
    timelineTime: RationalTime,
    reason: TimelineMediaSyncReason
  ) => void;
  /** Synchronize Mediabunny sinks from active timeline layers. */
  syncLayers: (details: TimelineLayerSyncDetails<string>) => Promise<void>;
  /** Update the adapter's human-readable status from synchronized playback state. */
  onStatus: (status: TimelineContentPlaybackStatus) => void;
  /** Clear the preview canvas and reset last-frame state. */
  clearVideo: () => void;
  /** Decode and return a frame for an active video clip without painting it. */
  getFrame: (activeVideo: ActiveClip) => Promise<MediabunnyFrame | null>;
  /**
   * Release Mediabunny inputs, sinks, audio nodes, and loaded source state.
   * Calling this method again is safe; new work requested afterward throws or rejects.
   */
  dispose: () => void;
}
