import type {
  ActiveClip,
  ActiveLayerResult,
  Clip,
  MaybePromise,
  TimelineContentPlaybackStatus,
  TimelineLayerSyncDetails,
  TimelineMediaSource,
  TimelineMediaSourceAttempt,
  TimelineMediaSourceOperationResult,
  TimelineMediaSourceStatus,
  TimelineMediaSourceTiming,
  TimelineMediaSyncAdapter,
  TimelineMediaSyncReason,
} from '@techsquidtv/canvas-timeline-core';
import { toSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';
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

interface MediabunnySourceLoadOptions {
  status: 'loading' | 'recovering';
  token: MediabunnySourceLoadToken;
  startIndex?: number;
  previousAttempts?: readonly TimelineMediaSourceAttempt[];
  replacement?: PendingSourceReplacement;
}

interface MediabunnySourceLoadToken {
  sourceId: string;
  generation: number;
}

interface PendingSourceRecovery {
  controller: MediabunnySourceController;
  error: Error;
  previousState: MediabunnySourceState | undefined;
  promise: Promise<TimelineMediaSourceOperationResult> | null;
}

interface PendingSourceReplacement {
  previousState: MediabunnySourceState | undefined;
  candidate: MediabunnySourceController | null;
  readyState: MediabunnySourceState | null;
  deferredRecovery: PendingSourceRecovery | null;
  promise: Promise<TimelineMediaSourceOperationResult> | null;
}

interface MediabunnySourceOperationState {
  generation: number;
  preloadPromise: Promise<TimelineMediaSourceOperationResult> | null;
  replacement: PendingSourceReplacement | null;
  recovery: PendingSourceRecovery | null;
}

interface MediabunnyOutputOperationToken {
  generation: number;
  canvas: HTMLCanvasElement | null;
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

interface MediabunnySourceController {
  sourceId: string;
  input: Mediabunny.Input | null;
  ownsInput: boolean;
  inputIndex: number;
  mediaTimeOffsetSeconds: number;
  videoSink: Mediabunny.CanvasSink | null;
  audioSink: Mediabunny.AudioBufferSink | null;
  audioContext: AudioContext | null;
  gainNode: GainNode | null;
  audioBufferIterator: AsyncGenerator<Mediabunny.WrappedAudioBuffer, void, void> | null;
  queuedAudioNodes: Set<AudioBufferSourceNode>;
  timelineTimeAtStart: number;
  audioContextStartTime: number | null;
  audioClockReady: boolean;
  wallClockStartTime: number | null;
  playbackRate: number;
  playing: boolean;
  activeAudioSyncKey: string | undefined;
  audioPlaybackGeneration: number;
  asyncId: number;
  renderingFrame: boolean;
  currentFrameRequest: PendingFrameRequest | undefined;
  pendingFrameRequest: PendingFrameRequest | undefined;
  videoPlaybackGeneration: number;
  videoPlaybackIterator: AsyncGenerator<Mediabunny.WrappedCanvas, void, unknown> | null;
  videoPlaybackFutureFrame: Mediabunny.WrappedCanvas | null;
  videoPlaybackProcessing: boolean;
  videoPlaybackEnded: boolean;
  videoPlaybackSyncKey: string | undefined;
  videoPlaybackSourceSeconds: number | null;
  videoPlaybackTargetSeconds: number | null;
  videoPlaybackCanvas: HTMLCanvasElement | null;
  videoPlaybackIsCurrent: (() => boolean) | undefined;
  videoPlaybackOnFrame: ((timestamp: number) => void) | undefined;
  videoPlaybackOnFailure: ((error: Error) => void) | undefined;
  lastRenderedVideoTimestamp: number | null;
}

interface PendingFrameRequest {
  canvas: HTMLCanvasElement;
  sourceSeconds: number;
  onFrame?: (timestamp: number) => void;
  isCurrent: () => boolean;
  resolve: () => void;
  reject: (error: Error) => void;
}

interface LoadedMediaInfo {
  metadata: MediabunnySourceMetadata;
}

/**
 * Format a timeline or source-media time value for Mediabunny adapter status text.
 *
 * @param seconds - Timeline or source-media time in decimal seconds.
 */
export function formatMediabunnyTime(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '0.00s';
  }

  return `${seconds.toFixed(2)}s`;
}

function validateSources(sources: readonly MediabunnySource[]) {
  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (source.sourceId.length === 0) {
      throw new Error('Mediabunny sourceId cannot be empty.');
    }
    if (sourceIds.has(source.sourceId)) {
      throw new Error(`Duplicate Mediabunny sourceId "${source.sourceId}".`);
    }
    sourceIds.add(source.sourceId);
    validateMediabunnyTiming(source.sourceId, source.timing);
  }
}

function assertValidMediabunnyVolume(volume: number) {
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    throw new RangeError('volume must be a finite number from 0 to 1.');
  }
}

function validateMediabunnyTiming(sourceId: string, timing: TimelineMediaSourceTiming | undefined) {
  if (
    timing !== undefined &&
    (!Number.isFinite(timing.sourceTimeSeconds) || !Number.isFinite(timing.mediaTimeSeconds))
  ) {
    throw new Error(`Source "${sourceId}" timing values must be finite.`);
  }
}

function createIdleSourceState(sourceId: string): MediabunnySourceState {
  return {
    sourceId,
    status: 'idle',
    selectedInputIndex: null,
    attempts: [],
    metadata: null,
    error: null,
  };
}

class SupersededSourceLoadError extends Error {
  override readonly name = 'SupersededSourceLoadError';

  constructor(sourceId: string) {
    super(`Loading source "${sourceId}" was superseded.`);
  }
}

function createSupersededSourceLoadResult(sourceId: string): TimelineMediaSourceOperationResult {
  return {
    ok: false,
    sourceId,
    reason: 'load-failed',
    error: new SupersededSourceLoadError(sourceId),
  };
}

function isSupersededSourceLoadResult(
  result: TimelineMediaSourceOperationResult
): result is Extract<TimelineMediaSourceOperationResult, { ok: false }> {
  return !result.ok && result.error instanceof SupersededSourceLoadError;
}

function areMediabunnySourcesEqual(left: MediabunnySource, right: MediabunnySource) {
  const leftFallbacks = left.fallbacks ?? [];
  const rightFallbacks = right.fallbacks ?? [];
  return (
    left.sourceId === right.sourceId &&
    areMediabunnySourceInputsEqual(left.input, right.input) &&
    leftFallbacks.length === rightFallbacks.length &&
    leftFallbacks.every((input, index) => {
      const rightInput = rightFallbacks[index];
      return rightInput !== undefined && areMediabunnySourceInputsEqual(input, rightInput);
    }) &&
    left.timing?.sourceTimeSeconds === right.timing?.sourceTimeSeconds &&
    left.timing?.mediaTimeSeconds === right.timing?.mediaTimeSeconds
  );
}

function areMediabunnySourceInputsEqual(
  left: MediabunnySourceInput,
  right: MediabunnySourceInput
): boolean {
  if (left === right) {
    return true;
  }
  if (left instanceof URL && right instanceof URL) {
    return left.href === right.href;
  }
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null ||
    !('kind' in left) ||
    !('kind' in right) ||
    left.kind !== right.kind
  ) {
    return false;
  }
  if (left.kind === 'url' && right.kind === 'url') {
    const leftFormats = left.formats ?? [];
    const rightFormats = right.formats ?? [];
    return (
      areMediabunnyUrlsEqual(left.url, right.url) &&
      leftFormats.length === rightFormats.length &&
      leftFormats.every((format, index) => format === rightFormats[index]) &&
      left.urlSourceOptions === right.urlSourceOptions
    );
  }
  if (left.kind === 'input' && right.kind === 'input') {
    return left.input === right.input;
  }
  return (
    left.kind === 'input-factory' &&
    right.kind === 'input-factory' &&
    left.createInput === right.createInput
  );
}

function areMediabunnyUrlsEqual(left: string | URL | Request, right: string | URL | Request) {
  if (left === right) {
    return true;
  }
  if (typeof left === 'string' && typeof right === 'string') {
    return left === right;
  }
  if (left instanceof URL && right instanceof URL) {
    return left.href === right.href;
  }
  return false;
}

/**
 * Create a Mediabunny adapter that drives Canvas Timeline media playback.
 *
 * @remarks
 *
 * Source definitions are registered immediately but opened only when active or
 * explicitly preloaded. The adapter owns inputs created from URLs, blobs, and
 * factories, while supplied `{ kind: "input" }` values and caller-provided
 * `AudioContext` instances remain caller-owned.
 *
 * @param options - Mediabunny sources, preview canvas, audio, loader, and change callback.
 * @returns Imperative lazy-loading adapter and framework-neutral sync contract.
 *
 * @example
 * ```ts
 * import * as mediabunny from 'mediabunny';
 * import { createMediabunnyAdapter } from '@techsquidtv/canvas-timeline-mediabunny-adapter';
 *
 * const adapter = createMediabunnyAdapter({
 *   mediabunny,
 *   canvas,
 *   sources: [{ sourceId: 'source-1', input: '/media/interview.mp4' }],
 * });
 *
 * await adapter.preloadSource('source-1');
 * ```
 *
 * @see {@link MediabunnyAdapter}
 * @see {@link https://canvastimeline.com/docs/media-adapters | Media adapter guide}
 */
