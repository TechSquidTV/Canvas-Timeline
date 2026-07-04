import { useEffect, useRef } from 'react';
import { useTimeline } from './useTimeline';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';

/**
 * Subscribes to real-time playback events (enter, update, leave) for a specific clip
 * as the global playhead crosses the clip's boundary timestamps.
 *
 * @param clipId - The unique string ID of the target clip to track.
 * @param callbacks - Callback handlers triggered on transition crossings.
 * @param callbacks.onEnter - Called when the playhead enters the clip range.
 * @param callbacks.onUpdate - Called on every frame tick inside the clip range.
 * @param callbacks.onLeave - Called when the playhead moves outside of the clip range.
 */
export function usePlaybackEffect(
  clipId: string,
  callbacks: {
    onEnter?: (time: RationalTime) => void;
    onUpdate?: (time: RationalTime) => void;
    onLeave?: (time: RationalTime) => void;
  }
) {
  const { engine } = useTimeline();
  const callbacksRef = useRef(callbacks);

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    const unsubEnter = engine.on('clip:enter', (payload) => {
      if (payload.clipId === clipId && callbacksRef.current.onEnter) {
        callbacksRef.current.onEnter(payload.time);
      }
    });
    const unsubUpdate = engine.on('clip:update', (payload) => {
      if (payload.clipId === clipId && callbacksRef.current.onUpdate) {
        callbacksRef.current.onUpdate(payload.time);
      }
    });
    const unsubLeave = engine.on('clip:leave', (payload) => {
      if (payload.clipId === clipId && callbacksRef.current.onLeave) {
        callbacksRef.current.onLeave(payload.time);
      }
    });

    return () => {
      unsubEnter();
      unsubUpdate();
      unsubLeave();
    };
  }, [clipId, engine]);
}
