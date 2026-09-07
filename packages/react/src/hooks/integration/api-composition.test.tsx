import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vite-plus/test';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import {
  useTimelinePlayback,
  useTimelineViewport,
  useTimelineMarkers,
  useTimelineSnapping,
  useTimelineTrackLockControl,
  useTimelineTrack,
  useTimelineVerticalRangeControl,
} from '#react/hooks';
import { createClip, createTrack, wrapper } from '#react/hooks/integration/testHelpers';

test('domain commands report invalid input without throwing or mutating state', () => {
  const engine = new TimelineEngine({
    tracks: [createTrack('track', [createClip('clip', 0, 10)])],
  });
  const { result } = renderHook(
    () => ({
      playback: useTimelinePlayback(),
      viewport: useTimelineViewport(),
      markers: useTimelineMarkers(),
      snapping: useTimelineSnapping(),
    }),
    {
      wrapper: (props) => wrapper({ ...props, engine }),
    }
  );
  const before = engine.getState();
  act(() => {
    expect(result.current.playback.setPlaybackRate(NaN)).toMatchObject({
      ok: false,
      reason: 'invalid-input',
    });
    expect(result.current.playback.setPlayheadTime({ v: 1, r: 0 })).toMatchObject({
      ok: false,
      reason: 'invalid-input',
    });
    expect(result.current.viewport.setZoomScale(-1)).toMatchObject({
      ok: false,
      reason: 'invalid-input',
    });
    expect(result.current.markers.addMarker({ v: Infinity, r: 1 })).toMatchObject({
      ok: false,
      reason: 'invalid-input',
    });
    expect(result.current.snapping.setThresholdPixels(-1)).toMatchObject({
      ok: false,
      reason: 'invalid-input',
    });
  });
  expect(engine.getState()).toBe(before);
  const error = new Error('unexpected integration failure');
  vi.spyOn(engine, 'setPlaybackRate').mockImplementation(() => {
    throw error;
  });
  expect(() => result.current.playback.setPlaybackRate(2)).toThrow(error);
});

test('standalone lock controls ignore row geometry and unrelated content updates', () => {
  const engine = new TimelineEngine({
    duration: fromSeconds(100),
    tracks: [createTrack('track', [createClip('clip', 0, 10)])],
  });
  let renders = 0;
  const { result } = renderHook(
    () => {
      renders++;
      return useTimelineTrackLockControl('track');
    },
    {
      wrapper: (props) => wrapper({ ...props, engine }),
    }
  );
  const before = renders;
  act(() => {
    engine.setTrackHeight('track', 120);
    engine.setScrollLeft(100);
    engine.updateClipProperties('clip', { label: 'new' });
  });
  expect(renders).toBe(before);
  act(() => {
    result.current.setLocked(true);
  });
  expect(result.current.locked).toBe(true);
  expect(result.current.buttonProps['aria-label']).toBe('Unlock visual 1');
  act(() => {
    result.current.toggleLock();
  });
  expect(result.current.locked).toBe(false);
});

test('row setters are idempotent and toggles read the current value', () => {
  const engine = new TimelineEngine({ tracks: [createTrack('track', [])] });
  const { result } = renderHook(() => useTimelineTrack('track'), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  act(() => {
    result.current.setMuted(true);
    result.current.setMuted(true);
  });
  expect(result.current.muted).toBe(true);
  act(() => {
    result.current.toggleMute();
    result.current.toggleMute();
  });
  expect(result.current.muted).toBe(true);
});

test('vertical range thumb includes its full spoken range', () => {
  const engine = new TimelineEngine({ tracks: [createTrack('track', [])] });
  const { result } = renderHook(() => useTimelineVerticalRangeControl(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  expect(
    result.current.rootProps.getAriaValueText?.(0, {
      part: 'thumb',
      rangeSpan: result.current.range.value.end - result.current.range.value.start,
      min: 0,
      max: result.current.contentHeight,
      value: result.current.range.value,
    })
  ).toBe(result.current.valueText);
});