export function createMediabunnyAdapter(
  options: CreateMediabunnyAdapterOptions
): MediabunnyAdapter {
  validateSources(options.sources);
  if (options.audio?.destination !== undefined && options.audio.context === undefined) {
    throw new Error('An audio context is required when an audio destination is provided.');
  }
  const initialVolume = options.audio?.volume ?? 0.7;
  assertValidMediabunnyVolume(initialVolume);
  let ready = options.sources.length > 0;
  let status = ready
    ? 'Sources registered. Mediabunny loads active media on demand.'
    : 'No Mediabunny sources are configured.';
  let error: Error | null = null;
  let canvas = options.canvas ?? null;
  let disposed = false;
  let currentPlaybackRate = 1;
  let transportTimelineTimeAtStart = 0;
  let transportAudioContextStartTime: number | null = null;
  let transportAudioClockReady = false;
  let transportWallClockStartTime: number | null = null;
  let transportPlaying = false;
  let lastFrameTime: number | null = null;
  const frameListeners = new Set<() => void>();
  const controllers = new Map<string, MediabunnySourceController>();
  const sourceDefinitions = new Map(options.sources.map((source) => [source.sourceId, source]));
  let sourceStateSnapshot: ReadonlyMap<string, MediabunnySourceState> = new Map(
    options.sources.map((source) => [source.sourceId, createIdleSourceState(source.sourceId)])
  );
  const sourceOperations = new Map<string, MediabunnySourceOperationState>();
  const activeSourceIds = new Set<string>();
  let activeVisualClip: ActiveClip | undefined;
  let outputGeneration = 0;
  const outputOperationsInFlight = new Set<number>();
  let currentOutputSourceIds = new Set<string>();
  const visualTrackKinds = new Set(options.visualTrackKinds ?? ['visual']);
  const audioTrackKinds = new Set(options.audioTrackKinds ?? ['audio']);
  let mediabunnyPromise: Promise<MediabunnyModule> | null = null;
  const getMediabunny = () => {
    mediabunnyPromise ??= Promise.resolve().then(() =>
      typeof options.mediabunny === 'function' ? options.mediabunny() : options.mediabunny
    );
    return mediabunnyPromise;
  };
  let audioContext: AudioContext | null = options.audio?.context ?? null;
  let ownsAudioContext = false;
  let masterGainNode: GainNode | null = null;
  let volume = initialVolume;
  let muted = options.audio?.muted ?? false;
  let audioStatus: MediabunnyAudioStatus = { state: 'unavailable' };
  let activationGeneration = 0;
  let activationTimer: number | null = null;
  let pendingAudioActivationRate: number | null = null;

  const getSourceOperation = (sourceId: string) => {
    let operation = sourceOperations.get(sourceId);
    if (operation === undefined) {
      operation = {
        generation: 0,
        preloadPromise: null,
        replacement: null,
        recovery: null,
      };
      sourceOperations.set(sourceId, operation);
    }
    return operation;
  };

  const beginSourceLoad = (sourceId: string): MediabunnySourceLoadToken => {
    const operation = getSourceOperation(sourceId);
    operation.generation += 1;
    operation.preloadPromise = null;
    return { sourceId, generation: operation.generation };
  };

  const isCurrentSourceLoad = (token: MediabunnySourceLoadToken) =>
    !disposed && getSourceOperation(token.sourceId).generation === token.generation;

  const beginOutputOperation = (
    sourceIds: Iterable<string> = activeSourceIds
  ): MediabunnyOutputOperationToken => {
    const token = {
      generation: ++outputGeneration,
      canvas,
    };
    currentOutputSourceIds = new Set(sourceIds);
    outputOperationsInFlight.add(token.generation);
    return token;
  };

  const completeOutputOperation = (token: MediabunnyOutputOperationToken) => {
    outputOperationsInFlight.delete(token.generation);
  };

  const isCurrentOutputOperation = (token: MediabunnyOutputOperationToken) =>
    !disposed && token.generation === outputGeneration && token.canvas === canvas;

  const isCurrentActiveSourceOwnership = (
    outputToken: MediabunnyOutputOperationToken,
    ownership: readonly MediabunnySourceLoadToken[]
  ) =>
    !disposed &&
    isCurrentOutputOperation(outputToken) &&
    ownership.every((token) => {
      const operation = getSourceOperation(token.sourceId);
      return operation.generation === token.generation && controllers.has(token.sourceId);
    });

  const invalidateOutputOperations = (affectedSourceIds?: ReadonlySet<string>) => {
    if (
      affectedSourceIds !== undefined &&
      ![...affectedSourceIds].some(
        (sourceId) => currentOutputSourceIds.has(sourceId) || activeSourceIds.has(sourceId)
      )
    ) {
      return;
    }
    outputGeneration += 1;
    outputOperationsInFlight.clear();
    currentOutputSourceIds.clear();
    for (const controller of controllers.values()) {
      invalidateFrameRendering(controller);
      void cancelVideoPlayback(controller);
    }
  };

  const assertAdapterActive = () => {
    if (disposed) {
      throw new Error('Mediabunny adapter has been disposed.');
    }
  };

  const notify = () => {
    if (disposed) {
      return;
    }
    options.onChange?.();
  };

  const setLastFrameTime = (timestamp: number | null) => {
    if (disposed) {
      return;
    }
    if (Object.is(lastFrameTime, timestamp)) {
      return;
    }

    lastFrameTime = timestamp;
    for (const listener of frameListeners) {
      listener();
    }
  };

  const setStatus = (nextStatus: string) => {
    if (disposed) {
      return;
    }
    status = nextStatus;
    notify();
  };

  const updateSourceStateSnapshot = (state: MediabunnySourceState) => {
    if (disposed) {
      return;
    }
    const nextSnapshot = new Map(sourceStateSnapshot);
    nextSnapshot.set(state.sourceId, state);
    sourceStateSnapshot = nextSnapshot;
  };

  const setSourceState = (state: MediabunnySourceState) => {
    updateSourceStateSnapshot(state);
    notify();
  };

  const updateMasterGain = () => {
    if (masterGainNode !== null) {
      masterGainNode.gain.value = muted ? 0 : volume;
    }
  };

  const getTransportClockTime = () => {
    if (
      transportPlaying &&
      audioContext !== null &&
      transportAudioContextStartTime !== null &&
      transportAudioClockReady &&
      audioContext.state === 'running'
    ) {
      return (
        transportTimelineTimeAtStart +
        (audioContext.currentTime - transportAudioContextStartTime) * currentPlaybackRate
      );
    }

    if (transportPlaying && transportWallClockStartTime !== null) {
      return (
        transportTimelineTimeAtStart +
        (performance.now() / 1000 - transportWallClockStartTime) * currentPlaybackRate
      );
    }

    return transportTimelineTimeAtStart;
  };

  const setTransportClock = (timelineSeconds: number, playbackRate: number, playing: boolean) => {
    transportTimelineTimeAtStart = timelineSeconds;
    transportAudioContextStartTime =
      masterGainNode !== null ? (audioContext?.currentTime ?? null) : null;
    transportAudioClockReady = masterGainNode !== null && audioContext?.state === 'running';
    transportWallClockStartTime = playing ? performance.now() / 1000 : null;
    transportPlaying = playing;
    currentPlaybackRate = playbackRate;
  };

  const ensureAudioRuntime = (notifyChange = true) => {
    if (disposed) {
      return null;
    }
    if (masterGainNode !== null && audioContext !== null) {
      return { context: audioContext, gainNode: masterGainNode };
    }
    const AudioContextCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor === undefined) {
      audioStatus = {
        state: 'degraded',
        error: new Error('This browser does not expose AudioContext.'),
      };
      if (notifyChange) {
        notify();
      }
      return null;
    }
    if (audioContext === null) {
      audioContext = new AudioContextCtor();
      ownsAudioContext = true;
    }
    masterGainNode = audioContext.createGain();
    updateMasterGain();
    masterGainNode.connect(options.audio?.destination ?? audioContext.destination);
    audioStatus = { state: audioContext.state === 'running' ? 'running' : 'suspended' };
    if (notifyChange) {
      notify();
    }
    return { context: audioContext, gainNode: masterGainNode };
  };

  const getController = (activeClip: ActiveClip | undefined) => {
    if (activeClip === undefined) {
      return undefined;
    }

    return controllers.get(activeClip.clip.sourceId);
  };

  const setAllClocks = (timelineSeconds: number, playbackRate: number, playing: boolean) => {
    for (const controller of controllers.values()) {
      setTimelineClock(controller, timelineSeconds, playbackRate);
      controller.playing = playing;
    }
  };

  const activatePendingAudioClock = () => {
    if (pendingAudioActivationRate === null || masterGainNode === null || audioContext === null) {
      return;
    }
    if (audioContext.state === 'running') {
      const timelineSeconds = getTransportClockTime();
      pendingAudioActivationRate = null;
      setTransportClock(timelineSeconds, currentPlaybackRate, transportPlaying);
      setAllClocks(timelineSeconds, currentPlaybackRate, transportPlaying);
      audioStatus = { state: 'running' };
      notify();
      return;
    }
    if (audioContext.state !== 'suspended') {
      pendingAudioActivationRate = null;
      audioStatus = {
        state: 'degraded',
        error: new Error(`AudioContext cannot be activated from state "${audioContext.state}".`),
      };
      notify();
      return;
    }

    const context = audioContext;
    const generation = ++activationGeneration;
    if (activationTimer !== null) {
      window.clearTimeout(activationTimer);
    }
    activationTimer = window.setTimeout(() => {
      if (generation !== activationGeneration || context.state === 'running') {
        return;
      }
      pendingAudioActivationRate = null;
      audioStatus = { state: 'degraded', error: null };
      notify();
    }, options.audio?.activationTimeoutMs ?? 1000);
    void context.resume().then(
      () => {
        if (generation !== activationGeneration || disposed) {
          return;
        }
        if (activationTimer !== null) {
          window.clearTimeout(activationTimer);
        }
        activationTimer = null;
        pendingAudioActivationRate = null;
        const timelineSeconds = getTransportClockTime();
        for (const controller of controllers.values()) {
          stopAudioIterator(controller);
          stopQueuedAudio(controller);
          controller.activeAudioSyncKey = undefined;
        }
        setTransportClock(timelineSeconds, currentPlaybackRate, transportPlaying);
        setAllClocks(timelineSeconds, currentPlaybackRate, transportPlaying);
        audioStatus = { state: 'running' };
        notify();
      },
      (activationError: unknown) => {
        if (generation !== activationGeneration || disposed) {
          return;
        }
        if (activationTimer !== null) {
          window.clearTimeout(activationTimer);
        }
        activationTimer = null;
        pendingAudioActivationRate = null;
        audioStatus = {
          state: 'degraded',
          error:
            activationError instanceof Error ? activationError : new Error(String(activationError)),
        };
        notify();
      }
    );
  };

  const clearVideoSurface = () => {
    if (canvas !== null) {
      const context = canvas.getContext('2d');
      if (context !== null) {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    setLastFrameTime(null);
  };

  const clearVideo = () => {
    if (disposed) {
      return;
    }
    invalidateOutputOperations();
    activeVisualClip = undefined;
    clearVideoSurface();
  };

  const renderVideoForOperation = async (
    activeVideo: ActiveClip,
    _timelineTime: RationalTime,
    outputToken: MediabunnyOutputOperationToken
  ) => {
    assertAdapterActive();
    if (!isCurrentOutputOperation(outputToken)) {
      return;
    }
    const controller = getController(activeVideo);
    if (controller === undefined || canvas === null) {
      return;
    }

    const targetCanvas = canvas;
    try {
      await renderActiveVideoFrame(
        controller,
        targetCanvas,
        activeVideo,
        () =>
          isCurrentOutputOperation(outputToken) &&
          controllers.get(controller.sourceId) === controller,
        (timestamp) => {
          if (
            !isCurrentOutputOperation(outputToken) ||
            controllers.get(controller.sourceId) !== controller
          ) {
            return;
          }
          controller.lastRenderedVideoTimestamp = timestamp;
          setLastFrameTime(toLogicalSourceSeconds(controller, timestamp));
        }
      );
      if (
        !isCurrentOutputOperation(outputToken) ||
        controllers.get(controller.sourceId) !== controller
      ) {
        return;
      }
    } catch (renderError) {
      if (
        !isCurrentOutputOperation(outputToken) ||
        controllers.get(controller.sourceId) !== controller
      ) {
        return;
      }
      const error = renderError instanceof Error ? renderError : new Error(String(renderError));
      void recoverSource(controller.sourceId, controller, error);
      throw error;
    }
  };

  const renderVideo = async (activeVideo: ActiveClip, timelineTime: RationalTime) => {
    assertAdapterActive();
    const outputToken = beginOutputOperation([activeVideo.clip.sourceId]);
    try {
      await renderVideoForOperation(activeVideo, timelineTime, outputToken);
      if (!isCurrentOutputOperation(outputToken)) {
        return;
      }
    } finally {
      completeOutputOperation(outputToken);
    }
  };

  const syncAudio = (activeAudio: ActiveClip | undefined) => {
    assertAdapterActive();
    const controller = getController(activeAudio);
    if (controller === undefined) {
      for (const sourceController of controllers.values()) {
        syncAudioClip(sourceController, undefined);
      }
      return;
    }

    syncAudioClip(controller, activeAudio, (audioError) => {
      void recoverSource(controller.sourceId, controller, audioError);
    });
  };

  const findActiveClipForKinds = (
    activeLayers: ActiveLayerResult<string>,
    trackKinds: ReadonlySet<string>
  ) => activeLayers.all.find((activeClip) => trackKinds.has(activeClip.track.kind));

  const stopInactiveControllerOutputs = async (
    activeVisual: ActiveClip | undefined,
    activeAudio: ActiveClip | undefined
  ) => {
    const activeVideoController = getController(activeVisual);
    const activeAudioController = getController(activeAudio);
    const videoCancellations: Promise<void>[] = [];

    for (const controller of controllers.values()) {
      if (controller !== activeAudioController) {
        stopControllerAudio(controller);
      }
      if (controller !== activeVideoController) {
        videoCancellations.push(cancelVideoPlayback(controller));
      }
    }

    await Promise.all(videoCancellations);
  };

  const shouldSyncAudio = (
    reason: TimelineMediaSyncReason,
    activeAudio: ActiveClip | undefined
  ) => {
    if (reason !== 'tick') {
      return true;
    }

    if (activeAudio === undefined) {
      return [...controllers.values()].some(
        (controller) => controller.activeAudioSyncKey !== undefined
      );
    }

    const controller = getController(activeAudio);
    return controller?.activeAudioSyncKey !== activeAudio.syncKey;
  };

  const discardPendingSourceReplacement = (sourceId: string) => {
    const operation = getSourceOperation(sourceId);
    const replacement = operation.replacement;
    if (replacement?.candidate !== null && replacement?.candidate !== undefined) {
      disposeController(replacement.candidate);
    }
    operation.replacement = null;
  };

  const commitLoadedController = (
    candidate: MediabunnySourceController,
    readyState: MediabunnySourceState,
    notifyReady: boolean
  ): boolean => {
    if (disposed) {
      disposeController(candidate);
      return false;
    }
    const previous = controllers.get(candidate.sourceId);
    const timelineSeconds = getTransportClockTime();
    if (previous !== undefined) {
      disposeController(previous);
    }
    controllers.set(candidate.sourceId, candidate);
    setTimelineClock(candidate, timelineSeconds, currentPlaybackRate);
    candidate.playing = transportPlaying;
    if (disposed) {
      return false;
    }
    error = null;
    status = 'Ready. Mediabunny can drive timeline video and audio.';
    if (notifyReady) {
      setSourceState(readyState);
    } else {
      updateSourceStateSnapshot(readyState);
    }
    if (candidate.audioSink !== null) {
      activatePendingAudioClock();
    }
    return !disposed;
  };

  const loadSource = async (
    source: MediabunnySource,
    loadOptions: MediabunnySourceLoadOptions
  ): Promise<TimelineMediaSourceOperationResult> => {
    const {
      status: loadStatus,
      token,
      startIndex = 0,
      previousAttempts = [],
      replacement,
    } = loadOptions;
    const inputs = [source.input, ...(source.fallbacks ?? [])];
    const isCurrentLoad = () => isCurrentSourceLoad(token);
    if (!isCurrentLoad()) {
      return createSupersededSourceLoadResult(source.sourceId);
    }
    setSourceState({
      sourceId: source.sourceId,
      status: loadStatus,
      selectedInputIndex: null,
      attempts: previousAttempts,
      metadata: null,
      error: null,
    });

    const modulePromise = getMediabunny();
    let mediabunny: MediabunnyModule;
    try {
      mediabunny = await modulePromise;
    } catch (moduleError: unknown) {
      if (mediabunnyPromise === modulePromise) {
        mediabunnyPromise = null;
      }
      const loadError = moduleError instanceof Error ? moduleError : new Error(String(moduleError));
      if (!isCurrentLoad()) {
        return createSupersededSourceLoadResult(source.sourceId);
      }
      if (replacement === undefined) {
        error = loadError;
        status = loadError.message;
        setSourceState({
          sourceId: source.sourceId,
          status: 'failed',
          selectedInputIndex: null,
          attempts: previousAttempts,
          metadata: null,
          error: loadError,
        });
      }
      return {
        ok: false,
        sourceId: source.sourceId,
        reason: 'load-failed',
        error: loadError,
      };
    }
    if (!isCurrentLoad()) {
      return createSupersededSourceLoadResult(source.sourceId);
    }
    const attempts = [...previousAttempts];
    let finalError = new Error(
      `No remaining inputs are available for source "${source.sourceId}".`
    );

    for (let inputIndex = startIndex; inputIndex < inputs.length; inputIndex += 1) {
      const sourceInput = inputs[inputIndex];
      if (sourceInput === undefined) {
        continue;
      }
      const candidate = createController(source.sourceId, inputIndex, source.timing);
      try {
        const loaded = await loadMediabunnySourceController(
          candidate,
          mediabunny,
          source,
          sourceInput,
          options.selectTracks,
          ensureAudioRuntime,
          isCurrentLoad,
          replacement !== undefined
        );
        if (!isCurrentLoad()) {
          disposeController(candidate);
          return createSupersededSourceLoadResult(source.sourceId);
        }

        attempts.push({ inputIndex, status: 'ready', error: null });
        const readyState: MediabunnySourceState = {
          sourceId: source.sourceId,
          status: 'ready',
          selectedInputIndex: inputIndex,
          attempts,
          metadata: loaded.metadata,
          error: null,
        };
        if (replacement !== undefined) {
          replacement.candidate = candidate;
          replacement.readyState = readyState;
        } else if (!commitLoadedController(candidate, readyState, true)) {
          return createSupersededSourceLoadResult(source.sourceId);
        }
        return {
          ok: true,
          sourceId: source.sourceId,
          state: 'ready',
        };
      } catch (sourceError) {
        disposeController(candidate);
        if (!isCurrentLoad()) {
          return createSupersededSourceLoadResult(source.sourceId);
        }
        finalError = sourceError instanceof Error ? sourceError : new Error(String(sourceError));
        attempts.push({
          inputIndex,
          status: 'failed',
          error: finalError,
        });
      }
    }

    if (!isCurrentLoad()) {
      return createSupersededSourceLoadResult(source.sourceId);
    }

    const previous = controllers.get(source.sourceId);
    if (loadStatus === 'recovering' && previous !== undefined) {
      disposeController(previous);
      controllers.delete(source.sourceId);
    }
    if (replacement === undefined) {
      error = finalError;
      status = finalError.message;
      setSourceState({
        sourceId: source.sourceId,
        status: 'failed',
        selectedInputIndex: null,
        attempts,
        metadata: null,
        error: finalError,
      });
    }
    return {
      ok: false,
      sourceId: source.sourceId,
      reason: 'load-failed',
      error: finalError,
    };
  };

  const ensureSource = (sourceId: string): Promise<TimelineMediaSourceOperationResult> => {
    const operation = sourceOperations.get(sourceId);
    const activeRecovery = operation?.recovery;
    if (activeRecovery?.promise !== null && activeRecovery?.promise !== undefined) {
      return activeRecovery.promise;
    }
    const activeReplacement = operation?.replacement ?? null;
    if (activeReplacement !== null) {
      if (controllers.has(sourceId) && activeReplacement.deferredRecovery === null) {
        return Promise.resolve({ ok: true, sourceId, state: 'ready' });
      }
      if (activeReplacement.promise === null) {
        return Promise.resolve().then(() => ensureSource(sourceId));
      }
      return activeReplacement.promise.then((result) => {
        if (result.ok || !sourceDefinitions.has(sourceId)) {
          return result;
        }
        return ensureSource(sourceId);
      });
    }
    const source = sourceDefinitions.get(sourceId);
    if (source === undefined) {
      return Promise.resolve({
        ok: false,
        sourceId,
        reason: 'unknown-source',
        error: new Error(`Unknown source "${sourceId}".`),
      });
    }
    const sourceOperation = operation ?? getSourceOperation(sourceId);
    if (controllers.has(sourceId)) {
      return Promise.resolve({ ok: true, sourceId, state: 'ready' });
    }
    const existingPromise = sourceOperation.preloadPromise;
    if (existingPromise !== null) {
      return existingPromise;
    }

    sourceOperation.recovery = null;
    const token = beginSourceLoad(sourceId);
    const loadPromise = loadSource(source, { status: 'loading', token }).finally(() => {
      if (sourceOperation.preloadPromise === loadPromise) {
        sourceOperation.preloadPromise = null;
      }
    });
    sourceOperation.preloadPromise = loadPromise;
    return loadPromise;
  };

  const ensureActiveSources = async (
    activeVisual: ActiveClip | undefined,
    activeAudio: ActiveClip | undefined,
    outputToken: MediabunnyOutputOperationToken
  ): Promise<readonly MediabunnySourceLoadToken[] | null> => {
    const requestedSourceIds = new Set<string>();
    for (const activeClip of [activeVisual, activeAudio]) {
      if (activeClip !== undefined) {
        requestedSourceIds.add(activeClip.clip.sourceId);
      }
    }

    const requestTokens = [...requestedSourceIds];
    const sourceResults = await Promise.all(
      requestTokens.map(async (sourceId) => {
        while (true) {
          if (!isCurrentOutputOperation(outputToken)) {
            return false;
          }
          const result = await ensureSource(sourceId);
          if (!isCurrentOutputOperation(outputToken)) {
            return false;
          }
          if (result.ok) {
            return true;
          }
          if (isSupersededSourceLoadResult(result) && sourceDefinitions.has(sourceId)) {
            continue;
          }
          throw result.error;
        }
      })
    );
    if (sourceResults.some((sourceReady) => !sourceReady)) {
      return null;
    }

    return requestTokens.map((sourceId) => ({
      sourceId,
      generation: getSourceOperation(sourceId).generation,
    }));
  };

  const queuePausedActiveVisualRefresh = (
    sourceIds: ReadonlySet<string>,
    supersedeInFlight = true
  ) => {
    const expectedVisual = activeVisualClip;
    if (
      transportPlaying ||
      canvas === null ||
      expectedVisual === undefined ||
      !sourceIds.has(expectedVisual.clip.sourceId)
    ) {
      return;
    }
    if (!supersedeInFlight && outputOperationsInFlight.has(outputGeneration)) {
      return;
    }

    const sourceId = expectedVisual.clip.sourceId;
    const outputToken = beginOutputOperation([sourceId]);
    void (async () => {
      try {
        while (true) {
          if (
            disposed ||
            transportPlaying ||
            activeVisualClip !== expectedVisual ||
            !isCurrentOutputOperation(outputToken) ||
            !sourceDefinitions.has(sourceId)
          ) {
            return;
          }

          const result = await ensureSource(sourceId);
          if (result.ok) {
            break;
          }
          if (!isSupersededSourceLoadResult(result) || !sourceDefinitions.has(sourceId)) {
            return;
          }
        }

        const ownership: readonly MediabunnySourceLoadToken[] = [
          {
            sourceId,
            generation: getSourceOperation(sourceId).generation,
          },
        ];
        const controller = controllers.get(sourceId);
        if (
          controller === undefined ||
          transportPlaying ||
          activeVisualClip !== expectedVisual ||
          !isCurrentActiveSourceOwnership(outputToken, ownership)
        ) {
          return;
        }

        await cancelVideoPlayback(controller);
        if (
          transportPlaying ||
          activeVisualClip !== expectedVisual ||
          !isCurrentActiveSourceOwnership(outputToken, ownership)
        ) {
          return;
        }
        await renderVideoForOperation(expectedVisual, expectedVisual.timelineTime, outputToken);
      } finally {
        completeOutputOperation(outputToken);
      }
    })().catch(() => {
      // Source loads publish their failures and renderVideo owns runtime recovery.
    });
  };

  const recoverSource = (
    sourceId: string,
    expectedController: MediabunnySourceController,
    recoveryError: Error
  ): Promise<TimelineMediaSourceOperationResult> => {
    const source = sourceDefinitions.get(sourceId);
    const controller = controllers.get(sourceId);
    const operation = getSourceOperation(sourceId);
    const activeRecovery = operation.recovery;
    if (activeRecovery?.promise !== null && activeRecovery?.promise !== undefined) {
      return activeRecovery.promise;
    }
    if (source === undefined || controller !== expectedController || disposed) {
      return Promise.resolve(createSupersededSourceLoadResult(sourceId));
    }
    const recovery: PendingSourceRecovery = {
      controller: expectedController,
      error: recoveryError,
      previousState: sourceStateSnapshot.get(sourceId),
      promise: null,
    };
    const pendingReplacement = operation.replacement;
    if (pendingReplacement !== null) {
      pendingReplacement.deferredRecovery ??= recovery;
      return Promise.resolve(createSupersededSourceLoadResult(sourceId));
    }
    operation.recovery = recovery;
    stopMediaClock(controller);
    const attempts = [
      ...(recovery.previousState?.attempts ?? []),
      {
        inputIndex: controller.inputIndex,
        status: 'failed',
        error: recoveryError,
      } as const,
    ];
    const token = beginSourceLoad(sourceId);
    const recoveryPromise = (async () => {
      try {
        const result = await loadSource(source, {
          status: 'recovering',
          token,
          startIndex: controller.inputIndex + 1,
          previousAttempts: attempts,
        });
        if (result.ok && isCurrentSourceLoad(token)) {
          queuePausedActiveVisualRefresh(new Set([sourceId]), false);
        }
        return result;
      } finally {
        if (operation.recovery === recovery) {
          operation.recovery = null;
        }
      }
    })();
    recovery.promise = recoveryPromise;
    return recoveryPromise;
  };

  const syncLayers = async ({
    activeLayers,
    reason,
    timelineTime,
  }: TimelineLayerSyncDetails<string>) => {
    assertAdapterActive();
    const activeVisual = findActiveClipForKinds(activeLayers, visualTrackKinds);
    const activeAudio = findActiveClipForKinds(activeLayers, audioTrackKinds);
    const outputToken = beginOutputOperation(
      [activeVisual, activeAudio]
        .filter((activeClip): activeClip is ActiveClip => activeClip !== undefined)
        .map((activeClip) => activeClip.clip.sourceId)
    );
    try {
      const sourceOwnership = await ensureActiveSources(activeVisual, activeAudio, outputToken);
      if (
        sourceOwnership === null ||
        !isCurrentActiveSourceOwnership(outputToken, sourceOwnership)
      ) {
        return;
      }

      for (const activeClip of [activeVisual, activeAudio]) {
        if (activeClip === undefined) {
          continue;
        }
        const sourceState = sourceStateSnapshot.get(activeClip.clip.sourceId);
        if (sourceState?.status === 'failed' && sourceState.error !== null) {
          throw sourceState.error;
        }
      }

      await stopInactiveControllerOutputs(activeVisual, activeAudio);
      if (!isCurrentActiveSourceOwnership(outputToken, sourceOwnership)) {
        return;
      }
      const pausedRateSynchronization = reason === 'rate' && !transportPlaying;

      if (activeVisual !== undefined) {
        activeVisualClip = activeVisual;
        const controller = getController(activeVisual);
        if (
          controller !== undefined &&
          canvas !== null &&
          !pausedRateSynchronization &&
          (reason === 'play' || reason === 'tick' || reason === 'rate')
        ) {
          syncActiveVideoPlaybackFrame(
            controller,
            canvas,
            activeVisual,
            () => isCurrentActiveSourceOwnership(outputToken, sourceOwnership),
            (timestamp) => {
              if (isCurrentActiveSourceOwnership(outputToken, sourceOwnership)) {
                setLastFrameTime(toLogicalSourceSeconds(controller, timestamp));
              }
            },
            (playbackError) => {
              if (isCurrentActiveSourceOwnership(outputToken, sourceOwnership)) {
                void recoverSource(controller.sourceId, controller, playbackError);
              }
            }
          );
        } else {
          if (controller !== undefined) {
            await cancelVideoPlayback(controller);
            if (!isCurrentActiveSourceOwnership(outputToken, sourceOwnership)) {
              return;
            }
          }
          await renderVideoForOperation(activeVisual, timelineTime, outputToken);
          if (!isCurrentActiveSourceOwnership(outputToken, sourceOwnership)) {
            return;
          }
        }
      } else {
        activeVisualClip = undefined;
        clearVideoSurface();
      }

      if (reason === 'pause' || reason === 'gap' || pausedRateSynchronization) {
        for (const controller of controllers.values()) {
          stopControllerAudio(controller);
        }
      } else if (shouldSyncAudio(reason, activeAudio)) {
        syncAudio(activeAudio);
      }

      if (!isCurrentActiveSourceOwnership(outputToken, sourceOwnership)) {
        return;
      }
      activeSourceIds.clear();
      for (const activeClip of [activeVisual, activeAudio]) {
        if (activeClip !== undefined) {
          activeSourceIds.add(activeClip.clip.sourceId);
        }
      }
    } finally {
      completeOutputOperation(outputToken);
    }
  };

  const invalidateSourceLoad = (sourceId: string) => {
    const operation = getSourceOperation(sourceId);
    operation.generation += 1;
    operation.preloadPromise = null;
    operation.recovery = null;
    discardPendingSourceReplacement(sourceId);
  };

  const releaseSource = (sourceId: string, invalidateActiveRequests = false) => {
    if (invalidateActiveRequests || activeSourceIds.has(sourceId)) {
      invalidateOutputOperations(new Set([sourceId]));
    }
    invalidateSourceLoad(sourceId);
    const controller = controllers.get(sourceId);
    if (controller !== undefined) {
      if (activeSourceIds.has(sourceId) && canvas !== null) {
        clearPreviewCanvas(controller, canvas);
        setLastFrameTime(null);
      }
      disposeController(controller);
      controllers.delete(sourceId);
    }
  };

  const discardCurrentController = (
    sourceId: string,
    expectedController: MediabunnySourceController
  ) => {
    if (controllers.get(sourceId) !== expectedController) {
      return;
    }
    disposeController(expectedController);
    controllers.delete(sourceId);
  };

  const reconcileSources = (nextSources: readonly MediabunnySource[]) => {
    assertAdapterActive();
    validateSources(nextSources);
    const nextDefinitions = new Map(nextSources.map((source) => [source.sourceId, source]));
    const supersededReplacements = new Map<string, PendingSourceReplacement>();
    for (const [sourceId, operation] of sourceOperations) {
      if (operation.replacement !== null) {
        supersededReplacements.set(sourceId, operation.replacement);
      }
    }
    const changedSourceIds = new Set<string>();
    for (const [sourceId, source] of sourceDefinitions) {
      const nextSource = nextDefinitions.get(sourceId);
      if (nextSource === undefined || !areMediabunnySourcesEqual(source, nextSource)) {
        changedSourceIds.add(sourceId);
      }
    }
    for (const sourceId of nextDefinitions.keys()) {
      if (!sourceDefinitions.has(sourceId)) {
        changedSourceIds.add(sourceId);
      }
    }
    if (
      changedSourceIds.size === 0 &&
      sourceDefinitions.size === nextDefinitions.size &&
      supersededReplacements.size === 0
    ) {
      return;
    }
    invalidateOutputOperations(changedSourceIds);

    for (const sourceId of supersededReplacements.keys()) {
      invalidateSourceLoad(sourceId);
    }

    for (const sourceId of changedSourceIds) {
      releaseSource(sourceId, !nextDefinitions.has(sourceId));
    }
    sourceDefinitions.clear();
    for (const [sourceId, source] of nextDefinitions) {
      sourceDefinitions.set(sourceId, source);
    }
    sourceStateSnapshot = new Map(
      nextSources.map((source) => {
        const previousState = sourceStateSnapshot.get(source.sourceId);
        const replacementState = supersededReplacements.get(source.sourceId)?.previousState;
        return [
          source.sourceId,
          changedSourceIds.has(source.sourceId)
            ? createIdleSourceState(source.sourceId)
            : (replacementState ?? previousState ?? createIdleSourceState(source.sourceId)),
        ];
      })
    );
    ready = nextSources.length > 0;
    error = null;
    status = ready
      ? 'Sources registered. Mediabunny loads active media on demand.'
      : 'No Mediabunny sources are configured.';
    notify();
    queuePausedActiveVisualRefresh(changedSourceIds);
  };

  const adapter: MediabunnyAdapter = {
    get ready() {
      return ready;
    },
    get status() {
      return status;
    },
    get error() {
      return error;
    },
    get lastFrameTime() {
      return lastFrameTime;
    },
    get sourceStateById() {
      return sourceStateSnapshot;
    },
    get volume() {
      return volume;
    },
    get muted() {
      return muted;
    },
    get audioStatus() {
      return audioStatus;
    },
    subscribeFrame: (listener) => {
      assertAdapterActive();
      frameListeners.add(listener);
      return () => {
        frameListeners.delete(listener);
      };
    },
    setCanvas: (nextCanvas) => {
      assertAdapterActive();
      if (canvas === nextCanvas) {
        return;
      }
      invalidateOutputOperations();
      canvas = nextCanvas;
      if (canvas !== null && !transportPlaying && activeVisualClip !== undefined) {
        void renderVideo(activeVisualClip, activeVisualClip.timelineTime).catch(() => {
          // renderVideo owns recovery; canvas replacement is a best-effort refresh.
        });
      }
    },
    getClockTime: getTransportClockTime,
    startClock: (timelineTime, playbackRate) => {
      assertAdapterActive();
      if (
        !ready ||
        activeSourceIds.size === 0 ||
        [...activeSourceIds].some((sourceId) => !controllers.has(sourceId))
      ) {
        return false;
      }

      setTransportClock(toSeconds(timelineTime), playbackRate, true);
      setAllClocks(toSeconds(timelineTime), playbackRate, true);
      return true;
    },
    stopClock: () => {
      if (disposed) {
        return;
      }
      const timelineSeconds = getTransportClockTime();
      setTransportClock(timelineSeconds, currentPlaybackRate, false);
      pendingAudioActivationRate = null;
      activationGeneration += 1;
      if (activationTimer !== null) {
        window.clearTimeout(activationTimer);
        activationTimer = null;
      }
      for (const controller of controllers.values()) {
        stopMediaClock(controller);
      }
    },
    requestClockActivation: (playbackRate) => {
      assertAdapterActive();
      pendingAudioActivationRate = playbackRate;
      activatePendingAudioClock();
    },
    setVolume: (nextVolume) => {
      assertAdapterActive();
      assertValidMediabunnyVolume(nextVolume);
      volume = nextVolume;
      updateMasterGain();
      notify();
    },
    setMuted: (nextMuted) => {
      assertAdapterActive();
      muted = nextMuted;
      updateMasterGain();
      notify();
    },
    setSources: reconcileSources,
    preloadSource: async (sourceId) => {
      assertAdapterActive();
      const result = await ensureSource(sourceId);
      if (result.ok) {
        queuePausedActiveVisualRefresh(new Set([sourceId]), false);
      }
      return result;
    },
    unloadSource: (sourceId) => {
      assertAdapterActive();
      if (!sourceDefinitions.has(sourceId)) {
        return false;
      }
      releaseSource(sourceId, true);
      status = 'Source unloaded. It will reload when active or explicitly preloaded.';
      setSourceState(createIdleSourceState(sourceId));
      return true;
    },
    retrySource: async (sourceId) => {
      assertAdapterActive();
      const source = sourceDefinitions.get(sourceId);
      if (source === undefined) {
        return {
          ok: false,
          sourceId,
          reason: 'unknown-source',
          error: new Error(`Unknown source "${sourceId}".`),
        };
      }
      invalidateOutputOperations(new Set([sourceId]));
      const operation = getSourceOperation(sourceId);
      const pendingReplacement = operation.replacement;
      const recovery = operation.recovery ?? pendingReplacement?.deferredRecovery ?? null;
      operation.recovery = null;
      discardPendingSourceReplacement(sourceId);
      const previousState =
        recovery?.previousState ??
        pendingReplacement?.previousState ??
        sourceStateSnapshot.get(sourceId);
      const previousController = controllers.get(sourceId);
      const previousStatus = status;
      const previousError = error;
      const token = beginSourceLoad(sourceId);
      const result = await loadSource(source, { status: 'loading', token });
      if (!isCurrentSourceLoad(token)) {
        return createSupersededSourceLoadResult(sourceId);
      }
      if (!result.ok && previousController !== undefined) {
        if (recovery !== null) {
          discardCurrentController(sourceId, previousController);
        } else if (previousState !== undefined) {
          status = previousStatus;
          error = previousError;
          setSourceState(previousState);
        }
      }
      if (result.ok) {
        queuePausedActiveVisualRefresh(new Set([sourceId]));
      }
      return result;
    },
    replaceSource: async (source) => {
      assertAdapterActive();
      try {
        validateSources([source]);
      } catch (sourceError) {
        return {
          ok: false,
          sourceId: source.sourceId,
          reason: 'invalid-source',
          error: sourceError instanceof Error ? sourceError : new Error(String(sourceError)),
        } as const;
      }
      invalidateOutputOperations(new Set([source.sourceId]));
      const operation = getSourceOperation(source.sourceId);
      const previousReplacement = operation.replacement;
      const activeRecovery = operation.recovery;
      operation.recovery = null;
      const replacement: PendingSourceReplacement = {
        previousState:
          previousReplacement?.previousState ?? sourceStateSnapshot.get(source.sourceId),
        candidate: null,
        readyState: null,
        deferredRecovery: previousReplacement?.deferredRecovery ?? activeRecovery,
        promise: null,
      };
      discardPendingSourceReplacement(source.sourceId);
      operation.replacement = replacement;
      const token = beginSourceLoad(source.sourceId);
      const replacementPromise = (async (): Promise<TimelineMediaSourceOperationResult> => {
        try {
          const result = await loadSource(source, {
            status: 'loading',
            token,
            replacement,
          });
          if (!isCurrentSourceLoad(token) || operation.replacement !== replacement) {
            return createSupersededSourceLoadResult(source.sourceId);
          }
          if (result.ok) {
            if (replacement.candidate === null || replacement.readyState === null) {
              operation.replacement = null;
              return {
                ok: false,
                sourceId: source.sourceId,
                reason: 'load-failed',
                error: new Error(
                  `Replacement source "${source.sourceId}" did not produce a controller.`
                ),
              };
            }
            if (replacement.candidate.audioSink !== null) {
              const audioRuntime = ensureAudioRuntime(false);
              if (audioRuntime === null) {
                replacement.candidate.audioSink = null;
              } else {
                replacement.candidate.audioContext = audioRuntime.context;
                replacement.candidate.gainNode = audioRuntime.gainNode;
              }
            }
            if (!isCurrentSourceLoad(token) || operation.replacement !== replacement) {
              return createSupersededSourceLoadResult(source.sourceId);
            }
            operation.replacement = null;
            if (!commitLoadedController(replacement.candidate, replacement.readyState, false)) {
              return createSupersededSourceLoadResult(source.sourceId);
            }
            sourceDefinitions.set(source.sourceId, source);
            ready = true;
            notify();
            queuePausedActiveVisualRefresh(new Set([source.sourceId]));
          } else {
            operation.replacement = null;
            const nextSnapshot = new Map(sourceStateSnapshot);
            if (replacement.previousState === undefined) {
              nextSnapshot.delete(source.sourceId);
            } else {
              nextSnapshot.set(source.sourceId, replacement.previousState);
            }
            sourceStateSnapshot = nextSnapshot;
            notify();
            const deferredRecovery = replacement.deferredRecovery;
            if (
              deferredRecovery !== null &&
              controllers.get(source.sourceId) === deferredRecovery.controller &&
              sourceDefinitions.has(source.sourceId)
            ) {
              void recoverSource(
                source.sourceId,
                deferredRecovery.controller,
                deferredRecovery.error
              );
            }
          }
          return result;
        } finally {
          if (operation.replacement === replacement) {
            discardPendingSourceReplacement(source.sourceId);
          }
        }
      })();
      replacement.promise = replacementPromise;
      return replacementPromise;
    },
    setClockRate: (playbackRate) => {
      assertAdapterActive();
      const timelineSeconds = getTransportClockTime();
      if (pendingAudioActivationRate !== null) {
        pendingAudioActivationRate = playbackRate;
      }
      setTransportClock(timelineSeconds, playbackRate, transportPlaying);
      setAllClocks(timelineSeconds, playbackRate, transportPlaying);
    },
    seek: async (timelineTime, activeLayers) => {
      assertAdapterActive();
      if (!ready) {
        return;
      }

      const activeVisual = findActiveClipForKinds(activeLayers, visualTrackKinds);
      const activeAudio = findActiveClipForKinds(activeLayers, audioTrackKinds);
      const outputToken = beginOutputOperation(
        [activeVisual, activeAudio]
          .filter((activeClip): activeClip is ActiveClip => activeClip !== undefined)
          .map((activeClip) => activeClip.clip.sourceId)
      );
      try {
        const sourceOwnership = await ensureActiveSources(activeVisual, activeAudio, outputToken);
        if (
          sourceOwnership === null ||
          !isCurrentActiveSourceOwnership(outputToken, sourceOwnership)
        ) {
          return;
        }

        for (const controller of controllers.values()) {
          stopControllerAudio(controller);
        }
        await Promise.all([...controllers.values()].map(cancelVideoPlayback));
        if (!isCurrentActiveSourceOwnership(outputToken, sourceOwnership)) {
          return;
        }
        setTransportClock(toSeconds(timelineTime), currentPlaybackRate, false);
        setAllClocks(toSeconds(timelineTime), currentPlaybackRate, false);
        if (activeVisual !== undefined) {
          activeVisualClip = activeVisual;
          await renderVideoForOperation(activeVisual, timelineTime, outputToken);
          if (!isCurrentActiveSourceOwnership(outputToken, sourceOwnership)) {
            return;
          }
        } else {
          activeVisualClip = undefined;
          clearVideoSurface();
        }

        if (activeVisual === undefined) {
          setStatus(
            activeAudio ? 'Audio-only region at playhead.' : 'No active content at playhead.'
          );
        } else {
          setStatus(
            activeAudio
              ? 'Ready. Visuals and audio are mapped from separate timeline clips.'
              : 'Ready. Visual content is active; audio starts at its own clip offset.'
          );
        }

        if (!isCurrentActiveSourceOwnership(outputToken, sourceOwnership)) {
          return;
        }
        activeSourceIds.clear();
        for (const activeClip of [activeVisual, activeAudio]) {
          if (activeClip !== undefined) {
            activeSourceIds.add(activeClip.clip.sourceId);
          }
        }
      } finally {
        completeOutputOperation(outputToken);
      }
    },
    renderVideo,
    syncAudio,
    syncLayers,
    onStatus: (playbackStatus) => {
      if (playbackStatus === 'playing') {
        setStatus('Mediabunny is driving timeline media playback.');
      } else if (playbackStatus === 'content-gap') {
        setStatus('Reached the next content gap.');
      } else if (playbackStatus === 'paused') {
        setStatus('Paused. Timeline edits seek Mediabunny frames.');
      }
    },
    clearVideo,
    getFrame: async (activeVideo) => {
      assertAdapterActive();
      const controller = getController(activeVideo);
      if (controller === undefined || controller.videoSink === null) {
        return null;
      }

      let wrappedCanvas: Awaited<ReturnType<Mediabunny.CanvasSink['getCanvas']>>;
      try {
        wrappedCanvas = await controller.videoSink.getCanvas(
          toMediaSeconds(controller, toSeconds(activeVideo.sourceTime))
        );
      } catch (frameError) {
        const error = frameError instanceof Error ? frameError : new Error(String(frameError));
        void recoverSource(controller.sourceId, controller, error);
        return null;
      }
      if (
        wrappedCanvas === null ||
        disposed ||
        controllers.get(controller.sourceId) !== controller
      ) {
        return null;
      }

      return {
        canvas: wrappedCanvas.canvas,
        timestamp: toLogicalSourceSeconds(controller, wrappedCanvas.timestamp),
      };
    },
    dispose: () => {
      if (disposed) {
        return;
      }
      const terminalTimelineTime = getTransportClockTime();
      disposed = true;
      outputGeneration += 1;
      outputOperationsInFlight.clear();
      currentOutputSourceIds.clear();
      ready = false;
      status = 'Mediabunny adapter disposed.';
      error = null;
      lastFrameTime = null;
      setTransportClock(terminalTimelineTime, currentPlaybackRate, false);
      activationGeneration += 1;
      pendingAudioActivationRate = null;
      if (activationTimer !== null) {
        window.clearTimeout(activationTimer);
        activationTimer = null;
      }
      for (const controller of controllers.values()) {
        disposeController(controller);
      }
      controllers.clear();
      for (const [sourceId, operation] of sourceOperations) {
        operation.generation += 1;
        operation.preloadPromise = null;
        operation.recovery = null;
        discardPendingSourceReplacement(sourceId);
      }
      sourceStateSnapshot = new Map();
      frameListeners.clear();
      masterGainNode?.disconnect();
      if (ownsAudioContext) {
        void audioContext?.close();
      }
    },
  };

  return adapter;
}

function createController(
  sourceId: string,
  inputIndex: number,
  timing: TimelineMediaSourceTiming | undefined
): MediabunnySourceController {
  return {
    sourceId,
    inputIndex,
    mediaTimeOffsetSeconds:
      timing === undefined ? 0 : timing.mediaTimeSeconds - timing.sourceTimeSeconds,
    input: null,
    ownsInput: true,
    videoSink: null,
    audioSink: null,
    audioContext: null,
    gainNode: null,
    audioBufferIterator: null,
    queuedAudioNodes: new Set(),
    timelineTimeAtStart: 0,
    audioContextStartTime: null,
    audioClockReady: false,
    wallClockStartTime: null,
    playbackRate: 1,
    playing: false,
    activeAudioSyncKey: undefined,
    audioPlaybackGeneration: 0,
    asyncId: 0,
    renderingFrame: false,
    currentFrameRequest: undefined,
    pendingFrameRequest: undefined,
    videoPlaybackGeneration: 0,
    videoPlaybackIterator: null,
    videoPlaybackFutureFrame: null,
    videoPlaybackProcessing: false,
    videoPlaybackEnded: false,
    videoPlaybackSyncKey: undefined,
    videoPlaybackSourceSeconds: null,
    videoPlaybackTargetSeconds: null,
    videoPlaybackCanvas: null,
    videoPlaybackIsCurrent: undefined,
    videoPlaybackOnFrame: undefined,
    videoPlaybackOnFailure: undefined,
    lastRenderedVideoTimestamp: null,
  };
}

async function loadMediabunnySourceController(
  controller: MediabunnySourceController,
  mediabunny: MediabunnyModule,
  source: MediabunnySource,
  sourceInput: MediabunnySourceInput,
  selectTracks: CreateMediabunnyAdapterOptions['selectTracks'],
  ensureAudioRuntime: (notifyChange?: boolean) => {
    context: AudioContext;
    gainNode: GainNode;
  } | null,
  isCurrentLoad: () => boolean,
  deferAudioRuntime: boolean
): Promise<LoadedMediaInfo> {
  const assertCurrentLoad = () => {
    if (!isCurrentLoad()) {
      throw new SupersededSourceLoadError(source.sourceId);
    }
  };
  const input = await createInput(mediabunny, sourceInput);
  controller.input = input;
  controller.ownsInput = !isSuppliedMediabunnyInput(sourceInput);
  assertCurrentLoad();

  let videoTrack: Mediabunny.InputVideoTrack | null;
  let audioTrack: Mediabunny.InputAudioTrack | null;
  if (selectTracks === undefined) {
    [videoTrack, audioTrack] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
    ]);
  } else {
    const [videoTracks, audioTracks] = await Promise.all([
      input.getVideoTracks(),
      input.getAudioTracks(),
    ]);
    ({ videoTrack, audioTrack } = await selectTracks({
      source,
      sourceInput,
      input,
      videoTracks,
      audioTracks,
    }));
  }
  assertCurrentLoad();
  type InputTrack = NonNullable<typeof videoTrack> | NonNullable<typeof audioTrack>;
  const tracks = [videoTrack, audioTrack].filter((track): track is InputTrack => track !== null);

  if (tracks.length === 0) {
    throw new Error(`No audio or video track found for source "${source.sourceId}".`);
  }

  const firstTimestamp = await input.getFirstTimestamp(tracks);
  assertCurrentLoad();
  const presentationStartTimestamp = Math.max(firstTimestamp, 0);
  const metadataEndTimestamp = await input.getDurationFromMetadata(tracks, {
    skipLiveWait: true,
  });
  assertCurrentLoad();
  const endTimestamp =
    metadataEndTimestamp ?? (await input.computeDuration(tracks, { skipLiveWait: true }));
  assertCurrentLoad();

  if (videoTrack !== null) {
    const videoCodec = await videoTrack.getCodec();
    assertCurrentLoad();
    const videoDecodable = await videoTrack.canDecode();
    assertCurrentLoad();
    if (videoCodec === null || !videoDecodable) {
      throw new Error(`The browser cannot decode the video track for source "${source.sourceId}".`);
    }

    const alpha = await videoTrack.canBeTransparent();
    assertCurrentLoad();
    controller.videoSink = new mediabunny.CanvasSink(videoTrack, {
      poolSize: 2,
      fit: 'contain',
      alpha,
    });
  }

  let audioDecodable = false;
  if (audioTrack !== null) {
    const audioCodec = await audioTrack.getCodec();
    assertCurrentLoad();
    audioDecodable = await audioTrack.canDecode();
    assertCurrentLoad();
    audioDecodable = audioCodec !== null && audioDecodable;
  }
  if (audioTrack !== null && videoTrack === null && !audioDecodable) {
    throw new Error(`The browser cannot decode the audio track for source "${source.sourceId}".`);
  }

  const [videoMetadata, audioMetadata] = await Promise.all([
    videoTrack === null
      ? null
      : Promise.all([
          videoTrack.getDisplayWidth(),
          videoTrack.getDisplayHeight(),
          videoTrack.getRotation(),
          videoTrack.computePacketStats(100, { skipLiveWait: true }).catch(() => null),
        ]).then(([displayWidth, displayHeight, rotation, packetStats]) => ({
          displayWidth,
          displayHeight,
          rotation,
          detectedFrameRate: packetStats?.averagePacketRate || null,
        })),
    audioTrack === null || !audioDecodable
      ? null
      : audioTrack.getSampleRate().then((sampleRate) => ({ sampleRate })),
  ]);
  assertCurrentLoad();

  if (audioTrack !== null && audioDecodable) {
    assertCurrentLoad();
    controller.audioSink = new mediabunny.AudioBufferSink(audioTrack);
    if (!deferAudioRuntime) {
      const audioRuntime = ensureAudioRuntime(false);
      if (audioRuntime === null) {
        controller.audioSink = null;
      } else {
        controller.audioContext = audioRuntime.context;
        controller.gainNode = audioRuntime.gainNode;
      }
    }
  }

  return {
    metadata: {
      firstTimestampSeconds: firstTimestamp,
      sourceFirstTimestampSeconds: toLogicalSourceSeconds(controller, firstTimestamp),
      presentationStartTimestampSeconds: presentationStartTimestamp,
      endTimestampSeconds: endTimestamp,
      sourceEndTimestampSeconds: toLogicalSourceSeconds(controller, endTimestamp),
      durationSeconds: Math.max(0, endTimestamp - presentationStartTimestamp),
      video: videoMetadata,
      audio: audioMetadata,
    },
  };
}

