import { useEffect, useMemo, useReducer, useRef, useState, type RefObject } from 'react';
import {
  useTimelineMediaSync,
  type UseTimelineMediaSyncOptions,
  type UseTimelineMediaSyncResult,
} from '@techsquidtv/canvas-timeline-react';
import {
  createHTMLMediaAdapter,
  type HTMLMediaAdapter,
  type HTMLMediaSource,
} from '#html-media-adapter/index';

/**
 * Options for creating an HTML media adapter from a React ref.
 *
 * @template TMediaElement - Native video or audio element held by `ref`.
 */
export interface UseHTMLMediaAdapterOptions<
  TMediaElement extends HTMLMediaElement = HTMLMediaElement,
> {
  /** Ref whose mounted native element should be synchronized. */
  ref: RefObject<TMediaElement | null>;
  /** Complete app-resolved source registry keyed by timeline clip `sourceId`. */
  sources: readonly HTMLMediaSource[];
}

/** React hook result for native HTML media timeline synchronization. */
export interface UseHTMLMediaAdapterResult {
  /** Whether the media element ref has resolved and an imperative adapter exists. */
  ready: boolean;
  /** Imperative adapter managed for the mounted media element. */
  adapter: HTMLMediaAdapter;
}

/** Options for wiring one native media element directly to timeline playback. */
export interface UseHTMLTimelineMediaOptions<
  LayerName extends string = string,
  TMediaElement extends HTMLMediaElement = HTMLMediaElement,
>
  extends
    UseHTMLMediaAdapterOptions<TMediaElement>,
    Pick<UseTimelineMediaSyncOptions<LayerName>, 'layers' | 'onError' | 'playbackOptions'> {}

/** Timeline transport state plus the underlying native media adapter. */
export interface UseHTMLTimelineMediaResult<
  LayerName extends string = string,
> extends UseTimelineMediaSyncResult<LayerName> {
  /** Whether the media element ref has resolved; inspect source state for native loading. */
  ready: boolean;
  /** Immutable native loading, fallback-attempt, and failure snapshot by source id. */
  sourceStateById: HTMLMediaAdapter['sourceStateById'];
  /** Underlying imperative HTML media adapter. */
  adapter: HTMLMediaAdapter;
}

const noopAdapter: HTMLMediaAdapter = {
  sourceStateById: new Map(),
  volume: 1,
  muted: false,
  getClockTime: () => 0,
  startClock: () => false,
  setSources: () => {},
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
 * Create and dispose a native media adapter without requiring stable source-array identity.
 *
 * @remarks
 *
 * The hook preserves the adapter while ordinary URL source descriptors remain
 * semantically equal, then reconciles changed definitions through `setSources`.
 * `ready` reports that the element ref resolved; use `adapter.sourceStateById`
 * to distinguish idle, loading, recovering, ready, and failed native inputs.
 *
 * @param options - Media element ref and complete resolved source registry.
 * @returns Adapter readiness and the current imperative adapter.
 *
 * @see {@link useHTMLTimelineMedia}
 * @see {@link https://canvastimeline.com/docs/media-adapters | Media adapter guide}
 */
export function useHTMLMediaAdapter<TMediaElement extends HTMLMediaElement = HTMLMediaElement>(
  options: UseHTMLMediaAdapterOptions<TMediaElement>
): UseHTMLMediaAdapterResult {
  const { ref, sources } = options;
  const sourcesRef = useRef(sources);
  const [, forceUpdate] = useReducer((value: number) => value + 1, 0);
  const [element, setElement] = useState<HTMLMediaElement | null>(null);

  useEffect(() => {
    setElement(ref.current);
  }, [ref]);

  const adapter = useMemo(() => {
    if (element === null) {
      return noopAdapter;
    }
    return createHTMLMediaAdapter({ element, sources: sourcesRef.current, onChange: forceUpdate });
  }, [element]);

  useEffect(() => adapter.dispose, [adapter]);
  useEffect(() => adapter.setSources(sources), [adapter, sources]);

  const result = useMemo(() => ({ ready: element !== null, adapter }), [adapter, element]);
  sourcesRef.current = sources;
  return result;
}

/**
 * Create a native media adapter and bind it to timeline-synchronized playback.
 *
 * @remarks
 *
 * This is the normal React entry point for a single native `<video>` or
 * `<audio>` preview. The hook owns adapter disposal, reconciles source changes,
 * and exposes media-aware timeline transport commands. Keep original/proxy
 * policy in application state and pass the currently resolved source choice.
 *
 * @param options - Media element ref, sources, layer selectors, and playback policy.
 * @template LayerName - Named media layer keys inferred from `options.layers`.
 * @template TMediaElement - Native video or audio element held by `options.ref`.
 * @returns Media-aware transport state and the underlying imperative adapter.
 *
 * @example
 * ```tsx
 * import { useRef } from 'react';
 * import { useHTMLTimelineMedia } from '@techsquidtv/canvas-timeline-html-media-adapter/react';
 *
 * const layers = {
 *   visuals: { trackKind: 'visual', sourceId: 'source-1' },
 * } as const;
 *
 * export function NativePreview() {
 *   const ref = useRef<HTMLVideoElement>(null);
 *   const media = useHTMLTimelineMedia({
 *     ref,
 *     layers,
 *     sources: [{ sourceId: 'source-1', input: '/media/interview.mp4' }],
 *     onError: (error) => console.error(error.reason, error.message),
 *   });
 *
 *   return <video ref={ref} playsInline onClick={() => void media.play()} />;
 * }
 * ```
 *
 * @see {@link useHTMLMediaAdapter}
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

  return {
    ...mediaSync,
    ready: htmlMedia.ready,
    sourceStateById: htmlMedia.adapter.sourceStateById,
    adapter: htmlMedia.adapter,
  };
}
