import React from 'react';
import { act, render, renderHook, cleanup } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vite-plus/test';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { useTimelineSelector } from '@techsquidtv/canvas-timeline-react';
import { useTimelineSelection } from '#react/hooks/selection/useTimelineSelection';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimelineProvider } from '#react/Provider';
import { useTimelineState } from '#react/hooks/core/useTimelineState';
import { useTimelineTrack } from '#react/hooks/tracks/useTimelineTrack';
import { useTimelineTracks } from '#react/hooks/tracks/useTimelineTracks';
import { createClip, createTrack } from '#react/hooks/integration/testHelpers';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('commands from a missing row validate newly added tracks before the next render', () => {
  const engine = new TimelineEngine({ tracks: [] });
  const { result } = renderHook(() => useTimelineTrack('new'), {
    wrapper: ({ children }) => <TimelineProvider engine={engine}>{children}</TimelineProvider>,
  });
  act(() => {
    engine.addTrack(createTrack('new', []));
    expect(result.current.setMuted(true)).toEqual({ ok: true });
  });
  expect(result.current.muted).toBe(true);
});

test('StrictMode replay retains geometry sharing for subsequently mounted rows', () => {
  const engine = new TimelineEngine({ tracks: [createTrack('a', []), createTrack('b', [])] });
  const geometry = vi.spyOn(engine.geometry, 'getTrackRects');
  function Row({ id }: { id: string }) {
    useTimelineTrack(id);
    return null;
  }
  const view = render(
    <React.StrictMode>
      <TimelineProvider engine={engine}>
        <Row id="a" />
      </TimelineProvider>
    </React.StrictMode>
  );
  view.rerender(
    <React.StrictMode>
      <TimelineProvider engine={engine}>
        <Row id="a" />
        <Row id="b" />
      </TimelineProvider>
    </React.StrictMode>
  );
  expect(geometry).toHaveBeenCalledTimes(1);
});

test('track rows ignore unrelated clip edits and keep command identities stable', () => {
  const engine = new TimelineEngine({
    tracks: [createTrack('a', []), createTrack('b', [createClip('clip', 0, 1)])],
  });
  const geometry = vi.spyOn(engine.geometry, 'getTrackRects');
  let renders = 0;
  const { result } = renderHook(
    () => {
      renders++;
      return useTimelineTrack('a');
    },
    {
      wrapper: ({ children }) => <TimelineProvider engine={engine}>{children}</TimelineProvider>,
    }
  );
  const original = result.current;
  const initialRenders = renders;
  act(() => {
    engine.updateClipProperties('clip', { label: 'changed' });
  });
  expect(renders).toBe(initialRenders);
  expect(result.current).toBe(original);
  expect(geometry).toHaveBeenCalledTimes(1);
  act(() => {
    engine.setTrackHeight('a', 80);
  });
  expect(result.current.height).toBe(80);
  expect(result.current.toggleMute).toBe(original.toggleMute);
});

test('row geometry updates across resize, reorder, removal, options, and StrictMode replay', () => {
  const engine = new TimelineEngine({ tracks: [createTrack('a', []), createTrack('b', [])] });
  const { result, rerender, unmount } = renderHook(
    ({ height }) => useTimelineTrack('b', { trackHeight: height }),
    {
      initialProps: { height: 40 },
      wrapper: ({ children }) => (
        <React.StrictMode>
          <TimelineProvider engine={engine}>{children}</TimelineProvider>
        </React.StrictMode>
      ),
    }
  );
  expect(result.current.rect?.y).toBe(72);
  rerender({ height: 60 });
  expect(result.current.rect?.y).toBe(92);
  act(() => {
    engine.removeTrack('a');
  });
  expect(result.current.trackIndex).toBe(0);
  expect(result.current.rect?.y).toBe(32);
  act(() => {
    engine.removeTrack('b');
  });
  expect(result.current.exists).toBe(false);
  expect(result.current.rect).toBeNull();
  expect(result.current.toggleMute()).toEqual({ ok: false, reason: 'not-found' });
  unmount();
});