async function createInput(
  mediabunny: MediabunnyModule,
  sourceInput: MediabunnySourceInput
): Promise<Mediabunny.Input> {
  if (isMediabunnyInputDescriptor(sourceInput) && sourceInput.kind === 'input') {
    return sourceInput.input;
  }
  if (isMediabunnyInputDescriptor(sourceInput) && sourceInput.kind === 'input-factory') {
    return sourceInput.createInput(mediabunny);
  }
  if (isMediabunnyInputDescriptor(sourceInput) && sourceInput.kind === 'url') {
    return new mediabunny.Input({
      source: new mediabunny.UrlSource(sourceInput.url, sourceInput.urlSourceOptions),
      formats: [...(sourceInput.formats ?? mediabunny.ALL_FORMATS)],
    });
  }

  if (
    typeof sourceInput === 'string' ||
    sourceInput instanceof URL ||
    sourceInput instanceof Request
  ) {
    return new mediabunny.Input({
      source: new mediabunny.UrlSource(sourceInput),
      formats: [...mediabunny.ALL_FORMATS],
    });
  }

  const mediabunnyWithBlobSource = mediabunny as MediabunnyModule & {
    BlobSource?: new (
      blob: Blob | File
    ) => ConstructorParameters<MediabunnyModule['Input']>[0]['source'];
  };

  if (mediabunnyWithBlobSource.BlobSource === undefined) {
    throw new Error('This Mediabunny version does not expose BlobSource for local files.');
  }

  return new mediabunny.Input({
    source: new mediabunnyWithBlobSource.BlobSource(sourceInput),
    formats: mediabunny.ALL_FORMATS,
  });
}

