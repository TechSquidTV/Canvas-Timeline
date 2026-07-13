import type { ActiveClip } from '@techsquidtv/canvas-timeline-core';
import { toSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useEffect, useMemo, useReducer, useState, type RefObject } from 'react';
import {
  useTimelineMediaSync,
  type TimelineMediaSyncAdapter,
  type UseTimelineMediaSyncOptions,
  type UseTimelineMediaSyncResult,
} from '@techsquidtv/canvas-timeline-react';

/**
 * Source value that can be loaded into a native HTML media element.
 */
export type HTMLMediaAdapterSource = string | Blob | File;

/** Maps a logical source timestamp to the corresponding representation timestamp. */
export interface HTMLMediaRepresentationTiming {
  /** Timestamp in the logical source time domain. */
  sourceTimeSeconds: number;
  /** Equivalent timestamp in this representation's media time domain. */
  mediaTimeSeconds: number;
}

/** A deliberately selectable editing proxy for one logical source. */
export interface HTMLMediaProxy {
  /** Stable proxy identifier used for selection and diagnostics. */
  proxyId: string;
  /** Preferred URL, blob, or file for this proxy. */
  input: HTMLMediaAdapterSource;
  /** Inputs attempted only when this proxy's preferred input fails. */
  fallbacks?: readonly HTMLMediaAdapterSource[];
  /** Optional mapping when proxy timestamps differ from logical source timestamps. */
  timing?: HTMLMediaRepresentationTiming;
}

/** Original or proxy representation selected for a logical source. */
export type HTMLMediaRepresentationSelection =
  | { kind: 'original' }
  | { kind: 'proxy'; proxyId: string };

/** One logical timeline source with an original input and optional editing proxies. */
export interface HTMLMediaSource {
  /** Identifier matching timeline clip `sourceId` values. */
  sourceId: string;
  /** Preferred URL, blob, or file for the original representation. */
  input: HTMLMediaAdapterSource;
  /** Inputs attempted only when the original input fails. */
  fallbacks?: readonly HTMLMediaAdapterSource[];
  /** Deliberately selectable editing representations. */
  proxies?: readonly HTMLMediaProxy[];
  /** Optional mapping when original media timestamps differ from logical source timestamps. */
  timing?: HTMLMediaRepresentationTiming;
}

/** Observable representation and input state for one HTML media source. */
export interface HTMLMediaSourceState {
  /** Logical source identifier. */
  sourceId: string;
  /** Current native source loading state. */
  status: 'idle' | 'ready' | 'failed';
  /** Original or proxy representation currently selected for this source. */
  selectedRepresentation: HTMLMediaRepresentationSelection;
  /** Selected preferred/fallback input index, or `null` after all inputs fail. */
  selectedInputIndex: number | null;
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
  readonly sourceStateById: ReadonlyMap<string, HTMLMediaSourceState>;
  readonly volume: number;
  readonly muted: boolean;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setRepresentation: (
    sourceId: string,
    representation: HTMLMediaRepresentationSelection
  ) => boolean;
  retrySource: (sourceId: string) => boolean;
  replaceSource: (source: HTMLMediaSource) => boolean;
  /** Release object URLs and pause the media element. */
  dispose: () => void;
}

/**
 * Options for creating an imperative HTML media element adapter.
 *
 * @remarks
 *
 * Logical sources match timeline clip `sourceId` values. Each source has one
 * original input, optional per-representation fallbacks, and optional proxies.
 */
export interface CreateHTMLMediaAdapterOptions {
  /** Native video or audio element to synchronize with the timeline. */
  element: HTMLMediaElement;
  /** Logical media sources, original inputs, and optional proxies. */
  sources: readonly HTMLMediaSource[];
  /** Select the initial representation for each source. Defaults to original. */
  selectRepresentation?: (source: HTMLMediaSource) => HTMLMediaRepresentationSelection;
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
  /** Logical media sources, original inputs, and optional proxies. */
  sources: readonly HTMLMediaSource[];
  /** Select the initial representation for each source. Defaults to original. */
  selectRepresentation?: CreateHTMLMediaAdapterOptions['selectRepresentation'];
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
  /** Selected representation and input load state by source id. */
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
  setRepresentation: () => false,
  retrySource: () => false,
  replaceSource: () => false,
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
  const sourceStateById = new Map<string, HTMLMediaSourceState>();
  const selectedRepresentationBySourceId = new Map<string, HTMLMediaRepresentationSelection>();
  const selectedInputIndexBySourceId = new Map<string, number>();
  const objectUrlsBySourceId = new Map<string, Map<string, string>>();
  let activeClip: ActiveClip | undefined;
  let timelineTimeAtStart = 0;
  let playbackRate = 1;
  let shouldPlay = false;
  let lastError: Error | null = null;
  const notify = () => options.onChange?.();

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

