import {
  useTimelineKeyframeDrag,
  useTimelineKeyframes,
  useTimelineKeyframeGeometry,
  useTimelineKeyframeSegments,
  useTimelineKeyframeTangentDrag,
} from '#react/hooks';
import {
  createClip,
  createTrack,
  levelKeyframeProperty,
  opacityKeyframeProperty,
} from '#react/hooks/integration/testHelpers';
import { TimelineProvider } from '#react/Provider';
import { expectDefined } from '#test-utils/assertions';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { expect, test, vi } from 'vite-plus/test';
test('useTimelineKeyframes exposes settled keyframe state, evaluation, and commands', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 4, {
          selected: true,
          keyframes: [
            {
              id: 'opacity-start',
              property: 'opacity',
              time: fromSeconds(0),
              value: 1,
            },
          ],
        }),
      ]),
    ],
    zoomScale: 100,
    keyframeProperties: [opacityKeyframeProperty],
  });

  const { result } = renderHook(
    () =>
      useTimelineKeyframes({
        clipId: 'intro',
        property: 'opacity',
        selectedClipOnly: true,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(result.current.keyframes).toHaveLength(1);

  act(() => {
    result.current.setKeyframe({
      clipId: 'intro',
      property: 'opacity',
      time: fromSeconds(2),
      value: 0.25,
    });
  });

  expect(result.current.keyframes).toHaveLength(2);
  expect(result.current.getPropertyValueAtTime('intro', 'opacity', fromSeconds(1))).toBe(0.625);
  expect(
    result.current.setKeyframe({
      clipId: 'missing',
      property: 'opacity',
      time: fromSeconds(2),
      value: 0.5,
    }).reason
  ).toBe('not-found');

  act(() => {
    result.current.updateKeyframe({
      clipId: 'intro',
      keyframeId: 'opacity-start',
      outgoing: { interpolation: 'bezier', handle: { x: 0.2, y: 1 } },
    });
  });

  expect(result.current.keyframes[0].outgoing).toEqual({
    interpolation: 'bezier',
    handle: { x: 0.2, y: 1 },
  });

  act(() => {
    result.current.selectKeyframes([{ clipId: 'intro', keyframeId: 'opacity-start' }]);
  });

  expect(result.current.keyframes[0].selected).toBe(true);
});

test('useTimelineKeyframes reports invalid keyframe command input', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 4, {
          selected: true,
        }),
      ]),
    ],
    keyframeProperties: [opacityKeyframeProperty],
  });

  const { result } = renderHook(() => useTimelineKeyframes({ clipId: 'intro' }), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  expect(
    result.current.setKeyframe({
      clipId: 'intro',
      property: 'opacity',
      time: fromSeconds(1),
      value: Number.NaN,
    })
  ).toEqual({
    ok: false,
    reason: 'invalid-input',
    message: 'Timeline keyframe could not be created from the provided input.',
    cause: expect.any(RangeError),
  });
});

test('useTimelineKeyframeDrag previews keyframe time and value changes', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 4, {
          selected: true,
          keyframes: [
            {
              id: 'opacity-middle',
              property: 'opacity',
              time: fromSeconds(1),
              value: 0.5,
            },
          ],
        }),
      ]),
    ],
    zoomScale: 100,
    keyframeProperties: [opacityKeyframeProperty],
  });

  const { result } = renderHook(
    () => useTimelineKeyframeDrag({ rulerHeight: 32, trackHeight: 48, keyframeValuePadding: 7 }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );
  const rect = expectDefined(
    engine.keyframes.getKeyframeRects({ rulerHeight: 32, trackHeight: 48 })[0],
    'keyframe rect'
  );

  act(() => {
    expect(
      result.current.startKeyframeDrag({
        clipId: 'intro',
        keyframeId: 'opacity-middle',
        clientX: rect.rect.x + rect.rect.width / 2,
        viewportY: rect.rect.y + rect.rect.height / 2,
        keyframeRect: rect,
      }).ok
    ).toBe(true);
  });

  act(() => {
    result.current.moveKeyframeDrag({
      clientX: rect.rect.x + rect.rect.width / 2 + 100,
      viewportY: 39,
    });
  });

  const keyframe = engine.keyframes.getClipKeyframes('intro')[0];
  expect(toSeconds(keyframe.time)).toBe(2);
  expect(keyframe.value).toBe(1);

  act(() => {
    result.current.endKeyframeDrag();
  });
});