type MediabunnyInputDescriptor = Exclude<
  MediabunnySourceInput,
  string | URL | Request | Blob | File
>;

function isMediabunnyInputDescriptor(
  sourceInput: MediabunnySourceInput
): sourceInput is MediabunnyInputDescriptor {
  return (
    typeof sourceInput !== 'string' &&
    !(sourceInput instanceof URL) &&
    !(sourceInput instanceof Request) &&
    !(sourceInput instanceof Blob)
  );
}

function isSuppliedMediabunnyInput(sourceInput: MediabunnySourceInput) {
  return isMediabunnyInputDescriptor(sourceInput) && sourceInput.kind === 'input';
}

function setTimelineClock(
  controller: MediabunnySourceController,
  timelineSeconds: number,
  playbackRate: number
) {
  controller.timelineTimeAtStart = timelineSeconds;
  controller.audioContextStartTime = controller.audioContext?.currentTime ?? null;
  controller.audioClockReady = controller.audioContext?.state === 'running';
  controller.wallClockStartTime = performance.now() / 1000;
  controller.playbackRate = playbackRate;
}

function toMediaSeconds(controller: MediabunnySourceController, sourceSeconds: number) {
  return sourceSeconds + controller.mediaTimeOffsetSeconds;
}

function toLogicalSourceSeconds(controller: MediabunnySourceController, mediaSeconds: number) {
  return mediaSeconds - controller.mediaTimeOffsetSeconds;
}

