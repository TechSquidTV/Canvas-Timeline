import type { ActiveClip } from '@techsquidtv/canvas-timeline-core';
import { toSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useEffect, useMemo, useReducer, useState, type RefObject } from 'react';
import {
  useTimelineMediaSync,
  type TimelineMediaSyncAdapter,
  type TimelineMediaSourceOperationResult,
  type TimelineMediaSourceStatus,
  type UseTimelineMediaSyncOptions,
  type UseTimelineMediaSyncResult,
} from '@techsquidtv/canvas-timeline-react';

/**
 * Source value that can be loaded into a native HTML media element.
 */
export type HTMLMediaAdapterSource = string | Blob | File;

/** Maps a logical source timestamp to the corresponding resolved media timestamp. */
export interface HTMLMediaSourceTiming {
  /** Timestamp in the logical source time domain. */
  sourceTimeSeconds: number;
  /** Equivalent timestamp in the resolved media's time domain. */
  mediaTimeSeconds: number;
}

/** One resolved media choice for a logical timeline source. */
export interface HTMLMediaSource {
  /** Identifier matching timeline clip `sourceId` values. */
  sourceId: string;
  /** Preferred URL, blob, or file for the resolved media. */
  input: HTMLMediaAdapterSource;
  /** Equivalent inputs attempted only when the preferred input fails. */
  fallbacks?: readonly HTMLMediaAdapterSource[];
  /** Optional mapping when media timestamps differ from logical source timestamps. */
  timing?: HTMLMediaSourceTiming;
}

/** One native input attempt for an HTML media source. */
export interface HTMLMediaSourceAttempt {
  /** Preferred/fallback input index. */
  inputIndex: number;
  /** Whether native metadata loaded or the input failed. */
  status: 'ready' | 'failed';
  /** Native media error for a failed input. */
  error: Error | null;
}