test('useTimelineKeyframeSegments exposes tangent geometry for non-opacity properties', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 4, {
          selected: true,
          keyframes: [
            {
              id: 'level-start',
              property: 'level',
              time: fromSeconds(0),
              value: -24,
              outgoing: { interpolation: 'bezier', handle: { x: 0.2, y: 0.8 } },
              selected: true,
            },
            {
              id: 'level-end',
              property: 'level',
              time: fromSeconds(4),
              value: 0,
              incoming: { interpolation: 'bezier', handle: { x: 0.8, y: 0.2 } },
            },
          ],
        }),
      ]),
    ],
    zoomScale: 100,
    keyframeProperties: [levelKeyframeProperty],
  });

  const { result } = renderHook(
    () =>
      useTimelineKeyframeSegments({
        property: 'level',
        selectedClipOnly: true,
        selectedKeyframeOnly: true,
        rulerHeight: 32,
        trackHeight: 48,
        tangentHandleSize: 8,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(result.current.visibleSegments[0].property).toBe('level');
  expect(result.current.visibleTangentHandles).toHaveLength(2);
  expect(result.current.visibleTangentHandles[0].keyframe.property).toBe('level');

  act(() => {
    expect(
      result.current.updateKeyframeSide({
        clipId: 'intro',
        keyframeId: 'level-start',
        side: 'outgoing',
        patch: {
          interpolation: 'bezier',
          handle: null,
        },
      }).ok
    ).toBe(true);
  });

  expect(engine.keyframes.getClipKeyframes('intro', 'level')[0].outgoing).toEqual({
    interpolation: 'bezier',
  });
});

test('useTimelineKeyframeSegments reports invalid side command input', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 4, {
          selected: true,
          keyframes: [
            {
              id: 'opacity-start',
              property: 'opacity',
              time: fromSeconds(0),
              value: 0.25,
            },
          ],
        }),
      ]),
    ],
    keyframeProperties: [opacityKeyframeProperty],
  });

  const { result } = renderHook(
    () => useTimelineKeyframeSegments({ property: 'opacity', rulerHeight: 32, trackHeight: 48 }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(
    result.current.updateKeyframeSide({
      clipId: 'intro',
      keyframeId: 'opacity-start',
      side: 'outgoing',
      patch: {
        interpolation: 'bezier',
        handle: { x: Number.NaN, y: 0.5 },
      },
    })
  ).toEqual({
    ok: false,
    reason: 'invalid-input',
    message: 'Timeline keyframe side could not be updated from the provided input.',
    cause: expect.any(RangeError),
  });
});

test('useTimelineKeyframeSegments exposes Bezier segments, tangent handles, and side commands', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 4, {
          selected: true,
          keyframes: [
            {
              id: 'opacity-start',
              property: 'opacity',
              time: fromSeconds(0),
              value: 0.25,
              outgoing: { interpolation: 'bezier', handle: { x: 0.2, y: 0.8 } },
              selected: true,
            },
            {
              id: 'opacity-end',
              property: 'opacity',
              time: fromSeconds(4),
              value: 0.75,
              incoming: { interpolation: 'bezier', handle: { x: 0.8, y: 0.2 } },
            },
          ],
        }),
      ]),
    ],
    zoomScale: 100,
    keyframeProperties: [opacityKeyframeProperty],
  });

  const { result } = renderHook(
    () =>
      useTimelineKeyframeSegments({
        property: 'opacity',
        selectedClipOnly: true,
        selectedKeyframeOnly: true,
        rulerHeight: 32,
        trackHeight: 48,
        tangentHandleSize: 8,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(result.current.visibleSegments).toHaveLength(1);
  expect(result.current.visibleTangentHandles).toHaveLength(2);
  expect(
    result.current.getTangentHandleAtPoint({
      property: 'opacity',
      x: result.current.visibleTangentHandles[0].point.x,
      y: result.current.visibleTangentHandles[0].point.y,
      rulerHeight: 32,
      trackHeight: 48,
      tangentHandleSize: 8,
    })?.side
  ).toBe('outgoing');

  act(() => {
    expect(
      result.current.updateKeyframeSide({
        clipId: 'intro',
        keyframeId: 'opacity-start',
        side: 'outgoing',
        patch: {
          interpolation: 'bezier',
          handle: { x: 0.1, y: 0.9 },
        },
      }).ok
    ).toBe(true);
  });

  expect(engine.keyframes.getClipKeyframes('intro')[0].outgoing).toEqual({
    interpolation: 'bezier',
    handle: { x: 0.1, y: 0.9 },
  });
  expect(
    result.current.updateKeyframeSide({
      clipId: 'missing',
      keyframeId: 'opacity-start',
      side: 'outgoing',
      patch: {
        interpolation: 'bezier',
        handle: { x: 0.1, y: 0.9 },
      },
    }).reason
  ).toBe('not-found');
});

test('useTimelineKeyframeTangentDrag previews Bezier tangent handle changes', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 4, {
          selected: true,
          keyframes: [
            {
              id: 'opacity-start',
              property: 'opacity',
              time: fromSeconds(0),
              value: 0.25,
              outgoing: { interpolation: 'bezier', handle: { x: 0.2, y: 0.8 } },
              selected: true,
            },
            {
              id: 'opacity-end',
              property: 'opacity',
              time: fromSeconds(4),
              value: 0.75,
              incoming: { interpolation: 'bezier', handle: { x: 0.8, y: 0.2 } },
            },
          ],
        }),
      ]),
    ],
    zoomScale: 100,
    keyframeProperties: [opacityKeyframeProperty],
  });

  const { result } = renderHook(
    () =>
      useTimelineKeyframeTangentDrag({
        property: 'opacity',
        rulerHeight: 32,
        trackHeight: 48,
        tangentHandleSize: 8,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );
  const segment = expectDefined(
    engine.keyframes.getKeyframeSegments({
      property: 'opacity',
      rulerHeight: 32,
      trackHeight: 48,
      tangentHandleSize: 8,
    })[0],
    'keyframe segment'
  );
  const incoming = expectDefined(segment.handles[1], 'incoming handle');

  act(() => {
    expect(
      result.current.startKeyframeTangentDrag({
        tangentHandle: incoming,
      }).ok
    ).toBe(true);
  });

  act(() => {
    result.current.moveKeyframeTangentDrag({
      viewportX: segment.startPoint.x + (segment.endPoint.x - segment.startPoint.x) * 0.6,
      viewportY: segment.startPoint.y + (segment.endPoint.y - segment.startPoint.y) * 0.4,
    });
  });

  const updatedIncoming = engine.keyframes.getClipKeyframes('intro')[1].incoming?.handle;
  expect(engine.keyframes.getClipKeyframes('intro')[0].outgoing?.handle).toEqual({
    x: 0.2,
    y: 0.8,
  });
  expect(updatedIncoming?.x).toBeCloseTo(0.6);
  expect(updatedIncoming?.y).toBeCloseTo(0.45);

  act(() => {
    result.current.endKeyframeTangentDrag();
  });
});

