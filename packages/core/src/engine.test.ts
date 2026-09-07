import type { TimelineState, Clip, Marker, Track } from '#core/types';
import { TimelineEngine } from '#core/engine';
import type {
  ClipCreatedEvent,
  ClipMoveEvent,
  ClipRemovedEvent,
  ClipSplitEvent,
} from '#core/events';
import { createTimelineScalarKeyframeProperty } from '#core/keyframes';
import { expectDefined } from '#test-utils/assertions';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
const opacityKeyframeProperty = createTimelineScalarKeyframeProperty({
  id: 'opacity',
  label: 'Opacity',
  min: 0,
  max: 1,
  defaultValue: 1,
  formatValue: (value) => `${Math.round(value * 100)}%`,
  getBaseValue: (clip) => clip.opacity ?? 1,
});
describe('TimelineEngine', () => {
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

  describe('Timeline state snapshots', () => {
    it('rejects invalid rational clip timings at the engine boundary', () => {
      expect(
        () =>
          new TimelineEngine({
            tracks: [
              {
                ...mockTrack,
                clips: [
                  {
                    ...mockClip,
                    timelineStart: { v: 1, r: 0 },
                  },
                ],
              },
            ],
          })
      ).toThrow('clip "clip1".timelineStart.r must be a positive finite tick rate.');

      expect(
        engine.validateEdit({
          type: 'trim',
          clipId: 'clip1',
          edge: 'end',
          newTime: { v: Number.NaN, r: 24000 },
        })
      ).toEqual({
        valid: false,
        reason: 'invalid-range',
        message: 'command.newTime.v must be a finite integer tick value.',
      });
    });

    it('strips runtime metadata from constructor and addTrack inputs', () => {
      const bulky = 'metadata-sentinel'.repeat(300);
      const inputTrack = {
        id: 'metadata-track',
        kind: 'visual',
        clips: [
          {
            id: 'metadata-clip',
            sourceId: 'source-1',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(1),
            sourceStart: fromSeconds(0),
            selected: false,
            label: 'Visible label',
            data: { bulky },
            bulky,
          },
        ],
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        name: 'Visible track name',
        data: { bulky },
        bulky,
      } as unknown as Track;

      const metadataEngine = new TimelineEngine({ tracks: [inputTrack] });

      expect(metadataEngine.getState().tracks[0].name).toBe('Visible track name');
      expect(metadataEngine.getState().tracks[0].visible).toBe(true);
      expect(metadataEngine.getState().tracks[0].clips[0].label).toBe('Visible label');
      expect(JSON.stringify(metadataEngine.getState().tracks)).not.toContain(bulky);

      metadataEngine.addTrack({
        id: 'added-track',
        kind: 'audio',
        clips: [
          {
            id: 'added-clip',
            sourceId: 'source-2',
            timelineStart: fromSeconds(1),
            timelineEnd: fromSeconds(2),
            sourceStart: fromSeconds(0),
            selected: false,
            data: { bulky },
            bulky,
          },
        ],
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        data: { bulky },
        bulky,
      } as unknown as Track);

      expect(metadataEngine.getState().tracks[1].visible).toBe(true);
      expect(JSON.stringify(metadataEngine.getState().tracks)).not.toContain(bulky);
    });

    it('returns frozen snapshots that cannot inject runtime data into the engine', () => {
      const snapshot = engine.getState();
      expect(() => Object.assign(snapshot.tracks[0], { data: 'bulky' })).toThrow(TypeError);
      expect(Object.isFrozen(snapshot.tracks[0].clips[0].timelineStart)).toBe(true);
      engine.selectClip('clip1');
      engine.copySelection();
      expect(engine.clipboardCount).toBe(1);
    });
  });

  describe('Zoom constraints', () => {
    it('emits one settled render cycle when duration changes', () => {
      const render = vi.fn();
      const settled = vi.fn();
      engine.on('render', render);
      engine.on('state:settled', settled);

      engine.setDuration(fromSeconds(10));

      expect(render).toHaveBeenCalledTimes(1);
      expect(settled).toHaveBeenCalledTimes(1);

      render.mockClear();
      settled.mockClear();

      engine.setDuration(undefined);

      expect(render).toHaveBeenCalledTimes(1);
      expect(settled).toHaveBeenCalledTimes(1);
    });

    it('caps zoom-in density by configured frame rate', () => {
      const constrainedEngine = new TimelineEngine({
        duration: fromSeconds(20),
        tracks: [],
        zoomConstraints: { frameRate: 24 },
      });

      constrainedEngine.setViewportWidth(1000);
      constrainedEngine.setZoomScale(10000);

      expect(constrainedEngine.maxZoomScale).toBe(384);
      expect(constrainedEngine.zoomScale).toBe(384);
    });

    it('lets content-fit minimum win over a lower frame-rate cap', () => {
      const constrainedEngine = new TimelineEngine({
        duration: fromSeconds(1),
        tracks: [],
        zoomScale: 100,
        zoomConstraints: { frameRate: 24 },
      });

      expect(constrainedEngine.minZoomScale).toBe(1000);
      expect(constrainedEngine.maxZoomScale).toBe(1000);

      constrainedEngine.setZoomScale(2000);

      expect(constrainedEngine.zoomScale).toBe(1000);
    });

    it('updates zoom constraints after construction', () => {
      const constrainedEngine = new TimelineEngine({
        duration: fromSeconds(20),
        tracks: [],
        zoomScale: 800,
      });

      constrainedEngine.setViewportWidth(1000);
      constrainedEngine.setZoomConstraints({ frameRate: 24 });

      expect(constrainedEngine.zoomScale).toBe(384);

      constrainedEngine.setZoomConstraints({ frameRate: 30, maxPixelsPerFrame: 16 });
      constrainedEngine.setZoomScale(10000);

      expect(constrainedEngine.maxZoomScale).toBe(480);
      expect(constrainedEngine.zoomScale).toBe(480);
    });
  });

  describe('Clip hit testing', () => {
    function createHitTestEngine(tracks: Track[], scrollLeft = 0, zoomScale = 100) {
      return new TimelineEngine({
        tracks,
        playheadTime: fromSeconds(0),
        scrollLeft,
        zoomScale,
      });
    }

    function createHitTestClip(
      id: string,
      start: number,
      end: number,
      overrides: Partial<Clip> = {}
    ) {
      return {
        id,
        sourceId: `source-${id}`,
        timelineStart: fromSeconds(start),
        timelineEnd: fromSeconds(end),
        sourceStart: fromSeconds(0),
        selected: false,
        ...overrides,
      };
    }

    function createHitTestTrack(id: string, clips: Clip[], overrides: Partial<Track> = {}) {
      return {
        id,
        kind: 'visual',
        clips,
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        ...overrides,
      };
    }

    it('returns clip viewport geometry matching scroll and zoom', () => {
      const hitEngine = createHitTestEngine(
        [createHitTestTrack('track-1', [createHitTestClip('clip-1', 1, 5)])],
        25,
        50
      );

      expect(hitEngine.geometry.getClipRect('clip-1')).toEqual({
        clipId: 'clip-1',
        trackId: 'track-1',
        trackIndex: 0,
        clipIndex: 0,
        x: 25,
        y: 32,
        width: 200,
        height: 48,
      });
      expect(hitEngine.geometry.getClipRect('missing')).toBeNull();
    });

    it('returns null for ruler space, blank tracks, and points outside clips', () => {
      const hitEngine = createHitTestEngine([
        createHitTestTrack('track-1', [createHitTestClip('clip-1', 1, 5)]),
      ]);

      expect(hitEngine.geometry.getClipAtPoint({ x: 100, y: 20 })).toBeNull();
      expect(hitEngine.geometry.getClipAtPoint({ x: 50, y: 40 })).toBeNull();
      expect(hitEngine.geometry.getClipAtPoint({ x: 600, y: 40 })).toBeNull();
      expect(hitEngine.geometry.getClipAtPoint({ x: 100, y: 1000 })).toBeNull();
    });

    it('detects body and trim-edge regions with pointer-specific thresholds', () => {
      const hitEngine = createHitTestEngine([
        createHitTestTrack('track-1', [createHitTestClip('clip-1', 1, 5)]),
      ]);

      expect(hitEngine.geometry.getClipAtPoint({ x: 105, y: 40 })?.region).toBe('start-edge');
      expect(hitEngine.geometry.getClipAtPoint({ x: 495, y: 40 })?.region).toBe('end-edge');
      expect(hitEngine.geometry.getClipAtPoint({ x: 130, y: 40 })?.region).toBe('body');
      expect(
        hitEngine.geometry.getClipAtPoint({ x: 120, y: 40, pointerType: 'mouse' })?.region
      ).toBe('body');
      expect(
        hitEngine.geometry.getClipAtPoint({ x: 120, y: 40, pointerType: 'touch' })?.region
      ).toBe('start-edge');
    });

    it('uses custom and collapsed track heights', () => {
      const hitEngine = createHitTestEngine([
        createHitTestTrack('track-1', [createHitTestClip('clip-1', 1, 2)], { height: 60 }),
        createHitTestTrack('track-2', [createHitTestClip('clip-2', 2, 3)], { collapsed: true }),
      ]);

      const hit = hitEngine.geometry.getClipAtPoint({ x: 220, y: 100 });

      expect(hit?.clip.id).toBe('clip-2');
      expect(hit?.rect).toMatchObject({
        clipId: 'clip-2',
        trackId: 'track-2',
        y: 92,
        height: 24,
      });
    });

    it('returns canonical clip rect entries in track order', () => {
      const hitEngine = createHitTestEngine([
        createHitTestTrack('track-1', [createHitTestClip('clip-1', 1, 2)], {
          height: 60,
          locked: true,
          muted: true,
          visible: true,
        }),
        createHitTestTrack('track-2', [
          createHitTestClip('clip-2', 2, 3, {
            disabled: true,
            movable: false,
            resizable: false,
            sourceStart: fromSeconds(10),
          }),
        ]),
      ]);

      const clipRects = hitEngine.geometry.getClipRects();

      expect(clipRects.map((entry) => `${entry.track.id}:${entry.clip.id}`)).toEqual([
        'track-1:clip-1',
        'track-2:clip-2',
      ]);
      expect(clipRects[0]).toMatchObject({
        canMove: false,
        canTrim: false,
        disabled: false,
        locked: true,
        muted: true,
        visible: true,
        rect: {
          clipId: 'clip-1',
          trackId: 'track-1',
          x: 100,
          y: 32,
          width: 100,
          height: 60,
        },
      });
      expect(clipRects[1]).toMatchObject({
        canMove: false,
        canTrim: false,
        disabled: true,
        locked: false,
        muted: false,
        visible: true,
        rect: {
          clipId: 'clip-2',
          trackId: 'track-2',
          x: 200,
          y: 92,
          width: 100,
          height: 48,
        },
      });
      expect(toSeconds(clipRects[1].sourceRange.start)).toBe(10);
      expect(toSeconds(clipRects[1].sourceRange.end)).toBe(11);
    });

    it('returns visible clips with clipped timeline and source ranges', () => {
      const hitEngine = createHitTestEngine(
        [
          createHitTestTrack('track-1', [
            createHitTestClip('before', -1, 0.5),
            createHitTestClip('visible', 1, 5, { sourceStart: fromSeconds(10) }),
            createHitTestClip('after', 8, 9),
          ]),
        ],
        150,
        100
      );

      const visibleClips = hitEngine.geometry.getVisibleTimelineClips({ viewportWidth: 200 });

      expect(visibleClips.map((entry) => entry.clip.id)).toEqual(['visible']);
      expect(visibleClips[0].visibleRect).toMatchObject({
        clipId: 'visible',
        x: 0,
        width: 200,
      });
      expect(toSeconds(visibleClips[0].visibleTimelineStartTime)).toBeCloseTo(1.5);
      expect(toSeconds(visibleClips[0].visibleTimelineEndTime)).toBeCloseTo(3.5);
      expect(toSeconds(visibleClips[0].visibleSourceStartTime)).toBeCloseTo(10.5);
      expect(toSeconds(visibleClips[0].visibleSourceEndTime)).toBeCloseTo(12.5);
    });

    it('honors visible clip overscan and optional vertical filtering', () => {
      const hitEngine = createHitTestEngine(
        [
          createHitTestTrack('track-1', [createHitTestClip('near-left', 0, 1)]),
          createHitTestTrack('track-2', [createHitTestClip('below', 0, 1)]),
        ],
        124,
        100
      );

      expect(hitEngine.geometry.getVisibleTimelineClips({ viewportWidth: 100 })).toHaveLength(0);
      expect(
        hitEngine.geometry.getVisibleTimelineClips({
          overscanPixels: 25,
          viewportHeight: 50,
          viewportWidth: 100,
        })
      ).toHaveLength(1);
      expect(
        hitEngine.geometry.getVisibleTimelineClips({
          overscanPixels: 25,
          viewportHeight: 200,
          viewportWidth: 100,
        })
      ).toHaveLength(2);
    });

    it('clips visible clip rectangles to the fixed ruler after vertical scroll', () => {
      const hitEngine = createHitTestEngine([
        createHitTestTrack('track-1', [createHitTestClip('under-ruler', 0, 2)]),
        createHitTestTrack('track-2', [createHitTestClip('below', 0, 2)]),
      ]);
      hitEngine.setViewportHeight(80);
      hitEngine.setScrollTop(20);

      const visibleClips = hitEngine.geometry.getVisibleTimelineClips({
        viewportHeight: 80,
        viewportWidth: 200,
      });

      expect(visibleClips[0].visibleRect).toMatchObject({
        clipId: 'under-ruler',
        y: 32,
        height: 28,
      });
    });

    it('allows locked and non-editable clips to be selected without edit regions', () => {
      const lockedEngine = createHitTestEngine([
        createHitTestTrack('track-1', [createHitTestClip('clip-1', 1, 5)], { locked: true }),
      ]);
      const nonEditableEngine = createHitTestEngine([
        createHitTestTrack('track-1', [
          createHitTestClip('clip-1', 1, 5, { movable: false, resizable: false }),
        ]),
      ]);

      const lockedHit = lockedEngine.geometry.getClipAtPoint({ x: 105, y: 40 });
      const nonEditableHit = nonEditableEngine.geometry.getClipAtPoint({ x: 105, y: 40 });

      expect(lockedHit?.region).toBe('body');
      expect(lockedHit?.canMove).toBe(false);
      expect(lockedHit?.canTrim).toBe(false);
      expect(nonEditableHit?.region).toBe('body');
      expect(nonEditableHit?.canMove).toBe(false);
      expect(nonEditableHit?.canTrim).toBe(false);
    });

    it('matches canvas draw order for overlapping clips', () => {
      const selectedEngine = createHitTestEngine([
        createHitTestTrack('track-1', [
          createHitTestClip('clip-selected', 1, 4, { selected: true }),
          createHitTestClip('clip-later', 2, 5),
        ]),
      ]);
      const laterEngine = createHitTestEngine([
        createHitTestTrack('track-1', [
          createHitTestClip('clip-earlier', 1, 4),
          createHitTestClip('clip-later', 2, 5),
        ]),
      ]);

      expect(selectedEngine.geometry.getClipAtPoint({ x: 250, y: 40 })?.clip.id).toBe(
        'clip-selected'
      );
      expect(laterEngine.geometry.getClipAtPoint({ x: 250, y: 40 })?.clip.id).toBe('clip-later');
    });
  });

  describe('Playback', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start playing', () => {
      expect(engine.getState().playing).toBe(false);
      engine.play();
      expect(engine.getState().playing).toBe(true);
    });

    it('should pause playback', () => {
      engine.play();
      expect(engine.getState().playing).toBe(true);
      engine.pause();
      expect(engine.getState().playing).toBe(false);
    });

    it('should set playback rate', () => {
      engine.setPlaybackRate(2.0);
      expect(engine.getState().playbackRate).toBe(2.0);
      expect(engine.getPlaybackRate()).toBe(2.0);
    });

    it('should start external playback without scheduling internal animation', () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

      expect(engine.play({ clock: 'external' })).toBe(true);
      expect(engine.getState().playing).toBe(true);
      expect(rafSpy).not.toHaveBeenCalled();

      engine.setTime(fromSeconds(2));
      expect(toSeconds(engine.getTime())).toBeCloseTo(2);

      engine.pause();
      expect(engine.getState().playing).toBe(false);

      rafSpy.mockRestore();
    });

    it('applies in/out boundaries to externally clocked playback', () => {
      engine.setInPoint(fromSeconds(2), false);
      engine.setOutPoint(fromSeconds(4), false);
      engine.setTime(fromSeconds(3));

      expect(engine.play({ clock: 'external', respectInOut: true })).toBe(true);
      expect(engine.updateExternalPlaybackTime(fromSeconds(4.5))).toMatchObject({
        action: 'pause',
        reason: 'in-out',
      });
      expect(toSeconds(engine.getTime())).toBe(4);
      expect(engine.getState().playing).toBe(false);
    });

    it('stops external playback at an earlier target before later range boundaries', () => {
      const rangedEngine = new TimelineEngine({
        tracks: [mockTrack],
        duration: fromSeconds(20),
      });
      rangedEngine.setOutPoint(fromSeconds(10), false);
      rangedEngine.setTime(fromSeconds(4));

      expect(
        rangedEngine.play({
          clock: 'external',
          toTime: fromSeconds(5),
          autoEnd: true,
          loop: true,
        })
      ).toBe(true);
      expect(rangedEngine.updateExternalPlaybackTime(fromSeconds(12))).toMatchObject({
        action: 'pause',
        reason: 'target',
      });
      expect(toSeconds(rangedEngine.getTime())).toBe(5);
      expect(rangedEngine.getState().playing).toBe(false);
    });

    it.each([
      {
        name: 'out point',
        duration: 20,
        outPoint: 5,
        target: 10,
        reason: 'in-out',
      },
      {
        name: 'duration',
        duration: 5,
        outPoint: 10,
        target: 12,
        reason: 'duration',
      },
    ] as const)(
      'loops at an earlier $name before later playback boundaries',
      ({ duration, outPoint, target, reason }) => {
        const rangedEngine = new TimelineEngine({
          tracks: [mockTrack],
          duration: fromSeconds(duration),
        });
        rangedEngine.setOutPoint(fromSeconds(outPoint), false);
        rangedEngine.setTime(fromSeconds(4));

        expect(
          rangedEngine.play({
            clock: 'external',
            toTime: fromSeconds(target),
            autoEnd: true,
            loop: true,
          })
        ).toBe(true);
        expect(rangedEngine.updateExternalPlaybackTime(fromSeconds(15))).toMatchObject({
          action: 'loop',
          reason,
        });
        expect(toSeconds(rangedEngine.getTime())).toBe(0);
        expect(rangedEngine.getState().playing).toBe(true);
      }
    );

    it('preserves range precedence when an out point and target are equal', () => {
      const rangedEngine = new TimelineEngine({
        tracks: [mockTrack],
        duration: fromSeconds(20),
      });
      rangedEngine.setOutPoint(fromSeconds(5), false);
      rangedEngine.setTime(fromSeconds(4));

      expect(
        rangedEngine.play({
          clock: 'external',
          toTime: fromSeconds(5),
          autoEnd: true,
          loop: true,
        })
      ).toBe(true);
      expect(rangedEngine.updateExternalPlaybackTime(fromSeconds(6))).toMatchObject({
        action: 'loop',
        reason: 'in-out',
      });
      expect(toSeconds(rangedEngine.getTime())).toBe(0);
      expect(rangedEngine.getState().playing).toBe(true);
    });

    it('stops internal playback at an earlier target before later range boundaries', () => {
      const rangedEngine = new TimelineEngine({
        tracks: [mockTrack],
        duration: fromSeconds(20),
      });
      rangedEngine.setOutPoint(fromSeconds(10), false);
      rangedEngine.setTime(fromSeconds(4));
      let playbackFrame: FrameRequestCallback | undefined;
      const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        playbackFrame = callback;
        return 1;
      });

      expect(
        rangedEngine.play({
          toTime: fromSeconds(5),
          autoEnd: true,
          loop: true,
        })
      ).toBe(true);
      playbackFrame?.(8_000);

      expect(toSeconds(rangedEngine.getTime())).toBe(5);
      expect(rangedEngine.getState().playing).toBe(false);
      expect(rafSpy).toHaveBeenCalledOnce();
      nowSpy.mockRestore();
      rafSpy.mockRestore();
    });

    it('loops external playback and resets playback started at the out point', () => {
      engine.setInPoint(fromSeconds(2), false);
      engine.setOutPoint(fromSeconds(4), false);
      engine.setTime(fromSeconds(4));

      expect(engine.getPlaybackStartTime({ respectInOut: true })).toEqual(fromSeconds(2));
      expect(engine.play({ clock: 'external', respectInOut: true, loop: true })).toBe(true);
      expect(toSeconds(engine.getTime())).toBe(2);
      expect(engine.updateExternalPlaybackTime(fromSeconds(4.25))).toMatchObject({
        action: 'loop',
        reason: 'in-out',
      });
      expect(toSeconds(engine.getTime())).toBe(2);
      expect(engine.getState().playing).toBe(true);
    });

    it('loops external playback to zero when in/out boundaries are ignored', () => {
      const rangedEngine = new TimelineEngine({
        tracks: [mockTrack],
        duration: fromSeconds(10),
      });
      rangedEngine.setInPoint(fromSeconds(2), false);
      rangedEngine.setTime(fromSeconds(9));

      expect(rangedEngine.play({ clock: 'external', respectInOut: false, loop: true })).toBe(true);
      expect(rangedEngine.updateExternalPlaybackTime(fromSeconds(10.25))).toMatchObject({
        action: 'loop',
        reason: 'duration',
      });
      expect(toSeconds(rangedEngine.getTime())).toBe(0);
      expect(rangedEngine.getState().playing).toBe(true);
    });

    it('resets external loop playback started at duration', () => {
      const rangedEngine = new TimelineEngine({
        tracks: [mockTrack],
        duration: fromSeconds(10),
      });
      rangedEngine.setInPoint(fromSeconds(2), false);
      rangedEngine.setTime(fromSeconds(10));

      expect(rangedEngine.getPlaybackStartTime({ respectInOut: true, loop: true })).toEqual(
        fromSeconds(2)
      );
      expect(rangedEngine.play({ clock: 'external', respectInOut: true, loop: true })).toBe(true);
      expect(toSeconds(rangedEngine.getTime())).toBe(2);
      expect(rangedEngine.getState().playing).toBe(true);
    });
  });

  describe('Snapping', () => {
    it('does not snap an in point back to itself while dragging it', () => {
      engine = new TimelineEngine({
        tracks: [],
        playheadTime: fromSeconds(7),
        zoomScale: 100,
      });
      engine.setInPoint(fromSeconds(4), false);
      engine.setOutPoint(fromSeconds(9), false);

      engine.prepareSnapping({ ignoreInPoint: true });
      engine.setInPoint(fromSeconds(4.05), true);

      expect(toSeconds(expectDefined(engine.getState().inPoint, 'in point'))).toBeCloseTo(4.05);
      expect(engine.getState().snapFeedback.lines).toEqual([]);
      expect(engine.getState().snapFeedback.target).toBeNull();
    });

    it('keeps snapping range boundaries to external targets', () => {
      engine = new TimelineEngine({
        tracks: [],
        markers: [{ id: 'marker-1', time: fromSeconds(5), label: 'M1' }],
        playheadTime: fromSeconds(7),
        zoomScale: 100,
      });
      engine.setInPoint(fromSeconds(4), false);
      engine.setOutPoint(fromSeconds(9), false);

      engine.prepareSnapping({ ignoreInPoint: true });
      engine.setInPoint(fromSeconds(5.05), true);

      expect(toSeconds(expectDefined(engine.getState().inPoint, 'in point'))).toBeCloseTo(5);
      expect(engine.getState().snapFeedback.lines).toEqual([5]);
      expect(engine.getState().snapFeedback.target?.kind).toBe('marker');
    });

    it('keeps locked and muted track clips as snap references', () => {
      engine = new TimelineEngine({
        tracks: [
          {
            id: 'reference-track',
            kind: 'visual',
            clips: [
              {
                id: 'reference',
                sourceId: 'source',
                timelineStart: fromSeconds(5),
                timelineEnd: fromSeconds(8),
                sourceStart: fromSeconds(0),
                selected: false,
              },
            ],
            selected: false,
            locked: true,
            muted: true,
            visible: true,
          },
        ],
        playheadTime: fromSeconds(12),
        zoomScale: 100,
      });

      engine.prepareSnapping();
      const result = engine.resolveSnap(fromSeconds(5.05));
      const snapResult = expectDefined(result, 'snap result');

      expect(toSeconds(snapResult.snappedTime)).toBeCloseTo(5);
      expect(snapResult.target.kind).toBe('clip-start');
      expect(snapResult.target.ownerId).toBe('reference');
    });

    it('skips disabled clips and item-level snap opt-outs', () => {
      engine = new TimelineEngine({
        tracks: [
          {
            id: 'track-1',
            kind: 'visual',
            clips: [
              {
                id: 'disabled',
                sourceId: 'source-a',
                timelineStart: fromSeconds(5),
                timelineEnd: fromSeconds(8),
                sourceStart: fromSeconds(0),
                selected: false,
                disabled: true,
              },
              {
                id: 'opt-out',
                sourceId: 'source-b',
                timelineStart: fromSeconds(10),
                timelineEnd: fromSeconds(12),
                sourceStart: fromSeconds(0),
                selected: false,
                snap: false,
              },
            ],
            selected: false,
            locked: false,
            muted: false,
            visible: true,
          },
        ],
        markers: [{ id: 'marker-1', time: fromSeconds(15), snap: false }],
        playheadTime: fromSeconds(20),
        zoomScale: 100,
      });

      engine.prepareSnapping();

      expect(engine.resolveSnap(fromSeconds(5.05))).toBeNull();
      expect(engine.resolveSnap(fromSeconds(10.05))).toBeNull();
      expect(engine.resolveSnap(fromSeconds(15.05))).toBeNull();
    });

    it('registers prioritized runtime snap providers and unregisters them', () => {
      engine = new TimelineEngine({
        tracks: [],
        markers: [{ id: 'marker-1', time: fromSeconds(5), label: 'M1' }],
        playheadTime: fromSeconds(12),
        zoomScale: 100,
      });
      const unsubscribe = engine.registerSnapProvider(() => [
        {
          id: 'grid:5',
          kind: 'grid',
          time: fromSeconds(5),
          priority: 20,
          label: 'Grid 5s',
        },
      ]);

      engine.prepareSnapping();
      let result = engine.resolveSnap(fromSeconds(5.05));
      let snapResult = expectDefined(result, 'snap result');

      expect(snapResult.target.kind).toBe('grid');
      expect(snapResult.target.id).toBe('grid:5');

      unsubscribe();
      engine.prepareSnapping();
      result = engine.resolveSnap(fromSeconds(5.05));
      snapResult = expectDefined(result, 'snap result');

      expect(snapResult.target.kind).toBe('marker');
    });
  });

  describe('Media sync mapping', () => {
    beforeEach(() => {
      engine = new TimelineEngine({
        playheadTime: fromSeconds(2),
        tracks: [
          {
            id: 'video-1',
            kind: 'visual',
            clips: [
              {
                id: 'offset-clip',
                sourceId: 'source-main',
                timelineStart: fromSeconds(1),
                timelineEnd: fromSeconds(5),
                sourceStart: fromSeconds(10),
                selected: false,
              },
              {
                id: 'disabled-clip',
                sourceId: 'source-disabled',
                timelineStart: fromSeconds(1),
                timelineEnd: fromSeconds(5),
                sourceStart: fromSeconds(0),
                selected: false,
                disabled: true,
              },
            ],
            selected: false,
            locked: false,
            muted: false,
            visible: true,
          },
          {
            id: 'overlay',
            kind: 'visual',
            clips: [
              {
                id: 'overlap-clip',
                sourceId: 'source-overlay',
                timelineStart: fromSeconds(1.5),
                timelineEnd: fromSeconds(4),
                sourceStart: fromSeconds(3),
                selected: false,
              },
            ],
            selected: false,
            locked: false,
            muted: false,
            visible: true,
          },
          {
            id: 'muted-video',
            kind: 'visual',
            clips: [
              {
                id: 'muted-clip',
                sourceId: 'source-muted',
                timelineStart: fromSeconds(0),
                timelineEnd: fromSeconds(10),
                sourceStart: fromSeconds(0),
                selected: false,
              },
            ],
            selected: false,
            locked: false,
            muted: true,
            visible: true,
          },
          {
            id: 'hidden-video',
            kind: 'visual',
            clips: [
              {
                id: 'hidden-clip',
                sourceId: 'source-hidden',
                timelineStart: fromSeconds(0),
                timelineEnd: fromSeconds(10),
                sourceStart: fromSeconds(0),
                selected: false,
              },
            ],
            selected: false,
            locked: false,
            muted: false,
            visible: false,
          },
        ],
      });
    });

    it('maps timeline time to source time with non-zero offsets', () => {
      const sourceTime = engine.media.timelineTimeToSourceTime('offset-clip', fromSeconds(2.5));
      const resolvedSourceTime = expectDefined(sourceTime, 'source time');

      expect(sourceTime).toBeDefined();
      expect(toSeconds(resolvedSourceTime)).toBeCloseTo(11.5);
    });

    it('maps source time back to timeline time with non-zero offsets', () => {
      const timelineTime = engine.media.sourceTimeToTimelineTime('offset-clip', fromSeconds(11.5));
      const resolvedTimelineTime = expectDefined(timelineTime, 'timeline time');

      expect(timelineTime).toBeDefined();
      expect(toSeconds(resolvedTimelineTime)).toBeCloseTo(2.5);
    });

    it('returns undefined for missing clips and out-of-range mapping requests', () => {
      expect(engine.media.timelineTimeToSourceTime('missing', fromSeconds(2))).toBeUndefined();
      expect(
        engine.media.timelineTimeToSourceTime('offset-clip', fromSeconds(0.5))
      ).toBeUndefined();
      expect(engine.media.timelineTimeToSourceTime('offset-clip', fromSeconds(5))).toBeUndefined();
      expect(engine.media.sourceTimeToTimelineTime('offset-clip', fromSeconds(14))).toBeUndefined();
      expect(
        engine.media.sourceTimeToTimelineTime('offset-clip', fromSeconds(15.5))
      ).toBeUndefined();
    });

    it('treats active clip ranges as half-open intervals', () => {
      expect(
        engine.media.getActiveClip({ time: fromSeconds(1), sourceId: 'source-main' })?.clip.id
      ).toBe('offset-clip');
      expect(
        engine.media.getActiveClip({ time: fromSeconds(5), sourceId: 'source-main' })
      ).toBeUndefined();
    });

    it('returns active clips with computed source times in track order', () => {
      const activeClips = engine.media.getActiveClips(fromSeconds(2));

      expect(activeClips.map(({ clip }) => clip.id)).toEqual(['offset-clip', 'overlap-clip']);
      expect(activeClips.map(({ sourceTime }) => toSeconds(sourceTime))).toEqual([11, 3.5]);
      expect(activeClips.map(({ sourceRange }) => toSeconds(sourceRange.end))).toEqual([14, 5.5]);
      expect(activeClips.every(({ syncKey }) => syncKey.length > 0)).toBe(true);
    });

    it('returns clip source ranges and undefined for missing clips', () => {
      const sourceRange = engine.media.getClipSourceRange('offset-clip');
      const resolvedSourceRange = expectDefined(sourceRange, 'source range');

      expect(sourceRange).toBeDefined();
      expect(sourceRange?.sourceId).toBe('source-main');
      expect(toSeconds(resolvedSourceRange.start)).toBeCloseTo(10);
      expect(toSeconds(resolvedSourceRange.end)).toBeCloseTo(14);
      expect(toSeconds(resolvedSourceRange.duration)).toBeCloseTo(4);
      expect(engine.media.getClipSourceRange('missing')).toBeUndefined();
    });

    it('changes clip sync keys when media timing fields change', () => {
      const originalKey = engine.media.getClipSyncKey('offset-clip');

      engine.commitEdit({
        type: 'move',
        clipId: 'offset-clip',
        startTime: fromSeconds(1.25),
      });
      expect(engine.media.getClipSyncKey('offset-clip')).not.toBe(originalKey);

      const movedKey = engine.media.getClipSyncKey('offset-clip');
      engine.commitEdit({ type: 'slip', clipId: 'offset-clip', deltaTime: fromSeconds(0.25) });
      expect(engine.media.getClipSyncKey('offset-clip')).not.toBe(movedKey);
    });

    it('publishes content changes for edits that affect active layer lookup', () => {
      const mediaChange = vi.fn();
      engine.on('content:change', mediaChange);

      engine.commitEdit({
        type: 'move',
        clipId: 'offset-clip',
        startTime: fromSeconds(1.25),
      });
      engine.commitEdit({
        type: 'trim',
        clipId: 'offset-clip',
        edge: 'end',
        newTime: fromSeconds(4.5),
      });
      engine.commitEdit({ type: 'slip', clipId: 'offset-clip', deltaTime: fromSeconds(0.25) });
      engine.toggleMuteTrack('video-1', true);
      engine.toggleTrackVisibility('overlay', false);
      engine.addTrack({
        id: 'new-audio',
        kind: 'audio',
        clips: [],
        selected: false,
        locked: false,
        muted: false,
        visible: true,
      });
      engine.removeTrack('new-audio');

      expect(engine.contentRevision).toBe(7);
      expect(engine.getState().contentRevision).toBe(7);
      expect(mediaChange).toHaveBeenCalledTimes(7);
      expect(mediaChange.mock.calls.map(([revision]) => revision)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('toggles track visibility with events, active lookup exclusion, and undo history', () => {
      const visibilityChange = vi.fn();
      engine.on('track:visibility', visibilityChange);

      expect(
        engine.media.getActiveClip({ time: fromSeconds(2), sourceId: 'source-overlay' })?.clip.id
      ).toBe('overlap-clip');
      expect(
        engine.media.getActiveClip({ time: fromSeconds(2), sourceId: 'source-hidden' })
      ).toBeUndefined();

      engine.toggleTrackVisibility('overlay', false);

      expect(visibilityChange).toHaveBeenCalledWith({ trackId: 'overlay', visible: false });
      expect(engine.getState().tracks.find((track) => track.id === 'overlay')?.visible).toBe(false);
      expect(
        engine.media.getActiveClip({ time: fromSeconds(2), sourceId: 'source-overlay' })
      ).toBeUndefined();

      engine.undo();

      expect(engine.getState().tracks.find((track) => track.id === 'overlay')?.visible).toBe(true);
      expect(
        engine.media.getActiveClip({ time: fromSeconds(2), sourceId: 'source-overlay' })?.clip.id
      ).toBe('overlap-clip');

      engine.redo();

      expect(engine.getState().tracks.find((track) => track.id === 'overlay')?.visible).toBe(false);
      expect(
        engine.media.getActiveClip({ time: fromSeconds(2), sourceId: 'source-overlay' })
      ).toBeUndefined();
    });

    it('toggles track mute with events, active lookup exclusion, and undo history', () => {
      const muteChange = vi.fn();
      engine.on('track:mute', muteChange);

      expect(
        engine.media.getActiveClip({ time: fromSeconds(2), sourceId: 'source-main' })?.clip.id
      ).toBe('offset-clip');

      engine.toggleMuteTrack('video-1', true);

      expect(muteChange).toHaveBeenCalledWith({ trackId: 'video-1', muted: true });
      expect(engine.getState().tracks.find((track) => track.id === 'video-1')?.muted).toBe(true);
      expect(
        engine.media.getActiveClip({ time: fromSeconds(2), sourceId: 'source-main' })
      ).toBeUndefined();

      engine.undo();

      expect(engine.getState().tracks.find((track) => track.id === 'video-1')?.muted).toBe(false);
      expect(
        engine.media.getActiveClip({ time: fromSeconds(2), sourceId: 'source-main' })?.clip.id
      ).toBe('offset-clip');

      engine.redo();

      expect(engine.getState().tracks.find((track) => track.id === 'video-1')?.muted).toBe(true);
      expect(
        engine.media.getActiveClip({ time: fromSeconds(2), sourceId: 'source-main' })
      ).toBeUndefined();
    });

    it('selects the first active clip matching track, source, and predicate filters', () => {
      expect(
        engine.media.getActiveClip({ time: fromSeconds(2), trackKind: 'visual' })?.clip.id
      ).toBe('offset-clip');
      expect(
        engine.media.getActiveClip({ time: fromSeconds(2), sourceId: 'source-overlay' })?.clip.id
      ).toBe('overlap-clip');
      expect(
        engine.media.getActiveClip({
          time: fromSeconds(2),
          predicate: ({ clip }) => clip.id === 'disabled-clip',
        })
      ).toBeUndefined();
      expect(
        engine.media.getActiveClip({
          time: fromSeconds(2),
          predicate: ({ clip }) => clip.id === 'overlap-clip',
        })?.clip.id
      ).toBe('overlap-clip');
    });

    it('groups active clips by track id in stable track order', () => {
      const clipsByTrack = engine.media.getActiveClipsByTrack(fromSeconds(2));

      expect([...clipsByTrack.keys()]).toEqual(['video-1', 'overlay']);
      expect(clipsByTrack.get('video-1')?.map(({ clip }) => clip.id)).toEqual(['offset-clip']);
      expect(clipsByTrack.get('overlay')?.map(({ clip }) => clip.id)).toEqual(['overlap-clip']);
    });

    it('groups active layers clips without dropping layered matches', () => {
      const media = engine.media.getActiveLayers({
        time: fromSeconds(2),
        layers: {
          visuals: { trackKind: 'visual' },
          mainSource: { sourceId: 'source-main' },
          predicateMatches: { predicate: ({ clip }) => clip.id === 'overlap-clip' },
        },
      });

      expect(media.time).toEqual(fromSeconds(2));
      expect(media.layers.visuals.map(({ clip }) => clip.id)).toEqual([
        'offset-clip',
        'overlap-clip',
      ]);
      expect(media.layers.mainSource.map(({ clip }) => clip.id)).toEqual(['offset-clip']);
      expect(media.layers.predicateMatches.map(({ clip }) => clip.id)).toEqual(['overlap-clip']);
      expect(media.all.map(({ clip }) => clip.id)).toEqual(['offset-clip', 'overlap-clip']);
      expect([...media.byTrack.keys()]).toEqual(['video-1', 'overlay']);
      expect(media.primary.visuals?.clip.id).toBe('offset-clip');
      expect(media.primary.mainSource?.clip.id).toBe('offset-clip');
      expect(media.hasActiveClips).toBe(true);
      expect(
        toSeconds(
          expectDefined(
            engine.media.getFirstContentTime({
              layers: { visuals: { trackKind: 'visual' }, audio: { trackKind: 'audio' } },
            }),
            'first content time'
          )
        )
      ).toBeCloseTo(1);
    });

    it('keeps requested active layers groups empty when clips are muted or disabled', () => {
      const media = engine.media.getActiveLayers({
        time: fromSeconds(2),
        layers: {
          disabled: { sourceId: 'source-disabled' },
          muted: { sourceId: 'source-muted' },
          hidden: { sourceId: 'source-hidden' },
        },
      });

      expect(media.layers.disabled).toEqual([]);
      expect(media.layers.muted).toEqual([]);
      expect(media.layers.hidden).toEqual([]);
      expect(media.primary.disabled).toBeUndefined();
      expect(media.primary.muted).toBeUndefined();
      expect(media.primary.hidden).toBeUndefined();
      expect(media.all).toEqual([]);
      expect(media.hasActiveClips).toBe(false);
      expect(
        engine.media.getFirstContentTime({
          layers: {
            disabled: { sourceId: 'source-disabled' },
            muted: { sourceId: 'source-muted' },
            hidden: { sourceId: 'source-hidden' },
          },
        })
      ).toBeUndefined();
    });

    it('finds the earliest content time across matching layers', () => {
      expect(
        toSeconds(
          expectDefined(
            engine.media.getFirstContentTime({
              layers: {
                visuals: { trackKind: 'visual' },
              },
            }),
            'first content time'
          )
        )
      ).toBeCloseTo(1);

      expect(
        engine.media.getFirstContentTime({
          layers: {
            muted: { sourceId: 'source-muted' },
            disabled: { sourceId: 'source-disabled' },
          },
        })
      ).toBeUndefined();

      expect(
        toSeconds(
          expectDefined(
            engine.media.getFirstContentTime({
              layers: {
                visuals: { trackKind: 'visual' },
              },
              atOrAfter: fromSeconds(1.25),
              before: fromSeconds(2),
            }),
            'bounded first content time'
          )
        )
      ).toBeCloseTo(1.5);

      expect(
        engine.media.getFirstContentTime({
          layers: {
            visuals: { trackKind: 'visual' },
          },
          atOrAfter: fromSeconds(2),
        })
      ).toBeUndefined();
    });
  });

  describe('Undo/Redo', () => {
    it('should take a snapshot and undo/redo', () => {
      expect(engine.canUndo).toBe(false);

      // Perform action that snapshots
      engine.selectClip('clip1');
      engine.snapshot();

      expect(engine.canUndo).toBe(true);

      engine.undo();
      // Undo restores the previous state, clip1 shouldn't be selected in initial snapshot
      const clip = engine.getState().tracks[0].clips[0];
      expect(clip.selected).toBe(false);

      expect(engine.canRedo).toBe(true);
      engine.redo();
      // Redo restores the state with selection
      const redoneClip = engine.getState().tracks[0].clips[0];
      expect(redoneClip.selected).toBe(true);
    });

    it('captures track lock changes in undo history', () => {
      engine.toggleLockTrack('track1', true);

      expect(engine.tracks[0].locked).toBe(true);
      expect(engine.canUndo).toBe(true);

      engine.undo();
      expect(engine.tracks[0].locked).toBe(false);

      engine.redo();
      expect(engine.tracks[0].locked).toBe(true);
    });
  });

  describe('Markers', () => {
    it('keeps marker ids stable when untyped callers include an id update', () => {
      const marker = engine.addMarker(fromSeconds(1), 'Original');
      const unsafeUpdates: Partial<Marker> = { id: 'replacement-id', label: 'Updated' };

      const updated = engine.updateMarker(marker.id, unsafeUpdates);

      expect(updated?.id).toBe(marker.id);
      expect(updated?.label).toBe('Updated');
      expect(engine.markers[0].id).toBe(marker.id);
    });
  });

  describe('Clipboard', () => {
    it('should copy and paste a clip', () => {
      engine.selectClip('clip1');
      engine.copySelection();

      // Paste at time 6s
      engine.pasteSelection(fromSeconds(6), 'track1');

      const clips = engine.getState().tracks[0].clips;
      expect(clips.length).toBe(2);
      expect(toSeconds(clips[1].timelineStart)).toBeCloseTo(6);
      expect(toSeconds(clips[1].timelineEnd)).toBeCloseTo(10); // 4s duration
    });

    it('emits clip:created with the origin clip id when pasting', () => {
      const created = vi.fn();
      engine.on('clip:created', created);
      engine.selectClip('clip1');
      engine.copySelection();

      engine.pasteSelection(fromSeconds(6), 'track1');

      expect(created).toHaveBeenCalledTimes(1);
      const payload = created.mock.calls[0][0] as ClipCreatedEvent;
      expect(payload.reason).toBe('paste');
      expect(payload.originClipId).toBe('clip1');
      expect(payload.clip.id).not.toBe('clip1');
      expect(toSeconds(payload.clip.timelineStart)).toBeCloseTo(6);
    });

    it('should cut a clip', () => {
      engine.selectClip('clip1');
      engine.cutSelection();

      const clips = engine.getState().tracks[0].clips;
      expect(clips.length).toBe(0);

      // Paste at time 2s
      engine.pasteSelection(fromSeconds(2), 'track1');
      const pastedClips = engine.getState().tracks[0].clips;
      expect(pastedClips.length).toBe(1);
      expect(toSeconds(pastedClips[0].timelineStart)).toBeCloseTo(2);
    });

    it('emits clip:removed for cut clips', () => {
      const removed = vi.fn();
      engine.on('clip:removed', removed);
      engine.selectClip('clip1');

      engine.cutSelection();

      expect(removed).toHaveBeenCalledTimes(1);
      const payload = removed.mock.calls[0][0] as ClipRemovedEvent;
      expect(payload.reason).toBe('cut');
      expect(payload.clip.id).toBe('clip1');
    });
  });

  describe('Slip and Slide', () => {
    it('should slip a clip (change sourceStart)', () => {
      engine.commitEdit({ type: 'slip', clipId: 'clip1', deltaTime: fromSeconds(0.5) });
      const clip = engine.getState().tracks[0].clips[0];
      expect(toSeconds(clip.sourceStart)).toBeCloseTo(0.5);
      expect(toSeconds(clip.timelineStart)).toBeCloseTo(1.0); // unaffected
    });

    it('should slide a clip (change timelineStart)', () => {
      engine.commitEdit({ type: 'slide', clipId: 'clip1', deltaTime: fromSeconds(1) }); // move right by 1s
      const clip = engine.getState().tracks[0].clips[0];
      expect(toSeconds(clip.timelineStart)).toBeCloseTo(2.0);
      expect(toSeconds(clip.timelineEnd)).toBeCloseTo(6.0);
      expect(toSeconds(clip.sourceStart)).toBeCloseTo(0); // unaffected
    });
  });

  describe('Cross-track clip movement', () => {
    function createMoveEngine() {
      return new TimelineEngine({
        tracks: [
          {
            id: 'visual-a',
            kind: 'visual',
            clips: [
              {
                id: 'clip-a',
                sourceId: 'source-a',
                timelineStart: fromSeconds(1),
                timelineEnd: fromSeconds(3),
                sourceStart: fromSeconds(0),
                selected: true,
              },
            ],
            selected: false,
            locked: false,
            muted: false,
            visible: true,
          },
          {
            id: 'visual-b',
            kind: 'visual',
            clips: [
              {
                id: 'clip-b',
                sourceId: 'source-b',
                timelineStart: fromSeconds(8),
                timelineEnd: fromSeconds(10),
                sourceStart: fromSeconds(0),
                selected: false,
              },
            ],
            selected: false,
            locked: false,
            muted: false,
            visible: true,
          },
          {
            id: 'audio-a',
            kind: 'audio',
            clips: [],
            selected: false,
            locked: false,
            muted: false,
            visible: true,
          },
        ],
      });
    }

    it('moves clips across same-kind tracks and keeps clip lists sorted', () => {
      const moveEngine = createMoveEngine();

      expect(
        moveEngine.commitEdit({
          type: 'move',
          clipId: 'clip-a',
          startTime: fromSeconds(4),
          targetTrackId: 'visual-b',
        }).committed
      ).toBe(true);

      expect(moveEngine.getState().tracks[0].clips).toHaveLength(0);
      expect(moveEngine.getState().tracks[1].clips.map((clip) => clip.id)).toEqual([
        'clip-a',
        'clip-b',
      ]);
      const movedClip = expectDefined(moveEngine.geometry.getClip('clip-a'), 'clip-a').clip;
      expect(toSeconds(movedClip.timelineStart)).toBeCloseTo(4);
      expect(toSeconds(movedClip.timelineEnd)).toBeCloseTo(6);
    });

    it('blocks cross-kind moves by default and allows explicit cross-kind transfers', () => {
      const moveEngine = createMoveEngine();

      expect(
        moveEngine.commitEdit({
          type: 'move',
          clipId: 'clip-a',
          startTime: fromSeconds(4),
          targetTrackId: 'audio-a',
        }).committed
      ).toBe(false);
      expect(expectDefined(moveEngine.geometry.getClip('clip-a'), 'clip-a').track.id).toBe(
        'visual-a'
      );

      expect(
        moveEngine.commitEdit({
          type: 'move',
          clipId: 'clip-a',
          startTime: fromSeconds(4),
          targetTrackId: 'audio-a',
          allowCrossKindTrackMove: true,
        }).committed
      ).toBe(true);
      expect(expectDefined(moveEngine.geometry.getClip('clip-a'), 'clip-a').track.id).toBe(
        'audio-a'
      );
    });

    it('emits preview and commit move events with track metadata during drag settle', () => {
      const moveEngine = createMoveEngine();
      const moveEvents: ClipMoveEvent[] = [];
      moveEngine.on('clip:move', (event) => moveEvents.push(event));

      moveEngine.previewEdit({
        type: 'move',
        overwrite: true,
        clipId: 'clip-a',
        startTime: fromSeconds(4),
        targetTrackId: 'visual-b',
      });

      expect(moveEvents).toHaveLength(1);
      expect(moveEvents[0]).toMatchObject({
        clipId: 'clip-a',
        sourceTrackId: 'visual-a',
        destinationTrackId: 'visual-b',
        sourceTrackIndex: 0,
        destinationTrackIndex: 1,
        phase: 'preview',
      });

      moveEngine.commitEdit(expectDefined(moveEngine.getEditPreview(), 'preview').command);
      moveEngine.settle();

      expect(moveEvents).toHaveLength(2);
      expect(moveEvents[1]).toMatchObject({
        clipId: 'clip-a',
        sourceTrackId: 'visual-a',
        destinationTrackId: 'visual-b',
        phase: 'commit',
      });
    });

    it('builds and hit-tests track geometry with custom and collapsed heights', () => {
      const geometryEngine = new TimelineEngine({
        tracks: [
          {
            id: 'tall',
            kind: 'visual',
            height: 60,
            clips: [],
            selected: false,
            locked: false,
            muted: false,
            visible: true,
          },
          {
            id: 'collapsed',
            kind: 'visual',
            collapsed: true,
            clips: [],
            selected: false,
            locked: false,
            muted: false,
            visible: true,
          },
        ],
      });

      const rects = geometryEngine.geometry.getTrackRects({
        rulerHeight: 20,
        trackHeight: 48,
        collapsedTrackHeight: 18,
        viewportWidth: 320,
      });

      expect(rects.map(({ trackId, y, height }) => ({ trackId, y, height }))).toEqual([
        { trackId: 'tall', y: 20, height: 60 },
        { trackId: 'collapsed', y: 80, height: 18 },
      ]);
      expect(
        geometryEngine.geometry.getTrackAtPoint({
          y: 89,
          rulerHeight: 20,
          trackHeight: 48,
          collapsedTrackHeight: 18,
        })?.track.id
      ).toBe('collapsed');
      expect(geometryEngine.geometry.getTrackAtPoint({ y: 10, rulerHeight: 20 })).toBeNull();
    });
  });

  describe('Deletion lifecycle', () => {
    it('emits clip:removed for direct clip deletion', () => {
      const removed = vi.fn();
      engine.on('clip:removed', removed);

      expect(engine.commitEdit({ type: 'delete-clips', clipIds: ['clip1'] }).committed).toBe(true);

      expect(removed).toHaveBeenCalledTimes(1);
      const payload = removed.mock.calls[0][0] as ClipRemovedEvent;
      expect(payload.reason).toBe('delete');
      expect(payload.clip.id).toBe('clip1');
    });
  });

  describe('Editing constraints and preview', () => {
    it('should clamp start trims to minStart', () => {
      const initial = structuredClone(engine.getState()) as TimelineState;
      initial.tracks[0].clips[0].minStart = fromSeconds(2);
      engine = new TimelineEngine(initial);

      engine.commitEdit({
        type: 'trim',
        clipId: 'clip1',
        edge: 'start',
        newTime: fromSeconds(0.5),
      });

      const clip = engine.getState().tracks[0].clips[0];
      expect(toSeconds(clip.timelineStart)).toBeCloseTo(2);
      expect(toSeconds(clip.sourceStart)).toBeCloseTo(1);
    });

    it('should publish preview state when live overwrite changes clip membership', () => {
      const previewEngine = new TimelineEngine({
        tracks: [
          {
            id: 'track1',
            kind: 'visual',
            clips: [
              {
                id: 'clip1',
                sourceId: 'src1',
                timelineStart: fromSeconds(1),
                timelineEnd: fromSeconds(5.5),
                sourceStart: fromSeconds(0),
                selected: false,
              },
              {
                id: 'clip2',
                sourceId: 'src2',
                timelineStart: fromSeconds(6.5),
                timelineEnd: fromSeconds(12.5),
                sourceStart: fromSeconds(0),
                selected: true,
              },
            ],
            selected: false,
            locked: false,
            muted: false,
            visible: true,
          },
        ],
        playheadTime: fromSeconds(0),
      });
      let previewEvents = 0;
      const created = vi.fn();
      const removed = vi.fn();
      previewEngine.on('state:preview', () => {
        previewEvents += 1;
      });
      previewEngine.on('clip:created', created);
      previewEngine.on('clip:removed', removed);

      previewEngine.previewEdit({
        type: 'move',
        overwrite: true,
        clipId: 'clip2',
        startTime: fromSeconds(3),
      });

      const clips = previewEngine.getRenderState().tracks[0].clips;
      expect(previewEvents).toBe(1);
      expect(clips).toHaveLength(2);
      expect(toSeconds(clips[0].timelineEnd)).toBeCloseTo(3);
      expect(clips[0].editPreview).toMatchObject({ operation: 'overwrite', cutEnd: true });
      expect(created).not.toHaveBeenCalled();
      expect(removed).not.toHaveBeenCalled();

      previewEngine.cancelEdit();

      expect(previewEvents).toBe(2);
      expect(previewEngine.getRenderState().tracks[0].clips[0].editPreview).toBeUndefined();
    });

    it('publishes live edit impacts for overwrite trims, splits, and removals', () => {
      const trimEngine = new TimelineEngine({
        tracks: [
          {
            id: 'track1',
            kind: 'visual',
            clips: [
              {
                id: 'victim',
                sourceId: 'src1',
                timelineStart: fromSeconds(1),
                timelineEnd: fromSeconds(5.5),
                sourceStart: fromSeconds(0),
                selected: false,
              },
              {
                id: 'winner',
                sourceId: 'src2',
                timelineStart: fromSeconds(6.5),
                timelineEnd: fromSeconds(12.5),
                sourceStart: fromSeconds(0),
                selected: true,
              },
            ],
            selected: false,
            locked: false,
            muted: false,
            visible: true,
          },
        ],
      });
      const trimImpacts = vi.fn();
      trimEngine.on('edit:impacts', trimImpacts);

      trimEngine.previewEdit({
        type: 'move',
        overwrite: true,
        clipId: 'winner',
        startTime: fromSeconds(3),
      });

      expect(trimImpacts).toHaveBeenCalledTimes(1);
      expect(trimEngine.getEditImpacts()).toMatchObject({
        operation: 'move',
        sourceClipId: 'winner',
        sourceTrackId: 'track1',
        impacts: [
          {
            clipId: 'victim',
            trackId: 'track1',
            effect: 'trim-end',
            cutEnd: true,
          },
        ],
      });
      const trimImpact = expectDefined(trimEngine.getEditImpacts(), 'trim edit impacts').impacts[0];
      expect(toSeconds(trimImpact.affectedStartTime)).toBeCloseTo(3);
      expect(toSeconds(trimImpact.affectedEndTime)).toBeCloseTo(5.5);
      expect(toSeconds(trimImpact.resultClips[0].timelineEnd)).toBeCloseTo(3);

      trimEngine.cancelEdit();
      expect(trimEngine.getEditImpacts()).toBeNull();
      expect(trimImpacts).toHaveBeenLastCalledWith(null);

      const splitEngine = new TimelineEngine({
        tracks: [
          {
            id: 'track1',
            kind: 'visual',
            clips: [
              {
                id: 'victim',
                sourceId: 'src1',
                timelineStart: fromSeconds(0),
                timelineEnd: fromSeconds(10),
                sourceStart: fromSeconds(0),
                selected: false,
              },
              {
                id: 'winner',
                sourceId: 'src2',
                timelineStart: fromSeconds(12),
                timelineEnd: fromSeconds(14),
                sourceStart: fromSeconds(0),
                selected: true,
              },
            ],
            selected: false,
            locked: false,
            muted: false,
            visible: true,
          },
        ],
      });

      splitEngine.previewEdit({
        type: 'move',
        overwrite: true,
        clipId: 'winner',
        startTime: fromSeconds(3),
      });

      const splitImpact = expectDefined(splitEngine.getEditImpacts(), 'split edit impacts')
        .impacts[0];
      expect(splitImpact.effect).toBe('split');
      expect(splitImpact.resultClips).toHaveLength(2);
      expect(toSeconds(splitImpact.resultClips[0].timelineEnd)).toBeCloseTo(3);
      expect(toSeconds(splitImpact.resultClips[1].timelineStart)).toBeCloseTo(5);

      const removeEngine = new TimelineEngine({
        tracks: [
          {
            id: 'track1',
            kind: 'visual',
            clips: [
              {
                id: 'victim',
                sourceId: 'src1',
                timelineStart: fromSeconds(3),
                timelineEnd: fromSeconds(5),
                sourceStart: fromSeconds(0),
                selected: false,
              },
              {
                id: 'winner',
                sourceId: 'src2',
                timelineStart: fromSeconds(7),
                timelineEnd: fromSeconds(11),
                sourceStart: fromSeconds(0),
                selected: true,
              },
            ],
            selected: false,
            locked: false,
            muted: false,
            visible: true,
          },
        ],
      });

      removeEngine.previewEdit({
        type: 'move',
        overwrite: true,
        clipId: 'winner',
        startTime: fromSeconds(2),
      });

      const removeImpact = expectDefined(removeEngine.getEditImpacts(), 'remove edit impacts')
        .impacts[0];
      expect(removeImpact.effect).toBe('remove');
      expect(removeImpact.resultClips).toEqual([]);
      expect(removeImpact.cutStart).toBe(true);
      expect(removeImpact.cutEnd).toBe(true);
    });

    it('splitClip emits clip:split with correct ClipSplitEvent payload and not clip:created', () => {
      const split = vi.fn();
      const created = vi.fn();
      engine.on('clip:split', split);
      engine.on('clip:created', created);

      expect(
        engine.commitEdit({ type: 'split', clipIds: ['clip1'], time: fromSeconds(2) }).committed
      ).toBe(true);

      expect(split).toHaveBeenCalledTimes(1);
      expect(created).not.toHaveBeenCalled();
      const [payload] = split.mock.calls[0] as [ClipSplitEvent];
      expect(payload.originalId).toBe('clip1');
      expect(payload.left.id).toBe('clip1');
      expect(payload.right.id).not.toBe('clip1');
      expect(toSeconds(payload.left.timelineEnd)).toBeCloseTo(2);
      expect(toSeconds(payload.right.timelineStart)).toBeCloseTo(2);
    });

    it('emits clip lifecycle events for committed overwrite edits', () => {
      const overwriteEngine = new TimelineEngine({
        tracks: [
          {
            id: 'track1',
            kind: 'visual',
            clips: [
              {
                id: 'victim',
                sourceId: 'src1',
                timelineStart: fromSeconds(0),
                timelineEnd: fromSeconds(10),
                sourceStart: fromSeconds(0),
                selected: false,
              },
              {
                id: 'winner',
                sourceId: 'src2',
                timelineStart: fromSeconds(3),
                timelineEnd: fromSeconds(5),
                sourceStart: fromSeconds(0),
                selected: false,
              },
            ],
            selected: false,
            locked: false,
            muted: false,
            visible: true,
          },
        ],
      });
      const created = vi.fn();
      const removed = vi.fn();
      overwriteEngine.on('clip:created', created);
      overwriteEngine.on('clip:removed', removed);

      overwriteEngine.commitEdit({
        type: 'move',
        clipId: 'winner',
        startTime: fromSeconds(3),
        snap: false,
        overwrite: true,
      });

      expect(created).toHaveBeenCalledTimes(1);
      expect(removed).not.toHaveBeenCalled();
      const createdPayload = created.mock.calls[0][0] as ClipCreatedEvent;
      expect(createdPayload.reason).toBe('overwrite-split');
      expect(createdPayload.originClipId).toBe('victim');
      expect(createdPayload.clip.id).not.toBe('victim');
      expect(toSeconds(createdPayload.clip.timelineStart)).toBeCloseTo(5);

      const coverEngine = new TimelineEngine({
        tracks: [
          {
            id: 'track1',
            kind: 'visual',
            clips: [
              {
                id: 'covered',
                sourceId: 'src1',
                timelineStart: fromSeconds(2),
                timelineEnd: fromSeconds(4),
                sourceStart: fromSeconds(0),
                selected: false,
              },
              {
                id: 'winner',
                sourceId: 'src2',
                timelineStart: fromSeconds(0),
                timelineEnd: fromSeconds(6),
                sourceStart: fromSeconds(0),
                selected: false,
              },
            ],
            selected: false,
            locked: false,
            muted: false,
            visible: true,
          },
        ],
      });
      const coverCreated = vi.fn();
      const coverRemoved = vi.fn();
      coverEngine.on('clip:created', coverCreated);
      coverEngine.on('clip:removed', coverRemoved);

      coverEngine.commitEdit({
        type: 'move',
        clipId: 'winner',
        startTime: fromSeconds(0),
        snap: false,
        overwrite: true,
      });

      expect(coverCreated).not.toHaveBeenCalled();
      expect(coverRemoved).toHaveBeenCalledTimes(1);
      const removedPayload = coverRemoved.mock.calls[0][0] as ClipRemovedEvent;
      expect(removedPayload.reason).toBe('overwrite');
      expect(removedPayload.clip.id).toBe('covered');
    });
  });

  describe('Track Targeting and Groups', () => {
    it('clamps initial vertical scroll to the track stack range', () => {
      const scrollEngine = new TimelineEngine({
        tracks: [
          {
            id: 'track-1',
            kind: 'visual',
            clips: [],
            selected: false,
            locked: false,
            muted: false,
            visible: true,
          },
        ],
        scrollTop: 100,
      });

      expect(scrollEngine.maxScrollTop).toBe(0);
      expect(scrollEngine.scrollTop).toBe(0);
    });

    it('clamps vertical scroll when removing tracks shrinks the scroll range', () => {
      const scrollEngine = new TimelineEngine({
        tracks: Array.from({ length: 3 }, (_, index) => ({
          id: `track-${index + 1}`,
          kind: 'visual',
          clips: [],
          selected: false,
          locked: false,
          muted: false,
          visible: true,
        })),
      });
      scrollEngine.setViewportHeight(128);
      scrollEngine.setScrollTop(48);
      const scrollChange = vi.fn();
      scrollEngine.on('scroll:change', scrollChange);

      expect(scrollEngine.maxScrollTop).toBe(48);
      expect(scrollEngine.removeTrack('track-3')).toEqual({ ok: true });

      expect(scrollEngine.maxScrollTop).toBe(0);
      expect(scrollEngine.scrollTop).toBe(0);
      expect(scrollChange).toHaveBeenLastCalledWith({ scrollLeft: 0, scrollTop: 0 });
    });

    it('batches track height updates into one settled render cycle', () => {
      const resizeEngine = new TimelineEngine({
        tracks: Array.from({ length: 3 }, (_, index) => ({
          id: `track-${index + 1}`,
          kind: 'visual',
          clips: [],
          selected: false,
          locked: false,
          muted: false,
          visible: true,
        })),
      });
      resizeEngine.setViewportHeight(96);
      resizeEngine.setScrollTop(80);
      const render = vi.fn();
      const settled = vi.fn();
      const resize = vi.fn();
      const scrollChange = vi.fn();
      resizeEngine.on('render', render);
      resizeEngine.on('state:settled', settled);
      resizeEngine.on('track:resize', resize);
      resizeEngine.on('scroll:change', scrollChange);

      resizeEngine.setTrackHeights([
        { trackId: 'track-1', height: 24 },
        { trackId: 'track-2', height: 24 },
        { trackId: 'track-3', height: 24 },
      ]);

      expect(resizeEngine.tracks.map((track) => track.height)).toEqual([24, 24, 24]);
      expect(resize).toHaveBeenCalledTimes(3);
      expect(scrollChange).toHaveBeenCalledTimes(1);
      expect(settled).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledTimes(1);
      expect(resizeEngine.scrollTop).toBe(8);
    });

    it('should toggle track targeting', () => {
      engine.toggleTrackTarget('track1', true);
      expect(engine.getState().tracks[0].targeted).toBe(true);

      engine.toggleTrackTarget('track1', false);
      expect(engine.getState().tracks[0].targeted).toBe(false);
    });

    it('should set track group', () => {
      engine.setTrackGroup('track1', 'groupA');
      expect(engine.getState().tracks[0].groupId).toBe('groupA');
    });
  });

  describe('Clip Custom Metadata & Undo/Redo', () => {
    it('preserves custom metadata when cloning/modifying properties', () => {
      const initial = structuredClone(engine.getState()) as TimelineState;
      initial.tracks[0].clips[0].metadata = { note: 'test metadata', flag: true };
      engine = new TimelineEngine(initial);

      engine.updateClipProperties('clip1', { color: '#ff0000' });
      const updatedClip = engine.getState().tracks[0].clips[0];
      expect(updatedClip.color).toBe('#ff0000');
      expect(updatedClip.metadata).toEqual({ note: 'test metadata', flag: true });
    });

    it('clones metadata correctly when splitting a clip', () => {
      const initial = structuredClone(engine.getState()) as TimelineState;
      initial.tracks[0].clips[0].metadata = { caption: 'hello split' };
      engine = new TimelineEngine(initial);

      expect(
        engine.commitEdit({ type: 'split', clipIds: ['clip1'], time: fromSeconds(2) }).committed
      ).toBe(true);

      const track = engine.getState().tracks[0];
      expect(track.clips).toHaveLength(2);
      expect(track.clips[0].metadata).toEqual({ caption: 'hello split' });
      expect(track.clips[1].metadata).toEqual({ caption: 'hello split' });
    });

    it('restores clip metadata after undoing a delete action', () => {
      const initial = structuredClone(engine.getState()) as TimelineState;
      initial.tracks[0].clips[0].metadata = { tag: 'important' };
      engine = new TimelineEngine(initial);
      engine.snapshot(); // snapshot current state with metadata

      engine.commitEdit({ type: 'delete-clips', clipIds: ['clip1'] });
      expect(engine.getState().tracks[0].clips).toHaveLength(0);

      engine.undo();
      const restoredClips = engine.getState().tracks[0].clips;
      expect(restoredClips).toHaveLength(1);
      expect(restoredClips[0].id).toBe('clip1');
      expect(restoredClips[0].metadata).toEqual({ tag: 'important' });
    });
  });
});
