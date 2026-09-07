import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { useMemo } from 'react';

/** Stable delegates; all validation reads the current engine state. */
export function useTimelineTrackCommands() {
  const engine = useTimelineEngine();
  return useMemo(
    () => ({
      selectTrack: engine.selectTrack.bind(engine),
      addTrack: engine.addTrack.bind(engine),
      removeTrack: engine.removeTrack.bind(engine),
      toggleMute: engine.toggleMuteTrack.bind(engine),
      toggleVisibility: engine.toggleTrackVisibility.bind(engine),
      toggleLock: engine.toggleLockTrack.bind(engine),
      setTrackHeight: engine.setTrackHeight.bind(engine),
      toggleTrackTarget: engine.toggleTrackTarget.bind(engine),
      setTrackGroup: engine.setTrackGroup.bind(engine),
    }),
    [engine]
  );
}
