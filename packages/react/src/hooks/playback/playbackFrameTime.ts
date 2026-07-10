import {
  fromTimecodeFrameNumber,
  resolveTimecodeFrameRate,
  toSeconds,
  type RationalTime,
  type TimecodeFrameRate,
} from '@techsquidtv/canvas-timeline-utils';

export function quantizeTimelineTimeToFrame(
  time: RationalTime,
  frameRate: TimecodeFrameRate | undefined,
  rounding: 'ceil' | 'floor' = 'floor'
) {
  if (frameRate === undefined) {
    return time;
  }

  const resolvedFrameRate = resolveTimecodeFrameRate(frameRate);
  const unroundedFrameNumber = Math.max(0, toSeconds(time)) * resolvedFrameRate;
  const frameNumber =
    rounding === 'ceil'
      ? Math.ceil(unroundedFrameNumber - 1e-9)
      : Math.floor(unroundedFrameNumber + 1e-9);
  return fromTimecodeFrameNumber(frameNumber, frameRate, time.r);
}
