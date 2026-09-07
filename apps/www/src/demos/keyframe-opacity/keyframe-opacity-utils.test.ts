import {
  findClipContainingTime,
  findOpacityKeyframeAtTime,
  opacityKeyframeProperty,
  createCurvePresetCommand,
  getCurvePresetId,
  toggleOpacityKeyframeAtTime,
} from '#www/demos/keyframe-opacity/keyframe-opacity-utils';
import {
  demoTracks,
  opacityClipId,
  sampleDurationSeconds,
} from '#www/demos/keyframe-opacity/timeline-demo-data';
import {
  getTimelineKeyframeBezierProgress,
  TimelineEngine,
} from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { describe, expect, it } from 'vite-plus/test';
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
    const peakKeyframe = engine.keyframes
      .getClipKeyframes(opacityClipId, 'opacity')
      .find((keyframe) => toSeconds(keyframe.time) === 10);
    const nextKeyframe = engine.keyframes
      .getClipKeyframes(opacityClipId, 'opacity')
      .find((keyframe) => toSeconds(keyframe.time) === 15);
    const expectedMidpoint =
      0.82 +
      (0.42 - 0.82) *
        getTimelineKeyframeBezierProgress(
          0.5,
          { x: peakKeyframe?.outgoing?.handle?.x ?? 0.16, y: 1 },
          { x: nextKeyframe?.incoming?.handle?.x ?? 0.3, y: 1 }
        );

    expect(
      engine.keyframes.getClipPropertyValueAtTime(opacityClipId, 'opacity', fromSeconds(10))
    ).toBe(0.82);
    expect(
      engine.keyframes.getClipPropertyValueAtTime(opacityClipId, 'opacity', fromSeconds(12.5))
    ).toBeCloseTo(expectedMidpoint);
    expect(
      engine.keyframes.getClipPropertyValueAtTime(opacityClipId, 'opacity', fromSeconds(15))
    ).toBe(0.42);
  });

  it('finds the playhead clip and toggles exact opacity keyframes', () => {
    const engine = createEngine();
    const track = engine.tracks[0];
    const clip = findClipContainingTime(track, fromSeconds(7));

    expect(clip?.id).toBe(opacityClipId);
    expect(toggleOpacityKeyframeAtTime(engine, opacityClipId, fromSeconds(7), 0.42)).toBe(true);
    expect(
      findOpacityKeyframeAtTime(
        engine.geometry.getClip(opacityClipId)?.clip ?? track.clips[0],
        fromSeconds(7)
      )?.value
    ).toBe(0.42);

    expect(toggleOpacityKeyframeAtTime(engine, opacityClipId, fromSeconds(7), 0.9)).toBe(true);
    expect(
      engine.keyframes.getClipKeyframes(opacityClipId).map((keyframe) => toSeconds(keyframe.time))
    ).not.toContain(7);
  });
});

it('recognizes custom curves and applies both segment endpoints in one undo step', () => {
  const engine = createEngine();
  const keys = engine.keyframes.getClipKeyframes(opacityClipId, 'opacity');
  expect(getCurvePresetId(keys[2], keys[3])).toBe('custom');
  const before = engine.getState().tracks;
  expect(
    engine.commitEdit(createCurvePresetCommand(opacityClipId, keys[2], keys[3], 'ease-in'))
      .committed
  ).toBe(true);
  const updated = engine.keyframes.getClipKeyframes(opacityClipId, 'opacity');
  expect(getCurvePresetId(updated[2], updated[3])).toBe('ease-in');
  engine.undo();
  expect(engine.getState().tracks).toEqual(before);
});

it('inserts near an existing key without deleting it at different zoom levels', () => {
  for (const zoom of [32, 100, 1000]) {
    const engine = createEngine();
    engine.setZoomScale(zoom);
    toggleOpacityKeyframeAtTime(engine, opacityClipId, fromSeconds(5.01), 0.28);
    expect(
      engine.keyframes.getClipKeyframes(opacityClipId).map((key) => toSeconds(key.time))
    ).toEqual([0, 5, 5.01, 10, 15, 24]);
  }
});
