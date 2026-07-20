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
  startIndex?: number;
  previousAttempts?: readonly TimelineMediaSourceAttempt[];
  replacement?: PendingSourceReplacement;
}

interface PendingSourceReplacement {
  previousState: MediabunnySourceState | undefined;
  candidate: MediabunnySourceController | null;
  readyState: MediabunnySourceState | null;
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
  /** Release Mediabunny inputs, sinks, audio nodes, and loaded source state. */
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
  videoPlaybackOnFrame: ((timestamp: number) => void) | undefined;
  videoPlaybackOnFailure: ((error: Error) => void) | undefined;
  lastRenderedVideoTimestamp: number | null;
}

interface PendingFrameRequest {
  canvas: HTMLCanvasElement;
  sourceSeconds: number;
  onFrame?: (timestamp: number) => void;
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
  let ready = options.sources.length > 0;
  let status = ready
    ? 'Sources registered. Mediabunny loads active media on demand.'
    : 'No Mediabunny sources are configured.';
  let error: Error | null = null;
  let canvas = options.canvas ?? null;
  let disposed = false;
  let clockController: MediabunnySourceController | null = null;
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
  const loadGenerations = new Map<string, number>();
  const sourceLoadPromises = new Map<string, Promise<TimelineMediaSourceOperationResult>>();
  const pendingSourceReplacements = new Map<string, PendingSourceReplacement>();
  const recoveringSources = new Map<string, MediabunnySourceController>();
  const activeSourceIds = new Set<string>();
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
  let volume = options.audio?.volume ?? 0.7;
  let muted = options.audio?.muted ?? false;
  let audioStatus: MediabunnyAudioStatus = { state: 'unavailable' };
  let activationGeneration = 0;
  let activationTimer: number | null = null;
  let pendingAudioActivationRate: number | null = null;

  const notify = () => {
    options.onChange?.();
  };

  const setLastFrameTime = (timestamp: number | null) => {
    if (Object.is(lastFrameTime, timestamp)) {
      return;
    }

    lastFrameTime = timestamp;
    for (const listener of frameListeners) {
      listener();
    }
  };

  const setStatus = (nextStatus: string) => {
    status = nextStatus;
    notify();
  };

  const setError = (nextError: unknown) => {
    error = nextError instanceof Error ? nextError : new Error(String(nextError));
    status = error.message;
    notify();
  };

