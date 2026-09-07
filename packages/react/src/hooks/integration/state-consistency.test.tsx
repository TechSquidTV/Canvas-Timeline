import { act, renderHook } from '@testing-library/react';
import { expect, test } from 'vite-plus/test';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import {
  useActiveClips,
  useTimelineHistory,
  useTimelineViewport,
  useTimelinePanControl,
  useTimelineRulerTicks,
  useTimelineEditCommands,
  useTimelineInOutRangeControl,
  useTimelineRangeSelection,
  useTimelineZoomControl,
} from '#react/hooks';
import { createClip, createTrack, wrapper } from '#react/hooks/integration/testHelpers';

function makeEngine() {
  const engine = new TimelineEngine({
    playheadTime: fromSeconds(1),
    zoomScale: 100,
    tracks: [createTrack('track', [createClip('clip', 0, 10)])],
  });
  engine.setViewportWidth(100);
  return engine;
}

test('history availability updates after an edit', () => {
  const engine = makeEngine();
  const { result } = renderHook(() => useTimelineHistory(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  expect(result.current.canUndo).toBe(false);
  act(() => {
    engine.updateClipProperties('clip', { label: 'changed' });
  });
  expect(engine.canUndo).toBe(true);
  expect(result.current.canUndo).toBe(true);
  act(() => {
    result.current.undo();
  });
  expect(result.current.canUndo).toBe(false);
  expect(result.current.canRedo).toBe(true);
  act(() => {
    result.current.redo();
  });
  expect(result.current.canUndo).toBe(true);
  expect(result.current.canRedo).toBe(false);
});

test('active clips update when a track is hidden at a fixed playhead', () => {
  const engine = makeEngine();
  const { result } = renderHook(() => useActiveClips(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  expect(result.current.map((clip) => clip.id)).toEqual(['clip']);
  act(() => {
    engine.toggleTrackVisibility('track', false);
  });
  expect(engine.media.getActiveClips(engine.playheadTime)).toHaveLength(0);
  expect(result.current).toHaveLength(0);
});

test('viewport content bounds update without scroll or zoom changes', () => {
  const engine = makeEngine();
  const { result } = renderHook(() => useTimelineViewport(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  expect(toSeconds(result.current.maxContentTime)).toBe(10);
  act(() => {
    engine.addTrack(createTrack('long', [createClip('long-clip', 0, 30)]));
  });
  expect(engine.scrollLeft).toBe(0);
  expect(engine.zoomScale).toBe(100);
  expect(toSeconds(engine.maxContentTime)).toBe(30);
  expect(toSeconds(result.current.maxContentTime)).toBe(30);
});

test('pan bounds update without moving scroll', () => {
  const engine = makeEngine();
  const { result } = renderHook(() => useTimelinePanControl(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  expect(result.current.max).toBe(engine.maxScrollLeft);
  act(() => {
    engine.setViewportWidth(200);
  });
  expect(engine.scrollLeft).toBe(0);
  expect(result.current.max).toBe(engine.maxScrollLeft);
});

test('ruler ignores playhead changes when viewport geometry is fixed', () => {
  const engine = makeEngine();
  let renders = 0;
  const { result } = renderHook(
    () => {
      renders++;
      return useTimelineRulerTicks();
    },
    {
      wrapper: (props) => wrapper({ ...props, engine }),
    }
  );
  const before = renders;
  const ticks = result.current;
  act(() => {
    engine.updatePlayhead(fromSeconds(2));
  });
  expect(result.current).toEqual(ticks);
  expect(renders).toBe(before);
});

test('command hook ignores clip presentation updates', () => {
  const engine = makeEngine();
  let renders = 0;
  renderHook(
    () => {
      renders++;
      return useTimelineEditCommands();
    },
    {
      wrapper: (props) => wrapper({ ...props, engine }),
    }
  );
  const before = renders;
  act(() => {
    engine.updateClipProperties('clip', { label: 'changed' });
  });
  expect(renders).toBe(before);
});

test('In/Out control uses content bounds for an implicit duration', () => {
  const engine = makeEngine();
  const { result } = renderHook(() => useTimelineInOutRangeControl(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  expect(result.current.max).toBe(toSeconds(engine.maxContentTime));
});

test('replacing a range preserves both endpoints when crossing the old out point', () => {
  const engine = makeEngine();
  engine.setInPoint(fromSeconds(2));
  engine.setOutPoint(fromSeconds(4));
  const { result } = renderHook(() => useTimelineRangeSelection(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  act(() => {
    result.current.setRange({ startTime: fromSeconds(4), endTime: fromSeconds(6) });
  });
  expect(result.current.range).toEqual({ startTime: fromSeconds(4), endTime: fromSeconds(6) });
});

test('zoom bounds update when constraints change without changing zoom', () => {
  const engine = makeEngine();
  const { result } = renderHook(() => useTimelineZoomControl(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  act(() => {
    engine.setZoomConstraints({ maxZoomScale: 300 });
  });
  expect(engine.zoomScale).toBe(100);
  expect(result.current.max).toBe(300);
});

test('range replacement rejects invalid input before publishing either boundary', () => {
  const engine = makeEngine();
  engine.setInOutRange(fromSeconds(2), fromSeconds(4));
  const snapshots: [number | undefined, number | undefined][] = [];
  engine.on('state:inOut', () => {
    const { inPoint, outPoint } = engine.getState();
    snapshots.push([inPoint && toSeconds(inPoint), outPoint && toSeconds(outPoint)]);
  });
  expect(engine.setInOutRange(fromSeconds(6), fromSeconds(4))).toEqual({
    ok: false,
    reason: 'invalid-range',
  });
  expect(engine.setInOutRange({ v: 0, r: 0 }, fromSeconds(6))).toMatchObject({
    ok: false,
    reason: 'invalid-input',
  });
  expect(snapshots).toEqual([]);
  engine.setInOutRange(fromSeconds(4), fromSeconds(6));
  expect(snapshots).toEqual([[4, 6]]);
});

test('retained edit commands use the current selection without a React render', () => {
  const engine = makeEngine();
  const { result } = renderHook(() => useTimelineEditCommands(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  const commands = result.current;
  act(() => {
    engine.selectClip('clip');
    expect(commands.splitSelectedClipsAtTime(fromSeconds(5)).ok).toBe(true);
  });
  expect(engine.tracks[0].clips).toHaveLength(2);
  expect(result.current).toBe(commands);
});

test('In/Out slider applies both changed endpoints atomically', () => {
  const engine = makeEngine();
  engine.setInOutRange(fromSeconds(2), fromSeconds(4));
  const { result } = renderHook(() => useTimelineInOutRangeControl(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  act(() => result.current.setValue([4, 6]));
  expect(result.current.value).toEqual([4, 6]);
});
