import type {
  ActiveClip,
  TimelineMediaSource,
  TimelineMediaSourceAttempt,
  TimelineMediaSourceOperationResult,
  TimelineMediaSourceStatus,
  TimelineMediaSourceTiming,
  TimelineMediaSyncAdapter,
} from '@techsquidtv/canvas-timeline-core';
import { toSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';

/**
 * Source value that can be loaded into a native HTML media element.
 */
export type HTMLMediaSourceInput = string | Blob | File;

/** One resolved media choice for a logical timeline source. */
export type HTMLMediaSource = TimelineMediaSource<HTMLMediaSourceInput>;

/** Observable lifecycle and input state for one HTML media source. */
export interface HTMLMediaSourceState {
  /** Logical source identifier. */
  sourceId: string;
  /** Current native source loading state. */
  status: TimelineMediaSourceStatus;
  /** Selected preferred/fallback input index, or `null` after all inputs fail. */
  selectedInputIndex: number | null;
  /** Ordered native input attempts for the current source definition. */
  attempts: readonly TimelineMediaSourceAttempt[];
  /** Terminal source error when loading fails. */
  error: Error | null;
}

/**
 * Timeline media sync adapter backed by one HTMLMediaElement.
 *
 * @remarks
 *
 * This adapter is intentionally small: it maps the first active clip from the
 * configured layers to a native `<video>` or `<audio>` element, seeks the
 * element to the clip's source time, and lets the element clock drive timeline
 * playback. Use it for simple browser-native previews before reaching for a
 * frame-accurate decoded adapter.
 *
 * @see {@link createHTMLMediaAdapter}
 * @see {@link https://canvastimeline.com/packages/html-media-adapter | HTML media adapter guide}
 */
export interface HTMLMediaAdapter extends TimelineMediaSyncAdapter {
  /** Immutable source snapshot replaced whenever observable lifecycle state changes. */
  readonly sourceStateById: ReadonlyMap<string, HTMLMediaSourceState>;
  /** Current native media element volume from 0 to 1. */
  readonly volume: number;
  /** Whether native media element output is muted. */
  readonly muted: boolean;
  /** Reconcile the complete logical source registry without recreating the adapter. */
  setSources: (sources: readonly HTMLMediaSource[]) => void;
  /** Update native element volume without reloading the active source. */
  setVolume: (volume: number) => void;
  /** Update native element mute state without reloading the active source. */
  setMuted: (muted: boolean) => void;
  /** Retry one source from its preferred input and report that native loading was configured. */
  retrySource: (sourceId: string) => Promise<TimelineMediaSourceOperationResult>;
  /** Replace one resolved source without recreating the adapter. */
  replaceSource: (source: HTMLMediaSource) => Promise<TimelineMediaSourceOperationResult>;
  /** Release object URLs and pause the media element. */
  dispose: () => void;
}

/**
 * Options for creating an imperative HTML media element adapter.
 *
 * @remarks
 *
 * Logical sources match timeline clip `sourceId` values. Each source describes
 * one app-resolved media choice plus equivalent transport fallbacks.
 */
export interface CreateHTMLMediaAdapterOptions {
  /** Native video or audio element to synchronize with the timeline. */
  element: HTMLMediaElement;
  /** Resolved media sources and equivalent transport fallbacks. */
  sources: readonly HTMLMediaSource[];
  /** Called when selected source state or runtime controls change. */
  onChange?: () => void;
}

type HTMLMediaInputFailureOutcome = 'advanced' | 'terminal';

interface HTMLMediaElementLoad {
  generation: number;
  sourceId: string;
  inputIndex: number;
  url: string;
}

/**
 * Create an adapter that maps active timeline clips to one HTMLMediaElement.
 *
 * @remarks
 *
 * Use the imperative adapter when your app owns the media element lifecycle but
 * wants Canvas Timeline to do clip-to-source time mapping. React apps normally
 * use the optional React hooks instead so disposal follows component lifetime.
 *
 * @param options - Media element and source map used for timeline synchronization.
 * @returns Adapter callbacks compatible with Canvas Timeline media synchronization.
 *
 * @example
 * ```ts
 * import { createHTMLMediaAdapter } from '@techsquidtv/canvas-timeline-html-media-adapter';
 *
 * const video = document.querySelector('video');
 *
 * if (video) {
 *   const adapter = createHTMLMediaAdapter({
 *     element: video,
 *     sources: [{
 *       sourceId: 'source-1',
 *       input: '/media/interview.mp4',
 *     }],
 *   });
 *
 *   await adapter.seek?.(engine.getTime(), engine.getActiveLayers({
 *     layers: {
 *       visuals: { trackKind: 'visual', sourceId: 'source-1' },
 *     },
 *   }));
 * }
 * ```
 *
 * @see {@link HTMLMediaAdapter}
 * @see {@link https://canvastimeline.com/docs/react-hooks | React editor hooks}
 */
export function createHTMLMediaAdapter(options: CreateHTMLMediaAdapterOptions): HTMLMediaAdapter {
  const { element, sources } = options;
  validateHTMLMediaSources(sources);
  const sourceDefinitions = new Map(sources.map((source) => [source.sourceId, source]));
  let sourceStateSnapshot: ReadonlyMap<string, HTMLMediaSourceState> = new Map(
    sources.map((source) => [
      source.sourceId,
      {
        sourceId: source.sourceId,
        status: 'idle',
        selectedInputIndex: null,
        attempts: [],
        error: null,
      },
    ])
  );
  const selectedInputIndexBySourceId = new Map<string, number>();
  const objectUrlsBySourceId = new Map<string, Map<string, string>>();
  let activeClip: ActiveClip | undefined;
  let timelineTimeAtStart = 0;
  let playbackRate = 1;
  let shouldPlay = false;
  let clockStartPending = false;
  let lastError: Error | null = null;
  let loadGeneration = 0;
  let activeLoad: HTMLMediaElementLoad | undefined;
  const inputFailureOutcomes = new Map<number, HTMLMediaInputFailureOutcome>();
  const inputFailureWaiters = new Map<
    number,
    Set<(outcome: HTMLMediaInputFailureOutcome) => void>
  >();
  const notify = () => options.onChange?.();

  const settleInputFailure = (generation: number, outcome: HTMLMediaInputFailureOutcome) => {
    const waiters = inputFailureWaiters.get(generation);
    if (waiters === undefined) {
      if (clockStartPending) {
        inputFailureOutcomes.set(generation, outcome);
      }
      return;
    }

    inputFailureWaiters.delete(generation);
    for (const resolve of waiters) {
      resolve(outcome);
    }
  };

  const waitForInputFailure = (generation: number) => {
    const settledOutcome = inputFailureOutcomes.get(generation);
    if (settledOutcome !== undefined) {
      inputFailureOutcomes.delete(generation);
      return Promise.resolve(settledOutcome);
    }

    return new Promise<HTMLMediaInputFailureOutcome>((resolve) => {
      const waiters = inputFailureWaiters.get(generation);
      if (waiters === undefined) {
        inputFailureWaiters.set(generation, new Set([resolve]));
      } else {
        waiters.add(resolve);
      }
    });
  };

  const setSourceState = (state: HTMLMediaSourceState) => {
    const nextSnapshot = new Map(sourceStateSnapshot);
    nextSnapshot.set(state.sourceId, state);
    sourceStateSnapshot = nextSnapshot;
    notify();
  };

  const revokeSourceObjectUrls = (sourceId: string) => {
    const sourceObjectUrls = objectUrlsBySourceId.get(sourceId);
    if (sourceObjectUrls === undefined) {
      return;
    }

    for (const url of sourceObjectUrls.values()) {
      URL.revokeObjectURL(url);
    }
    objectUrlsBySourceId.delete(sourceId);
  };

  const setSourceIdle = (sourceId: string) => {
    const previousState = sourceStateSnapshot.get(sourceId);
    if (previousState === undefined || previousState.status === 'idle') {
      return;
    }
    setSourceState({
      ...previousState,
      status: 'idle',
      selectedInputIndex: null,
      error: null,
    });
  };

  const clearElement = () => {
    if (activeClip !== undefined) {
      setSourceIdle(activeClip.clip.sourceId);
    }
    activeClip = undefined;
    activeLoad = undefined;
    element.pause();
    element.removeAttribute('src');
    element.load();
  };

  const getSourceInputs = (sourceId: string) => {
    const source = sourceDefinitions.get(sourceId);
    if (source === undefined) {
      return undefined;
    }
    return {
      inputs: [source.input, ...(source.fallbacks ?? [])],
      timing: source.timing,
    };
  };

  const getSourceUrl = (sourceId: string) => {
    const sourceInputs = getSourceInputs(sourceId);
    const inputIndex = selectedInputIndexBySourceId.get(sourceId) ?? 0;
    const input = sourceInputs?.inputs[inputIndex];
    if (sourceInputs === undefined || input === undefined) {
      return undefined;
    }

    if (typeof input === 'string') {
      return new URL(input, element.ownerDocument.baseURI).href;
    }

    const objectUrlKey = inputIndex.toString();
    const sourceObjectUrls = objectUrlsBySourceId.get(sourceId);
    const existingUrl = sourceObjectUrls?.get(objectUrlKey);
    if (existingUrl !== undefined) {
      return existingUrl;
    }

    const url = URL.createObjectURL(input);
    if (sourceObjectUrls === undefined) {
      objectUrlsBySourceId.set(sourceId, new Map([[objectUrlKey, url]]));
    } else {
      sourceObjectUrls.set(objectUrlKey, url);
    }
    return url;
  };

  const loadClip = (
    clip: ActiveClip,
    timelineTime: RationalTime,
    loadOptions: { forceReload?: boolean; status?: 'loading' | 'recovering' } = {}
  ) => {
    const nextUrl = getSourceUrl(clip.clip.sourceId);
    if (nextUrl === undefined) {
      lastError = new Error(`No HTML media source configured for source "${clip.clip.sourceId}".`);
      clearElement();
      return false;
    }

    lastError = null;
    const sourceInputs = getSourceInputs(clip.clip.sourceId);
    const inputIndex = selectedInputIndexBySourceId.get(clip.clip.sourceId) ?? 0;
    const previousState = sourceStateSnapshot.get(clip.clip.sourceId);
    const sourceChanged = activeClip?.clip.sourceId !== clip.clip.sourceId;
    const urlChanged = element.src !== nextUrl;
    if (sourceChanged && activeClip !== undefined) {
      setSourceIdle(activeClip.clip.sourceId);
    }
    if (sourceInputs !== undefined && (sourceChanged || previousState?.status === 'idle')) {
      setSourceState({
        sourceId: clip.clip.sourceId,
        status: loadOptions.status ?? 'loading',
        selectedInputIndex: inputIndex,
        attempts: previousState?.attempts ?? [],
        error: null,
      });
    }
    activeClip = clip;
    timelineTimeAtStart = toSeconds(timelineTime);
    element.playbackRate = playbackRate;

    if (
      sourceChanged ||
      urlChanged ||
      loadOptions.forceReload === true ||
      activeLoad === undefined
    ) {
      loadGeneration += 1;
      activeLoad = {
        generation: loadGeneration,
        sourceId: clip.clip.sourceId,
        inputIndex,
        url: nextUrl,
      };
    }

    if (urlChanged) {
      element.src = nextUrl;
    } else if (loadOptions.forceReload === true) {
      element.load();
    }

    const timing = sourceInputs?.timing;
    const nextCurrentTime =
      toSeconds(clip.sourceTime) +
      (timing === undefined ? 0 : timing.mediaTimeSeconds - timing.sourceTimeSeconds);
    if (Math.abs(element.currentTime - nextCurrentTime) > 0.03) {
      element.currentTime = nextCurrentTime;
    }

    if (
      !urlChanged &&
      loadOptions.forceReload !== true &&
      element.readyState >= HTMLMediaElement.HAVE_METADATA
    ) {
      const state = sourceStateSnapshot.get(clip.clip.sourceId);
      if (state?.status !== 'ready' || state.selectedInputIndex !== inputIndex) {
        setSourceState({
          sourceId: clip.clip.sourceId,
          status: 'ready',
          selectedInputIndex: inputIndex,
          attempts: [...(state?.attempts ?? []), { inputIndex, status: 'ready', error: null }],
          error: null,
        });
      }
    }

    return true;
  };

  const playElement = async () => {
    if (activeClip === undefined) {
      if (lastError !== null) {
        throw lastError;
      }
      return false;
    }

    const sourceId = activeClip.clip.sourceId;
    const inputIndex = selectedInputIndexBySourceId.get(sourceId) ?? 0;
    const load = activeLoad;
    try {
      await element.play();
      return true;
    } catch (playError: unknown) {
      if (load !== undefined) {
        const settledOutcome = inputFailureOutcomes.get(load.generation);
        if (settledOutcome !== undefined) {
          inputFailureOutcomes.delete(load.generation);
          if (settledOutcome === 'advanced' && shouldPlay) {
            return playElement();
          }
          throw lastError ?? new Error(`HTML media input failed for source "${sourceId}".`);
        }
      }

      const currentSourceId = activeClip?.clip.sourceId;
      const currentInputIndex =
        currentSourceId === undefined
          ? null
          : (selectedInputIndexBySourceId.get(currentSourceId) ?? 0);
      if (shouldPlay && currentSourceId === sourceId && currentInputIndex !== inputIndex) {
        return playElement();
      }
      const hasFallback = getSourceInputs(sourceId)?.inputs[inputIndex + 1] !== undefined;
      const isPlaybackPolicyError =
        playError instanceof DOMException &&
        (playError.name === 'NotAllowedError' || playError.name === 'AbortError');
      if (load !== undefined && element.error !== null && hasFallback && !isPlaybackPolicyError) {
        const failureOutcome = await waitForInputFailure(load.generation);
        if (failureOutcome === 'advanced' && shouldPlay) {
          return playElement();
        }
        throw lastError ?? new Error(`HTML media input failed for source "${sourceId}".`);
      }
      lastError = playError instanceof Error ? playError : new Error(String(playError));
      shouldPlay = false;
      throw lastError;
    }
  };

  const handleLoadedMetadata = () => {
    if (activeClip === undefined) {
      return;
    }
    const sourceId = activeClip.clip.sourceId;
    const inputIndex = selectedInputIndexBySourceId.get(sourceId) ?? 0;
    const previousState = sourceStateSnapshot.get(sourceId);
    if (
      previousState?.status === 'ready' &&
      previousState.selectedInputIndex === inputIndex &&
      previousState.attempts.at(-1)?.status === 'ready'
    ) {
      return;
    }
    setSourceState({
      sourceId,
      status: 'ready',
      selectedInputIndex: inputIndex,
      attempts: [...(previousState?.attempts ?? []), { inputIndex, status: 'ready', error: null }],
      error: null,
    });
  };

  const handleElementError = () => {
    const failedLoad = activeLoad;
    if (activeClip === undefined || failedLoad === undefined) {
      return;
    }
    const currentUrl = element.currentSrc || element.src;
    if (
      activeClip.clip.sourceId !== failedLoad.sourceId ||
      (currentUrl.length > 0 && currentUrl !== failedLoad.url)
    ) {
      return;
    }

    const sourceId = failedLoad.sourceId;
    const sourceInputs = getSourceInputs(sourceId);
    const failedInputIndex = failedLoad.inputIndex;
    if ((selectedInputIndexBySourceId.get(sourceId) ?? 0) !== failedInputIndex) {
      return;
    }
    const nextIndex = failedInputIndex + 1;
    const nativeMessage = element.error?.message;
    const inputError = new Error(
      nativeMessage === undefined || nativeMessage.length === 0
        ? `HTML media input ${failedInputIndex} failed for source "${sourceId}".`
        : nativeMessage
    );
    const attempts = [
      ...(sourceStateSnapshot.get(sourceId)?.attempts ?? []),
      { inputIndex: failedInputIndex, status: 'failed', error: inputError } as const,
    ];
    if (sourceInputs?.inputs[nextIndex] === undefined) {
      const sourceError = new Error(`All HTML media inputs failed for source "${sourceId}".`);
      lastError = sourceError;
      setSourceState({
        sourceId,
        status: 'failed',
        selectedInputIndex: null,
        attempts,
        error: sourceError,
      });
      shouldPlay = false;
      element.pause();
      settleInputFailure(failedLoad.generation, 'terminal');
      return;
    }
    selectedInputIndexBySourceId.set(sourceId, nextIndex);
    setSourceState({
      sourceId,
      status: 'recovering',
      selectedInputIndex: nextIndex,
      attempts,
      error: null,
    });
    const clip = activeClip;
    loadClip(clip, { v: timelineTimeAtStart, r: 1 }, { forceReload: true, status: 'recovering' });
    settleInputFailure(failedLoad.generation, 'advanced');
    if (shouldPlay && !clockStartPending) {
      void playElement().catch(() => undefined);
    }
  };

  const reconcileSources = (nextSources: readonly HTMLMediaSource[]) => {
    validateHTMLMediaSources(nextSources);
    const nextDefinitions = new Map(nextSources.map((source) => [source.sourceId, source]));
    const changedSourceIds = new Set<string>();

    for (const [sourceId, source] of sourceDefinitions) {
      const nextSource = nextDefinitions.get(sourceId);
      if (nextSource === undefined || !areHTMLMediaSourcesEqual(source, nextSource)) {
        changedSourceIds.add(sourceId);
      }
    }
    for (const sourceId of nextDefinitions.keys()) {
      if (!sourceDefinitions.has(sourceId)) {
        changedSourceIds.add(sourceId);
      }
    }
    if (changedSourceIds.size === 0 && sourceDefinitions.size === nextDefinitions.size) {
      return;
    }

    for (const sourceId of changedSourceIds) {
      revokeSourceObjectUrls(sourceId);
      selectedInputIndexBySourceId.delete(sourceId);
    }

    sourceDefinitions.clear();
    for (const [sourceId, source] of nextDefinitions) {
      sourceDefinitions.set(sourceId, source);
    }

    sourceStateSnapshot = new Map(
      nextSources.map((source) => {
        const previousState = sourceStateSnapshot.get(source.sourceId);
        return [
          source.sourceId,
          previousState !== undefined && !changedSourceIds.has(source.sourceId)
            ? previousState
            : {
                sourceId: source.sourceId,
                status: 'idle' as const,
                selectedInputIndex: null,
                attempts: [],
                error: null,
              },
        ];
      })
    );

    const activeSourceId = activeClip?.clip.sourceId;
    if (activeSourceId !== undefined && !nextDefinitions.has(activeSourceId)) {
      activeClip = undefined;
      shouldPlay = false;
      element.pause();
      element.removeAttribute('src');
      element.load();
    }
    notify();

    if (
      activeClip !== undefined &&
      activeSourceId !== undefined &&
      changedSourceIds.has(activeSourceId)
    ) {
      selectedInputIndexBySourceId.set(activeSourceId, 0);
      loadClip(activeClip, { v: timelineTimeAtStart, r: 1 }, { forceReload: true });
    }
  };

  element.addEventListener('loadedmetadata', handleLoadedMetadata);
  element.addEventListener('error', handleElementError);

  return {
    get sourceStateById() {
      return sourceStateSnapshot;
    },
    get volume() {
      return element.volume;
    },
    get muted() {
      return element.muted;
    },
    setSources: reconcileSources,
    getClockTime: () => {
      if (activeClip === undefined) {
        return timelineTimeAtStart;
      }

      const sourceInputs = getSourceInputs(activeClip.clip.sourceId);
      const timing = sourceInputs?.timing;
      const logicalSourceTime =
        element.currentTime -
        (timing === undefined ? 0 : timing.mediaTimeSeconds - timing.sourceTimeSeconds);
      return (
        logicalSourceTime +
        toSeconds(activeClip.clip.timelineStart) -
        toSeconds(activeClip.clip.sourceStart)
      );
    },
    startClock: async (timelineTime, rate) => {
      timelineTimeAtStart = toSeconds(timelineTime);
      playbackRate = rate;
      shouldPlay = true;
      element.playbackRate = rate;

      clockStartPending = true;
      try {
        return await playElement();
      } finally {
        clockStartPending = false;
      }
    },
    stopClock: () => {
      shouldPlay = false;
      clockStartPending = false;
      element.pause();
    },
    setClockRate: (rate) => {
      playbackRate = rate;
      element.playbackRate = rate;
    },
    setVolume: (volume) => {
      if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
        throw new RangeError('volume must be a finite number from 0 to 1.');
      }
      element.volume = volume;
      notify();
    },
    setMuted: (muted) => {
      element.muted = muted;
      notify();
    },
    retrySource: async (sourceId) => {
      if (!sourceDefinitions.has(sourceId)) {
        return {
          ok: false,
          sourceId,
          reason: 'unknown-source',
          error: new Error(`Unknown HTML media source "${sourceId}".`),
        };
      }
      selectedInputIndexBySourceId.set(sourceId, 0);
      setSourceState({
        sourceId,
        status: activeClip?.clip.sourceId === sourceId ? 'loading' : 'idle',
        selectedInputIndex: activeClip?.clip.sourceId === sourceId ? 0 : null,
        attempts: [],
        error: null,
      });
      if (activeClip?.clip.sourceId === sourceId) {
        loadClip(activeClip, { v: timelineTimeAtStart, r: 1 }, { forceReload: true });
      }
      return { ok: true, sourceId, state: 'configured' };
    },
    replaceSource: async (source) => {
      try {
        validateHTMLMediaSources([source]);
      } catch (sourceError) {
        return {
          ok: false,
          sourceId: source.sourceId,
          reason: 'invalid-source',
          error: sourceError instanceof Error ? sourceError : new Error(String(sourceError)),
        };
      }
      reconcileSources([
        ...[...sourceDefinitions.values()].filter(
          (existingSource) => existingSource.sourceId !== source.sourceId
        ),
        source,
      ]);
      return { ok: true, sourceId: source.sourceId, state: 'configured' };
    },
    seek: (_timelineTime, activeLayers) => {
      const clip = activeLayers.all[0];
      if (clip === undefined) {
        lastError = null;
        clearElement();
        return;
      }

      if (!loadClip(clip, activeLayers.time) && lastError !== null) {
        throw lastError;
      }
    },
    syncLayers: async ({ activeLayers, timelineTime }) => {
      const clip = activeLayers.all[0];
      if (clip === undefined) {
        lastError = null;
        clearElement();
        return;
      }

      const loaded = loadClip(clip, timelineTime);
      if (!loaded && shouldPlay && lastError !== null) {
        throw lastError;
      }
      if (loaded && shouldPlay) {
        await playElement();
      }
    },
    onStatus: (status) => {
      if (status !== 'playing') {
        shouldPlay = false;
        element.pause();
      }
    },
    dispose: () => {
      shouldPlay = false;
      clockStartPending = false;
      activeLoad = undefined;
      element.pause();
      element.removeEventListener('loadedmetadata', handleLoadedMetadata);
      element.removeEventListener('error', handleElementError);
      for (const sourceId of objectUrlsBySourceId.keys()) {
        revokeSourceObjectUrls(sourceId);
      }
      for (const waiters of inputFailureWaiters.values()) {
        for (const resolve of waiters) {
          resolve('terminal');
        }
      }
      inputFailureWaiters.clear();
      inputFailureOutcomes.clear();
    },
  };
}