  const updateSourceStateSnapshot = (state: MediabunnySourceState) => {
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

  const ensureAudioRuntime = () => {
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
      notify();
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
    notify();
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
    const playbackRate = pendingAudioActivationRate;
    if (playbackRate === null || masterGainNode === null || audioContext === null) {
      return;
    }
    if (audioContext.state === 'running') {
      const timelineSeconds = getTransportClockTime();
      pendingAudioActivationRate = null;
      setTransportClock(timelineSeconds, playbackRate, transportPlaying);
      setAllClocks(timelineSeconds, playbackRate, transportPlaying);
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
        setTransportClock(timelineSeconds, playbackRate, transportPlaying);
        setAllClocks(timelineSeconds, playbackRate, transportPlaying);
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

  const clearVideo = () => {
    for (const sourceController of controllers.values()) {
      void cancelVideoPlayback(sourceController);
    }
    if (canvas !== null) {
      const controller = clockController ?? [...controllers.values()][0];
      if (controller !== undefined) {
        clearPreviewCanvas(controller, canvas);
      }
    }
    setLastFrameTime(null);
  };

  const renderVideo = async (activeVideo: ActiveClip, _timelineTime: RationalTime) => {
    const controller = getController(activeVideo);
    if (controller === undefined || canvas === null) {
      return;
    }

    clockController = controller;
    try {
      await renderActiveVideoFrame(controller, canvas, activeVideo, (timestamp) => {
        controller.lastRenderedVideoTimestamp = timestamp;
        setLastFrameTime(toLogicalSourceSeconds(controller, timestamp));
      });
    } catch (renderError) {
      const error = renderError instanceof Error ? renderError : new Error(String(renderError));
      void recoverSource(controller.sourceId, controller, error);
      throw error;
    }
  };

  const syncAudio = (activeAudio: ActiveClip | undefined) => {
    const controller = getController(activeAudio);
    if (controller === undefined) {
      for (const sourceController of controllers.values()) {
        syncAudioClip(sourceController, undefined);
      }
      return;
    }

    clockController = controller;
    syncAudioClip(controller, activeAudio, (audioError) => {
      void recoverSource(controller.sourceId, controller, audioError);
    });
  };

  const findActiveClipForKinds = (
    activeLayers: ActiveLayerResult<string>,
    trackKinds: ReadonlySet<string>
  ) => activeLayers.all.find((activeClip) => trackKinds.has(activeClip.track.kind));

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
    const replacement = pendingSourceReplacements.get(sourceId);
    if (replacement?.candidate !== null && replacement?.candidate !== undefined) {
      disposeController(replacement.candidate);
    }
    pendingSourceReplacements.delete(sourceId);
  };

  const commitLoadedController = (
    candidate: MediabunnySourceController,
    readyState: MediabunnySourceState,
    notifyReady: boolean
  ) => {
    const previous = controllers.get(candidate.sourceId);
    const timelineSeconds = getTransportClockTime();
    if (previous !== undefined) {
      if (clockController === previous) {
        clockController = candidate;
      }
      disposeController(previous);
    }
    controllers.set(candidate.sourceId, candidate);
    setTimelineClock(candidate, timelineSeconds, currentPlaybackRate);
    candidate.playing = transportPlaying;
    if (candidate.audioSink !== null) {
      activatePendingAudioClock();
    }
    error = null;
    status = 'Ready. Mediabunny can drive timeline video and audio.';
    if (notifyReady) {
      setSourceState(readyState);
    } else {
      updateSourceStateSnapshot(readyState);
    }
  };

  const loadSource = async (
    source: MediabunnySource,
    loadOptions: MediabunnySourceLoadOptions
  ): Promise<TimelineMediaSourceOperationResult> => {
    const { status: loadStatus, startIndex = 0, previousAttempts = [], replacement } = loadOptions;
    const inputs = [source.input, ...(source.fallbacks ?? [])];
    if (replacement === undefined) {
      discardPendingSourceReplacement(source.sourceId);
    }
    sourceLoadPromises.delete(source.sourceId);
    const generation = (loadGenerations.get(source.sourceId) ?? 0) + 1;
    loadGenerations.set(source.sourceId, generation);
    const isCurrentLoad = () => !disposed && loadGenerations.get(source.sourceId) === generation;
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
        } else {
          commitLoadedController(candidate, readyState, true);
        }
        return {
          ok: true,
          sourceId: source.sourceId,
          state: 'ready',
        };
      } catch (sourceError) {
        disposeController(candidate);
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
    const source = sourceDefinitions.get(sourceId);
    if (source === undefined) {
      return Promise.resolve({
        ok: false,
        sourceId,
        reason: 'unknown-source',
        error: new Error(`Unknown source "${sourceId}".`),
      });
    }
    if (controllers.has(sourceId)) {
      return Promise.resolve({ ok: true, sourceId, state: 'ready' });
    }
    const existingPromise = sourceLoadPromises.get(sourceId);
    if (existingPromise !== undefined) {
      return existingPromise;
    }

    const loadPromise = loadSource(source, { status: 'loading' }).finally(() => {
      if (sourceLoadPromises.get(sourceId) === loadPromise) {
        sourceLoadPromises.delete(sourceId);
      }
    });
    sourceLoadPromises.set(sourceId, loadPromise);
    return loadPromise;
  };

  const ensureActiveSources = async (
    activeVisual: ActiveClip | undefined,
    activeAudio: ActiveClip | undefined
  ) => {
    activeSourceIds.clear();
    for (const activeClip of [activeVisual, activeAudio]) {
      if (activeClip !== undefined) {
        activeSourceIds.add(activeClip.clip.sourceId);
      }
    }

    await Promise.all(
      [...activeSourceIds].map(async (sourceId) => {
        while (true) {
          const result = await ensureSource(sourceId);
          if (result.ok) {
            return;
          }
          if (
            isSupersededSourceLoadResult(result) &&
            !disposed &&
            sourceDefinitions.has(sourceId)
          ) {
            continue;
          }
          throw result.error;
        }
      })
    );
  };

  const recoverSource = async (
    sourceId: string,
    expectedController: MediabunnySourceController,
    recoveryError: Error
  ) => {
    const source = sourceDefinitions.get(sourceId);
    const controller = controllers.get(sourceId);
    if (
      source === undefined ||
      controller !== expectedController ||
      recoveringSources.has(sourceId) ||
      disposed
    ) {
      return;
    }
    recoveringSources.set(sourceId, expectedController);
    stopMediaClock(controller);
    const previousState = sourceStateSnapshot.get(sourceId);
    const attempts = [
      ...(previousState?.attempts ?? []),
      {
        inputIndex: controller.inputIndex,
        status: 'failed',
        error: recoveryError,
      } as const,
    ];
    try {
      const result = await loadSource(source, {
        status: 'recovering',
        startIndex: controller.inputIndex + 1,
        previousAttempts: attempts,
      });
      if (recoveringSources.get(sourceId) === expectedController && !result.ok) {
        setError(result.error);
      }
    } finally {
      if (recoveringSources.get(sourceId) === expectedController) {
        recoveringSources.delete(sourceId);
      }
    }
  };

  const syncLayers = async ({
    activeLayers,
    reason,
    timelineTime,
  }: TimelineLayerSyncDetails<string>) => {
    const activeVisual = findActiveClipForKinds(activeLayers, visualTrackKinds);
    const activeAudio = findActiveClipForKinds(activeLayers, audioTrackKinds);

    await ensureActiveSources(activeVisual, activeAudio);

    for (const activeClip of [activeVisual, activeAudio]) {
      if (activeClip === undefined) {
        continue;
      }
      const sourceState = sourceStateSnapshot.get(activeClip.clip.sourceId);
      if (sourceState?.status === 'failed' && sourceState.error !== null) {
        throw sourceState.error;
      }
    }

    if (activeVisual !== undefined) {
      const controller = getController(activeVisual);
      if (
        controller !== undefined &&
        canvas !== null &&
        (reason === 'play' || reason === 'tick' || reason === 'rate')
      ) {
        clockController = controller;
        syncActiveVideoPlaybackFrame(
          controller,
          canvas,
          activeVisual,
          (timestamp) => {
            setLastFrameTime(toLogicalSourceSeconds(controller, timestamp));
          },
          (playbackError) => {
            void recoverSource(controller.sourceId, controller, playbackError);
          }
        );
      } else {
        if (controller !== undefined) {
          await cancelVideoPlayback(controller);
        }
        await renderVideo(activeVisual, timelineTime);
      }
    } else {
      clearVideo();
    }

    if (shouldSyncAudio(reason, activeAudio)) {
      syncAudio(activeAudio);
    }
  };

  const invalidateSourceLoad = (sourceId: string) => {
    loadGenerations.set(sourceId, (loadGenerations.get(sourceId) ?? 0) + 1);
    sourceLoadPromises.delete(sourceId);
    recoveringSources.delete(sourceId);
    discardPendingSourceReplacement(sourceId);
  };

  const releaseSource = (sourceId: string) => {
    invalidateSourceLoad(sourceId);
    const controller = controllers.get(sourceId);
    if (controller !== undefined) {
      if (activeSourceIds.has(sourceId) && canvas !== null) {
        clearPreviewCanvas(controller, canvas);
        setLastFrameTime(null);
      }
      if (clockController === controller) {
        clockController = null;
      }
      disposeController(controller);
      controllers.delete(sourceId);
    }
  };

  const reconcileSources = (nextSources: readonly MediabunnySource[]) => {
    validateSources(nextSources);
    const nextDefinitions = new Map(nextSources.map((source) => [source.sourceId, source]));
    const supersededReplacements = new Map(pendingSourceReplacements);
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

    for (const sourceId of supersededReplacements.keys()) {
      invalidateSourceLoad(sourceId);
    }

    for (const sourceId of changedSourceIds) {
      releaseSource(sourceId);
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
      frameListeners.add(listener);
      return () => {
        frameListeners.delete(listener);
      };
    },
    setCanvas: (nextCanvas) => {
      if (canvas !== nextCanvas) {
        for (const controller of controllers.values()) {
          void cancelVideoPlayback(controller);
        }
      }
      canvas = nextCanvas;
    },
    getClockTime: getTransportClockTime,
    startClock: (timelineTime, playbackRate) => {
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
      pendingAudioActivationRate = playbackRate;
      activatePendingAudioClock();
    },
    setVolume: (nextVolume) => {
      if (!Number.isFinite(nextVolume) || nextVolume < 0 || nextVolume > 1) {
        throw new RangeError('volume must be a finite number from 0 to 1.');
      }
      volume = nextVolume;
      updateMasterGain();
      notify();
    },
    setMuted: (nextMuted) => {
      muted = nextMuted;
      updateMasterGain();
      notify();
    },
    setSources: reconcileSources,
    preloadSource: ensureSource,
    unloadSource: (sourceId) => {
      if (!sourceDefinitions.has(sourceId)) {
        return false;
      }
      releaseSource(sourceId);
      status = 'Source unloaded. It will reload when active or explicitly preloaded.';
      setSourceState(createIdleSourceState(sourceId));
      return true;
    },
    retrySource: async (sourceId) => {
      const source = sourceDefinitions.get(sourceId);
      if (source === undefined) {
        return {
          ok: false,
          sourceId,
          reason: 'unknown-source',
          error: new Error(`Unknown source "${sourceId}".`),
        };
      }
      const previousState = sourceStateSnapshot.get(sourceId);
      const loadPromise = loadSource(source, { status: 'loading' });
      const generation = loadGenerations.get(sourceId);
      const result = await loadPromise;
      if (disposed || loadGenerations.get(sourceId) !== generation) {
        return createSupersededSourceLoadResult(sourceId);
      }
      if (!result.ok && controllers.has(sourceId) && previousState !== undefined) {
        setSourceState(previousState);
      }
      return result;
    },
    replaceSource: async (source) => {
      try {
        validateSources([source]);
      } catch (sourceError) {
        return {
          ok: false,
          sourceId: source.sourceId,
          reason: 'invalid-source',
          error: sourceError instanceof Error ? sourceError : new Error(String(sourceError)),
        };
      }
      const previousReplacement = pendingSourceReplacements.get(source.sourceId);
      const replacement: PendingSourceReplacement = {
        previousState:
          previousReplacement?.previousState ?? sourceStateSnapshot.get(source.sourceId),
        candidate: null,
        readyState: null,
      };
      discardPendingSourceReplacement(source.sourceId);
      pendingSourceReplacements.set(source.sourceId, replacement);
      const loadPromise = loadSource(source, {
        status: 'loading',
        replacement,
      });
      const generation = loadGenerations.get(source.sourceId);
      const result = await loadPromise;
      if (
        disposed ||
        loadGenerations.get(source.sourceId) !== generation ||
        pendingSourceReplacements.get(source.sourceId) !== replacement
      ) {
        return createSupersededSourceLoadResult(source.sourceId);
      }
      pendingSourceReplacements.delete(source.sourceId);
      if (result.ok) {
        if (replacement.candidate === null || replacement.readyState === null) {
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
          const audioRuntime = ensureAudioRuntime();
          if (audioRuntime === null) {
            replacement.candidate.audioSink = null;
          } else {
            replacement.candidate.audioContext = audioRuntime.context;
            replacement.candidate.gainNode = audioRuntime.gainNode;
          }
        }
        commitLoadedController(replacement.candidate, replacement.readyState, false);
        sourceDefinitions.set(source.sourceId, source);
        ready = true;
        notify();
      } else {
        const nextSnapshot = new Map(sourceStateSnapshot);
        if (replacement.previousState === undefined) {
          nextSnapshot.delete(source.sourceId);
        } else {
          nextSnapshot.set(source.sourceId, replacement.previousState);
        }
        sourceStateSnapshot = nextSnapshot;
        notify();
      }
      return result;
    },
    setClockRate: (playbackRate) => {
      const timelineSeconds = getTransportClockTime();
      setTransportClock(timelineSeconds, playbackRate, transportPlaying);
      setAllClocks(timelineSeconds, playbackRate, transportPlaying);
    },
    seek: async (timelineTime, activeLayers) => {
      if (!ready) {
        return;
      }

      const activeVisual = findActiveClipForKinds(activeLayers, visualTrackKinds);
      const activeAudio = findActiveClipForKinds(activeLayers, audioTrackKinds);

      await ensureActiveSources(activeVisual, activeAudio);

      for (const controller of controllers.values()) {
        stopControllerAudio(controller);
      }
      await Promise.all([...controllers.values()].map(cancelVideoPlayback));
      setTransportClock(toSeconds(timelineTime), currentPlaybackRate, false);
      setAllClocks(toSeconds(timelineTime), currentPlaybackRate, false);
      if (activeVisual !== undefined) {
        await adapter.renderVideo(activeVisual, timelineTime);
      } else {
        adapter.clearVideo();
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
      disposed = true;
      ready = false;
      status = 'Mediabunny adapter disposed.';
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
      for (const sourceId of pendingSourceReplacements.keys()) {
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
  ensureAudioRuntime: () => { context: AudioContext; gainNode: GainNode } | null,
  isCurrentLoad: () => boolean,
  deferAudioRuntime: boolean
): Promise<LoadedMediaInfo> {
  const input = await createInput(mediabunny, sourceInput);
  controller.input = input;
  controller.ownsInput = !isSuppliedMediabunnyInput(sourceInput);

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
  type InputTrack = NonNullable<typeof videoTrack> | NonNullable<typeof audioTrack>;
  const tracks = [videoTrack, audioTrack].filter((track): track is InputTrack => track !== null);

  if (tracks.length === 0) {
    throw new Error(`No audio or video track found for source "${source.sourceId}".`);
  }

  const firstTimestamp = await input.getFirstTimestamp(tracks);
  const presentationStartTimestamp = Math.max(firstTimestamp, 0);
  const endTimestamp =
    (await input.getDurationFromMetadata(tracks, { skipLiveWait: true })) ??
    (await input.computeDuration(tracks, { skipLiveWait: true }));

  if (videoTrack !== null) {
    if ((await videoTrack.getCodec()) === null || !(await videoTrack.canDecode())) {
      throw new Error(`The browser cannot decode the video track for source "${source.sourceId}".`);
    }

    const alpha = await videoTrack.canBeTransparent();
    controller.videoSink = new mediabunny.CanvasSink(videoTrack, {
      poolSize: 2,
      fit: 'contain',
      alpha,
    });
  }

  const audioDecodable =
    audioTrack !== null && (await audioTrack.getCodec()) !== null && (await audioTrack.canDecode());
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

  if (audioTrack !== null && audioDecodable && isCurrentLoad()) {
    controller.audioSink = new mediabunny.AudioBufferSink(audioTrack);
    if (!deferAudioRuntime) {
      const audioRuntime = ensureAudioRuntime();
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
  onFrame?: (timestamp: number) => void
) {
  await renderFrameAt(
    controller,
    canvas,
    toMediaSeconds(controller, toSeconds(video.sourceTime)),
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
  controller.videoPlaybackOnFrame = onFrame;
  controller.videoPlaybackOnFailure = onFailure;
  void processVideoPlayback(controller, generation);
}

function syncActiveVideoPlaybackFrame(
  controller: MediabunnySourceController,
  canvas: HTMLCanvasElement,
  activeVideo: ActiveClip,
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
    void startVideoPlayback(controller, canvas, activeVideo, onFrame, onFailure);
    return;
  }

  controller.videoPlaybackSourceSeconds = sourceSeconds;
  controller.videoPlaybackTargetSeconds = sourceSeconds;
  controller.videoPlaybackCanvas = canvas;
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
  controller.pendingFrameRequest = undefined;
}

async function renderFrameAt(
  controller: MediabunnySourceController,
  canvas: HTMLCanvasElement,
  sourceSeconds: number,
  onFrame?: (timestamp: number) => void
) {
  if (controller.videoSink === null) {
    return;
  }

  if (controller.renderingFrame) {
    controller.pendingFrameRequest = { canvas, sourceSeconds, onFrame };
    return;
  }

  controller.renderingFrame = true;

  try {
    let request: PendingFrameRequest | undefined = { canvas, sourceSeconds, onFrame };

    while (request !== undefined) {
      controller.pendingFrameRequest = undefined;
      const renderId = ++controller.asyncId;
      const wrappedCanvas = await controller.videoSink.getCanvas(request.sourceSeconds);
      if (renderId !== controller.asyncId || wrappedCanvas === null) {
        request = controller.pendingFrameRequest;
        continue;
      }

      if (paintWrappedCanvas(request.canvas, wrappedCanvas)) {
        request.onFrame?.(wrappedCanvas.timestamp);
      }
      request = controller.pendingFrameRequest;
    }
  } finally {
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
