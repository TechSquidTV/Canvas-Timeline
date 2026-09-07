import type { TimelineReadonly, Clip, Track } from '#core/types';
import { TimelineEngine } from '#core/engine';
import {
  createTimelineScalarKeyframeProperty,
  getTimelineKeyframeBezierControlPoints,
  getTimelineKeyframeBezierProgress,
} from '#core/keyframes';
import { expectDefined } from '#test-utils/assertions';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
const opacityKeyframeProperty = createTimelineScalarKeyframeProperty({
  id: 'opacity',
  label: 'Opacity',
  min: 0,
  max: 1,
  defaultValue: 1,
  formatValue: (value) => `${Math.round(value * 100)}%`,
  getBaseValue: (clip) => clip.opacity ?? 1,
});
const nonlinearKeyframeProperty = {
  id: 'gamma',
  label: 'Gamma',
  min: 0,
  max: 100,
  defaultValue: 0,
  clampValue: (value: number) => Math.max(0, Math.min(100, value)),
  normalizeValue: (value: number) => Math.sqrt(Math.max(0, Math.min(100, value)) / 100),
  denormalizeValue: (normalized: number) => Math.max(0, Math.min(1, normalized)) ** 2 * 100,
  formatValue: (value: number) => `${Math.round(value)}`,
};