function getTimelinePlaybackSeconds(controller: MediabunnySourceController) {
  if (
    controller.playing &&
    controller.audioContext !== null &&
    controller.audioContextStartTime !== null &&
    controller.audioClockReady &&
    controller.audioContext.state === 'running'
  ) {
    return (
      controller.timelineTimeAtStart +
      (controller.audioContext.currentTime - controller.audioContextStartTime) *
        controller.playbackRate
    );
  }

  if (controller.playing && controller.wallClockStartTime !== null) {
    return (
      controller.timelineTimeAtStart +
      (performance.now() / 1000 - controller.wallClockStartTime) * controller.playbackRate
    );
  }

  return controller.timelineTimeAtStart;
}

async function renderActiveVideoFrame(
  controller: MediabunnySourceController,
  canvas: HTMLCanvasElement,
  video: ActiveClip,
  isCurrent: () => boolean,
  onFrame?: (timestamp: number) => void
) {
  await renderFrameAt(
    controller,
    canvas,
    toMediaSeconds(controller, toSeconds(video.sourceTime)),
    isCurrent,
    onFrame
  );
}

const VIDEO_TIMESTAMP_EPSILON = 1e-9;

async function cancelVideoPlayback(controller: MediabunnySourceController) {
  const iterator = resetVideoPlayback(controller);

  if (iterator !== null) {
    try {
      await iterator.return();
    } catch {
      // Cancellation should not surface decoder teardown errors.
    }
  }
}

