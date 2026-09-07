import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { act, renderHook } from '@testing-library/react';
import { expect, test } from 'vite-plus/test';
import { useTimelineTrackCommands, useTimelineTrack, useTimelineEditCommands } from '#react/hooks';
import { createClip, createTrack, wrapper } from '#react/hooks/integration/testHelpers';

function createEngine() {
  return new TimelineEngine({
    tracks: [
      createTrack('a', [createClip('one', 0, 2)]),
      createTrack('b', [createClip('two', 0, 2)]),
    ],
  });
}

test('command-only track consumers do not rerender on document, selection, or viewport updates', () => {
  const engine = createEngine();
  let renders = 0;
  const { result } = renderHook(
    () => {
      renders++;
      return useTimelineTrackCommands();
    },
    { wrapper: (props) => wrapper({ ...props, engine }) }
  );
  const commands = result.current;
  const before = renders;
  act(() => {
    commands.renameTrack('a', 'Renamed');
    commands.moveTrack('a', 1);
    commands.setCollapsed('a', true);
    commands.toggleCollapse('a');
    commands.selectTrack('b');
    engine.updatePlayhead(fromSeconds(1));
    engine.setZoomScale(50);
  });
  expect(renders).toBe(before);
  expect(result.current).toBe(commands);
  expect(engine.tracks[1]).toMatchObject({ id: 'a', name: 'Renamed', collapsed: false });
});

test('row hooks observe rename, order and collapse, including history restoration', () => {
  const engine = createEngine();
  const { result } = renderHook(() => useTimelineTrack('a'), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  act(() => {
    result.current.renameTrack('Dialogue');
    result.current.moveTrack(1);
    result.current.setCollapsed(true);
  });
  expect(result.current).toMatchObject({ name: 'Dialogue', trackIndex: 1, collapsed: true });
  expect(result.current.rect?.height).toBe(24);
  act(() => engine.undo());
  expect(result.current.collapsed).toBe(false);
  act(() => {
    engine.removeTrack('a');
  });
  expect(result.current.exists).toBe(false);
  expect(result.current.moveTrack(0)).toMatchObject({ reason: 'not-found' });
});

test('bulk deletion uses current selection, is atomic across locks, and is one undo step', () => {
  const engine = createEngine();
  const { result } = renderHook(() => useTimelineEditCommands(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  const commands = result.current;
  act(() => {
    engine.selectClip('one');
    engine.toggleClipSelection('two');
    engine.toggleLockTrack('b', true);
  });
  act(() => expect(commands.deleteSelectedClips()).toMatchObject({ ok: false, reason: 'locked' }));
  expect(engine.tracks.flatMap((track) => track.clips)).toHaveLength(2);
  act(() => {
    engine.toggleLockTrack('b', false);
    expect(commands.deleteSelectedClips().ok).toBe(true);
  });
  expect(engine.tracks.flatMap((track) => track.clips)).toHaveLength(0);
  act(() => engine.undo());
  expect(engine.tracks.flatMap((track) => track.clips)).toHaveLength(2);
  act(() => expect(commands.deleteClips(['one', 'missing']).ok).toBe(false));
  expect(engine.tracks.flatMap((track) => track.clips)).toHaveLength(2);
  act(() => expect(commands.deleteClips(['one', 'two']).ok).toBe(true));
  expect(engine.tracks.flatMap((track) => track.clips)).toHaveLength(0);
});