describe('TimelineEngine keyframes', () => {
  let engine: TimelineEngine;
  let mockTrack: Track;
  let mockClip: Clip;

  beforeEach(() => {
    mockClip = {
      id: 'clip1',
      sourceId: 'src1',
      timelineStart: fromSeconds(1),
      timelineEnd: fromSeconds(5),
      sourceStart: fromSeconds(0),
      selected: false,
    };

    mockTrack = {
      id: 'track1',
      kind: 'visual',
      clips: [mockClip],
      selected: false,
      locked: false,
      muted: false,
      visible: true,
    };

    engine = new TimelineEngine({
      tracks: [mockTrack],
      playheadTime: fromSeconds(0),
      keyframeProperties: [opacityKeyframeProperty],
    });
  });

  describe('Keyframes', () => {
    it.each(['value', 'incoming', 'outgoing'] as const)(
      'rejects an invalid %s before moving a keyframe or deleting a collision',
      (field) => {
        const first = expectDefined(
          engine.keyframes.setClipKeyframe({
            clipId: 'clip1',
            property: 'opacity',
            time: fromSeconds(2),
            value: 0.5,
          }),
          'first keyframe'
        );
        engine.keyframes.setClipKeyframe({
          clipId: 'clip1',
          property: 'opacity',
          time: fromSeconds(3),
          value: 0.8,
        });
        const before = engine.getState();
        const invalid = { interpolation: 'bezier', handle: { x: NaN, y: 0.5 } } as const;
        expect(() =>
          engine.keyframes.updateClipKeyframe({
            clipId: 'clip1',
            keyframeId: first.id,
            time: fromSeconds(3),
            ...(field === 'value' ? { value: NaN } : { [field]: invalid }),
          })
        ).toThrow();
        engine.invalidateContent();
        expect(engine.getState().tracks).toEqual(before.tracks);
        engine.undo();
        expect(engine.keyframes.getClipKeyframes('clip1')).toHaveLength(1);
      }
    );

    it('validates both interpolation sides before applying either side', () => {
      const first = expectDefined(
        engine.keyframes.setClipKeyframe({
          clipId: 'clip1',
          property: 'opacity',
          time: fromSeconds(2),
          value: 0.5,
        }),
        'first keyframe'
      );
      const before = engine.getState();
      expect(() =>
        engine.keyframes.updateClipKeyframeSides({
          clipId: 'clip1',
          keyframeId: first.id,
          incoming: { interpolation: 'hold' },
          outgoing: { interpolation: 'bezier', handle: { x: NaN, y: 0.5 } },
        })
      ).toThrow();
      expect(() =>
        engine.keyframes.setClipKeyframe({
          clipId: 'clip1',
          property: 'opacity',
          time: fromSeconds(2),
          value: 0.9,
          outgoing: { interpolation: 'bezier', handle: { x: NaN, y: 0.5 } },
        })
      ).toThrow();
      engine.invalidateContent();
      expect(engine.getState().tracks).toEqual(before.tracks);
    });

    function createKeyframeClip(id: string, start: number, end: number, values: number[]): Clip {
      return {
        id,
        sourceId: `${id}-source`,
        timelineStart: fromSeconds(start),
        timelineEnd: fromSeconds(end),
        sourceStart: fromSeconds(0),
        selected: false,
        keyframes: values.map((time, index) => ({
          id: `${id}-opacity-${index}`,
          property: 'opacity',
          time: fromSeconds(time),
          value: index / Math.max(1, values.length - 1),
        })),
      };
    }

    function createKeyframeTrack(clips: Clip[]): Track {
      return {
        id: 'keyframe-track',
        kind: 'visual',
        clips,
        selected: false,
        locked: false,
        muted: false,
        visible: true,
      };
    }

    function keyframeSeconds(clip: TimelineReadonly<Clip> | undefined): number[] {
      return (clip?.keyframes ?? []).map((keyframe) => toSeconds(keyframe.time));
    }

    it('refreshes drawing snapshots during a keyframe preview', () => {
      const before = engine.getRenderState();
      engine.keyframes.setClipKeyframe(
        {
          clipId: 'clip1',
          property: 'opacity',
          time: fromSeconds(1),
          value: 0.5,
        },
        { commit: false }
      );
      const preview = engine.getRenderState();
      expect(preview.tracks).not.toBe(before.tracks);
      expect(preview.tracks[0].clips[0].keyframes?.[0].value).toBe(0.5);
    });

    it('stores registered keyframe properties as immutable snapshots', () => {
      const registryEngine = new TimelineEngine({ tracks: [] });
      const scaleOptions = {
        id: 'scale',
        label: 'Scale',
        min: 0,
        max: 4,
        defaultValue: 1,
      };
      const scaleProperty = createTimelineScalarKeyframeProperty(scaleOptions);

      registryEngine.registerKeyframeProperty(scaleProperty);
      scaleOptions.max = 12;
      scaleProperty.label = 'Changed';

      const registered = expectDefined(
        registryEngine.getKeyframePropertyDefinition('scale'),
        'registered keyframe property'
      );
      expect(Object.isFrozen(registered)).toBe(true);
      expect(registered.label).toBe('Scale');
      expect(registered.clampValue(8)).toBe(4);
      expect(registered.normalizeValue(2)).toBe(0.5);
      expect(registryEngine.hasKeyframeProperty('scale')).toBe(true);
      expect(registryEngine.listKeyframeProperties()).toEqual([registered]);
    });

    it('rejects keyframe property definitions with invalid mapping outputs', () => {
      expect(
        () =>
          new TimelineEngine({
            tracks: [],
            keyframeProperties: [
              {
                ...nonlinearKeyframeProperty,
                id: 'bad-clamp',
                clampValue: () => Number.NaN,
              },
            ],
          })
      ).toThrow('clampValue result');
      expect(
        () =>
          new TimelineEngine({
            tracks: [],
            keyframeProperties: [
              {
                ...nonlinearKeyframeProperty,
                id: 'bad-normalize',
                normalizeValue: () => 2,
              },
            ],
          })
      ).toThrow('normalizeValue must return a value between 0 and 1');
      expect(
        () =>
          new TimelineEngine({
            tracks: [],
            keyframeProperties: [
              {
                ...nonlinearKeyframeProperty,
                id: 'bad-denormalize',
                denormalizeValue: () => 101,
              },
            ],
          })
      ).toThrow('denormalizeValue must return a value within min/max');
    });

    it('rejects invalid custom property outputs during evaluation', () => {
      const unstableKeyframeProperty = {
        id: 'unstable',
        label: 'Unstable',
        min: 0,
        max: 1,
        defaultValue: 0,
        clampValue: (value: number) => Math.max(0, Math.min(1, value)),
        normalizeValue: (value: number) => Math.max(0, Math.min(1, value)),
        denormalizeValue: (normalized: number) =>
          normalized > 0.49 && normalized < 0.51 ? Number.NaN : normalized,
      };
      const unstableEngine = new TimelineEngine({
        tracks: [
          {
            ...mockTrack,
            clips: [
              {
                ...mockClip,
                timelineStart: fromSeconds(0),
                timelineEnd: fromSeconds(10),
                keyframes: [
                  {
                    id: 'unstable-start',
                    property: 'unstable',
                    time: fromSeconds(0),
                    value: 0,
                  },
                  {
                    id: 'unstable-end',
                    property: 'unstable',
                    time: fromSeconds(10),
                    value: 1,
                  },
                ],
              },
            ],
          },
        ],
        keyframeProperties: [unstableKeyframeProperty],
      });

      expect(() =>
        unstableEngine.keyframes.getClipPropertyValueAtTime('clip1', 'unstable', fromSeconds(5))
      ).toThrow('denormalizeValue result');
    });

    it('evaluates nonlinear properties in normalized space and prepares matching geometry', () => {
      const nonlinearEngine = new TimelineEngine({
        tracks: [
          {
            ...mockTrack,
            clips: [
              {
                ...mockClip,
                timelineStart: fromSeconds(0),
                timelineEnd: fromSeconds(10),
                keyframes: [
                  {
                    id: 'gamma-start',
                    property: 'gamma',
                    time: fromSeconds(0),
                    value: 0,
                  },
                  {
                    id: 'gamma-middle',
                    property: 'gamma',
                    time: fromSeconds(5),
                    value: 25,
                  },
                  {
                    id: 'gamma-end',
                    property: 'gamma',
                    time: fromSeconds(10),
                    value: 100,
                  },
                ],
              },
            ],
          },
        ],
        keyframeProperties: [nonlinearKeyframeProperty],
        zoomScale: 100,
      });

      expect(
        nonlinearEngine.keyframes.getClipPropertyValueAtTime('clip1', 'gamma', fromSeconds(2.5))
      ).toBeCloseTo(6.25);

      const geometry = nonlinearEngine.keyframes.getKeyframeRenderGeometry({
        property: 'gamma',
        rulerHeight: 32,
        trackHeight: 48,
        viewportHeight: 100,
        viewportWidth: 1000,
      });
      const renderClip = expectDefined(geometry.clips[0], 'gamma render clip');
      const middlePoint = expectDefined(
        renderClip.points.find((point) => point.keyframeId === 'gamma-middle'),
        'gamma middle point'
      );
      const middleCenterY = middlePoint.rect.y + middlePoint.rect.height / 2;

      expect(middleCenterY).toBeCloseTo(56);
      expect(renderClip.segments).toHaveLength(2);
    });

    it('sets, updates, and evaluates registered keyframes with side-aware interpolation', () => {
      const addEvent = vi.fn();
      const updateEvent = vi.fn();
      engine.on('keyframe:add', addEvent);
      engine.on('keyframe:update', updateEvent);

      expect(
        engine.keyframes.setClipKeyframe({
          clipId: 'clip1',
          property: 'opacity',
          time: fromSeconds(1),
          value: 1,
        })?.value
      ).toBe(1);
      engine.keyframes.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(3),
        value: 0,
        outgoing: { interpolation: 'hold' },
      });
      engine.keyframes.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(5),
        value: 1,
      });

      expect(engine.keyframes.getClipPropertyValueAtTime('clip1', 'opacity', fromSeconds(2))).toBe(
        0.5
      );
      expect(engine.keyframes.getClipPropertyValueAtTime('clip1', 'opacity', fromSeconds(4))).toBe(
        0
      );
      expect(
        engine.keyframes.getClipPropertyValueAtTime('clip1', 'opacity', fromSeconds(8))
      ).toBeUndefined();

      const middle = expectDefined(
        engine.keyframes.getClipKeyframes('clip1', 'opacity')[1],
        'middle keyframe'
      );
      const updatedBySet = engine.keyframes.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(3),
        value: 0.25,
      });

      expect(updatedBySet?.outgoing?.interpolation).toBe('hold');
      expect(engine.keyframes.getClipPropertyValueAtTime('clip1', 'opacity', fromSeconds(4))).toBe(
        0.25
      );

      const updated = engine.keyframes.updateClipKeyframe({
        clipId: 'clip1',
        keyframeId: middle.id,
        value: 0.25,
        outgoing: { interpolation: 'linear' },
      });

      expect(updated?.value).toBe(0.25);
      expect(engine.keyframes.getClipPropertyValueAtTime('clip1', 'opacity', fromSeconds(4))).toBe(
        0.625
      );

      const bezier = engine.keyframes.updateClipKeyframeSides({
        clipId: 'clip1',
        keyframeId: middle.id,
        incoming: {
          interpolation: 'bezier',
          handle: { x: 0.8, y: 0 },
        },
        outgoing: {
          interpolation: 'bezier',
          handle: { x: 0.2, y: 1 },
        },
      });
      const expectedBezierValue =
        0.25 + (1 - 0.25) * getTimelineKeyframeBezierProgress(0.5, { x: 0.2, y: 1 }, undefined);

      expect(bezier?.incoming).toEqual({ interpolation: 'bezier', handle: { x: 0.8, y: 0 } });
      expect(bezier?.outgoing).toEqual({ interpolation: 'bezier', handle: { x: 0.2, y: 1 } });
      expect(
        engine.keyframes.getClipPropertyValueAtTime('clip1', 'opacity', fromSeconds(4))
      ).toBeCloseTo(expectedBezierValue);

      const defaultedHandle = engine.keyframes.updateClipKeyframeSide({
        clipId: 'clip1',
        keyframeId: middle.id,
        side: 'outgoing',
        patch: { interpolation: 'bezier', handle: null },
      });
      expect(defaultedHandle?.outgoing).toEqual({
        interpolation: 'bezier',
        handle: { x: 0.42, y: 0 },
      });

      const reset = engine.keyframes.updateClipKeyframeSide({
        clipId: 'clip1',
        keyframeId: middle.id,
        side: 'outgoing',
        patch: { interpolation: 'linear' },
      });
      expect(reset?.outgoing?.interpolation).toBe('linear');

      expect(addEvent).toHaveBeenCalledTimes(3);
      expect(updateEvent).toHaveBeenCalledTimes(5);
    });

    it('does not inherit side interpolation from neighboring keyframes', () => {
      const first = engine.keyframes.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(4),
        value: 1,
      });
      expect(first?.incoming).toBeUndefined();
      expect(first?.outgoing).toBeUndefined();

      engine.keyframes.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(1),
        value: 0,
        outgoing: { interpolation: 'bezier', handle: { x: 0.2, y: 0.8 } },
      });

      const independent = engine.keyframes.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(2),
        value: 0.5,
      });
      expect(independent?.incoming).toBeUndefined();
      expect(independent?.outgoing).toBeUndefined();

      const explicit = engine.keyframes.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(3),
        value: 0.75,
        incoming: { interpolation: 'linear' },
      });
      expect(explicit?.incoming?.interpolation).toBe('linear');
      expect(explicit?.outgoing).toBeUndefined();
    });

    it('rejects unregistered keyframe properties', () => {
      expect(
        engine.keyframes.setClipKeyframe({
          clipId: 'clip1',
          property: 'volume',
          time: fromSeconds(2),
          value: 0.5,
        })
      ).toBeNull();
      expect(
        engine.keyframes.getClipPropertyValueAtTime('clip1', 'volume', fromSeconds(2))
      ).toBeUndefined();
    });

    it('keeps neighboring keyframes when preview updates collide', () => {
      const track = createKeyframeTrack([createKeyframeClip('kf-clip', 0, 10, [2, 3])]);
      const previewEngine = new TimelineEngine({
        tracks: [track],
        keyframeProperties: [opacityKeyframeProperty],
      });
      const dragged = expectDefined(
        previewEngine.keyframes.getClipKeyframes('kf-clip')[1],
        'dragged keyframe'
      );

      const preview = previewEngine.keyframes.updateClipKeyframe(
        { clipId: 'kf-clip', keyframeId: dragged.id, time: fromSeconds(2) },
        { commit: false }
      );

      expect(toSeconds(expectDefined(preview, 'preview keyframe').time)).toBe(3);
      expect(keyframeSeconds(previewEngine.geometry.getClip('kf-clip')?.clip)).toEqual([2, 3]);

      const committed = previewEngine.keyframes.updateClipKeyframe({
        clipId: 'kf-clip',
        keyframeId: dragged.id,
        time: fromSeconds(2),
      });

      expect(toSeconds(expectDefined(committed, 'committed keyframe').time)).toBe(2);
      expect(keyframeSeconds(previewEngine.geometry.getClip('kf-clip')?.clip)).toEqual([2]);
    });

    it('clones side interpolation state without property-specific fallbacks', () => {
      const sideEngine = new TimelineEngine({
        tracks: [
          {
            ...mockTrack,
            clips: [
              {
                ...mockClip,
                keyframes: [
                  {
                    id: 'linear-with-handle',
                    property: 'opacity',
                    time: fromSeconds(2),
                    value: 0.5,
                    outgoing: { interpolation: 'linear', handle: { x: 0.2, y: 0.8 } },
                  },
                  {
                    id: 'bezier-without-handle',
                    property: 'opacity',
                    time: fromSeconds(3),
                    value: 0.75,
                    incoming: { interpolation: 'bezier' },
                  },
                ],
              },
            ],
          },
        ],
        keyframeProperties: [opacityKeyframeProperty],
      });

      expect(sideEngine.keyframes.getClipKeyframes('clip1')[0].outgoing).toEqual({
        interpolation: 'linear',
      });
      expect(sideEngine.keyframes.getClipKeyframes('clip1')[1].incoming).toEqual({
        interpolation: 'bezier',
        handle: { x: 0.58, y: 1 },
      });
    });

    it('exposes selected keyframe geometry and hit testing', () => {
      const keyframe = engine.keyframes.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(3),
        value: 0.5,
      });
      const selectedKeyframe = expectDefined(keyframe, 'selected keyframe');

      engine.selectClip('clip1');
      engine.keyframes.selectClipKeyframe('clip1', selectedKeyframe.id);
      const rects = engine.keyframes.getKeyframeRects({
        selectedClipOnly: true,
        rulerHeight: 32,
        trackHeight: 48,
        keyframeSize: 12,
      });

      expect(rects).toHaveLength(1);
      expect(rects[0].keyframe.selected).toBe(true);
      const hit = engine.keyframes.getKeyframeAtPoint({
        x: rects[0].rect.x + rects[0].rect.width / 2,
        y: rects[0].rect.y + rects[0].rect.height / 2,
        rulerHeight: 32,
        trackHeight: 48,
        keyframeSize: 12,
      });

      expect(hit?.keyframe.id).toBe(selectedKeyframe.id);
    });

    it('keeps edge keyframe hit rects inside clip bounds', () => {
      const edgeEngine = new TimelineEngine({
        tracks: [
          {
            ...mockTrack,
            clips: [
              {
                ...mockClip,
                keyframes: [
                  {
                    id: 'opacity-start',
                    property: 'opacity',
                    time: fromSeconds(1),
                    value: 1,
                  },
                  {
                    id: 'opacity-end',
                    property: 'opacity',
                    time: fromSeconds(5),
                    value: 0,
                  },
                ],
              },
            ],
          },
        ],
        zoomScale: 100,
        keyframeProperties: [opacityKeyframeProperty],
      });

      const clipRect = expectDefined(
        edgeEngine.geometry.getClipRect('clip1', { rulerHeight: 32, trackHeight: 48 }),
        'clip rect'
      );
      const rects = edgeEngine.keyframes.getKeyframeRects({
        rulerHeight: 32,
        trackHeight: 48,
        keyframeSize: 12,
      });

      expect(rects).toHaveLength(2);
      expect(rects[0].rect.x).toBe(clipRect.x);
      expect(rects[1].rect.x + rects[1].rect.width).toBe(clipRect.x + clipRect.width);

      const startHit = edgeEngine.keyframes.getKeyframeAtPoint({
        x: clipRect.x + 1,
        y: rects[0].rect.y + rects[0].rect.height / 2,
        rulerHeight: 32,
        trackHeight: 48,
        keyframeSize: 12,
      });
      const endHit = edgeEngine.keyframes.getKeyframeAtPoint({
        x: clipRect.x + clipRect.width - 1,
        y: rects[1].rect.y + rects[1].rect.height / 2,
        rulerHeight: 32,
        trackHeight: 48,
        keyframeSize: 12,
      });

      expect(startHit?.keyframe.id).toBe('opacity-start');
      expect(endHit?.keyframe.id).toBe('opacity-end');
    });

    it('exposes keyframe segments and Bezier tangent handles with shared control point math', () => {
      const segmentEngine = new TimelineEngine({
        tracks: [
          {
            ...mockTrack,
            clips: [
              {
                ...mockClip,
                keyframes: [
                  {
                    id: 'opacity-start',
                    property: 'opacity',
                    time: fromSeconds(1),
                    value: 0.2,
                    outgoing: { interpolation: 'bezier', handle: { x: 0.2, y: 0.8 } },
                    selected: true,
                  },
                  {
                    id: 'opacity-middle',
                    property: 'opacity',
                    time: fromSeconds(3),
                    value: 0.8,
                    incoming: { interpolation: 'bezier', handle: { x: 0.8, y: 0.2 } },
                    outgoing: { interpolation: 'hold' },
                  },
                  {
                    id: 'opacity-end',
                    property: 'opacity',
                    time: fromSeconds(5),
                    value: 0.4,
                  },
                ],
              },
            ],
          },
        ],
        zoomScale: 100,
        keyframeProperties: [opacityKeyframeProperty],
      });

      const segments = segmentEngine.keyframes.getKeyframeSegments({
        property: 'opacity',
        rulerHeight: 32,
        trackHeight: 48,
        keyframeSize: 6,
        tangentHandleSize: 8,
        keyframeValuePadding: 7,
      });

      expect(segments).toHaveLength(2);
      expect(segments[0].interpolation).toBe('bezier');
      expect(segments[0].handles).toHaveLength(2);
      expect(segments[1].interpolation).toBe('hold');
      expect(segments[1].handles).toHaveLength(0);

      const expectedControlPoints = getTimelineKeyframeBezierControlPoints(
        segments[0].startPoint,
        segments[0].endPoint,
        { x: 0.2, y: 0.8 },
        { x: 0.8, y: 0.2 }
      );

      expect(segments[0].controlPoint1).toEqual(expectedControlPoints.controlPoint1);
      expect(segments[0].controlPoint2).toEqual(expectedControlPoints.controlPoint2);
      expect(segments[0].handles[0].point).toEqual(expectedControlPoints.controlPoint1);
      expect(segments[0].handles[1].point).toEqual(expectedControlPoints.controlPoint2);
    });

    it('hit-tests Bezier tangent handles with pointer padding', () => {
      const segmentEngine = new TimelineEngine({
        tracks: [
          {
            ...mockTrack,
            clips: [
              {
                ...mockClip,
                keyframes: [
                  {
                    id: 'opacity-start',
                    property: 'opacity',
                    time: fromSeconds(1),
                    value: 0.2,
                    outgoing: { interpolation: 'bezier', handle: { x: 0.25, y: 0.75 } },
                  },
                  {
                    id: 'opacity-end',
                    property: 'opacity',
                    time: fromSeconds(5),
                    value: 0.8,
                    incoming: { interpolation: 'bezier', handle: { x: 0.75, y: 0.25 } },
                  },
                ],
              },
            ],
          },
        ],
        zoomScale: 100,
        keyframeProperties: [opacityKeyframeProperty],
      });

      const segment = expectDefined(
        segmentEngine.keyframes.getKeyframeSegments({
          property: 'opacity',
          rulerHeight: 32,
          trackHeight: 48,
          tangentHandleSize: 8,
        })[0],
        'keyframe segment'
      );
      const outgoing = expectDefined(segment.handles[0], 'outgoing handle');
      const exactHit = segmentEngine.keyframes.getKeyframeTangentHandleAtPoint({
        property: 'opacity',
        x: outgoing.point.x,
        y: outgoing.point.y,
        rulerHeight: 32,
        trackHeight: 48,
        tangentHandleSize: 8,
      });
      const touchHit = segmentEngine.keyframes.getKeyframeTangentHandleAtPoint({
        property: 'opacity',
        x: outgoing.rect.x - 6,
        y: outgoing.rect.y - 6,
        pointerType: 'touch',
        rulerHeight: 32,
        trackHeight: 48,
        tangentHandleSize: 8,
      });

      expect(exactHit?.side).toBe('outgoing');
      expect(touchHit?.side).toBe('outgoing');
    });

    it('filters keyframe segments by selected keyframes and viewport visibility', () => {
      const segmentEngine = new TimelineEngine({
        tracks: [
          createKeyframeTrack([
            {
              ...createKeyframeClip('curve-filter', 0, 10, [-1, 2, 8, 12]),
              keyframes: [
                {
                  id: 'out-of-range-start',
                  property: 'opacity',
                  time: fromSeconds(-1),
                  value: 0.1,
                  outgoing: { interpolation: 'bezier' },
                },
                {
                  id: 'visible-start',
                  property: 'opacity',
                  time: fromSeconds(2),
                  value: 0.3,
                  outgoing: { interpolation: 'bezier', handle: { x: 0.2, y: 1 } },
                  selected: true,
                },
                {
                  id: 'visible-end',
                  property: 'opacity',
                  time: fromSeconds(8),
                  value: 0.7,
                  incoming: { interpolation: 'bezier', handle: { x: 0.8, y: 0 } },
                },
                {
                  id: 'out-of-range-end',
                  property: 'opacity',
                  time: fromSeconds(12),
                  value: 1,
                },
              ],
            },
          ]),
        ],
        zoomScale: 100,
        keyframeProperties: [opacityKeyframeProperty],
      });

      const selectedSegments = segmentEngine.keyframes.getKeyframeSegments({
        property: 'opacity',
        selectedKeyframeOnly: true,
        rulerHeight: 32,
        trackHeight: 48,
      });
      const visibleSegments = segmentEngine.keyframes.getVisibleKeyframeSegments({
        property: 'opacity',
        viewportWidth: 150,
        rulerHeight: 32,
        trackHeight: 48,
      });

      expect(selectedSegments.map((segment) => segment.segmentId)).toEqual([
        'curve-filter:visible-start:visible-end:opacity',
      ]);
      expect(visibleSegments).toHaveLength(0);
    });

    it('keeps keyframes aligned when clips move and trims them across splits', () => {
      engine.keyframes.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(2),
        value: 0.2,
        outgoing: { interpolation: 'bezier', handle: { x: 0.2, y: 0.8 } },
      });
      engine.keyframes.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(4),
        value: 0.8,
        incoming: { interpolation: 'bezier', handle: { x: 0.8, y: 0.2 } },
      });

      engine.commitEdit({
        type: 'move',
        clipId: 'clip1',
        startTime: fromSeconds(3),
      });
      const movedKeyframes = engine.keyframes.getClipKeyframes('clip1');
      expect(movedKeyframes.map((keyframe) => toSeconds(keyframe.time))).toEqual([4, 6]);
      expect(movedKeyframes[0].outgoing).toEqual({
        interpolation: 'bezier',
        handle: { x: 0.2, y: 0.8 },
      });
      expect(movedKeyframes[1].incoming).toEqual({
        interpolation: 'bezier',
        handle: { x: 0.8, y: 0.2 },
      });

      expect(
        engine.commitEdit({ type: 'split', clipIds: ['clip1'], time: fromSeconds(5) }).committed
      ).toBe(true);
      const clips = engine.getState().tracks[0].clips;
      expect(clips).toHaveLength(2);
      expect(clips[0].keyframes?.map((keyframe) => toSeconds(keyframe.time))).toEqual([4]);
      expect(clips[1].keyframes?.map((keyframe) => toSeconds(keyframe.time))).toEqual([6]);
      expect(clips[0].keyframes?.[0].outgoing).toEqual({
        interpolation: 'bezier',
        handle: { x: 0.2, y: 0.8 },
      });
      expect(clips[1].keyframes?.[0].incoming).toEqual({
        interpolation: 'bezier',
        handle: { x: 0.8, y: 0.2 },
      });
    });

    it('removes out-of-range keyframes when clips are trimmed directly', () => {
      const trimEngine = new TimelineEngine({
        tracks: [createKeyframeTrack([createKeyframeClip('trimmed', 0, 10, [1, 3, 5, 8])])],
        keyframeProperties: [opacityKeyframeProperty],
      });

      trimEngine.commitEdit({
        type: 'trim',
        clipId: 'trimmed',
        edge: 'start',
        newTime: fromSeconds(2),
      });
      expect(keyframeSeconds(trimEngine.geometry.getClip('trimmed')?.clip)).toEqual([3, 5, 8]);

      trimEngine.commitEdit({
        type: 'trim',
        clipId: 'trimmed',
        edge: 'end',
        newTime: fromSeconds(6),
      });
      expect(keyframeSeconds(trimEngine.geometry.getClip('trimmed')?.clip)).toEqual([3, 5]);
    });

    it('preserves selected clip keyframes through cut and shifts them on paste', () => {
      const cutEngine = new TimelineEngine({
        tracks: [createKeyframeTrack([createKeyframeClip('cut-source', 1, 5, [2, 4])])],
        keyframeProperties: [opacityKeyframeProperty],
      });

      cutEngine.selectClip('cut-source');
      cutEngine.cutSelection();
      expect(cutEngine.tracks[0].clips).toHaveLength(0);

      cutEngine.pasteSelection(fromSeconds(10), 'keyframe-track');

      const pastedClip = expectDefined(cutEngine.tracks[0].clips[0], 'pasted clip');
      expect(pastedClip.id).not.toBe('cut-source');
      expect(toSeconds(pastedClip.timelineStart)).toBe(10);
      expect(keyframeSeconds(pastedClip)).toEqual([11, 13]);
    });

    it('filters keyframes when range removals trim clip edges', () => {
      const deleteRangeEngine = new TimelineEngine({
        tracks: [createKeyframeTrack([createKeyframeClip('delete-victim', 0, 10, [1, 4, 8])])],
        keyframeProperties: [opacityKeyframeProperty],
      });

      deleteRangeEngine.commitEdit({
        type: 'delete-range',
        startTime: fromSeconds(0),
        endTime: fromSeconds(3),
        trackIds: ['keyframe-track'],
      });

      const rippleTrimmed = expectDefined(
        deleteRangeEngine.geometry.getClip('delete-victim')?.clip,
        'ripple trimmed clip'
      );
      expect(toSeconds(rippleTrimmed.timelineStart)).toBe(0);
      expect(toSeconds(rippleTrimmed.timelineEnd)).toBe(7);
      expect(keyframeSeconds(rippleTrimmed)).toEqual([1, 5]);

      const liftRangeEngine = new TimelineEngine({
        tracks: [createKeyframeTrack([createKeyframeClip('lift-victim', 0, 10, [2, 6, 8])])],
        keyframeProperties: [opacityKeyframeProperty],
      });

      liftRangeEngine.commitEdit({
        type: 'lift-range',
        startTime: fromSeconds(7),
        endTime: fromSeconds(12),
        trackIds: ['keyframe-track'],
      });

      const endTrimmed = expectDefined(
        liftRangeEngine.geometry.getClip('lift-victim')?.clip,
        'end trimmed clip'
      );
      expect(toSeconds(endTrimmed.timelineStart)).toBe(0);
      expect(toSeconds(endTrimmed.timelineEnd)).toBe(7);
      expect(keyframeSeconds(endTrimmed)).toEqual([2, 6]);
    });

    it('filters keyframes when overwrite edits trim clip edges', () => {
      const overwriteStartEngine = new TimelineEngine({
        tracks: [createKeyframeTrack([createKeyframeClip('start-victim', 0, 10, [1, 4, 8])])],
        keyframeProperties: [opacityKeyframeProperty],
      });

      overwriteStartEngine.commitEdit({
        type: 'overwrite',
        clip: createKeyframeClip('start-winner', 0, 3, []),
        targetTrackId: 'keyframe-track',
        startTime: fromSeconds(0),
        snap: false,
      });

      const startTrimmed = expectDefined(
        overwriteStartEngine.geometry.getClip('start-victim')?.clip,
        'start trimmed victim'
      );
      expect(toSeconds(startTrimmed.timelineStart)).toBe(3);
      expect(keyframeSeconds(startTrimmed)).toEqual([4, 8]);

      const overwriteEndEngine = new TimelineEngine({
        tracks: [createKeyframeTrack([createKeyframeClip('end-victim', 0, 10, [1, 4, 8])])],
        keyframeProperties: [opacityKeyframeProperty],
      });

      overwriteEndEngine.commitEdit({
        type: 'overwrite',
        clip: createKeyframeClip('end-winner', 0, 3, []),
        targetTrackId: 'keyframe-track',
        startTime: fromSeconds(7),
        snap: false,
      });

      const endTrimmed = expectDefined(
        overwriteEndEngine.geometry.getClip('end-victim')?.clip,
        'end trimmed victim'
      );
      expect(toSeconds(endTrimmed.timelineEnd)).toBe(7);
      expect(keyframeSeconds(endTrimmed)).toEqual([1, 4]);
    });
  });
});
