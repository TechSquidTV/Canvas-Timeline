import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { expect, test } from 'vite-plus/test';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimelineProvider } from '#react/Provider';
import { expectDefined } from '#test-utils/assertions';
import {
  useTimelineKeyframeSegments,
  useTimelineKeyframeTangentDrag,
  useTimelineKeyframeDrag,
  useTimelineKeyframes,
} from '#react/hooks';

import {
  createClip,
  createTrack,
  levelKeyframeProperty,
  opacityKeyframeProperty,
} from '#react/hooks/integration/test-helpers';

test('useTimelineKeyframes exposes keyframe geometry, evaluation, and commands', () => {
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
        keyframeSize: 12,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(result.current.keyframes).toHaveLength(1);
  expect(result.current.visibleKeyframes[0].rect.width).toBe(12);

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
    result.current.selectKeyframe('intro', 'opacity-start');
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
    engine.getKeyframeRects({ rulerHeight: 32, trackHeight: 48 })[0],
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

  const keyframe = engine.getClipKeyframes('intro')[0];
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

  expect(engine.getClipKeyframes('intro', 'level')[0].outgoing).toEqual({
    interpolation: 'bezier',
    handle: { x: 0.42, y: 0 },
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

  expect(engine.getClipKeyframes('intro')[0].outgoing).toEqual({
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
    engine.getKeyframeSegments({
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

  const updatedIncoming = engine.getClipKeyframes('intro')[1].incoming?.handle;
  expect(engine.getClipKeyframes('intro')[0].outgoing?.handle).toEqual({ x: 0.2, y: 0.8 });
  expect(updatedIncoming?.x).toBeCloseTo(0.6);
  expect(updatedIncoming?.y).toBeCloseTo(0.4);

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
    engine.getKeyframeSegments({
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

test('useTimelineKeyframeTangentDrag preserves vertical handle value for flat segments', () => {
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
    engine.getKeyframeSegments({ property: 'opacity', rulerHeight: 32, trackHeight: 48 })[0],
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

  expect(engine.getClipKeyframes('intro')[0].outgoing).toEqual({
    interpolation: 'bezier',
    handle: { x: 0.4, y: 0.75 },
  });
});
