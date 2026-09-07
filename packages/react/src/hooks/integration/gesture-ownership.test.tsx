import { useTimelineClipDrag } from '#react/hooks/clips/useTimelineClipDrag';
import { useTimelineClipTrim } from '#react/hooks/clips/useTimelineClipTrim';
import { createClip, createTrack, wrapper } from '#react/hooks/integration/testHelpers';
import { createKeyframeInteractionEngine } from '#react/hooks/integration/keyframeInteractionTestHelpers';
import { useTimelineKeyframeDrag } from '#react/hooks/keyframes/useTimelineKeyframeDrag';
import { useTimelineKeyframeTangentDrag } from '#react/hooks/keyframes/useTimelineKeyframeTangentDrag';
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

for (const kind of ['keyframe', 'tangent'] as const) {
  test.each(['move', 'end', 'cancel', 'unmount'] as const)(
    `a superseded ${kind} gesture leaves a newer keyframe preview intact on %s`,
    (action) => {
      const engine = createKeyframeInteractionEngine([
        {
          id: 'a',
          property: 'opacity',
          time: fromSeconds(1),
          value: 0.5,
          outgoing: { interpolation: 'bezier', handle: { x: 0.3, y: 0.8 } },
        },
        {
          id: 'b',
          property: 'opacity',
          time: fromSeconds(5),
          value: 0.5,
          incoming: { interpolation: 'bezier', handle: { x: 0.7, y: 0.2 } },
        },
      ]);
      const { result, unmount } = renderHook(
        () => ({
          point: useTimelineKeyframeDrag(),
          tangent: useTimelineKeyframeTangentDrag({ property: 'opacity' }),
        }),
        { wrapper: (props) => wrapper({ ...props, engine }) }
      );
      const move = () =>
        kind === 'keyframe'
          ? result.current.point.moveKeyframeDrag({ clientX: 200, viewportY: 56 })
          : result.current.tangent.moveKeyframeTangentDrag({ viewportX: 230, viewportY: 45 });
      act(() => {
        const started =
          kind === 'keyframe'
            ? result.current.point.startKeyframeDrag({
                clipId: 'clip',
                keyframeId: 'a',
                clientX: 100,
                viewportY: 56,
              })
            : result.current.tangent.startKeyframeTangentDrag({
                tangentHandle: engine.keyframes.getKeyframeSegments({ property: 'opacity' })[0]
                  .handles[0],
              });
        expect(started.ok).toBe(true);
        expect(move().ok).toBe(true);
      });
      let preview = engine.getEditPreview();
      act(() => {
        preview = engine.previewEdit({
          type: 'keyframes',
          edits: [{ type: 'update', clipId: 'clip', keyframeId: 'b', value: 0.9 }],
        });
      });
      act(() => {
        if (action === 'move') {
          expect(move().ok).toBe(false);
        }
        if (action === 'end') {
          expect(
            (kind === 'keyframe'
              ? result.current.point.endKeyframeDrag()
              : result.current.tangent.endKeyframeTangentDrag()
            ).ok
          ).toBe(false);
        }
        if (action === 'cancel') {
          if (kind === 'keyframe') {
            result.current.point.cancelKeyframeDrag();
          } else {
            result.current.tangent.cancelKeyframeTangentDrag();
          }
        }
        if (action === 'unmount') {
          unmount();
        }
      });
      expect(engine.getEditPreview()).toBe(preview);
      expect(engine.getState().tracks[0].clips[0].keyframes?.[1].value).toBe(0.5);
      expect(engine.canUndo).toBe(false);
      unmount();
      expect(engine.getEditPreview()).toBe(preview);
    }
  );
}

test('history restoration invalidates a keyframe gesture before its first move', () => {
  const engine = createKeyframeInteractionEngine();
  engine.renameTrack('track', 'Renamed');
  const { result } = renderHook(() => useTimelineKeyframeDrag(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  act(() => {
    expect(
      result.current.startKeyframeDrag({
        clipId: 'clip',
        keyframeId: 'b',
        clientX: 300,
        viewportY: 56,
      }).ok
    ).toBe(true);
    engine.undo();
    expect(result.current.moveKeyframeDrag({ clientX: 400, viewportY: 56 }).ok).toBe(false);
    expect(result.current.endKeyframeDrag().ok).toBe(false);
  });
  expect(engine.keyframes.getClipKeyframes('clip')[1].time).toEqual(fromSeconds(3));
});
