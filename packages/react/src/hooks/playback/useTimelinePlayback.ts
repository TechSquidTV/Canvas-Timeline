import { runTimelineCommand } from '#react/hooks/core/runTimelineCommand';
import { timelineCommandFail, timelineCommandOk } from '@techsquidtv/canvas-timeline-core';
import type { TimelineCommandResult, PlaybackOptions } from '@techsquidtv/canvas-timeline-core';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { useTimelineSelector } from '#react/hooks/core/useTimelineSelector';
import { addRational, fromSeconds, subRational } from '@techsquidtv/canvas-timeline-utils';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { useCallback } from 'react';
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
    playbackRate: state.playbackRate,
    playing: state.playing,
  }));

  const play = useCallback(
    (options?: PlaybackOptions) =>
      runTimelineCommand(() => {
        if (engine.getState().playing) {
          return timelineCommandOk();
        }

        return engine.play(options) ? timelineCommandOk() : timelineCommandFail('unsupported');
      }),
    [engine]
  );

  const pause = useCallback(
    () =>
      runTimelineCommand(() => {
        engine.pause();
        return timelineCommandOk();
      }),
    [engine]
  );

  const togglePlayback = useCallback(
    () =>
      runTimelineCommand(() => {
        if (engine.getState().playing) {
          engine.pause();
          return timelineCommandOk();
        }

        if (engine.play()) {
          return timelineCommandOk();
        } else {
          return timelineCommandFail('unsupported');
        }
      }),
    [engine]
  );

  const setPlaybackRate = useCallback(
    (rate: number) =>
      runTimelineCommand(() => {
        engine.setPlaybackRate(rate);
        return timelineCommandOk();
      }),
    [engine]
  );

  const setPlayheadTime = useCallback(
    (time: RationalTime) =>
      runTimelineCommand(() => {
        engine.updatePlayhead(time);
        return timelineCommandOk();
      }),
    [engine]
  );

  const stepForward = useCallback(
    (amountSeconds: number = 1) =>
      runTimelineCommand(() => {
        engine.updatePlayhead(
          addRational(engine.playheadTime, fromSeconds(amountSeconds, engine.playheadTime.r))
        );
        return timelineCommandOk();
      }),
    [engine]
  );

  const stepBackward = useCallback(
    (amountSeconds: number = 1) =>
      runTimelineCommand(() => {
        engine.updatePlayhead(
          subRational(engine.playheadTime, fromSeconds(amountSeconds, engine.playheadTime.r))
        );
        return timelineCommandOk();
      }),
    [engine]
  );

  const setInPoint = useCallback(
    (time?: RationalTime) =>
      runTimelineCommand(() => {
        engine.setInPoint(time ?? engine.playheadTime);
        return timelineCommandOk();
      }),
    [engine]
  );

  const setOutPoint = useCallback(
    (time?: RationalTime) =>
      runTimelineCommand(() => {
        engine.setOutPoint(time ?? engine.playheadTime);
        return timelineCommandOk();
      }),
    [engine]
  );

  const clearInOutPoints = useCallback(
    () =>
      runTimelineCommand(() => {
        engine.clearInOutPoints();
        return timelineCommandOk();
      }),
    [engine]
  );

  return {
    playing: state.playing ?? false,
    playbackRate: state.playbackRate ?? 1,
    inPoint: state.inPoint,
    outPoint: state.outPoint,
    play,
    pause,
    togglePlayback,
    setPlaybackRate,
    setPlayheadTime,
    stepForward,
    stepBackward,
    setInPoint,
    setOutPoint,
    clearInOutPoints,
  };
}