function resetVideoPlayback(controller: MediabunnySourceController) {
  const iterator = controller.videoPlaybackIterator;
  controller.videoPlaybackGeneration += 1;
  controller.videoPlaybackIterator = null;
  controller.videoPlaybackFutureFrame = null;
  controller.videoPlaybackProcessing = false;
  controller.videoPlaybackEnded = false;
  controller.videoPlaybackSyncKey = undefined;
  controller.videoPlaybackSourceSeconds = null;
  controller.videoPlaybackTargetSeconds = null;
  controller.videoPlaybackCanvas = null;
  controller.videoPlaybackIsCurrent = undefined;
  controller.videoPlaybackOnFrame = undefined;
  controller.videoPlaybackOnFailure = undefined;
  return iterator;
}

async function processVideoPlayback(controller: MediabunnySourceController, generation: number) {
  if (
    controller.videoPlaybackProcessing ||
    controller.videoPlaybackEnded ||
    controller.videoPlaybackIterator === null
  ) {
    return;
  }

  controller.videoPlaybackProcessing = true;
  try {
    while (controller.videoPlaybackGeneration === generation) {
      if (controller.videoPlaybackIsCurrent?.() === false) {
        return;
      }
      const targetSeconds = controller.videoPlaybackTargetSeconds;
      const canvas = controller.videoPlaybackCanvas;
      if (targetSeconds === null || canvas === null) {
        return;
      }

      let newestDueFrame: Mediabunny.WrappedCanvas | null = null;
      while (controller.videoPlaybackGeneration === generation) {
        if (controller.videoPlaybackFutureFrame === null) {
          const iterator = controller.videoPlaybackIterator;
          if (iterator === null || controller.videoPlaybackEnded) {
            break;
          }

          const result = await iterator.next();
          if (controller.videoPlaybackGeneration !== generation) {
            return;
          }
          if (result.done) {
            controller.videoPlaybackEnded = true;
            break;
          }
          controller.videoPlaybackFutureFrame = result.value;
          if (controller.videoPlaybackIsCurrent?.() === false) {
            return;
          }
        }

        const latestTargetSeconds = controller.videoPlaybackTargetSeconds ?? targetSeconds;
        if (
          controller.videoPlaybackFutureFrame.timestamp >
          latestTargetSeconds + VIDEO_TIMESTAMP_EPSILON
        ) {
          break;
        }

        newestDueFrame = controller.videoPlaybackFutureFrame;
        controller.videoPlaybackFutureFrame = null;
      }

      if (
        newestDueFrame !== null &&
        controller.videoPlaybackIsCurrent?.() !== false &&
        !Object.is(newestDueFrame.timestamp, controller.lastRenderedVideoTimestamp) &&
        paintWrappedCanvas(canvas, newestDueFrame)
      ) {
        controller.lastRenderedVideoTimestamp = newestDueFrame.timestamp;
        controller.videoPlaybackOnFrame?.(newestDueFrame.timestamp);
      }

      if (Object.is(targetSeconds, controller.videoPlaybackTargetSeconds)) {
        return;
      }
    }
  } catch (decoderError) {
    if (controller.videoPlaybackGeneration === generation) {
      controller.videoPlaybackEnded = true;
      const error = decoderError instanceof Error ? decoderError : new Error(String(decoderError));
      controller.videoPlaybackOnFailure?.(error);
    }
  } finally {
    if (controller.videoPlaybackGeneration === generation) {
      controller.videoPlaybackProcessing = false;
    }
  }
}

