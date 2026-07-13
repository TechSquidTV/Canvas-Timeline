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

/** Options for creating an HTML media adapter from a React ref. */
export interface UseHTMLMediaAdapterOptions<
  TMediaElement extends HTMLMediaElement = HTMLMediaElement,
> {
  ref: RefObject<TMediaElement | null>;
  sources: readonly HTMLMediaSource[];
}

/** React hook result for native HTML media timeline synchronization. */
export interface UseHTMLMediaAdapterResult {
  ready: boolean;
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
  ready: boolean;
  sourceStateById: HTMLMediaAdapter['sourceStateById'];
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
 * @param options - Media element ref and complete resolved source registry.
 * @returns Adapter readiness and the current imperative adapter.
 */
export function useHTMLMediaAdapter<TMediaElement extends HTMLMediaElement = HTMLMediaElement>(
  options: UseHTMLMediaAdapterOptions<TMediaElement>
): UseHTMLMediaAdapterResult {
  const { ref, sources } = options;
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
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

  return useMemo(() => ({ ready: element !== null, adapter }), [adapter, element]);
}

/**
 * Create a native media adapter and bind it to timeline-synchronized playback.
 *
 * @param options - Media element ref, sources, layer selectors, and playback policy.
 * @returns Media-aware transport state and the underlying imperative adapter.
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
