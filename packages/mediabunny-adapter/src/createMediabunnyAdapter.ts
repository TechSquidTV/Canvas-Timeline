import type {
  ActiveClip,
  ActiveLayerResult,
  TimelineLayerSyncDetails,
  TimelineMediaSourceAttempt,
  TimelineMediaSourceOperationResult,
  TimelineMediaSyncReason,
} from '@techsquidtv/canvas-timeline-core';
import { toSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type * as Mediabunny from 'mediabunny';
import type {
  CreateMediabunnyAdapterOptions,
  MediabunnyAdapter,
  MediabunnyAudioStatus,
  MediabunnyModule,
  MediabunnySource,
  MediabunnySourceState,
} from '#mediabunny-adapter/types';
import {
  stopAudioIterator,
  stopControllerAudio,
  stopQueuedAudio,
  syncAudioClip,
} from '#mediabunny-adapter/internal/audioRuntime';
import {
  createController,
  type MediabunnySourceController,
  toLogicalSourceSeconds,
  toMediaSeconds,
} from '#mediabunny-adapter/internal/sourceController';
import {
  areMediabunnySourcesEqual,
  assertValidMediabunnyVolume,
  createIdleSourceState,
  createSupersededSourceLoadResult,
  isSupersededSourceLoadResult,
  loadMediabunnySourceController,
  validateSources,
} from '#mediabunny-adapter/internal/sourceLifecycle';
import {
  getTimelinePlaybackSeconds,
  setTimelineClock,
} from '#mediabunny-adapter/internal/transportClock';
import {
  cancelVideoPlayback,
  clearPreviewCanvas,
  invalidateFrameRendering,
  renderActiveVideoFrame,
  syncActiveVideoPlaybackFrame,
} from '#mediabunny-adapter/internal/videoOutput';
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

function disposeController(controller: MediabunnySourceController) {
  stopMediaClock(controller);
  invalidateFrameRendering(controller);
  if (controller.ownsInput) {
    controller.input?.dispose();
  }
}