/** Observable lifecycle and input state for one HTML media source. */
export interface HTMLMediaSourceState {
  /** Logical source identifier. */
  sourceId: string;
  /** Current native source loading state. */
  status: TimelineMediaSourceStatus;
  /** Selected preferred/fallback input index, or `null` after all inputs fail. */
  selectedInputIndex: number | null;
  /** Ordered native input attempts for the current source definition. */
  attempts: readonly HTMLMediaSourceAttempt[];
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
 * @see {@link useHTMLTimelineMedia}
 */
export interface HTMLMediaAdapter extends TimelineMediaSyncAdapter {
  /** Immutable source snapshot replaced whenever observable lifecycle state changes. */
  readonly sourceStateById: ReadonlyMap<string, HTMLMediaSourceState>;
  readonly volume: number;
  readonly muted: boolean;
  setVolume: (volume: number) => void;
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

/**
 * Options for creating an HTML media adapter from a React ref.
 *
 * @template TMediaElement - Native element type held by the ref, such as
 * `HTMLVideoElement` or `HTMLAudioElement`.
 */
export interface UseHTMLMediaAdapterOptions<
  TMediaElement extends HTMLMediaElement = HTMLMediaElement,
> {
  /** Ref containing the media element once React has mounted it. */
  ref: RefObject<TMediaElement | null>;
  /** Resolved media sources and equivalent transport fallbacks. */
  sources: readonly HTMLMediaSource[];
}

/**
 * React hook result for native HTML media timeline synchronization.
 */
export interface UseHTMLMediaAdapterResult {
  /** Whether the media element ref has been connected. */
  ready: boolean;
  /** Adapter callbacks passed to `useTimelineMediaSync`. */
  adapter: HTMLMediaAdapter;
}

/**
 * Options for wiring one native media element directly to timeline playback.
 *
 * @remarks
 *
 * This is the high-level React shape used by the HTML media sync demo. Provide
 * a media element ref, source map, and named layers. The hook creates an
 * {@link HTMLMediaAdapter}, passes it to {@link useTimelineMediaSync}, and
 * exposes transport commands suitable for toolbar buttons.
 *
 * @template LayerName - Named media layer keys inferred from `layers`, such as
 * `"visuals"` for a video-only preview.
 * @template TMediaElement - Native element type held by `ref`.
 *
 * @see {@link https://canvastimeline.com/demos/html-media-sync | HTML media sync demo}
 */
export interface UseHTMLTimelineMediaOptions<
  LayerName extends string = string,
  TMediaElement extends HTMLMediaElement = HTMLMediaElement,
>
  extends
    UseHTMLMediaAdapterOptions<TMediaElement>,
    Pick<UseTimelineMediaSyncOptions<LayerName>, 'layers' | 'onError' | 'playbackOptions'> {}

/**
 * Timeline transport state plus the underlying native media adapter.
 *
 * @template LayerName - Named media layer keys from
 * {@link UseHTMLTimelineMediaOptions.layers}.
 */
export interface UseHTMLTimelineMediaResult<
  LayerName extends string = string,
> extends UseTimelineMediaSyncResult<LayerName> {
  /** Whether the media element ref has been connected. */
  ready: boolean;
  /** Source lifecycle and input attempt state by source id. */
  sourceStateById: HTMLMediaAdapter['sourceStateById'];
  /** Low-level adapter used for custom synchronization flows. */
  adapter: HTMLMediaAdapter;
}

const noopAdapter: HTMLMediaAdapter = {
  sourceStateById: new Map(),
  volume: 1,
  muted: false,
  getClockTime: () => 0,
  startClock: () => false,
  setVolume: () => {},
  setMuted: () => {},
  retrySource: (sourceId) =>
    Promise.resolve({
      ok: false,
      sourceId,
      reason: 'unknown-source',
      error: new Error('HTML media is unavailable.'),
    }),
  replaceSource: (source) =>
    Promise.resolve({
      ok: false,
      sourceId: source.sourceId,
      reason: 'load-failed',
      error: new Error('HTML media is unavailable.'),
    }),
  dispose: () => {},
};

/**
 * Create an adapter that maps active timeline clips to one HTMLMediaElement.
 *
 * @remarks
 *
 * Use the imperative adapter when your app owns the media element lifecycle but
 * wants Canvas Timeline to do clip-to-source time mapping. React apps normally
 * use {@link useHTMLMediaAdapter} or {@link useHTMLTimelineMedia} instead so
 * disposal follows component lifetime.
 *
 * @param options - Media element and source map used for timeline synchronization.
 * @returns Adapter callbacks compatible with {@link useTimelineMediaSync}.
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
  let lastError: Error | null = null;
  const notify = () => options.onChange?.();

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

    try {
      await element.play();
      return true;
    } catch (playError: unknown) {
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
    if (activeClip === undefined) {
      return;
    }
    const sourceId = activeClip.clip.sourceId;
    const sourceInputs = getSourceInputs(sourceId);
    const failedInputIndex = selectedInputIndexBySourceId.get(sourceId) ?? 0;
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
    if (shouldPlay) {
      void playElement().catch(() => undefined);
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

      return playElement();
    },
    stopClock: () => {
      shouldPlay = false;
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
      revokeSourceObjectUrls(source.sourceId);
      sourceDefinitions.set(source.sourceId, source);
      selectedInputIndexBySourceId.set(source.sourceId, 0);
      setSourceState({
        sourceId: source.sourceId,
        status: activeClip?.clip.sourceId === source.sourceId ? 'loading' : 'idle',
        selectedInputIndex: activeClip?.clip.sourceId === source.sourceId ? 0 : null,
        attempts: [],
        error: null,
      });
      if (activeClip?.clip.sourceId === source.sourceId) {
        loadClip(activeClip, { v: timelineTimeAtStart, r: 1 }, { forceReload: true });
      }
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
      element.pause();
      element.removeEventListener('loadedmetadata', handleLoadedMetadata);
      element.removeEventListener('error', handleElementError);
      for (const sourceId of objectUrlsBySourceId.keys()) {
        revokeSourceObjectUrls(sourceId);
      }
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

function validateHTMLMediaTiming(sourceId: string, timing: HTMLMediaSourceTiming | undefined) {
  if (
    timing !== undefined &&
    (!Number.isFinite(timing.sourceTimeSeconds) || !Number.isFinite(timing.mediaTimeSeconds))
  ) {
    throw new Error(`HTML media source "${sourceId}" timing values must be finite.`);
  }
}

/**
 * Create and dispose an HTML media element timeline adapter from a React ref.
 *
 * @remarks
 *
 * Use this lower-level hook when you want direct access to the
 * {@link HTMLMediaAdapter} but will wire playback through
 * {@link useTimelineMediaSync} yourself. For the common case where a single
 * element should drive timeline playback, use {@link useHTMLTimelineMedia}.
 *
 * @param options - React media element ref and source map for the adapter.
 * @template TMediaElement - Native element type held by `options.ref`.
 * @returns Adapter readiness and callbacks for the mounted media element.
 */
export function useHTMLMediaAdapter<TMediaElement extends HTMLMediaElement = HTMLMediaElement>(
  options: UseHTMLMediaAdapterOptions<TMediaElement>
): UseHTMLMediaAdapterResult {
  const { ref, sources } = options;
  const [, forceUpdate] = useReducer((value: number) => value + 1, 0);
  const [element, setElement] = useState<HTMLMediaElement | null>(null);

  useEffect(() => {
    setElement(ref.current);
  }, [ref]);

  const adapter = useMemo(() => {
    if (element === null) {
      return noopAdapter;
    }

    return createHTMLMediaAdapter({
      element,
      sources,
      onChange: forceUpdate,
    });
  }, [element, sources]);

  useEffect(() => adapter.dispose, [adapter]);

  return useMemo(
    () => ({
      ready: element !== null,
      adapter,
    }),
    [adapter, element]
  );
}

/**
 * Create a native media adapter and bind it to timeline-synchronized playback.
 *
 * @remarks
 *
 * This hook is the simplest route for browser-native video or audio previews:
 * create a stable `sources` array, name the active layers you want to sync, and
 * render standard transport buttons from the returned commands. It is best for
 * straightforward media previews; use the Mediabunny adapter when you need
 * decoded canvas frames, audio scheduling, or richer source inspection.
 *
 * @param options - Media element ref, source map, active layers, and optional error callback.
 * @template LayerName - Named media layer keys inferred from `options.layers`.
 * @template TMediaElement - Native element type held by `options.ref`.
 * @returns Timeline transport state, readiness, active layers, and the underlying adapter.
 *
 * @example
 * ```tsx
 * import { useMemo, useRef } from 'react';
 * import { useHTMLTimelineMedia } from '@techsquidtv/canvas-timeline-html-media-adapter';
 *
 * const previewLayers = {
 *   visuals: { trackKind: 'visual', sourceId: 'sample-video' },
 * } as const;
 *
 * export function NativeVideoPreview() {
 *   const ref = useRef<HTMLVideoElement>(null);
 *   const sources = useMemo(() => [{
 *     sourceId: 'sample-video',
 *     input: '/media/sample.mp4',
 *   }], []);
 *   const media = useHTMLTimelineMedia({
 *     ref,
 *     sources,
 *     layers: previewLayers,
 *     onError: console.error,
 *   });
 *
 *   return (
 *     <>
 *       <video ref={ref} muted playsInline />
 *       <button type="button" disabled={!media.ready} onClick={() => void media.play()}>
 *         {media.playing ? 'Playing' : 'Play'}
 *       </button>
 *     </>
 *   );
 * }
 * ```
 *
 * @see {@link useTimelineMediaSync}
 * @see {@link https://canvastimeline.com/demos/html-media-sync | HTML media sync demo}
 */
export function useHTMLTimelineMedia<
  LayerName extends string = string,
  TMediaElement extends HTMLMediaElement = HTMLMediaElement,
>(
  options: UseHTMLTimelineMediaOptions<LayerName, TMediaElement>
): UseHTMLTimelineMediaResult<LayerName> {
  const { layers, onError, playbackOptions, ref, sources } = options;
  const htmlMedia = useHTMLMediaAdapter({ ref, sources });
  const mediaSync = useTimelineMediaSync<LayerName>({
    ready: htmlMedia.ready,
    layers,
    playbackOptions,
    adapter: htmlMedia.adapter,
    onError,
  });
  const sourceStateById = htmlMedia.adapter.sourceStateById;

  return useMemo(
    () => ({
      ...mediaSync,
      ready: htmlMedia.ready,
      sourceStateById,
      adapter: htmlMedia.adapter,
    }),
    [htmlMedia.adapter, htmlMedia.ready, mediaSync, sourceStateById]
  );
}
