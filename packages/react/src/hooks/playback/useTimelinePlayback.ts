import type { TimelineCommandResult, PlaybackOptions } from '@techsquidtv/canvas-timeline-core';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { useTimelineSelector } from '#react/hooks/core/useTimelineSelector';
import { createTimelinePlaybackCommands } from '#react/hooks/playback/createTimelinePlaybackCommands';
import { useMemo } from 'react';
/** Result returned by `useTimelinePlayback`. */
export interface UseTimelinePlaybackResult {
  /** Whether the timeline is currently playing. */
  playing: boolean;
  /** Current playback speed multiplier. */
  playbackRate: number;
  /** Current in point, when set. */
  inPoint: RationalTime | undefined;
  /** Current out point, when set. */
  outPoint: RationalTime | undefined;
  /** Starts timeline playback. */
  play: (options?: PlaybackOptions) => TimelineCommandResult;
  /** Pauses timeline playback. */
  pause: () => TimelineCommandResult;
  /** Starts playback when paused, or pauses playback when playing. */
  togglePlayback: () => TimelineCommandResult;
  /** Sets the playback speed multiplier. */
  setPlaybackRate: (rate: number) => TimelineCommandResult;
  /** Moves the playhead to an absolute time. */
  setPlayheadTime: (time: RationalTime) => TimelineCommandResult;
  /** Advances the playhead by a number of seconds. */
  stepForward: (amountSeconds?: number) => TimelineCommandResult;
  /** Moves the playhead backward by a number of seconds. */
  stepBackward: (amountSeconds?: number) => TimelineCommandResult;
  /** Sets the in point to a supplied time or the current playhead. */
  setInPoint: (time?: RationalTime) => TimelineCommandResult;
  /** Sets the out point to a supplied time or the current playhead. */
  setOutPoint: (time?: RationalTime) => TimelineCommandResult;
  /** Clears both in and out points. */
  clearInOutPoints: () => TimelineCommandResult;
}

/**
 * Provides canonical transport, playhead command, and in/out range commands.
 *
 * Compose this with `useTimelinePlayheadTime` when a component also needs a live
 * clock readout.
 *
 * @returns Playback state and transport commands for headless timeline controls.
 */
export function useTimelinePlayback(): UseTimelinePlaybackResult {
  const engine = useTimelineEngine();
  const state = useTimelineSelector((state) => ({
    inPoint: state.inPoint,
    outPoint: state.outPoint,
    playbackRate: state.playbackRate ?? 1,
    playing: state.playing ?? false,
  }));
  const commands = useMemo(() => createTimelinePlaybackCommands(engine), [engine]);
  return useMemo(() => ({ ...state, ...commands }), [state, commands]);
}
