import {
  getTimelineKeyframeBezierProgress,
  TimelineEngine,
} from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { describe, expect, it } from 'vite-plus/test';
import { opacityClipId, sampleDurationSeconds, demoTracks } from './timeline-demo-data';
import {
  findClipContainingTime,
  findOpacityKeyframeNearTime,
  opacityKeyframeProperty,
  toggleOpacityKeyframeAtTime,
} from './keyframe-opacity-utils';

function createEngine() {
  return new TimelineEngine({
    duration: fromSeconds(sampleDurationSeconds),
    tracks: demoTracks,
    zoomScale: 32,
    keyframeProperties: [opacityKeyframeProperty],
  });
}

describe('keyframe opacity demo utilities', () => {
  it('keeps the peak-to-next opacity segment interpolated', () => {
    const engine = createEngine();
    const peakKeyframe = engine
      .getClipKeyframes(opacityClipId, 'opacity')
      .find((keyframe) => toSeconds(keyframe.time) === 10);
    const nextKeyframe = engine
      .getClipKeyframes(opacityClipId, 'opacity')
      .find((keyframe) => toSeconds(keyframe.time) === 15);
    const expectedMidpoint =
      0.82 +
      (0.42 - 0.82) *
        getTimelineKeyframeBezierProgress(
          0.5,
          peakKeyframe?.outgoing?.handle,
          nextKeyframe?.incoming?.handle
        );

    expect(engine.getClipPropertyValueAtTime(opacityClipId, 'opacity', fromSeconds(10))).toBe(0.82);
    expect(
      engine.getClipPropertyValueAtTime(opacityClipId, 'opacity', fromSeconds(12.5))
    ).toBeCloseTo(expectedMidpoint);
    expect(engine.getClipPropertyValueAtTime(opacityClipId, 'opacity', fromSeconds(15))).toBe(0.42);
  });

  it('finds the playhead clip and toggles nearby opacity keyframes', () => {
    const engine = createEngine();
    const track = engine.tracks[0];
    const clip = findClipContainingTime(track, fromSeconds(7));

    expect(clip?.id).toBe(opacityClipId);
    expect(toggleOpacityKeyframeAtTime(engine, opacityClipId, fromSeconds(7), 0.42)).toBe(true);
    expect(
      findOpacityKeyframeNearTime(
        engine.getClip(opacityClipId)?.clip ?? track.clips[0],
        fromSeconds(7),
        32
      )?.value
    ).toBe(0.42);

    expect(toggleOpacityKeyframeAtTime(engine, opacityClipId, fromSeconds(7), 0.9)).toBe(true);
    expect(
      engine.getClipKeyframes(opacityClipId).map((keyframe) => toSeconds(keyframe.time))
    ).not.toContain(7);
  });
});
