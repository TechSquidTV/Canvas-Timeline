import type {
  ActiveClip,
  ActiveLayerResult,
  Clip,
  MaybePromise,
} from '@techsquidtv/canvas-timeline-core';
import type {
  TimelineMediaSyncAdapter,
  TimelineContentPlaybackStatus,
  TimelineMediaSyncReason,
  TimelineLayerSyncDetails,
} from '@techsquidtv/canvas-timeline-react';
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
  | {
      kind: 'url';
      url: string | URL | Request;
      formats?: readonly Mediabunny.InputFormat[];
      urlSourceOptions?: Mediabunny.UrlSourceOptions;
    }
  | { kind: 'blob'; blob: Blob | File }
  | { kind: 'input'; input: Mediabunny.Input }
  | {
      kind: 'input-factory';
      createInput: (mediabunny: MediabunnyModule) => MaybePromise<Mediabunny.Input>;
    };

/** Maps a logical source timestamp to the corresponding representation timestamp. */
export interface MediabunnyRepresentationTiming {
  sourceTimeSeconds: number;
  mediaTimeSeconds: number;
}

/** A deliberately selectable editing proxy for one logical source. */
export interface MediabunnyProxy {
  proxyId: string;
  input: MediabunnySourceInput;
  fallbacks?: readonly MediabunnySourceInput[];
  timing?: MediabunnyRepresentationTiming;
}

/** Original or proxy representation selected for a logical source. */
export type MediabunnyRepresentationSelection =
  | { kind: 'original' }
  | { kind: 'proxy'; proxyId: string };

/** One logical source with an original input and optional editing proxies. */
export interface MediabunnySource {
  sourceId: string;
  input: MediabunnySourceInput;
  fallbacks?: readonly MediabunnySourceInput[];
  proxies?: readonly MediabunnyProxy[];
  timing?: MediabunnyRepresentationTiming;
}

/** Tracks selected from a loaded source representation input. */
export interface MediabunnyTrackSelection {
  videoTrack: Mediabunny.InputVideoTrack | null;
  audioTrack: Mediabunny.InputAudioTrack | null;
}

/** Context passed to custom media-track selection. */
export interface MediabunnyTrackSelectionContext {
  source: MediabunnySource;
  representation: MediabunnyRepresentationSelection;
  sourceInput: MediabunnySourceInput;
  input: Mediabunny.Input;
  videoTracks: readonly Mediabunny.InputVideoTrack[];
  audioTracks: readonly Mediabunny.InputAudioTrack[];
}

/** Video metadata for the selected source track. */
export interface MediabunnyVideoMetadata {
  displayWidth: number;
  displayHeight: number;
  rotation: Mediabunny.Rotation;
  detectedFrameRate: number | null;
}

/** Audio metadata for the selected source track. */
export interface MediabunnyAudioMetadata {
  sampleRate: number;
}

/** Timing and selected-track metadata for a loaded source. */
export interface MediabunnySourceMetadata {
  /** First timestamp in the selected representation's media time domain. */
  firstTimestampSeconds: number;
  /** First timestamp mapped into the logical source time domain. */
  sourceFirstTimestampSeconds: number;
  presentationStartTimestampSeconds: number;
  /** End timestamp mapped into the logical source time domain. */
  sourceEndTimestampSeconds: number;
  endTimestampSeconds: number;
  durationSeconds: number;
  video: MediabunnyVideoMetadata | null;
  audio: MediabunnyAudioMetadata | null;
}

/** One input attempt within the selected source representation. */
export interface MediabunnySourceAttempt {
  representation: MediabunnyRepresentationSelection;
  inputIndex: number;
  status: 'ready' | 'failed';
  error: Error | null;
}

/** Observable loading and recovery state for a logical source. */
export interface MediabunnySourceState {
  sourceId: string;
  status: 'loading' | 'ready' | 'recovering' | 'failed';
  selectedRepresentation: MediabunnyRepresentationSelection;
  selectedInputIndex: number | null;
  attempts: readonly MediabunnySourceAttempt[];
  metadata: MediabunnySourceMetadata | null;
  error: Error | null;
}