  for (const source of sources) {
    const selection = options.selectRepresentation?.(source) ?? { kind: 'original' };
    assertHTMLMediaRepresentation(source, selection);
    selectedRepresentationBySourceId.set(source.sourceId, selection);
  }

  const clearElement = () => {
    activeClip = undefined;
    element.pause();
    element.removeAttribute('src');
    element.load();
  };

  const getRepresentation = (sourceId: string) => {
    const source = sourceDefinitions.get(sourceId);
    if (source === undefined) {
      return undefined;
    }

    const selection = selectedRepresentationBySourceId.get(sourceId) ?? { kind: 'original' };
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
  };

  const getSourceUrl = (sourceId: string) => {
    const representation = getRepresentation(sourceId);
    const inputIndex = selectedInputIndexBySourceId.get(sourceId) ?? 0;
    const input = representation?.inputs[inputIndex];
    if (representation === undefined || input === undefined) {
      return undefined;
    }

    if (typeof input === 'string') {
      return new URL(input, element.ownerDocument.baseURI).href;
    }

    const representationKey =
      representation.selection.kind === 'original'
        ? 'original'
        : `proxy:${representation.selection.proxyId}`;
    const objectUrlKey = `${representationKey}:${inputIndex}`;
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

  const loadClip = (clip: ActiveClip, timelineTime: RationalTime) => {
    const nextUrl = getSourceUrl(clip.clip.sourceId);
    if (nextUrl === undefined) {
      lastError = new Error(`No HTML media source configured for source "${clip.clip.sourceId}".`);
      clearElement();
      return false;
    }

    lastError = null;
    const representation = getRepresentation(clip.clip.sourceId);
    const inputIndex = selectedInputIndexBySourceId.get(clip.clip.sourceId) ?? 0;
    if (representation !== undefined) {
      sourceStateById.set(clip.clip.sourceId, {
        sourceId: clip.clip.sourceId,
        status: 'ready',
        selectedRepresentation: representation.selection,
        selectedInputIndex: inputIndex,
        error: null,
      });
      notify();
    }
    activeClip = clip;
    timelineTimeAtStart = toSeconds(timelineTime);
    element.playbackRate = playbackRate;

    if (element.src !== nextUrl) {
      element.src = nextUrl;
    }

    const timing = representation?.timing;
    const nextCurrentTime =
      toSeconds(clip.sourceTime) +
      (timing === undefined ? 0 : timing.mediaTimeSeconds - timing.sourceTimeSeconds);
    if (Math.abs(element.currentTime - nextCurrentTime) > 0.03) {
      element.currentTime = nextCurrentTime;
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

  const handleElementError = () => {
    if (activeClip === undefined) {
      return;
    }
    const sourceId = activeClip.clip.sourceId;
    const representation = getRepresentation(sourceId);
    const nextIndex = (selectedInputIndexBySourceId.get(sourceId) ?? 0) + 1;
    if (representation?.inputs[nextIndex] === undefined) {
      const sourceError = new Error(
        `All HTML media inputs failed for the selected representation of source "${sourceId}".`
      );
      lastError = sourceError;
      sourceStateById.set(sourceId, {
        sourceId,
        status: 'failed',
        selectedRepresentation: selectedRepresentationBySourceId.get(sourceId) ?? {
          kind: 'original',
        },
        selectedInputIndex: null,
        error: sourceError,
      });
      notify();
      shouldPlay = false;
      element.pause();
      return;
    }
    selectedInputIndexBySourceId.set(sourceId, nextIndex);
    const clip = activeClip;
    loadClip(clip, { v: timelineTimeAtStart, r: 1 });
    if (shouldPlay) {
      void playElement().catch(() => undefined);
    }
  };
  element.addEventListener('error', handleElementError);

  return {
    get sourceStateById() {
      return sourceStateById;
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

      const representation = getRepresentation(activeClip.clip.sourceId);
      const timing = representation?.timing;
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
    setRepresentation: (sourceId, representation) => {
      const source = sourceDefinitions.get(sourceId);
      if (source === undefined) {
        return false;
      }
      assertHTMLMediaRepresentation(source, representation);
      selectedRepresentationBySourceId.set(sourceId, representation);
      selectedInputIndexBySourceId.set(sourceId, 0);
      if (activeClip?.clip.sourceId === sourceId) {
        return loadClip(activeClip, { v: timelineTimeAtStart, r: 1 });
      }
      notify();
      return true;
    },
    retrySource: (sourceId) => {
      if (!sourceDefinitions.has(sourceId)) {
        return false;
      }
      selectedInputIndexBySourceId.set(sourceId, 0);
      if (activeClip?.clip.sourceId === sourceId) {
        return loadClip(activeClip, { v: timelineTimeAtStart, r: 1 });
      }
      notify();
      return true;
    },
    replaceSource: (source) => {
      validateHTMLMediaSources([source]);
      revokeSourceObjectUrls(source.sourceId);
      sourceDefinitions.set(source.sourceId, source);
      const previousSelection = selectedRepresentationBySourceId.get(source.sourceId) ?? {
        kind: 'original',
      };
      const nextSelection = hasHTMLMediaRepresentation(source, previousSelection)
        ? previousSelection
        : ({ kind: 'original' } as const);
      selectedRepresentationBySourceId.set(source.sourceId, nextSelection);
      selectedInputIndexBySourceId.set(source.sourceId, 0);
      if (activeClip?.clip.sourceId === source.sourceId) {
        return loadClip(activeClip, { v: timelineTimeAtStart, r: 1 });
      }
      notify();
      return true;
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
    if (sourceIds.has(source.sourceId)) {
      throw new Error(`Duplicate HTML media sourceId "${source.sourceId}".`);
    }
    sourceIds.add(source.sourceId);
    validateHTMLMediaTiming(source.sourceId, 'original', source.timing);
    const proxyIds = new Set<string>();
    for (const proxy of source.proxies ?? []) {
      if (proxy.proxyId.length === 0) {
        throw new Error(`HTML media source "${source.sourceId}" has an empty proxyId.`);
      }
      if (proxyIds.has(proxy.proxyId)) {
        throw new Error(
          `HTML media source "${source.sourceId}" has duplicate proxyId "${proxy.proxyId}".`
        );
      }
      proxyIds.add(proxy.proxyId);
      validateHTMLMediaTiming(source.sourceId, `proxy "${proxy.proxyId}"`, proxy.timing);
    }
  }
}

function validateHTMLMediaTiming(
  sourceId: string,
  representation: string,
  timing: HTMLMediaRepresentationTiming | undefined
) {
  if (
    timing !== undefined &&
    (!Number.isFinite(timing.sourceTimeSeconds) || !Number.isFinite(timing.mediaTimeSeconds))
  ) {
    throw new Error(
      `HTML media source "${sourceId}" ${representation} timing values must be finite.`
    );
  }
}

function hasHTMLMediaRepresentation(
  source: HTMLMediaSource,
  representation: HTMLMediaRepresentationSelection
) {
  return (
    representation.kind === 'original' ||
    source.proxies?.some((proxy) => proxy.proxyId === representation.proxyId) === true
  );
}

function assertHTMLMediaRepresentation(
  source: HTMLMediaSource,
  representation: HTMLMediaRepresentationSelection
) {
  if (!hasHTMLMediaRepresentation(source, representation)) {
    const proxyId = representation.kind === 'proxy' ? representation.proxyId : 'original';
    throw new Error(
      `HTML media source "${source.sourceId}" does not define representation "${proxyId}".`
    );
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
  const { ref, selectRepresentation, sources } = options;
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
      selectRepresentation,
      onChange: forceUpdate,
    });
  }, [element, selectRepresentation, sources]);

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
  const { layers, onError, playbackOptions, ref, selectRepresentation, sources } = options;
  const htmlMedia = useHTMLMediaAdapter({ ref, selectRepresentation, sources });
  const mediaSync = useTimelineMediaSync<LayerName>({
    ready: htmlMedia.ready,
    layers,
    playbackOptions,
    adapter: htmlMedia.adapter,
    onError,
  });

  return useMemo(
    () => ({
      ...mediaSync,
      ready: htmlMedia.ready,
      sourceStateById: htmlMedia.adapter.sourceStateById,
      adapter: htmlMedia.adapter,
    }),
    [htmlMedia.adapter, htmlMedia.ready, mediaSync]
  );
}
