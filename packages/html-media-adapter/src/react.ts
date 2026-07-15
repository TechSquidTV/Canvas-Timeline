import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type RefCallback,
} from 'react';
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
 * Options for creating an HTML media adapter from React.
 */
export interface UseHTMLMediaAdapterOptions {
  /** Complete app-resolved source registry keyed by timeline clip `sourceId`. */
  sources: readonly HTMLMediaSource[];
}

/** React hook result for native HTML media timeline synchronization. */
export interface UseHTMLMediaAdapterResult {
  /** Stable callback ref that connects the native media element to the adapter. */
  mediaRef: RefCallback<HTMLMediaElement>;
  /** Currently connected native media element. */
  element: HTMLMediaElement | null;
  /** Whether a native media element is connected and an imperative adapter exists. */
  ready: boolean;
  /** Imperative adapter managed for the mounted media element. */
  adapter: HTMLMediaAdapter;
}

/** Options for wiring one native media element directly to timeline playback. */
export interface UseHTMLTimelineMediaOptions<LayerName extends string = string>
  extends
    UseHTMLMediaAdapterOptions,
    Pick<UseTimelineMediaSyncOptions<LayerName>, 'layers' | 'onError' | 'playbackOptions'> {}

/** Timeline transport state plus the underlying native media adapter. */
export interface UseHTMLTimelineMediaResult<
  LayerName extends string = string,
> extends UseTimelineMediaSyncResult<LayerName> {
  /** Stable callback ref that connects the native media element to the adapter. */
  mediaRef: RefCallback<HTMLMediaElement>;
  /** Currently connected native media element. */
  element: HTMLMediaElement | null;
  /** Whether a native media element is connected; inspect source state for native loading. */
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
 * The returned callback ref owns element mount, replacement, and removal
 * transitions without requiring consumers to coordinate object refs.
 * `ready` reports that the element is connected; use `adapter.sourceStateById`
 * to distinguish idle, loading, recovering, ready, and failed native inputs.
 *
 * @param options - Complete resolved source registry.
 * @returns Adapter readiness and the current imperative adapter.
 *
 * @see {@link useHTMLTimelineMedia}
 * @see {@link https://canvastimeline.com/docs/media-adapters | Media adapter guide}
 */
export function useHTMLMediaAdapter(
  options: UseHTMLMediaAdapterOptions
): UseHTMLMediaAdapterResult {
  const { sources } = options;
  const sourcesRef = useRef(sources);
  const [, forceUpdate] = useReducer((value: number) => value + 1, 0);
  const [element, setElement] = useState<HTMLMediaElement | null>(null);
  const mediaRef = useCallback<RefCallback<HTMLMediaElement>>((nextElement) => {
    setElement(nextElement);
  }, []);

  const adapter = useMemo(() => {
    if (element === null) {
      return noopAdapter;
    }
    return createHTMLMediaAdapter({ element, sources: sourcesRef.current, onChange: forceUpdate });
  }, [element]);

  useEffect(() => adapter.dispose, [adapter]);
  useEffect(() => adapter.setSources(sources), [adapter, sources]);

  const result = useMemo(
    () => ({ mediaRef, element, ready: element !== null, adapter }),
    [adapter, element, mediaRef]
  );
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
 * @param options - Sources, layer selectors, and playback policy.
 * @template LayerName - Named media layer keys inferred from `options.layers`.
 * @returns Media-aware transport state and the underlying imperative adapter.
 *
 * @example
 * ```tsx
 * import { useHTMLTimelineMedia } from '@techsquidtv/canvas-timeline-html-media-adapter/react';
 *
 * const layers = {
 *   visuals: { trackKind: 'visual', sourceId: 'source-1' },
 * } as const;
 *
 * export function NativePreview() {
 *   const media = useHTMLTimelineMedia({
 *     layers,
 *     sources: [{ sourceId: 'source-1', input: '/media/interview.mp4' }],
 *     onError: (error) => console.error(error.reason, error.message),
 *   });
 *
 *   return <video ref={media.mediaRef} playsInline onClick={() => void media.play()} />;
 * }
 * ```
 *
 * @see {@link useHTMLMediaAdapter}
 * @see {@link https://canvastimeline.com/demos/html-media-sync | HTML media sync demo}
 */
export function useHTMLTimelineMedia<LayerName extends string = string>(
  options: UseHTMLTimelineMediaOptions<LayerName>
): UseHTMLTimelineMediaResult<LayerName> {
  const { layers, onError, playbackOptions, sources } = options;
  const htmlMedia = useHTMLMediaAdapter({ sources });
  const mediaSync = useTimelineMediaSync<LayerName>({
    ready: htmlMedia.ready,
    layers,
    playbackOptions,
    adapter: htmlMedia.adapter,
    adapterIdentity: htmlMedia.adapter,
    onError,
  });

  return {
    ...mediaSync,
    mediaRef: htmlMedia.mediaRef,
    element: htmlMedia.element,
    ready: htmlMedia.ready,
    sourceStateById: htmlMedia.adapter.sourceStateById,
    adapter: htmlMedia.adapter,
  };
}