/** Result of explicitly loading or replacing one logical source. */
export type MediabunnySourceLoadResult =
  | {
      ok: true;
      sourceId: string;
      representation: MediabunnyRepresentationSelection;
      inputIndex: number;
      metadata: MediabunnySourceMetadata;
    }
  | { ok: false; sourceId: string; error: Error };

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
  /** Audio context used to decode and schedule source audio. */
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
  /** Select the initial representation for each source. Defaults to original. */
  selectRepresentation?: (source: MediabunnySource) => MediabunnyRepresentationSelection;
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
 */
export interface MediabunnyAdapter {
  /** Whether at least one source is loaded and ready for playback. */
  readonly ready: boolean;
  /** Human-readable loading, playback, or error status. */
  readonly status: string;
  /** Last source loading error, when one is active. */
  readonly error: Error | null;
  /** Timestamp of the last rendered video frame, in seconds. */
  readonly lastFrameTime: number | null;
  /** Loading, selected representation, input attempts, metadata, and recovery by source id. */
  readonly sourceStateById: ReadonlyMap<string, MediabunnySourceState>;
  readonly volume: number;
  readonly muted: boolean;
  readonly audioStatus: MediabunnyAudioStatus;
  /** React timeline media sync adapter backed by Mediabunny clocks and sinks. */
  readonly syncAdapter: TimelineMediaSyncAdapter<string>;
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
  /** Request browser audio activation without blocking visual transport. */
  requestClockActivation: (playbackRate: number) => void;
  /** Update master output volume without reloading sources. */
  setVolume: (volume: number) => void;
  /** Update master mute state without reloading sources. */
  setMuted: (muted: boolean) => void;
  /** Select and load an original or proxy representation. */
  setRepresentation: (
    sourceId: string,
    representation: MediabunnyRepresentationSelection
  ) => Promise<MediabunnySourceLoadResult>;
  /** Retry the configured inputs for the selected representation of one source. */
  retrySource: (sourceId: string) => Promise<MediabunnySourceLoadResult>;
  /** Replace one logical source and load its selected representation. */
  replaceSource: (source: MediabunnySource) => Promise<MediabunnySourceLoadResult>;
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
  representation: MediabunnyRepresentationSelection;
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

interface MediabunnyResolvedRepresentation {
  selection: MediabunnyRepresentationSelection;
  inputs: readonly MediabunnySourceInput[];
  timing: MediabunnyRepresentationTiming | undefined;
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
    validateMediabunnyTiming(source.sourceId, 'original', source.timing);
    const proxyIds = new Set<string>();
    for (const proxy of source.proxies ?? []) {
      if (proxy.proxyId.length === 0) {
        throw new Error(`Source "${source.sourceId}" has an empty proxyId.`);
      }
      if (proxyIds.has(proxy.proxyId)) {
        throw new Error(`Source "${source.sourceId}" has duplicate proxyId "${proxy.proxyId}".`);
      }
      proxyIds.add(proxy.proxyId);
      validateMediabunnyTiming(source.sourceId, `proxy "${proxy.proxyId}"`, proxy.timing);
    }
  }
}

function validateMediabunnyTiming(
  sourceId: string,
  representation: string,
  timing: MediabunnyRepresentationTiming | undefined
) {
  if (
    timing !== undefined &&
    (!Number.isFinite(timing.sourceTimeSeconds) || !Number.isFinite(timing.mediaTimeSeconds))
  ) {
    throw new Error(`Source "${sourceId}" ${representation} timing values must be finite.`);
  }
}

function resolveMediabunnyRepresentation(
  source: MediabunnySource,
  selection: MediabunnyRepresentationSelection
): MediabunnyResolvedRepresentation | undefined {
  if (selection.kind === 'original') {
    return {
      selection,
      inputs: [source.input, ...(source.fallbacks ?? [])],
      timing: source.timing,
    };
  }

  const proxy = source.proxies?.find((candidate) => candidate.proxyId === selection.proxyId);
  if (proxy === undefined) {
    return undefined;
  }

  return {
    selection,
    inputs: [proxy.input, ...(proxy.fallbacks ?? [])],
    timing: proxy.timing,
  };
}