test('useTimelineKeyframeTangentDrag reports invalid pointer coordinates', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 4, {
          selected: true,
          keyframes: [
            {
              id: 'opacity-start',
              property: 'opacity',
              time: fromSeconds(0),
              value: 0.25,
              outgoing: { interpolation: 'bezier', handle: { x: 0.2, y: 0.8 } },
            },
            {
              id: 'opacity-end',
              property: 'opacity',
              time: fromSeconds(4),
              value: 0.75,
              incoming: { interpolation: 'bezier', handle: { x: 0.8, y: 0.2 } },
            },
          ],
        }),
      ]),
    ],
    zoomScale: 100,
    keyframeProperties: [opacityKeyframeProperty],
  });

  const { result } = renderHook(
    () =>
      useTimelineKeyframeTangentDrag({
        property: 'opacity',
        rulerHeight: 32,
        trackHeight: 48,
        tangentHandleSize: 8,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );
  const segment = expectDefined(
    engine.keyframes.getKeyframeSegments({
      property: 'opacity',
      rulerHeight: 32,
      trackHeight: 48,
      tangentHandleSize: 8,
    })[0],
    'keyframe segment'
  );

  act(() => {
    result.current.startKeyframeTangentDrag({
      tangentHandle: segment.handles[0],
    });
  });

  expect(
    result.current.moveKeyframeTangentDrag({
      viewportX: Number.NaN,
      viewportY: segment.startPoint.y,
    })
  ).toEqual({
    ok: false,
    reason: 'invalid-input',
    message: 'Timeline keyframe tangent drag requires finite viewport coordinates.',
  });
});

test('useTimelineKeyframeTangentDrag edits vertical handles for flat segments', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 4, {
          selected: true,
          keyframes: [
            {
              id: 'opacity-start',
              property: 'opacity',
              time: fromSeconds(0),
              value: 0.5,
              outgoing: { interpolation: 'bezier', handle: { x: 0.2, y: 0.75 } },
              selected: true,
            },
            {
              id: 'opacity-end',
              property: 'opacity',
              time: fromSeconds(4),
              value: 0.5,
              incoming: { interpolation: 'bezier', handle: { x: 0.8, y: 0.25 } },
            },
          ],
        }),
      ]),
    ],
    zoomScale: 100,
    keyframeProperties: [opacityKeyframeProperty],
  });

  const { result } = renderHook(
    () => useTimelineKeyframeTangentDrag({ property: 'opacity', rulerHeight: 32, trackHeight: 48 }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );
  const segment = expectDefined(
    engine.keyframes.getKeyframeSegments({
      property: 'opacity',
      rulerHeight: 32,
      trackHeight: 48,
    })[0],
    'flat keyframe segment'
  );

  act(() => {
    result.current.startKeyframeTangentDrag({
      tangentHandle: segment.handles[0],
    });
  });
  act(() => {
    result.current.moveKeyframeTangentDrag({
      viewportX: segment.startPoint.x + (segment.endPoint.x - segment.startPoint.x) * 0.4,
      viewportY: segment.startPoint.y + 100,
    });
  });

  expect(engine.keyframes.getClipKeyframes('intro')[0].outgoing).toEqual({
    interpolation: 'bezier',
    handle: { x: 0.4, y: 0 },
  });
});

