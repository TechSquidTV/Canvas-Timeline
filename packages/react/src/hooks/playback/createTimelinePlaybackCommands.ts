import { runTimelineCommand } from '#react/hooks/core/runTimelineCommand';
import { timelineCommandFail, timelineCommandOk } from '@techsquidtv/canvas-timeline-core';
import type { PlaybackOptions, TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { addRational, fromSeconds, subRational } from '@techsquidtv/canvas-timeline-utils';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type { UseTimelinePlaybackResult } from '#react/hooks/playback/useTimelinePlayback';

/** Shared imperative commands. Reads current engine state at invocation. */
export function createTimelinePlaybackCommands(
  engine: TimelineEngine
): Omit<UseTimelinePlaybackResult, 'playing' | 'playbackRate' | 'inPoint' | 'outPoint'> {
  const play = (options?: PlaybackOptions) =>
    runTimelineCommand(() => {
      if (engine.getState().playing) {
        return timelineCommandOk();
      }

      return engine.play(options) ? timelineCommandOk() : timelineCommandFail('unsupported');
    });

  const pause = () =>
    runTimelineCommand(() => {
      engine.pause();
      return timelineCommandOk();
    });

  const togglePlayback = () => (engine.getState().playing ? pause() : play());

  const setPlaybackRate = (rate: number) =>
    runTimelineCommand(() => {
      engine.setPlaybackRate(rate);
      return timelineCommandOk();
    });

  const setPlayheadTime = (time: RationalTime) =>
    runTimelineCommand(() => {
      engine.updatePlayhead(time);
      return timelineCommandOk();
    });

  const stepForward = (amountSeconds: number = 1) =>
    runTimelineCommand(() => {
      engine.updatePlayhead(
        addRational(engine.playheadTime, fromSeconds(amountSeconds, engine.playheadTime.r))
      );
      return timelineCommandOk();
    });

  const stepBackward = (amountSeconds: number = 1) =>
    runTimelineCommand(() => {
      engine.updatePlayhead(
        subRational(engine.playheadTime, fromSeconds(amountSeconds, engine.playheadTime.r))
      );
      return timelineCommandOk();
    });

  const setInPoint = (time?: RationalTime) =>
    runTimelineCommand(() => {
      engine.setInPoint(time ?? engine.playheadTime);
      return timelineCommandOk();
    });

  const setOutPoint = (time?: RationalTime) =>
    runTimelineCommand(() => {
      engine.setOutPoint(time ?? engine.playheadTime);
      return timelineCommandOk();
    });

  const clearInOutPoints = () =>
    runTimelineCommand(() => {
      engine.clearInOutPoints();
      return timelineCommandOk();
    });
  return {
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
