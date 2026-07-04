import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useTimeline } from './useTimeline';

interface TimelineGeometryRevisionOptions {
  /** Include high-frequency playhead scrubs in the revision stream. */
  redrawOnPlayhead?: boolean;
  /** Include active edit preview frames in the revision stream. */
  redrawOnPreview?: boolean;
}

/**
 * Subscribes to timeline events that can change viewport-space geometry.
 *
 * The snapshot is a stable numeric revision so geometry hooks can memoize their
 * derived arrays without returning a fresh external-store snapshot each render.
 */
export function useTimelineGeometryRevision(options: TimelineGeometryRevisionOptions = {}) {
  const redrawOnPlayhead = options.redrawOnPlayhead ?? false;
  const redrawOnPreview = options.redrawOnPreview ?? false;
  const { engine } = useTimeline();
  const revisionRef = useRef(0);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const update = () => {
        revisionRef.current += 1;
        onStoreChange();
      };

      const unsubScroll = engine.on('scroll:change', update);
      const unsubZoom = engine.on('zoom:change', update);
      const unsubRender = engine.on('render', update);
      const unsubViewport = engine.on('viewport:resize', update);
      const unsubPlayhead = redrawOnPlayhead
        ? engine.on('playhead:scrub', update)
        : () => undefined;
      const unsubPreview = redrawOnPreview ? engine.on('state:preview', update) : () => undefined;

      return () => {
        unsubScroll();
        unsubZoom();
        unsubRender();
        unsubViewport();
        unsubPlayhead();
        unsubPreview();
      };
    },
    [engine, redrawOnPlayhead, redrawOnPreview]
  );

  const getSnapshot = useCallback(() => revisionRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