function assertMediabunnyRepresentation(
  source: MediabunnySource,
  selection: MediabunnyRepresentationSelection
) {
  if (resolveMediabunnyRepresentation(source, selection) === undefined) {
    const representationId = selection.kind === 'proxy' ? selection.proxyId : 'original';
    throw new Error(
      `Source "${source.sourceId}" does not define representation "${representationId}".`
    );
  }
}

/**
 * Create a Mediabunny adapter that drives Canvas Timeline media playback.
 *
 * @param options - Mediabunny sources, preview canvas, audio, loader, and change callback.
 */
export function createMediabunnyAdapter(
  options: CreateMediabunnyAdapterOptions
): MediabunnyAdapter {
  validateSources(options.sources);
  if (options.audio?.destination !== undefined && options.audio.context === undefined) {
    throw new Error('An audio context is required when an audio destination is provided.');
  }
  let ready = false;
  let status = 'Loading Mediabunny sources...';
  let error: Error | null = null;
  let canvas = options.canvas ?? null;
  let disposed = false;
  let clockController: MediabunnySourceController | null = null;
  let currentPlaybackRate = 1;
  let lastFrameTime: number | null = null;
  const frameListeners = new Set<() => void>();
  const controllers = new Map<string, MediabunnySourceController>();
  const sourceDefinitions = new Map(options.sources.map((source) => [source.sourceId, source]));
  const selectedRepresentationBySourceId = new Map<string, MediabunnyRepresentationSelection>();
  const sourceStateById = new Map<string, MediabunnySourceState>();
  const loadGenerations = new Map<string, number>();
  const recoveringSources = new Set<string>();
  const visualTrackKinds = new Set(options.visualTrackKinds ?? ['visual']);
  const audioTrackKinds = new Set(options.audioTrackKinds ?? ['audio']);
  const mediabunnyPromise = Promise.resolve(
    typeof options.mediabunny === 'function' ? options.mediabunny() : options.mediabunny
  );
  let audioContext: AudioContext | null = options.audio?.context ?? null;
  let ownsAudioContext = false;
  let masterGainNode: GainNode | null = null;
  let volume = options.audio?.volume ?? 0.7;
  let muted = options.audio?.muted ?? false;
  let audioStatus: MediabunnyAudioStatus = { state: 'unavailable' };
  let activationGeneration = 0;
  let activationTimer: number | null = null;

  for (const source of options.sources) {
    const selection = options.selectRepresentation?.(source) ?? { kind: 'original' };
    assertMediabunnyRepresentation(source, selection);
    selectedRepresentationBySourceId.set(source.sourceId, selection);
  }

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

  const setSourceState = (state: MediabunnySourceState) => {
    sourceStateById.set(state.sourceId, state);
    notify();
  };

  const updateMasterGain = () => {
    if (masterGainNode !== null) {
      masterGainNode.gain.value = muted ? 0 : volume;
    }
  };

  const ensureAudioRuntime = () => {
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

  const loadSource = async (
    source: MediabunnySource,
    selection: MediabunnyRepresentationSelection,
    loadStatus: 'loading' | 'recovering',
    startIndex = 0,
    previousAttempts: readonly MediabunnySourceAttempt[] = []
  ): Promise<MediabunnySourceLoadResult> => {
    const representation = resolveMediabunnyRepresentation(source, selection);
    if (representation === undefined) {
      return {
        ok: false,
        sourceId: source.sourceId,
        error: new Error(
          `Source "${source.sourceId}" does not define the selected representation.`
        ),
      };
    }
    const generation = (loadGenerations.get(source.sourceId) ?? 0) + 1;
    loadGenerations.set(source.sourceId, generation);
    setSourceState({
      sourceId: source.sourceId,
      status: loadStatus,
      selectedRepresentation: selection,
      selectedInputIndex: null,
      attempts: previousAttempts,
      metadata: null,
      error: null,
    });

    const mediabunny = await mediabunnyPromise;
    const attempts = [...previousAttempts];
    let finalError = new Error(
      `No remaining inputs are available for source "${source.sourceId}".`
    );

    for (let inputIndex = startIndex; inputIndex < representation.inputs.length; inputIndex += 1) {
      const sourceInput = representation.inputs[inputIndex];
      if (sourceInput === undefined) {
        continue;
      }
      const candidate = createController(
        source.sourceId,
        selection,
        inputIndex,
        representation.timing
      );
      try {
        const loaded = await loadMediabunnySourceController(
          candidate,
          mediabunny,
          source,
          selection,
          sourceInput,
          options.selectTracks,
          ensureAudioRuntime
        );
        if (disposed || loadGenerations.get(source.sourceId) !== generation) {
          disposeController(candidate);
          return {
            ok: false,
            sourceId: source.sourceId,
            error: new Error(`Loading source "${source.sourceId}" was superseded.`),
          };
        }

        attempts.push({ representation: selection, inputIndex, status: 'ready', error: null });
        const previous = controllers.get(source.sourceId);
        const wasPlaying = previous?.playing ?? false;
        const timelineSeconds = previous === undefined ? 0 : getTimelinePlaybackSeconds(previous);
        if (previous !== undefined) {
          if (clockController === previous) {
            clockController = candidate;
          }
          disposeController(previous);
        }
        controllers.set(source.sourceId, candidate);
        selectedRepresentationBySourceId.set(source.sourceId, selection);
        if (wasPlaying) {
          setTimelineClock(candidate, timelineSeconds, currentPlaybackRate);
        }
        candidate.playing = wasPlaying;
        ready = controllers.size > 0;
        error = null;
        status = 'Ready. Mediabunny can drive timeline video and audio.';
        setSourceState({
          sourceId: source.sourceId,
          status: 'ready',
          selectedRepresentation: selection,
          selectedInputIndex: inputIndex,
          attempts,
          metadata: loaded.metadata,
          error: null,
        });
        return {
          ok: true,
          sourceId: source.sourceId,
          representation: selection,
          inputIndex,
          metadata: loaded.metadata,
        };
      } catch (sourceError) {
        disposeController(candidate);
        finalError = sourceError instanceof Error ? sourceError : new Error(String(sourceError));
        attempts.push({
          representation: selection,
          inputIndex,
          status: 'failed',
          error: finalError,
        });
      }
    }

    const previous = controllers.get(source.sourceId);
    if (loadStatus === 'recovering' && previous !== undefined) {
      disposeController(previous);
      controllers.delete(source.sourceId);
    }
    ready = controllers.size > 0;
    setSourceState({
      sourceId: source.sourceId,
      status: 'failed',
      selectedRepresentation: selection,
      selectedInputIndex: null,
      attempts,
      metadata: null,
      error: finalError,
    });
    return { ok: false, sourceId: source.sourceId, error: finalError };
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
    recoveringSources.add(sourceId);
    stopMediaClock(controller);
    const previousState = sourceStateById.get(sourceId);
    const attempts = [
      ...(previousState?.attempts ?? []),
      {
        representation: controller.representation,
        inputIndex: controller.inputIndex,
        status: 'failed',
        error: recoveryError,
      } as const,
    ];
    try {
      const result = await loadSource(
        source,
        controller.representation,
        'recovering',
        controller.inputIndex + 1,
        attempts
      );
      if (!result.ok) {
        setError(result.error);
      }
    } finally {
      recoveringSources.delete(sourceId);
    }
  };

  const syncLayers = async ({
    activeLayers,
    reason,
    timelineTime,
  }: TimelineLayerSyncDetails<string>) => {
    const activeVisual = findActiveClipForKinds(activeLayers, visualTrackKinds);
    const activeAudio = findActiveClipForKinds(activeLayers, audioTrackKinds);

    for (const activeClip of [activeVisual, activeAudio]) {
      if (activeClip === undefined) {
        continue;
      }
      const sourceState = sourceStateById.get(activeClip.clip.sourceId);
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
      return sourceStateById;
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
    get syncAdapter() {
      return {
        getClockTime: adapter.getClockTime,
        startClock: adapter.startClock,
        stopClock: adapter.stopClock,
        requestClockActivation: adapter.requestClockActivation,
        setClockRate: adapter.setClockRate,
        seek: adapter.seek,
        syncLayers: adapter.syncLayers,
        onStatus: (playbackStatus: TimelineContentPlaybackStatus) => {
          if (playbackStatus === 'playing') {
            setStatus('Mediabunny is driving timeline media playback.');
          } else if (playbackStatus === 'content-gap') {
            setStatus('Reached the next content gap.');
          } else if (playbackStatus === 'paused') {
            setStatus('Paused. Timeline edits seek Mediabunny frames.');
          }
        },
      };
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
    getClockTime: () => {
      const controller = clockController ?? [...controllers.values()][0];
      return controller === undefined ? 0 : getTimelinePlaybackSeconds(controller);
    },
    startClock: (timelineTime, playbackRate) => {
      if (!ready || controllers.size === 0) {
        return false;
      }

      currentPlaybackRate = playbackRate;
      setAllClocks(toSeconds(timelineTime), playbackRate, true);
      return true;
    },
    stopClock: () => {
      for (const controller of controllers.values()) {
        controller.playing = false;
        void cancelVideoPlayback(controller);
      }
    },
    requestClockActivation: (playbackRate) => {
      if (audioContext?.state !== 'suspended') {
        return;
      }
      const generation = ++activationGeneration;
      if (activationTimer !== null) {
        window.clearTimeout(activationTimer);
      }
      activationTimer = window.setTimeout(() => {
        if (generation !== activationGeneration || audioContext?.state === 'running') {
          return;
        }
        audioStatus = { state: 'degraded', error: null };
        notify();
      }, options.audio?.activationTimeoutMs ?? 1000);
      void audioContext.resume().then(
        () => {
          if (generation !== activationGeneration || disposed) {
            return;
          }
          if (activationTimer !== null) {
            window.clearTimeout(activationTimer);
          }
          activationTimer = null;
          audioStatus = { state: 'running' };
          const timelineSeconds = adapter.getClockTime();
          const playing = [...controllers.values()].some((controller) => controller.playing);
          setAllClocks(timelineSeconds, playbackRate, playing);
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
          audioStatus = {
            state: 'degraded',
            error:
              activationError instanceof Error
                ? activationError
                : new Error(String(activationError)),
          };
          notify();
        }
      );
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
    setRepresentation: async (sourceId, representation) => {
      const source = sourceDefinitions.get(sourceId);
      if (source === undefined) {
        return { ok: false, sourceId, error: new Error(`Unknown source "${sourceId}".`) };
      }
      const resolved = resolveMediabunnyRepresentation(source, representation);
      if (resolved === undefined) {
        return {
          ok: false,
          sourceId,
          error: new Error(`Source "${sourceId}" does not define the selected representation.`),
        };
      }
      const previousState = sourceStateById.get(sourceId);
      const result = await loadSource(source, representation, 'loading');
      if (!result.ok && controllers.has(sourceId) && previousState !== undefined) {
        setSourceState(previousState);
      }
      return result;
    },
    retrySource: async (sourceId) => {
      const source = sourceDefinitions.get(sourceId);
      if (source === undefined) {
        return { ok: false, sourceId, error: new Error(`Unknown source "${sourceId}".`) };
      }
      const previousState = sourceStateById.get(sourceId);
      const representation =
        selectedRepresentationBySourceId.get(sourceId) ?? ({ kind: 'original' } as const);
      const result = await loadSource(source, representation, 'loading');
      if (!result.ok && controllers.has(sourceId) && previousState !== undefined) {
        setSourceState(previousState);
      }
      return result;
    },
    replaceSource: async (source) => {
      validateSources([source]);
      const previousState = sourceStateById.get(source.sourceId);
      const previousSelection =
        selectedRepresentationBySourceId.get(source.sourceId) ?? ({ kind: 'original' } as const);
      const representation =
        resolveMediabunnyRepresentation(source, previousSelection) === undefined
          ? (options.selectRepresentation?.(source) ?? ({ kind: 'original' } as const))
          : previousSelection;
      assertMediabunnyRepresentation(source, representation);
      const result = await loadSource(source, representation, 'loading');
      if (result.ok) {
        sourceDefinitions.set(source.sourceId, source);
      } else if (controllers.has(source.sourceId) && previousState !== undefined) {
        setSourceState(previousState);
      }
      return result;
    },
    setClockRate: (playbackRate) => {
      const timelineSeconds = adapter.getClockTime();
      const playing = [...controllers.values()].some((controller) => controller.playing);
      currentPlaybackRate = playbackRate;
      setAllClocks(timelineSeconds, playbackRate, playing);
    },
    seek: async (timelineTime, activeLayers) => {
      if (!ready) {
        return;
      }

      const activeVisual = findActiveClipForKinds(activeLayers, visualTrackKinds);
      const activeAudio = findActiveClipForKinds(activeLayers, audioTrackKinds);

      await Promise.all([...controllers.values()].map(cancelVideoPlayback));
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
    clearVideo,
    getFrame: async (activeVideo) => {
      const controller = getController(activeVideo);
      if (controller === undefined || controller.videoSink === null) {
        return null;
      }

      let wrappedCanvas: Awaited<ReturnType<Mediabunny.CanvasSink['getCanvas']>>;
      try {
        wrappedCanvas = await controller.videoSink.getCanvas(
          toRepresentationSeconds(controller, toSeconds(activeVideo.sourceTime))
        );
      } catch (frameError) {
        const error = frameError instanceof Error ? frameError : new Error(String(frameError));
        void recoverSource(controller.sourceId, controller, error);
        return null;
      }
      if (wrappedCanvas === null) {
        return null;
      }

      return {
        canvas: wrappedCanvas.canvas,
        timestamp: toLogicalSourceSeconds(controller, wrappedCanvas.timestamp),
      };
    },
    dispose: () => {
      disposed = true;
      activationGeneration += 1;
      if (activationTimer !== null) {
        window.clearTimeout(activationTimer);
      }
      for (const controller of controllers.values()) {
        disposeController(controller);
      }
      controllers.clear();
      sourceStateById.clear();
      frameListeners.clear();
      masterGainNode?.disconnect();
      if (ownsAudioContext) {
        void audioContext?.close();
      }
    },
  };

  void Promise.all(
    options.sources.map((source) =>
      loadSource(
        source,
        selectedRepresentationBySourceId.get(source.sourceId) ?? { kind: 'original' },
        'loading'
      )
    )
  )
    .then((results) => {
      if (disposed) {
        controllers.clear();
        sourceStateById.clear();
        return;
      }

      const loadedCount = results.filter((result) => result.ok).length;
      ready = loadedCount > 0;
      const failedResult = results.find((result) => !result.ok);
      if (loadedCount > 0) {
        status = 'Ready. Mediabunny can drive timeline video and audio.';
      } else if (failedResult !== undefined && !failedResult.ok) {
        error = failedResult.error;
        status = failedResult.error.message;
      } else {
        status = 'No Mediabunny source could be loaded.';
      }
      notify();
    })
    .catch((loadError: unknown) => {
      if (!disposed) {
        setError(loadError);
      }
    });

  return adapter;
}

function createController(
  sourceId: string,
  representation: MediabunnyRepresentationSelection,
  inputIndex: number,
  timing: MediabunnyRepresentationTiming | undefined
): MediabunnySourceController {
  return {
    sourceId,
    representation,
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
  representation: MediabunnyRepresentationSelection,
  sourceInput: MediabunnySourceInput,
  selectTracks: CreateMediabunnyAdapterOptions['selectTracks'],
  ensureAudioRuntime: () => { context: AudioContext; gainNode: GainNode } | null
): Promise<LoadedMediaInfo> {
  const input = await createInput(mediabunny, sourceInput);
  controller.input = input;
  controller.ownsInput = sourceInput.kind !== 'input';

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
      representation,
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

  if (
    audioTrack !== null &&
    (await audioTrack.getCodec()) !== null &&
    (await audioTrack.canDecode())
  ) {
    const audioRuntime = ensureAudioRuntime();
    if (audioRuntime !== null) {
      controller.audioContext = audioRuntime.context;
      controller.gainNode = audioRuntime.gainNode;
      controller.audioSink = new mediabunny.AudioBufferSink(audioTrack);
    }
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
    audioTrack === null ? null : audioTrack.getSampleRate().then((sampleRate) => ({ sampleRate })),
  ]);

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
  if (sourceInput.kind === 'input') {
    return sourceInput.input;
  }
  if (sourceInput.kind === 'input-factory') {
    return sourceInput.createInput(mediabunny);
  }
  if (sourceInput.kind === 'url') {
    return new mediabunny.Input({
      source: new mediabunny.UrlSource(sourceInput.url, sourceInput.urlSourceOptions),
      formats: [...(sourceInput.formats ?? mediabunny.ALL_FORMATS)],
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
    source: new mediabunnyWithBlobSource.BlobSource(sourceInput.blob),
    formats: mediabunny.ALL_FORMATS,
  });
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

function toRepresentationSeconds(controller: MediabunnySourceController, sourceSeconds: number) {
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
    toRepresentationSeconds(controller, toSeconds(video.sourceTime)),
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

  const sourceSeconds = toRepresentationSeconds(controller, toSeconds(activeVideo.sourceTime));
  controller.videoPlaybackIterator = controller.videoSink.canvases(
    sourceSeconds,
    toRepresentationSeconds(controller, toSeconds(activeVideo.sourceRange.end))
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
  const sourceSeconds = toRepresentationSeconds(controller, toSeconds(activeVideo.sourceTime));
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
  controller.asyncId += 1;
  controller.pendingFrameRequest = undefined;
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

  const sourceStart = toRepresentationSeconds(controller, toSeconds(audio.sourceTime));
  const sourceEnd = toRepresentationSeconds(controller, toSeconds(audio.sourceRange.end));

  if (sourceEnd <= sourceStart) {
    return;
  }

  controller.audioBufferIterator = controller.audioSink.buffers(sourceStart, sourceEnd);
  void runAudioIterator(controller, audio.clip, audio.syncKey).catch((iteratorError: unknown) => {
    onFailure?.(iteratorError instanceof Error ? iteratorError : new Error(String(iteratorError)));
  });
}

function stopMediaClock(controller: MediabunnySourceController) {
  const currentTime = getTimelinePlaybackSeconds(controller);
  controller.timelineTimeAtStart = currentTime;
  controller.playing = false;
  controller.audioContextStartTime = null;
  controller.audioClockReady = false;
  controller.wallClockStartTime = null;
  controller.activeAudioSyncKey = undefined;

  void cancelVideoPlayback(controller);
  stopAudioIterator(controller);
  stopQueuedAudio(controller);
}

function disposeController(controller: MediabunnySourceController) {
  stopMediaClock(controller);
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
  void controller.audioBufferIterator?.return();
  controller.audioBufferIterator = null;
}

async function runAudioIterator(
  controller: MediabunnySourceController,
  audioClip: Clip,
  audioSyncKey: string
) {
  if (
    controller.audioBufferIterator === null ||
    controller.audioContext === null ||
    controller.gainNode === null
  ) {
    return;
  }

  const clipTimelineStart = toSeconds(audioClip.timelineStart);
  const clipSourceStart = toRepresentationSeconds(controller, toSeconds(audioClip.sourceStart));

  for await (const { buffer, timestamp } of controller.audioBufferIterator) {
    if (
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
