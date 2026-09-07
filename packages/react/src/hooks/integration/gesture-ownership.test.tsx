import { useTimelineClipDrag } from '#react/hooks/clips/useTimelineClipDrag';
import { useTimelineClipTrim } from '#react/hooks/clips/useTimelineClipTrim';
import { createClip, createTrack, wrapper } from '#react/hooks/integration/testHelpers';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { act, renderHook } from '@testing-library/react';
import { expect, test } from 'vite-plus/test';

test.each(['move', 'end', 'cancel', 'unmount'] as const)(
  'a superseded drag cannot affect a replacement preview on %s',
  (action) => {
    const engine = new TimelineEngine({
      tracks: [createTrack('track', [createClip('clip', 1, 3)])],
    });
    const { result, unmount } = renderHook(() => useTimelineClipDrag(), {
      wrapper: (props) => wrapper({ ...props, engine }),
    });
    act(() => {
      result.current.startClipDrag({ clipId: 'clip', clientX: 100, viewportY: 50 });
      result.current.moveClipDrag({ clientX: 200, viewportY: 50 });
    });
    let preview = engine.getEditPreview();
    act(() => {
      preview = engine.previewEdit({ type: 'delete-clips', clipIds: ['clip'] });
    });
    act(() => {
      if (action === 'move') {
        expect(result.current.moveClipDrag({ clientX: 300, viewportY: 50 }).ok).toBe(false);
      }
      if (action === 'end') {
        expect(result.current.endClipDrag().ok).toBe(false);
      }
      if (action === 'cancel') {
        result.current.cancelClipDrag();
      }
      if (action === 'unmount') {
        unmount();
      }
    });
    expect(engine.tracks[0].clips).toHaveLength(1);
    expect(engine.getEditPreview()).toBe(preview);
    expect(engine.canUndo).toBe(false);
    unmount();
    expect(engine.getEditPreview()).toBe(preview);
  }
);

test('a new gesture supersedes an older gesture before either publishes a preview', () => {
  const engine = new TimelineEngine({ tracks: [createTrack('track', [createClip('clip', 1, 3)])] });
  const { result, unmount } = renderHook(
    () => ({ drag: useTimelineClipDrag(), trim: useTimelineClipTrim() }),
    {
      wrapper: (props) => wrapper({ ...props, engine }),
    }
  );
  act(() => {
    result.current.drag.startClipDrag({ clipId: 'clip', clientX: 100, viewportY: 50 });
    result.current.trim.startClipTrim({ clipId: 'clip', edge: 'end', clientX: 300 });
    expect(result.current.drag.moveClipDrag({ clientX: 200, viewportY: 50 }).ok).toBe(false);
    result.current.drag.cancelClipDrag();
    expect(result.current.trim.moveClipTrim({ clientX: 400 }).ok).toBe(true);
    expect(result.current.trim.endClipTrim().ok).toBe(true);
  });
  expect(engine.tracks[0].clips[0].timelineEnd).toEqual(fromSeconds(4));
  unmount();
});

test('history restoration invalidates a trim before its first move', () => {
  const engine = new TimelineEngine({ tracks: [createTrack('track', [createClip('clip', 1, 3)])] });
  engine.renameTrack('track', 'Renamed');
  const { result, unmount } = renderHook(() => useTimelineClipTrim(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  act(() => {
    result.current.startClipTrim({ clipId: 'clip', edge: 'end', clientX: 300 });
    engine.undo();
    expect(result.current.moveClipTrim({ clientX: 400 }).ok).toBe(false);
    expect(result.current.endClipTrim().ok).toBe(false);
  });
  expect(engine.tracks[0].clips[0].timelineEnd).toEqual(fromSeconds(3));
  unmount();
});
