import type { ActiveClip } from '@techsquidtv/canvas-timeline-core';
import { toSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useEffect, useMemo, useState, type RefObject } from 'react';
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
  /** Release object URLs and pause the media element. */
  dispose: () => void;
}

/**
 * Options for creating an imperative HTML media element adapter.
 *
 * @remarks
 *
 * Sources are keyed by timeline clip `sourceId`. Values can be URLs, `Blob`s,
 * or `File`s, which makes this useful for both persisted project media and
 * user-selected local files.
 */
export interface CreateHTMLMediaAdapterOptions {
  /** Native video or audio element to synchronize with the timeline. */
  element: HTMLMediaElement;
  /** Media sources keyed by timeline clip `sourceId`. */
  sources: Record<string, HTMLMediaAdapterSource>;
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
  /** Media sources keyed by timeline clip `sourceId`. */
  sources: Record<string, HTMLMediaAdapterSource>;
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
    Pick<UseTimelineMediaSyncOptions<LayerName>, 'layers' | 'onError'> {}

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
  /** Low-level adapter used for custom synchronization flows. */
  adapter: HTMLMediaAdapter;
}

const noopAdapter: HTMLMediaAdapter = {
  getClockTime: () => 0,
  startClock: () => false,
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
 *     sources: {
 *       'source-1': '/media/interview.mp4',
 *     },
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
  const objectUrls = new Map<string, string>();
  let activeClip: ActiveClip | undefined;
  let timelineTimeAtStart = 0;
  let playbackRate = 1;
  let shouldPlay = false;
  let lastError: Error | null = null;

  const clearElement = () => {
    activeClip = undefined;
    element.pause();
    element.removeAttribute('src');
    element.load();
  };

  const getSourceUrl = (sourceId: string) => {
    const source = sources[sourceId];
    if (source === undefined) {
      return undefined;
    }

    if (typeof source === 'string') {
      return new URL(source, element.ownerDocument.baseURI).href;
    }

    const existingUrl = objectUrls.get(sourceId);
    if (existingUrl !== undefined) {
      return existingUrl;
    }

    const url = URL.createObjectURL(source);
    objectUrls.set(sourceId, url);
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
    activeClip = clip;
    timelineTimeAtStart = toSeconds(timelineTime);
    element.playbackRate = playbackRate;

    if (element.src !== nextUrl) {
      element.src = nextUrl;
    }

    const nextCurrentTime = toSeconds(clip.sourceTime);
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

  return {
    getClockTime: () => {
      if (activeClip === undefined) {
        return timelineTimeAtStart;
      }

      return (
        element.currentTime +
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
      for (const url of objectUrls.values()) {
        URL.revokeObjectURL(url);
      }
      objectUrls.clear();
    },
  };
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
  const [element, setElement] = useState<HTMLMediaElement | null>(null);

  useEffect(() => {
    setElement(ref.current);
  }, [ref]);

  const adapter = useMemo(() => {
    if (element === null) {
      return noopAdapter;
    }

    return createHTMLMediaAdapter({ element, sources });
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
 * create a stable `sources` map, name the active layers you want to sync, and
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
 *   const sources = useMemo(() => ({ 'sample-video': '/media/sample.mp4' }), []);
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
  const { layers, onError, ref, sources } = options;
  const htmlMedia = useHTMLMediaAdapter({ ref, sources });
  const mediaSync = useTimelineMediaSync<LayerName>({
    ready: htmlMedia.ready,
    layers,
    adapter: htmlMedia.adapter,
    onError,
  });

  return useMemo(
    () => ({
      ...mediaSync,
      ready: htmlMedia.ready,
      adapter: htmlMedia.adapter,
    }),
    [htmlMedia.adapter, htmlMedia.ready, mediaSync]
  );
}