function validateHTMLMediaSources(sources: readonly HTMLMediaSource[]) {
  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (source.sourceId.length === 0) {
      throw new Error('HTML media sourceId cannot be empty.');
    }
    if (sourceIds.has(source.sourceId)) {
      throw new Error(`Duplicate HTML media sourceId "${source.sourceId}".`);
    }
    sourceIds.add(source.sourceId);
    validateHTMLMediaTiming(source.sourceId, source.timing);
  }
}

function validateHTMLMediaTiming(sourceId: string, timing: TimelineMediaSourceTiming | undefined) {
  if (
    timing !== undefined &&
    (!Number.isFinite(timing.sourceTimeSeconds) || !Number.isFinite(timing.mediaTimeSeconds))
  ) {
    throw new Error(`HTML media source "${sourceId}" timing values must be finite.`);
  }
}

function areHTMLMediaSourcesEqual(left: HTMLMediaSource, right: HTMLMediaSource) {
  const leftFallbacks = left.fallbacks ?? [];
  const rightFallbacks = right.fallbacks ?? [];
  return (
    left.sourceId === right.sourceId &&
    left.input === right.input &&
    leftFallbacks.length === rightFallbacks.length &&
    leftFallbacks.every((input, index) => input === rightFallbacks[index]) &&
    left.timing?.sourceTimeSeconds === right.timing?.sourceTimeSeconds &&
    left.timing?.mediaTimeSeconds === right.timing?.mediaTimeSeconds
  );
}