async function startVideoPlayback(
  controller: MediabunnySourceController,
  canvas: HTMLCanvasElement,
  activeVideo: ActiveClip,
  isCurrent: () => boolean,
  onFrame?: (timestamp: number) => void,
  onFailure?: (error: Error) => void
) {
  const iterator = resetVideoPlayback(controller);
  const generation = controller.videoPlaybackGeneration;
  if (iterator !== null) {
    try {
      await iterator.return();
    } catch {
      // A new playback stream can still be created after teardown fails.
    }
  }
  if (controller.videoPlaybackGeneration !== generation) {
    return;
  }
  if (controller.videoSink === null) {
    return;
  }

  const sourceSeconds = toMediaSeconds(controller, toSeconds(activeVideo.sourceTime));
  controller.videoPlaybackIterator = controller.videoSink.canvases(
    sourceSeconds,
    toMediaSeconds(controller, toSeconds(activeVideo.sourceRange.end))
  );
  controller.videoPlaybackSyncKey = activeVideo.syncKey;
  controller.videoPlaybackSourceSeconds = sourceSeconds;
  controller.videoPlaybackTargetSeconds = sourceSeconds;
  controller.videoPlaybackCanvas = canvas;
  controller.videoPlaybackIsCurrent = isCurrent;
  controller.videoPlaybackOnFrame = onFrame;
  controller.videoPlaybackOnFailure = onFailure;
  void processVideoPlayback(controller, generation);
}