test('settled keyframe state ignores previews and scrolling while scoped geometry stays live', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('track', [
        createClip('clip', 0, 4, {
          keyframes: [{ id: 'key', property: 'opacity', time: fromSeconds(1), value: 0.5 }],
        }),
      ]),
    ],
    keyframeProperties: [opacityKeyframeProperty],
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(TimelineProvider, { engine }, children);
  const stateRender = vi.fn();
  const geometryRender = vi.fn();
  renderHook(
    () => {
      stateRender();
      return useTimelineKeyframes({ clipId: 'clip' });
    },
    { wrapper }
  );
  const rects = vi.spyOn(engine.keyframes, 'getKeyframeRects');
  const { result } = renderHook(
    () => {
      geometryRender();
      return useTimelineKeyframeGeometry({ clipId: 'clip', property: 'opacity' });
    },
    { wrapper }
  );
  expect(rects).toHaveBeenCalledTimes(1);
  stateRender.mockClear();
  geometryRender.mockClear();
  act(() => {
    engine.previewEdit({
      type: 'keyframes',
      edits: [{ type: 'update', clipId: 'clip', keyframeId: 'key', value: 0.75 }],
    });
  });
  expect(stateRender).not.toHaveBeenCalled();
  expect(geometryRender).toHaveBeenCalled();
  expect(result.current.keyframeRects[0].keyframe.value).toBe(0.75);
  act(() => {
    engine.updatePlayhead(fromSeconds(2));
    engine.setScrollLeft(10);
  });
  expect(stateRender).not.toHaveBeenCalled();
  act(() => {
    engine.cancelEdit();
  });
  expect(result.current.keyframeRects[0].keyframe.value).toBe(0.5);
  act(() => {
    engine.keyframes.updateClipKeyframe({ clipId: 'clip', keyframeId: 'key', value: 0.8 });
  });
  expect(stateRender).toHaveBeenCalled();
});

test('group dragging preserves spacing across timebases with fine and axis controls', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('track', [
        createClip('clip', 0, 10, {
          keyframes: [
            { id: 'a', property: 'opacity', time: { v: 24, r: 24 }, value: 0.4, selected: true },
            { id: 'b', property: 'opacity', time: { v: 90, r: 30 }, value: 0.6, selected: true },
          ],
        }),
      ]),
    ],
    keyframeProperties: [opacityKeyframeProperty],
    zoomScale: 100,
  });
  const { result, unmount } = renderHook(() => useTimelineKeyframeDrag(), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });
  act(() => {
    result.current.startKeyframeDrag({
      clipId: 'clip',
      keyframeId: 'a',
      clientX: 100,
      viewportY: 50,
    });
  });
  act(() => {
    result.current.moveKeyframeDrag({
      clientX: 123,
      viewportY: 10,
      snap: false,
      axis: 'time',
      fine: true,
    });
  });
  const keys = engine.keyframes.getClipKeyframes('clip');
  expect(toSeconds(keys[0].time)).toBeCloseTo(1.023, 6);
  expect(toSeconds(keys[1].time) - toSeconds(keys[0].time)).toBeCloseTo(2, 8);
  expect(keys.map((key) => key.value)).toEqual([0.4, 0.6]);
  unmount();
  expect(engine.keyframes.getClipKeyframes('clip').map((key) => toSeconds(key.time))).toEqual([
    1, 3,
  ]);
  expect(engine.canUndo).toBe(false);
});

test('keyframe geometry stays cached for equal inline options and refreshes for changed options', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('track', [
        createClip('clip', 0, 4, {
          keyframes: [{ id: 'key', property: 'opacity', time: fromSeconds(1), value: 0.5 }],
        }),
      ]),
    ],
    keyframeProperties: [opacityKeyframeProperty],
  });
  const geometry = vi.spyOn(engine.keyframes, 'getKeyframeRects');
  const { result, rerender } = renderHook(
    ({ trackHeight }) => useTimelineKeyframeGeometry({ property: 'opacity', trackHeight }),
    {
      initialProps: { trackHeight: 48 },
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );
  const initial = result.current;
  const count = geometry.mock.calls.length;
  rerender({ trackHeight: 48 });
  expect(result.current).toBe(initial);
  expect(geometry).toHaveBeenCalledTimes(count);
  rerender({ trackHeight: 100 });
  expect(result.current).not.toBe(initial);
  expect(result.current.keyframeRects[0].rect.y).not.toBe(initial.keyframeRects[0].rect.y);
});