test('selectors support falsy primitives, custom equality, changing selectors, and engine replacement', () => {
  const first = new TimelineEngine({ tracks: [] });
  const second = new TimelineEngine({ tracks: [createTrack('other', [])] });
  let renders = 0;
  const { result, rerender } = renderHook(
    ({ field }: { field: 'tracks' | 'markers' }) => {
      renders++;
      return {
        count: useTimelineSelector((state) => state[field]?.length ?? 0),
        playing: useTimelineSelector((state) => state.playing),
        ids: useTimelineSelector(
          (state) => state.tracks.map((track) => track.id),
          (a, b) => a.join(',') === b.join(',')
        ),
      };
    },
    {
      initialProps: { field: 'tracks' },
      wrapper: ({ children }) => <TimelineProvider engine={first}>{children}</TimelineProvider>,
    }
  );
  const initialRenders = renders;
  act(() => {
    first.setScrollLeft(0);
  });
  expect(result.current.count).toBe(0);
  expect(result.current.playing).toBe(false);
  expect(renders).toBe(initialRenders);
  act(() => {
    first.addTrack(createTrack('added', []));
  });
  const ids = result.current.ids;
  act(() => {
    first.toggleMuteTrack('added', true);
  });
  expect(result.current.ids).toBe(ids);
  rerender({ field: 'markers' });
  expect(result.current.count).toBe(0);
  act(() => {
    first.addMarker(fromSeconds(1));
  });
  expect(result.current.count).toBe(1);

  const selected: string[] = [];
  function Consumer() {
    selected.push(useTimelineSelector((state) => state.tracks[0]?.id ?? ''));
    return null;
  }
  const view = render(
    <TimelineProvider engine={first}>
      <Consumer />
    </TimelineProvider>
  );
  view.rerender(
    <TimelineProvider engine={second}>
      <Consumer />
    </TimelineProvider>
  );
  expect(selected.at(-1)).toBe('other');
});

test('selection and collection hooks share Core command results', () => {
  const engine = new TimelineEngine({ tracks: [createTrack('a', [createClip('clip', 0, 1)])] });
  const { result } = renderHook(
    () => ({ selection: useTimelineSelection(), tracks: useTimelineTracks() }),
    {
      wrapper: ({ children }) => <TimelineProvider engine={engine}>{children}</TimelineProvider>,
    }
  );
  expect(result.current.selection.selectClip('missing')).toEqual({
    ok: false,
    reason: 'not-found',
  });
  expect(result.current.selection.selectTrack('missing')).toEqual(
    result.current.tracks.selectTrack('missing')
  );
  act(() => {
    expect(result.current.selection.selectClip('clip')).toEqual({ ok: true });
  });
  expect(result.current.selection.selectedClipId).toBe('clip');
  expect(result.current.selection.selectClips(['clip', 'missing'])).toEqual({
    ok: false,
    reason: 'not-found',
  });
  expect(engine.getState().tracks[0].clips[0].selected).toBe(true);
  act(() => {
    expect(result.current.selection.toggleClipSelection('clip')).toEqual({ ok: true });
  });
  expect(result.current.selection.selectedClipId).toBeNull();
});

test('track rows share one geometry computation', () => {
  const tracks = Array.from({ length: 12 }, (_, index) => createTrack(`track-${index}`, []));
  const engine = new TimelineEngine({ tracks });
  const geometry = vi.spyOn(engine.geometry, 'getTrackRects');
  function Row({ id }: { id: string }) {
    useTimelineTrack(id);
    return null;
  }
  render(
    <TimelineProvider engine={engine}>
      {tracks.map((track) => (
        <Row key={track.id} id={track.id} />
      ))}
    </TimelineProvider>
  );
  const rowsAllocated = geometry.mock.results.reduce(
    (total, result) => total + (result.type === 'return' ? result.value.length : 0),
    0
  );
  expect(geometry).toHaveBeenCalledTimes(1);
  expect(rowsAllocated).toBe(12);
});

test('React reuses immutable Core snapshots and unchanged track identities', () => {
  const engine = new TimelineEngine({
    tracks: [createTrack('a', [createClip('clip', 0, 1)]), createTrack('b', [])],
  });
  const { result } = renderHook(() => useTimelineState(), {
    wrapper: ({ children }) => <TimelineProvider engine={engine}>{children}</TimelineProvider>,
  });
  const originalCoreTrack = engine.getState().tracks[1];
  const originalReactTrack = result.current.tracks[1];
  expect(result.current.tracks).toBe(engine.getState().tracks);
  act(() => {
    engine.updateClipProperties('clip', { label: 'edited' });
  });
  expect(engine.getState().tracks[1]).toBe(originalCoreTrack);
  expect(result.current.tracks[1]).toBe(originalReactTrack);
  expect(Object.isFrozen(engine.getState().tracks)).toBe(true);
  expect(Object.isFrozen(result.current.tracks)).toBe(true);
});

test('track commands validate current state and return structured failures', () => {
  const engine = new TimelineEngine({ tracks: [] });
  const { result } = renderHook(() => useTimelineTracks(), {
    wrapper: ({ children }) => <TimelineProvider engine={engine}>{children}</TimelineProvider>,
  });
  act(() => {
    expect(result.current.addTrack(createTrack('new', []))).toEqual({ ok: true });
    expect(result.current.setMuted('new', true)).toEqual({ ok: true });
  });
  expect(engine.getState().tracks[0].muted).toBe(true);
  expect(result.current.setTrackHeight('new', Number.NaN)).toMatchObject({
    ok: false,
    reason: 'invalid-input',
  });
  act(() => {
    expect(result.current.removeTrack('new')).toEqual({ ok: true });
    expect(result.current.toggleMute('new')).toEqual({ ok: false, reason: 'not-found' });
  });
});