function syncActiveVideoPlaybackFrame(
  controller: MediabunnySourceController,
  canvas: HTMLCanvasElement,
  activeVideo: ActiveClip,
  isCurrent: () => boolean,
  onFrame?: (timestamp: number) => void,
  onFailure?: (error: Error) => void
) {
  const sourceSeconds = toMediaSeconds(controller, toSeconds(activeVideo.sourceTime));
  if (
    controller.videoPlaybackIterator === null ||
    controller.videoPlaybackSyncKey !== activeVideo.syncKey ||
    (controller.videoPlaybackSourceSeconds !== null &&
      sourceSeconds + VIDEO_TIMESTAMP_EPSILON < controller.videoPlaybackSourceSeconds)
  ) {
    void startVideoPlayback(controller, canvas, activeVideo, isCurrent, onFrame, onFailure);
    return;
  }

  controller.videoPlaybackSourceSeconds = sourceSeconds;
  controller.videoPlaybackTargetSeconds = sourceSeconds;
  controller.videoPlaybackCanvas = canvas;
  controller.videoPlaybackIsCurrent = isCurrent;
  controller.videoPlaybackOnFrame = onFrame;
  controller.videoPlaybackOnFailure = onFailure;
  void processVideoPlayback(controller, controller.videoPlaybackGeneration);
}

function clearPreviewCanvas(controller: MediabunnySourceController, canvas: HTMLCanvasElement) {
  invalidateFrameRendering(controller);
  controller.lastRenderedVideoTimestamp = null;

  const context = canvas.getContext('2d');
  if (context !== null) {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function syncAudioClip(
  controller: MediabunnySourceController,
  audio: ActiveClip | undefined,
  onFailure?: (error: Error) => void
) {
  stopAudioIterator(controller);
  stopQueuedAudio(controller);
  controller.activeAudioSyncKey = audio?.syncKey;

  if (audio === undefined || controller.audioSink === null) {
    return;
  }

  const sourceStart = toMediaSeconds(controller, toSeconds(audio.sourceTime));
  const sourceEnd = toMediaSeconds(controller, toSeconds(audio.sourceRange.end));

  if (sourceEnd <= sourceStart) {
    return;
  }

  const iterator = controller.audioSink.buffers(sourceStart, sourceEnd);
  controller.audioBufferIterator = iterator;
  const generation = controller.audioPlaybackGeneration;
  void runAudioIterator(controller, iterator, audio.clip, audio.syncKey, generation).catch(
    (iteratorError: unknown) => {
      if (
        controller.audioPlaybackGeneration !== generation ||
        controller.audioBufferIterator !== iterator
      ) {
        return;
      }
      onFailure?.(
        iteratorError instanceof Error ? iteratorError : new Error(String(iteratorError))
      );
    }
  );
}

function stopMediaClock(controller: MediabunnySourceController) {
  const currentTime = getTimelinePlaybackSeconds(controller);
  controller.timelineTimeAtStart = currentTime;
  controller.playing = false;
  controller.audioContextStartTime = null;
  controller.audioClockReady = false;
  controller.wallClockStartTime = null;

  void cancelVideoPlayback(controller);
  stopControllerAudio(controller);
}

function stopControllerAudio(controller: MediabunnySourceController) {
  controller.activeAudioSyncKey = undefined;
  stopAudioIterator(controller);
  stopQueuedAudio(controller);
}

function disposeController(controller: MediabunnySourceController) {
  stopMediaClock(controller);
  invalidateFrameRendering(controller);
  if (controller.ownsInput) {
    controller.input?.dispose();
  }
}

function stopQueuedAudio(controller: MediabunnySourceController) {
  for (const node of controller.queuedAudioNodes) {
    try {
      node.stop();
    } catch {
      // The node may already have ended.
    }
  }
  controller.queuedAudioNodes.clear();
}

function stopAudioIterator(controller: MediabunnySourceController) {
  controller.audioPlaybackGeneration += 1;
  void controller.audioBufferIterator?.return();
  controller.audioBufferIterator = null;
}

async function runAudioIterator(
  controller: MediabunnySourceController,
  iterator: AsyncGenerator<Mediabunny.WrappedAudioBuffer, void, void>,
  audioClip: Clip,
  audioSyncKey: string,
  generation: number
) {
  if (
    controller.audioBufferIterator !== iterator ||
    controller.audioContext === null ||
    controller.gainNode === null
  ) {
    return;
  }

  const clipTimelineStart = toSeconds(audioClip.timelineStart);
  const clipSourceStart = toMediaSeconds(controller, toSeconds(audioClip.sourceStart));

  for await (const { buffer, timestamp } of iterator) {
    if (
      controller.audioPlaybackGeneration !== generation ||
      controller.audioBufferIterator !== iterator ||
      !controller.playing ||
      controller.audioContext === null ||
      controller.gainNode === null ||
      controller.audioContextStartTime === null ||
      controller.activeAudioSyncKey !== audioSyncKey
    ) {
      break;
    }

    const node = controller.audioContext.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = controller.playbackRate;
    node.connect(controller.gainNode);

    const timelineTimestamp = clipTimelineStart + (timestamp - clipSourceStart);
    let startTimestamp =
      controller.audioContextStartTime +
      (timelineTimestamp - controller.timelineTimeAtStart) / controller.playbackRate;
    startTimestamp =
      Math.round(controller.audioContext.sampleRate * startTimestamp) /
      controller.audioContext.sampleRate;

    if (startTimestamp >= controller.audioContext.currentTime) {
      node.start(startTimestamp);
    } else {
      const offset =
        (controller.audioContext.currentTime - startTimestamp) * controller.playbackRate;
      node.start(controller.audioContext.currentTime, offset);
    }

    controller.queuedAudioNodes.add(node);
    node.onended = () => {
      controller.queuedAudioNodes.delete(node);
    };

    if (timelineTimestamp - getTimelinePlaybackSeconds(controller) >= 1) {
      await new Promise<void>((resolve) => {
        const interval = window.setInterval(() => {
          if (
            controller.audioPlaybackGeneration !== generation ||
            !controller.playing ||
            timelineTimestamp - getTimelinePlaybackSeconds(controller) < 1
          ) {
            window.clearInterval(interval);
            resolve();
          }
        }, 100);
      });
    }
  }
}

function invalidateFrameRendering(controller: MediabunnySourceController) {
  controller.asyncId += 1;
  controller.currentFrameRequest?.resolve();
  controller.pendingFrameRequest?.resolve();
  controller.currentFrameRequest = undefined;
  controller.pendingFrameRequest = undefined;
}

function renderFrameAt(
  controller: MediabunnySourceController,
  canvas: HTMLCanvasElement,
  sourceSeconds: number,
  isCurrent: () => boolean,
  onFrame?: (timestamp: number) => void
): Promise<void> {
  if (controller.videoSink === null) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const request: PendingFrameRequest = {
      canvas,
      sourceSeconds,
      isCurrent,
      resolve,
      reject,
      ...(onFrame !== undefined ? { onFrame } : {}),
    };

    if (controller.renderingFrame) {
      controller.pendingFrameRequest?.resolve();
      controller.pendingFrameRequest = request;
      return;
    }

    controller.renderingFrame = true;
    void processFrameRequests(controller, request);
  });
}

async function processFrameRequests(
  controller: MediabunnySourceController,
  initialRequest: PendingFrameRequest
) {
  let request: PendingFrameRequest | undefined = initialRequest;

  try {
    while (request !== undefined) {
      controller.pendingFrameRequest = undefined;
      controller.currentFrameRequest = request;
      const renderId = ++controller.asyncId;
      try {
        const wrappedCanvas = await controller.videoSink?.getCanvas(request.sourceSeconds);
        if (
          renderId === controller.asyncId &&
          wrappedCanvas !== null &&
          wrappedCanvas !== undefined &&
          request.isCurrent() &&
          paintWrappedCanvas(request.canvas, wrappedCanvas)
        ) {
          request.onFrame?.(wrappedCanvas.timestamp);
        }
        request.resolve();
      } catch (frameError) {
        if (renderId === controller.asyncId && request.isCurrent()) {
          request.reject(frameError instanceof Error ? frameError : new Error(String(frameError)));
        } else {
          request.resolve();
        }
      }
      if (controller.currentFrameRequest === request) {
        controller.currentFrameRequest = undefined;
      }
      request = controller.pendingFrameRequest;
    }
  } finally {
    controller.currentFrameRequest = undefined;
    controller.renderingFrame = false;
  }
}

function paintWrappedCanvas(canvas: HTMLCanvasElement, wrappedCanvas: Mediabunny.WrappedCanvas) {
  const context = canvas.getContext('2d');
  if (context === null) {
    return false;
  }

  if (
    canvas.width !== wrappedCanvas.canvas.width ||
    canvas.height !== wrappedCanvas.canvas.height
  ) {
    canvas.width = wrappedCanvas.canvas.width;
    canvas.height = wrappedCanvas.canvas.height;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(wrappedCanvas.canvas, 0, 0);
  return true;
}
