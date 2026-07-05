import { describe, it, expect, beforeEach, afterEach, vi } from 'vite-plus/test';
import { TimelineEngine } from './engine';
import {
  getTimelineCubicBezierProgress,
  getTimelineKeyframeBezierControlPoints,
} from './keyframes';
import type { Clip, Track } from './types';
import type { ClipCreatedEvent, ClipMoveEvent, ClipRemovedEvent, ClipSplitEvent } from './events';
import {
  assertValidRationalTime,
  fromSeconds,
  toSeconds,
} from '@techsquidtv/canvas-timeline-utils';
import { expectDefined } from '../../../test-utils/assertions';

type TimelineEngineInternals = {
  historyManager: {
    history: { tracks: string; markers: string; clipGroups: string }[];
  };
  dragSnapshot: string | null;
  clipboardManager: {
    clipboard: unknown[];
  };
};

type RuntimeClip = Clip & { data?: unknown; bulky?: string };
type RuntimeTrack = Track & { data?: unknown; bulky?: string };

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
    });
  });

  describe('Lean timeline state', () => {
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

    it('keeps snapshots, drag previews, and clipboard payloads lean after runtime injection', () => {
      const bulky = 'runtime-sentinel'.repeat(300);
      const track = engine.getState().tracks[0] as RuntimeTrack;
      const clip = track.clips[0] as RuntimeClip;
      track.data = { bulky };
      track.bulky = bulky;
      clip.data = { bulky };
      clip.bulky = bulky;

      engine.snapshot();
      engine.startDrag();
      engine.selectClip('clip1');
      engine.copySelection();

      const internals = engine as unknown as TimelineEngineInternals;
      const latestSnapshot =
        internals.historyManager.history[internals.historyManager.history.length - 1];

      expect(latestSnapshot.tracks).not.toContain(bulky);
      expect(latestSnapshot.tracks.length).toBeLessThan(2000);
      expect(internals.dragSnapshot).not.toContain(bulky);
      expect(JSON.stringify(internals.clipboardManager.clipboard)).not.toContain(bulky);
    });
  });

  describe('Edit command layer', () => {
    function createEditClip(id: string, start: number, end: number): Clip {
      return {
        id,
        sourceId: `${id}-source`,
        timelineStart: fromSeconds(start),
        timelineEnd: fromSeconds(end),
        sourceStart: fromSeconds(0),
        selected: false,
      };
    }

    function createEditTrack(id: string, clips: Clip[], locked = false): Track {
      return {
        id,
        kind: 'visual',
        clips,
        selected: false,
        locked,
        muted: false,
        visible: true,
      };
    }

    it('previews commands without mutating state and clears previews on cancel', () => {
      const preview = engine.previewEdit({
        type: 'trim',
        clipId: 'clip1',
        edge: 'end',
        newTime: fromSeconds(3),
        snap: false,
      });

      expect(preview.valid).toBe(true);
      expect(preview.changedClips[0].id).toBe('clip1');
      expect(toSeconds(preview.changedClips[0].timelineEnd)).toBe(3);
      expect(toSeconds(engine.getClip('clip1')?.clip.timelineEnd ?? fromSeconds(0))).toBe(5);
      expect(engine.getEditPreview()).toBe(preview);
      expect(engine.getEditImpacts()?.operation).toBe('trim');

      engine.cancelEdit();

      expect(engine.getEditPreview()).toBeNull();
      expect(engine.getEditImpacts()).toBeNull();
    });

    it('commits move commands as one undoable history entry', () => {
      const moveEvents: ClipMoveEvent[] = [];
      engine.on('clip:move', (event) => moveEvents.push(event));

      const result = engine.commitEdit({
        type: 'move',
        clipId: 'clip1',
        startTime: fromSeconds(2),
        snap: false,
      });

      expect(result.committed).toBe(true);
      expect(toSeconds(engine.getClip('clip1')?.clip.timelineStart ?? fromSeconds(0))).toBe(2);
      expect(moveEvents).toHaveLength(1);
      expect(moveEvents[0].phase).toBe('commit');
      expect(toSeconds(moveEvents[0].startTime)).toBe(2);

      engine.undo();

      expect(toSeconds(engine.getClip('clip1')?.clip.timelineStart ?? fromSeconds(0))).toBe(1);
    });

    it('rejects invalid commands before policy and app policy can reject valid commands', () => {
      expect(
        engine.validateEdit({
          type: 'move',
          clipId: 'missing',
          startTime: fromSeconds(2),
        }).reason
      ).toBe('not-found');

      engine.setEditPolicy({
        canPlaceClip: () => ({ valid: false, reason: 'policy-rejected' }),
      });

      expect(
        engine.commitEdit({
          type: 'move',
          clipId: 'clip1',
          startTime: fromSeconds(2),
        }).preview.reason
      ).toBe('policy-rejected');
      expect(toSeconds(engine.getClip('clip1')?.clip.timelineStart ?? fromSeconds(0))).toBe(1);
    });

    it('commits insert, overwrite, and range removal commands', () => {
      const commandEngine = new TimelineEngine({
        tracks: [
          createEditTrack('track1', [
            createEditClip('a', 0, 2),
            createEditClip('b', 4, 6),
            createEditClip('c', 8, 10),
          ]),
        ],
      });

      commandEngine.commitEdit({
        type: 'insert',
        clip: createEditClip('inserted', 0, 1),
        targetTrackId: 'track1',
        startTime: fromSeconds(4),
        snap: false,
      });

      expect(
        commandEngine.tracks[0].clips.map((clip) => [clip.id, toSeconds(clip.timelineStart)])
      ).toEqual([
        ['a', 0],
        ['inserted', 4],
        ['b', 5],
        ['c', 9],
      ]);

      const overwriteResult = commandEngine.commitEdit({
        type: 'overwrite',
        clip: createEditClip('winner', 0, 3),
        targetTrackId: 'track1',
        startTime: fromSeconds(4.5),
        snap: false,
      });

      expect(overwriteResult.preview.removedClips.map((clip) => clip.id)).toContain('b');
      expect(commandEngine.getClip('winner')).toBeDefined();

      commandEngine.commitEdit({
        type: 'delete-range',
        startTime: fromSeconds(4),
        endTime: fromSeconds(6),
        trackIds: ['track1'],
      });

      const remainingWinner = expectDefined(commandEngine.getClip('winner'), 'winner clip').clip;
      expect(toSeconds(remainingWinner.timelineStart)).toBe(4);
      expect(toSeconds(remainingWinner.timelineEnd)).toBe(5.5);
      expect(
        commandEngine.tracks[0].clips.every((clip) => toSeconds(clip.timelineStart) <= 7)
      ).toBe(true);
    });

    it('supports ripple trim and roll trim command resolution', () => {
      const trimEngine = new TimelineEngine({
        tracks: [
          createEditTrack('track1', [
            createEditClip('left', 0, 4),
            createEditClip('right', 4, 8),
            createEditClip('later', 10, 12),
          ]),
        ],
      });

      trimEngine.commitEdit({
        type: 'roll-trim',
        leftClipId: 'left',
        rightClipId: 'right',
        boundaryTime: fromSeconds(5),
        snap: false,
      });

      expect(toSeconds(trimEngine.getClip('left')?.clip.timelineEnd ?? fromSeconds(0))).toBe(5);
      expect(toSeconds(trimEngine.getClip('right')?.clip.timelineStart ?? fromSeconds(0))).toBe(5);

      trimEngine.commitEdit({
        type: 'ripple-trim',
        clipId: 'right',
        edge: 'end',
        newTime: fromSeconds(7),
        snap: false,
      });

      expect(toSeconds(trimEngine.getClip('later')?.clip.timelineStart ?? fromSeconds(0))).toBe(9);
    });

    it('commits the active preview resolution so split clip ids stay stable', () => {
      const previewEngine = new TimelineEngine({
        tracks: [createEditTrack('track1', [createEditClip('victim', 0, 10)])],
      });
      const command = {
        type: 'overwrite' as const,
        clip: createEditClip('winner', 0, 2),
        targetTrackId: 'track1',
        startTime: fromSeconds(3),
        snap: false,
      };
      const preview = previewEngine.previewEdit(command);
      const previewSplitClip = expectDefined(
        preview.createdClips.find((clip) => clip.id !== 'winner'),
        'preview split clip'
      );

      previewEngine.commitEdit(command);

      expect(previewEngine.getClip(previewSplitClip.id)).toBeDefined();
    });

    it('preserves created clip lineage for overwrite and range split commands', () => {
      const lineageEngine = new TimelineEngine({
        tracks: [createEditTrack('track1', [createEditClip('victim', 0, 10)])],
      });
      const created: ClipCreatedEvent[] = [];
      lineageEngine.on('clip:created', (event) => created.push(event));

      lineageEngine.commitEdit({
        type: 'overwrite',
        clip: createEditClip('winner', 0, 2),
        targetTrackId: 'track1',
        startTime: fromSeconds(3),
        snap: false,
      });

      expect(
        created.some((event) => event.reason === 'overwrite' && event.clip.id === 'winner')
      ).toBe(true);
      const splitEvent = expectDefined(
        created.find((event) => event.reason === 'overwrite-split'),
        'overwrite split event'
      );
      expect(splitEvent.originClipId).toBe('victim');

      const rangeEngine = new TimelineEngine({
        tracks: [createEditTrack('track1', [createEditClip('range-victim', 0, 10)])],
      });
      const rangeCreated: ClipCreatedEvent[] = [];
      rangeEngine.on('clip:created', (event) => rangeCreated.push(event));

      rangeEngine.commitEdit({
        type: 'lift-range',
        startTime: fromSeconds(3),
        endTime: fromSeconds(5),
        trackIds: ['track1'],
      });

      const rangeSplitEvent = expectDefined(
        rangeCreated.find((event) => event.reason === 'range-split'),
        'range split event'
      );
      expect(rangeSplitEvent.originClipId).toBe('range-victim');
    });

    it('clears snap guides after command commits', () => {
      const snapEngine = new TimelineEngine({
        markers: [{ id: 'marker-1', time: fromSeconds(2), label: 'Marker' }],
        tracks: [createEditTrack('track1', [createEditClip('snap-clip', 0, 1)])],
      });

      snapEngine.prepareSnapping('snap-clip');
      snapEngine.previewEdit({
        type: 'move',
        clipId: 'snap-clip',
        startTime: fromSeconds(2.05),
      });

      expect(snapEngine.getState().snapFeedback.target?.kind).toBe('marker');

      snapEngine.commitEdit({
        type: 'move',
        clipId: 'snap-clip',
        startTime: fromSeconds(2.05),
      });

      expect(snapEngine.getState().snapFeedback.target).toBeNull();
      expect(snapEngine.getState().snapFeedback.lines).toEqual([]);
    });

    it('rejects roll trims when snapping would violate minimum clip duration', () => {
      const rollEngine = new TimelineEngine({
        tracks: [
          createEditTrack('track1', [createEditClip('left', 0, 1), createEditClip('right', 1, 2)]),
        ],
        zoomScale: 10,
      });
      rollEngine.prepareSnapping();

      const validation = rollEngine.validateEdit({
        type: 'roll-trim',
        leftClipId: 'left',
        rightClipId: 'right',
        boundaryTime: fromSeconds(0.04),
      });

      expect(validation).toEqual({ valid: false, reason: 'invalid-duration' });
      expect(
        rollEngine.commitEdit({
          type: 'roll-trim',
          leftClipId: 'left',
          rightClipId: 'right',
          boundaryTime: fromSeconds(0.04),
        }).committed
      ).toBe(false);
      expect(toSeconds(rollEngine.getClip('left')?.clip.timelineEnd ?? fromSeconds(0))).toBe(1);
    });
  });

  describe('Zoom constraints', () => {
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

      expect(hitEngine.getClipRect('clip-1')).toEqual({
        clipId: 'clip-1',
        trackId: 'track-1',
        trackIndex: 0,
        clipIndex: 0,
        x: 25,
        y: 32,
        width: 200,
        height: 48,
      });
      expect(hitEngine.getClipRect('missing')).toBeNull();
    });

    it('returns null for ruler space, blank tracks, and points outside clips', () => {
      const hitEngine = createHitTestEngine([
        createHitTestTrack('track-1', [createHitTestClip('clip-1', 1, 5)]),
      ]);

      expect(hitEngine.getClipAtPoint({ x: 100, y: 20 })).toBeNull();
      expect(hitEngine.getClipAtPoint({ x: 50, y: 40 })).toBeNull();
      expect(hitEngine.getClipAtPoint({ x: 600, y: 40 })).toBeNull();
      expect(hitEngine.getClipAtPoint({ x: 100, y: 1000 })).toBeNull();
    });

    it('detects body and trim-edge regions with pointer-specific thresholds', () => {
      const hitEngine = createHitTestEngine([
        createHitTestTrack('track-1', [createHitTestClip('clip-1', 1, 5)]),
      ]);

      expect(hitEngine.getClipAtPoint({ x: 105, y: 40 })?.region).toBe('start-edge');
      expect(hitEngine.getClipAtPoint({ x: 495, y: 40 })?.region).toBe('end-edge');
      expect(hitEngine.getClipAtPoint({ x: 130, y: 40 })?.region).toBe('body');
      expect(hitEngine.getClipAtPoint({ x: 120, y: 40, pointerType: 'mouse' })?.region).toBe(
        'body'
      );
      expect(hitEngine.getClipAtPoint({ x: 120, y: 40, pointerType: 'touch' })?.region).toBe(
        'start-edge'
      );
    });

    it('uses custom and collapsed track heights', () => {
      const hitEngine = createHitTestEngine([
        createHitTestTrack('track-1', [createHitTestClip('clip-1', 1, 2)], { height: 60 }),
        createHitTestTrack('track-2', [createHitTestClip('clip-2', 2, 3)], { collapsed: true }),
      ]);

      const hit = hitEngine.getClipAtPoint({ x: 220, y: 100 });

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

      const clipRects = hitEngine.getClipRects();

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

      const visibleClips = hitEngine.getVisibleTimelineClips({ viewportWidth: 200 });

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

      expect(hitEngine.getVisibleTimelineClips({ viewportWidth: 100 })).toHaveLength(0);
      expect(
        hitEngine.getVisibleTimelineClips({
          overscanPixels: 25,
          viewportHeight: 50,
          viewportWidth: 100,
        })
      ).toHaveLength(1);
      expect(
        hitEngine.getVisibleTimelineClips({
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

      const visibleClips = hitEngine.getVisibleTimelineClips({
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

      const lockedHit = lockedEngine.getClipAtPoint({ x: 105, y: 40 });
      const nonEditableHit = nonEditableEngine.getClipAtPoint({ x: 105, y: 40 });

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

      expect(selectedEngine.getClipAtPoint({ x: 250, y: 40 })?.clip.id).toBe('clip-selected');
      expect(laterEngine.getClipAtPoint({ x: 250, y: 40 })?.clip.id).toBe('clip-later');
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
      const sourceTime = engine.timelineTimeToSourceTime('offset-clip', fromSeconds(2.5));
      const resolvedSourceTime = expectDefined(sourceTime, 'source time');

      expect(sourceTime).toBeDefined();
      expect(toSeconds(resolvedSourceTime)).toBeCloseTo(11.5);
    });

    it('maps source time back to timeline time with non-zero offsets', () => {
      const timelineTime = engine.sourceTimeToTimelineTime('offset-clip', fromSeconds(11.5));
      const resolvedTimelineTime = expectDefined(timelineTime, 'timeline time');

      expect(timelineTime).toBeDefined();
      expect(toSeconds(resolvedTimelineTime)).toBeCloseTo(2.5);
    });

    it('returns undefined for missing clips and out-of-range mapping requests', () => {
      expect(engine.timelineTimeToSourceTime('missing', fromSeconds(2))).toBeUndefined();
      expect(engine.timelineTimeToSourceTime('offset-clip', fromSeconds(0.5))).toBeUndefined();
      expect(engine.timelineTimeToSourceTime('offset-clip', fromSeconds(5))).toBeUndefined();
      expect(engine.sourceTimeToTimelineTime('offset-clip', fromSeconds(14))).toBeUndefined();
      expect(engine.sourceTimeToTimelineTime('offset-clip', fromSeconds(15.5))).toBeUndefined();
    });

    it('treats active clip ranges as half-open intervals', () => {
      expect(engine.getActiveClip({ time: fromSeconds(1), sourceId: 'source-main' })?.clip.id).toBe(
        'offset-clip'
      );
      expect(
        engine.getActiveClip({ time: fromSeconds(5), sourceId: 'source-main' })
      ).toBeUndefined();
    });

    it('returns active clips with computed source times in track order', () => {
      const activeClips = engine.getActiveClips(fromSeconds(2));

      expect(activeClips.map(({ clip }) => clip.id)).toEqual(['offset-clip', 'overlap-clip']);
      expect(activeClips.map(({ sourceTime }) => toSeconds(sourceTime))).toEqual([11, 3.5]);
      expect(activeClips.map(({ sourceRange }) => toSeconds(sourceRange.end))).toEqual([14, 5.5]);
      expect(activeClips.every(({ syncKey }) => syncKey.length > 0)).toBe(true);
    });

    it('returns clip source ranges and undefined for missing clips', () => {
      const sourceRange = engine.getClipSourceRange('offset-clip');
      const resolvedSourceRange = expectDefined(sourceRange, 'source range');

      expect(sourceRange).toBeDefined();
      expect(sourceRange?.sourceId).toBe('source-main');
      expect(toSeconds(resolvedSourceRange.start)).toBeCloseTo(10);
      expect(toSeconds(resolvedSourceRange.end)).toBeCloseTo(14);
      expect(toSeconds(resolvedSourceRange.duration)).toBeCloseTo(4);
      expect(engine.getClipSourceRange('missing')).toBeUndefined();
    });

    it('changes clip sync keys when media timing fields change', () => {
      const originalKey = engine.getClipSyncKey('offset-clip');

      engine.moveClip({ clipId: 'offset-clip', startTime: fromSeconds(1.25) });
      expect(engine.getClipSyncKey('offset-clip')).not.toBe(originalKey);

      const movedKey = engine.getClipSyncKey('offset-clip');
      engine.slipClip('offset-clip', fromSeconds(0.25));
      expect(engine.getClipSyncKey('offset-clip')).not.toBe(movedKey);
    });

    it('publishes content changes for edits that affect active layer lookup', () => {
      const mediaChange = vi.fn();
      engine.on('content:change', mediaChange);

      engine.moveClip({ clipId: 'offset-clip', startTime: fromSeconds(1.25) });
      engine.trimClip('offset-clip', 'end', fromSeconds(4.5));
      engine.slipClip('offset-clip', fromSeconds(0.25));
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
        engine.getActiveClip({ time: fromSeconds(2), sourceId: 'source-overlay' })?.clip.id
      ).toBe('overlap-clip');
      expect(
        engine.getActiveClip({ time: fromSeconds(2), sourceId: 'source-hidden' })
      ).toBeUndefined();

      engine.toggleTrackVisibility('overlay', false);

      expect(visibilityChange).toHaveBeenCalledWith({ trackId: 'overlay', visible: false });
      expect(engine.getState().tracks.find((track) => track.id === 'overlay')?.visible).toBe(false);
      expect(
        engine.getActiveClip({ time: fromSeconds(2), sourceId: 'source-overlay' })
      ).toBeUndefined();

      engine.undo();

      expect(engine.getState().tracks.find((track) => track.id === 'overlay')?.visible).toBe(true);
      expect(
        engine.getActiveClip({ time: fromSeconds(2), sourceId: 'source-overlay' })?.clip.id
      ).toBe('overlap-clip');

      engine.redo();

      expect(engine.getState().tracks.find((track) => track.id === 'overlay')?.visible).toBe(false);
      expect(
        engine.getActiveClip({ time: fromSeconds(2), sourceId: 'source-overlay' })
      ).toBeUndefined();
    });

    it('toggles track mute with events, active lookup exclusion, and undo history', () => {
      const muteChange = vi.fn();
      engine.on('track:mute', muteChange);

      expect(engine.getActiveClip({ time: fromSeconds(2), sourceId: 'source-main' })?.clip.id).toBe(
        'offset-clip'
      );

      engine.toggleMuteTrack('video-1', true);

      expect(muteChange).toHaveBeenCalledWith({ trackId: 'video-1', muted: true });
      expect(engine.getState().tracks.find((track) => track.id === 'video-1')?.muted).toBe(true);
      expect(
        engine.getActiveClip({ time: fromSeconds(2), sourceId: 'source-main' })
      ).toBeUndefined();

      engine.undo();

      expect(engine.getState().tracks.find((track) => track.id === 'video-1')?.muted).toBe(false);
      expect(engine.getActiveClip({ time: fromSeconds(2), sourceId: 'source-main' })?.clip.id).toBe(
        'offset-clip'
      );

      engine.redo();

      expect(engine.getState().tracks.find((track) => track.id === 'video-1')?.muted).toBe(true);
      expect(
        engine.getActiveClip({ time: fromSeconds(2), sourceId: 'source-main' })
      ).toBeUndefined();
    });

    it('selects the first active clip matching track, source, and predicate filters', () => {
      expect(engine.getActiveClip({ time: fromSeconds(2), trackKind: 'visual' })?.clip.id).toBe(
        'offset-clip'
      );
      expect(
        engine.getActiveClip({ time: fromSeconds(2), sourceId: 'source-overlay' })?.clip.id
      ).toBe('overlap-clip');
      expect(
        engine.getActiveClip({
          time: fromSeconds(2),
          predicate: ({ clip }) => clip.id === 'disabled-clip',
        })
      ).toBeUndefined();
      expect(
        engine.getActiveClip({
          time: fromSeconds(2),
          predicate: ({ clip }) => clip.id === 'overlap-clip',
        })?.clip.id
      ).toBe('overlap-clip');
    });

    it('groups active clips by track id in stable track order', () => {
      const clipsByTrack = engine.getActiveClipsByTrack(fromSeconds(2));

      expect([...clipsByTrack.keys()]).toEqual(['video-1', 'overlay']);
      expect(clipsByTrack.get('video-1')?.map(({ clip }) => clip.id)).toEqual(['offset-clip']);
      expect(clipsByTrack.get('overlay')?.map(({ clip }) => clip.id)).toEqual(['overlap-clip']);
    });

    it('groups active layers clips without dropping layered matches', () => {
      const media = engine.getActiveLayers({
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
      expect(toSeconds(expectDefined(media.firstContentTime, 'first content time'))).toBeCloseTo(1);
    });

    it('keeps requested active layers groups empty when clips are muted or disabled', () => {
      const media = engine.getActiveLayers({
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
      expect(media.firstContentTime).toBeUndefined();
    });

    it('finds the earliest content time across matching layers', () => {
      expect(
        toSeconds(
          expectDefined(
            engine.getFirstContentTime({
              layers: {
                visuals: { trackKind: 'visual' },
              },
            }),
            'first content time'
          )
        )
      ).toBeCloseTo(1);

      expect(
        engine.getFirstContentTime({
          layers: {
            muted: { sourceId: 'source-muted' },
            disabled: { sourceId: 'source-disabled' },
          },
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
      engine.slipClip('clip1', fromSeconds(0.5));
      const clip = engine.getState().tracks[0].clips[0];
      expect(toSeconds(clip.sourceStart)).toBeCloseTo(0.5);
      expect(toSeconds(clip.timelineStart)).toBeCloseTo(1.0); // unaffected
    });

    it('should slide a clip (change timelineStart)', () => {
      engine.slideClip('clip1', fromSeconds(1)); // move right by 1s
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
        moveEngine.moveClip({
          clipId: 'clip-a',
          startTime: fromSeconds(4),
          targetTrackId: 'visual-b',
        })
      ).toBe(true);

      expect(moveEngine.getState().tracks[0].clips).toHaveLength(0);
      expect(moveEngine.getState().tracks[1].clips.map((clip) => clip.id)).toEqual([
        'clip-a',
        'clip-b',
      ]);
      const movedClip = expectDefined(moveEngine.getClip('clip-a'), 'clip-a').clip;
      expect(toSeconds(movedClip.timelineStart)).toBeCloseTo(4);
      expect(toSeconds(movedClip.timelineEnd)).toBeCloseTo(6);
    });

    it('blocks cross-kind moves by default and allows explicit cross-kind transfers', () => {
      const moveEngine = createMoveEngine();

      expect(
        moveEngine.moveClip({
          clipId: 'clip-a',
          startTime: fromSeconds(4),
          targetTrackId: 'audio-a',
        })
      ).toBe(false);
      expect(expectDefined(moveEngine.getClip('clip-a'), 'clip-a').track.id).toBe('visual-a');

      expect(
        moveEngine.moveClip({
          clipId: 'clip-a',
          startTime: fromSeconds(4),
          targetTrackId: 'audio-a',
          allowCrossKindTrackMove: true,
        })
      ).toBe(true);
      expect(expectDefined(moveEngine.getClip('clip-a'), 'clip-a').track.id).toBe('audio-a');
    });

    it('emits preview and commit move events with track metadata during drag settle', () => {
      const moveEngine = createMoveEngine();
      const moveEvents: ClipMoveEvent[] = [];
      moveEngine.on('clip:move', (event) => moveEvents.push(event));

      moveEngine.startDrag();
      moveEngine.moveClip({
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

      moveEngine.endDrag();
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

      const rects = geometryEngine.getTrackRects({
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
        geometryEngine.getTrackAtPoint({
          y: 89,
          rulerHeight: 20,
          trackHeight: 48,
          collapsedTrackHeight: 18,
        })?.track.id
      ).toBe('collapsed');
      expect(geometryEngine.getTrackAtPoint({ y: 10, rulerHeight: 20 })).toBeNull();
    });
  });

  describe('Deletion lifecycle', () => {
    it('emits clip:removed for direct clip deletion', () => {
      const removed = vi.fn();
      engine.on('clip:removed', removed);

      expect(engine.deleteClip('clip1')).toBe(true);

      expect(removed).toHaveBeenCalledTimes(1);
      const payload = removed.mock.calls[0][0] as ClipRemovedEvent;
      expect(payload.reason).toBe('delete');
      expect(payload.clip.id).toBe('clip1');
    });
  });

  describe('Editing constraints and preview', () => {
    function createConstraintClip(id: string, start: number, end: number): Clip {
      return {
        id,
        sourceId: `${id}-source`,
        timelineStart: fromSeconds(start),
        timelineEnd: fromSeconds(end),
        sourceStart: fromSeconds(0),
        selected: false,
      };
    }

    function createConstraintTrack(id: string, clips: Clip[], kind = 'visual'): Track {
      return {
        id,
        kind,
        clips,
        selected: false,
        locked: false,
        muted: false,
        visible: true,
      };
    }

    it('should clamp start trims to minStart', () => {
      engine.getState().tracks[0].clips[0].minStart = fromSeconds(2);

      engine.trimClip('clip1', 'start', fromSeconds(0.5));

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

      previewEngine.startDrag();
      previewEngine.moveClip({ clipId: 'clip2', startTime: fromSeconds(3) });

      const clips = previewEngine.getState().tracks[0].clips;
      expect(previewEvents).toBe(1);
      expect(clips).toHaveLength(2);
      expect(toSeconds(clips[0].timelineEnd)).toBeCloseTo(3);
      expect(clips[0].editPreview).toEqual({ operation: 'overwrite', cutEnd: true });
      expect(created).not.toHaveBeenCalled();
      expect(removed).not.toHaveBeenCalled();

      previewEngine.endDrag();

      expect(previewEvents).toBe(2);
      expect(previewEngine.getState().tracks[0].clips[0].editPreview).toBeUndefined();
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

      trimEngine.startDrag();
      trimEngine.moveClip({ clipId: 'winner', startTime: fromSeconds(3) });

      expect(trimImpacts).toHaveBeenCalledTimes(1);
      expect(trimEngine.getEditImpacts()).toMatchObject({
        operation: 'overwrite',
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

      trimEngine.endDrag();
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

      splitEngine.startDrag();
      splitEngine.moveClip({ clipId: 'winner', startTime: fromSeconds(3) });

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

      removeEngine.startDrag();
      removeEngine.moveClip({ clipId: 'winner', startTime: fromSeconds(2) });

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

      expect(engine.splitClip('clip1', fromSeconds(2))).toBe(true);

      expect(split).toHaveBeenCalledTimes(1);
      expect(created).not.toHaveBeenCalled();
      const [payload] = split.mock.calls[0] as [ClipSplitEvent];
      expect(payload.originalId).toBe('clip1');
      expect(payload.left.id).toBe('clip1');
      expect(payload.right.id).not.toBe('clip1');
      expect(toSeconds(payload.left.timelineEnd)).toBeCloseTo(2);
      expect(toSeconds(payload.right.timelineStart)).toBeCloseTo(2);
    });

    it('groups arbitrary clips, expands selection, and moves linked clips together', () => {
      const groupedEngine = new TimelineEngine({
        tracks: [
          {
            id: 'video',
            kind: 'visual',
            clips: [
              {
                id: 'video-clip',
                sourceId: 'source',
                timelineStart: fromSeconds(1),
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
          {
            id: 'audio',
            kind: 'audio',
            clips: [
              {
                id: 'audio-clip',
                sourceId: 'source',
                timelineStart: fromSeconds(2),
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

      const group = expectDefined(
        groupedEngine.createClipGroup({ id: 'linked-av', clipIds: ['video-clip', 'audio-clip'] }),
        'created clip group'
      );
      expect(group.clipIds).toEqual(['video-clip', 'audio-clip']);

      groupedEngine.selectClip('video-clip');
      expect(groupedEngine.getClip('video-clip')?.clip.selected).toBe(true);
      expect(groupedEngine.getClip('audio-clip')?.clip.selected).toBe(true);

      const move = groupedEngine.commitEdit({
        type: 'move',
        clipId: 'video-clip',
        startTime: fromSeconds(4),
      });
      expect(move.committed).toBe(true);
      expect(move.preview.changedClips.map((clip) => clip.id).sort()).toEqual([
        'audio-clip',
        'video-clip',
      ]);
      expect(
        toSeconds(groupedEngine.getClip('video-clip')?.clip.timelineStart ?? fromSeconds(0))
      ).toBeCloseTo(4);
      expect(
        toSeconds(groupedEngine.getClip('audio-clip')?.clip.timelineStart ?? fromSeconds(0))
      ).toBeCloseTo(5);
    });

    it('rejects duplicate group ids in initial clip group state', () => {
      expect(
        () =>
          new TimelineEngine({
            tracks: [
              createConstraintTrack('video', [
                createConstraintClip('clip-a', 0, 2),
                createConstraintClip('clip-b', 3, 5),
                createConstraintClip('clip-c', 6, 8),
                createConstraintClip('clip-d', 9, 11),
              ]),
            ],
            clipGroups: [
              { id: 'duplicate-group', clipIds: ['clip-a', 'clip-b'] },
              { id: 'duplicate-group', clipIds: ['clip-c', 'clip-d'] },
            ],
          })
      ).toThrow('duplicate clip group id "duplicate-group".');
    });

    it('rejects clips assigned to more than one initial clip group', () => {
      expect(
        () =>
          new TimelineEngine({
            tracks: [
              createConstraintTrack('video', [
                createConstraintClip('clip-a', 0, 2),
                createConstraintClip('clip-b', 3, 5),
                createConstraintClip('clip-c', 6, 8),
              ]),
            ],
            clipGroups: [
              { id: 'group-a', clipIds: ['clip-a', 'clip-b'] },
              { id: 'group-b', clipIds: ['clip-b', 'clip-c'] },
            ],
          })
      ).toThrow('clip "clip-b" belongs to more than one clip group.');
    });

    it('inserts clip groups atomically and shifts placed keyframes', () => {
      const groupedEngine = new TimelineEngine({
        tracks: [createConstraintTrack('video', []), createConstraintTrack('audio', [], 'audio')],
      });
      const group = groupedEngine.insertClipGroup({
        groupId: 'import-group',
        placements: [
          {
            clip: {
              ...createConstraintClip('video-clip', 0, 2),
              keyframes: [
                { id: 'video-opacity', property: 'opacity', time: fromSeconds(1), value: 1 },
              ],
            },
            targetTrackId: 'video',
            startTime: fromSeconds(5),
          },
          {
            clip: createConstraintClip('audio-clip', 0, 2),
            targetTrackId: 'audio',
            startTime: fromSeconds(5),
          },
        ],
      });

      expect(group?.clipIds).toEqual(['video-clip', 'audio-clip']);
      expect(
        toSeconds(groupedEngine.getClip('video-clip')?.clip.timelineStart ?? fromSeconds(0))
      ).toBe(5);
      expect(
        groupedEngine
          .getClip('video-clip')
          ?.clip.keyframes?.map((keyframe) => toSeconds(keyframe.time))
      ).toEqual([6]);

      const failed = groupedEngine.insertClipGroup({
        placements: [
          {
            clip: createConstraintClip('valid-clip', 0, 2),
            targetTrackId: 'video',
            startTime: fromSeconds(8),
          },
          {
            clip: {
              ...createConstraintClip('invalid-clip', 0, 2),
              timelineStart: { v: 0.5, r: 60000 },
            },
            targetTrackId: 'audio',
            startTime: fromSeconds(8),
          },
        ],
      });

      expect(failed).toBeNull();
      expect(groupedEngine.getClip('valid-clip')).toBeUndefined();
      expect(groupedEngine.getClip('invalid-clip')).toBeUndefined();
      expect(groupedEngine.clipGroups).toHaveLength(1);
    });

    it('applies overwrite cleanup for every grouped member during drag preview', () => {
      const groupedEngine = new TimelineEngine({
        tracks: [
          createConstraintTrack('video', [createConstraintClip('video-clip', 0, 2)]),
          createConstraintTrack(
            'audio',
            [createConstraintClip('audio-clip', 0, 2), createConstraintClip('audio-victim', 4, 6)],
            'audio'
          ),
        ],
      });
      groupedEngine.createClipGroup({ id: 'linked-av', clipIds: ['video-clip', 'audio-clip'] });

      groupedEngine.startDrag();
      expect(
        groupedEngine.moveClip({
          clipId: 'video-clip',
          startTime: fromSeconds(4),
          snap: false,
        })
      ).toBe(true);

      expect(groupedEngine.getClip('audio-victim')).toBeUndefined();
      groupedEngine.endDrag();
    });

    it('splits selected grouped clips and repartitions the group at the blade time', () => {
      const groupedEngine = new TimelineEngine({
        tracks: [
          {
            id: 'video',
            kind: 'visual',
            clips: [
              {
                id: 'video-clip',
                sourceId: 'source',
                timelineStart: fromSeconds(0),
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
            id: 'audio',
            kind: 'audio',
            clips: [
              {
                id: 'audio-clip',
                sourceId: 'source',
                timelineStart: fromSeconds(0),
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
        ],
      });
      groupedEngine.createClipGroup({ id: 'linked-av', clipIds: ['video-clip', 'audio-clip'] });
      groupedEngine.selectClip('video-clip');

      const split = groupedEngine.commitEdit({
        type: 'split',
        clipIds: ['video-clip', 'audio-clip'],
        time: fromSeconds(4),
      });

      expect(split.committed).toBe(true);
      expect(split.preview.createdClips).toHaveLength(2);
      expect(groupedEngine.clipGroups).toHaveLength(2);
      expect(groupedEngine.getClipGroup('linked-av')?.clipIds).toEqual([
        'video-clip',
        'audio-clip',
      ]);
      const rightGroup = expectDefined(
        groupedEngine.clipGroups.find((group) => group.id !== 'linked-av'),
        'right-side group'
      );
      expect(rightGroup.clipIds).toHaveLength(2);
      expect(
        rightGroup.clipIds.every((clipId) => groupedEngine.getClip(clipId) !== undefined)
      ).toBe(true);
    });

    it('keeps grouped split pieces valid across repeated mixed-rate moves', () => {
      const groupedEngine = new TimelineEngine({
        tracks: [
          {
            id: 'video',
            kind: 'visual',
            clips: [
              {
                id: 'video-clip',
                sourceId: 'source',
                timelineStart: fromSeconds(3),
                timelineEnd: fromSeconds(9),
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
            id: 'audio',
            kind: 'audio',
            clips: [
              {
                id: 'audio-clip',
                sourceId: 'source',
                timelineStart: fromSeconds(3),
                timelineEnd: fromSeconds(9),
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
      groupedEngine.createClipGroup({ id: 'linked-av', clipIds: ['video-clip', 'audio-clip'] });
      groupedEngine.selectClip('video-clip');
      groupedEngine.commitEdit({
        type: 'split',
        clipIds: ['video-clip', 'audio-clip'],
        time: fromSeconds(6.5),
      });

      for (let index = 0; index < 8; index += 1) {
        expect(
          groupedEngine.moveClip({
            clipId: 'video-clip',
            startTime: fromSeconds(4 + index * 0.01, 24000),
          })
        ).toBe(true);
      }

      const videoClip = expectDefined(groupedEngine.getClip('video-clip')?.clip, 'video clip');
      const audioClip = expectDefined(groupedEngine.getClip('audio-clip')?.clip, 'audio clip');
      assertValidRationalTime(videoClip.timelineStart, 'videoClip.timelineStart');
      assertValidRationalTime(audioClip.timelineStart, 'audioClip.timelineStart');
      expect(videoClip.timelineStart.r).toBeLessThanOrEqual(120000);
      expect(audioClip.timelineStart.r).toBeLessThanOrEqual(120000);
      expect(toSeconds(audioClip.timelineStart)).toBeCloseTo(toSeconds(videoClip.timelineStart));
    });

    it('rejects grouped splits when an overlapping linked member cannot be split', () => {
      const groupedEngine = new TimelineEngine({
        tracks: [
          createConstraintTrack('video', [createConstraintClip('video-clip', 0, 10)]),
          createConstraintTrack(
            'audio',
            [
              {
                ...createConstraintClip('audio-clip', 0, 10),
                resizable: false,
              },
            ],
            'audio'
          ),
        ],
      });
      groupedEngine.createClipGroup({ id: 'linked-av', clipIds: ['video-clip', 'audio-clip'] });

      const split = groupedEngine.commitEdit({
        type: 'split',
        clipIds: ['video-clip'],
        time: fromSeconds(4),
      });

      expect(split.committed).toBe(false);
      expect(split.preview.reason).toBe('locked');
      expect(groupedEngine.getClip('video-clip')?.track.clips).toHaveLength(1);
      expect(groupedEngine.getClip('audio-clip')?.track.clips).toHaveLength(1);
      expect(groupedEngine.getClipGroup('linked-av')?.clipIds).toEqual([
        'video-clip',
        'audio-clip',
      ]);
    });

    it('skips non-overlapping selected clips when splitting at a blade time', () => {
      const splitEngine = new TimelineEngine({
        tracks: [
          createConstraintTrack('track1', [
            createConstraintClip('selected-overlap', 0, 10),
            {
              ...createConstraintClip('selected-later', 20, 30),
              resizable: false,
            },
          ]),
        ],
      });

      const split = splitEngine.commitEdit({
        type: 'split',
        clipIds: ['selected-overlap', 'selected-later'],
        time: fromSeconds(4),
      });

      expect(split.committed).toBe(true);
      expect(split.preview.createdClips).toHaveLength(1);
      expect(splitEngine.getClip('selected-overlap')?.track.clips).toHaveLength(3);
    });

    it('preserves copied group membership on paste and restores groups through history', () => {
      const groupedEngine = new TimelineEngine({
        tracks: [
          {
            id: 'track1',
            kind: 'visual',
            clips: [
              {
                id: 'clip-a',
                sourceId: 'source-a',
                timelineStart: fromSeconds(0),
                timelineEnd: fromSeconds(2),
                sourceStart: fromSeconds(0),
                selected: false,
              },
              {
                id: 'clip-b',
                sourceId: 'source-b',
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

      groupedEngine.createClipGroup({ id: 'copy-group', clipIds: ['clip-a', 'clip-b'] });
      groupedEngine.undo();
      expect(groupedEngine.clipGroups).toEqual([]);
      groupedEngine.redo();
      expect(groupedEngine.getClipGroup('copy-group')?.clipIds).toEqual(['clip-a', 'clip-b']);

      groupedEngine.selectClip('clip-a');
      groupedEngine.copySelection();
      groupedEngine.pasteSelection(fromSeconds(10));

      expect(groupedEngine.clipGroups).toHaveLength(2);
      const pastedGroup = expectDefined(
        groupedEngine.clipGroups.find((group) => group.id !== 'copy-group'),
        'pasted group'
      );
      expect(pastedGroup.clipIds).toHaveLength(2);
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

      overwriteEngine.applyOverwrites('winner');

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

      coverEngine.applyOverwrites('winner');

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
      expect(scrollEngine.removeTrack('track-3')).toBe(true);

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

  describe('Keyframes', () => {
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

    function keyframeSeconds(clip: Clip | undefined): number[] {
      return (clip?.keyframes ?? []).map((keyframe) => toSeconds(keyframe.time));
    }

    it('sets, updates, and evaluates opacity keyframes with interpolation modes', () => {
      const addEvent = vi.fn();
      const updateEvent = vi.fn();
      engine.on('keyframe:add', addEvent);
      engine.on('keyframe:update', updateEvent);

      expect(
        engine.setClipKeyframe({
          clipId: 'clip1',
          property: 'opacity',
          time: fromSeconds(1),
          value: 1,
        })?.value
      ).toBe(1);
      engine.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(3),
        value: 0,
        interpolation: 'hold',
      });
      engine.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(5),
        value: 1,
      });

      expect(engine.getClipPropertyValueAtTime('clip1', 'opacity', fromSeconds(2))).toBe(0.5);
      expect(engine.getClipPropertyValueAtTime('clip1', 'opacity', fromSeconds(4))).toBe(0);
      expect(engine.getClipPropertyValueAtTime('clip1', 'opacity', fromSeconds(8))).toBeUndefined();

      const middle = expectDefined(
        engine.getClipKeyframes('clip1', 'opacity')[1],
        'middle keyframe'
      );
      const updatedBySet = engine.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(3),
        value: 0.25,
      });

      expect(updatedBySet?.interpolation).toBe('hold');
      expect(engine.getClipPropertyValueAtTime('clip1', 'opacity', fromSeconds(4))).toBe(0.25);

      const updated = engine.updateClipKeyframe({
        clipId: 'clip1',
        keyframeId: middle.id,
        value: 0.25,
        interpolation: 'linear',
      });

      expect(updated?.value).toBe(0.25);
      expect(engine.getClipPropertyValueAtTime('clip1', 'opacity', fromSeconds(4))).toBe(0.625);

      const bezier = engine.updateClipKeyframe({
        clipId: 'clip1',
        keyframeId: middle.id,
        interpolation: 'bezier',
        easing: { x1: 0.2, y1: 1, x2: 0.8, y2: 1 },
      });
      const expectedBezierValue =
        0.25 + (1 - 0.25) * getTimelineCubicBezierProgress(0.5, { x1: 0.2, y1: 1, x2: 0.8, y2: 1 });

      expect(bezier?.interpolation).toBe('bezier');
      expect(bezier?.easing).toEqual({ x1: 0.2, y1: 1, x2: 0.8, y2: 1 });
      expect(engine.getClipPropertyValueAtTime('clip1', 'opacity', fromSeconds(4))).toBeCloseTo(
        expectedBezierValue
      );

      const reset = engine.updateClipKeyframe({
        clipId: 'clip1',
        keyframeId: middle.id,
        interpolation: 'linear',
      });
      expect(reset?.easing).toBeUndefined();

      expect(addEvent).toHaveBeenCalledTimes(3);
      expect(updateEvent).toHaveBeenCalledTimes(4);
    });

    it('inherits interpolation and easing from the previous keyframe when placing new keyframes', () => {
      const easing = { x1: 0.2, y1: 0.8, x2: 0.8, y2: 0.2 };
      const first = engine.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(4),
        value: 1,
      });
      expect(first?.interpolation).toBe('linear');

      engine.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(1),
        value: 0,
        interpolation: 'bezier',
        easing,
      });

      const inherited = engine.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(2),
        value: 0.5,
      });
      expect(inherited?.interpolation).toBe('bezier');
      expect(inherited?.easing).toEqual(easing);

      const explicit = engine.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(3),
        value: 0.75,
        interpolation: 'linear',
      });
      expect(explicit?.interpolation).toBe('linear');
      expect(explicit?.easing).toBeUndefined();
    });

    it('keeps neighboring keyframes when preview updates collide', () => {
      const track = createKeyframeTrack([createKeyframeClip('kf-clip', 0, 10, [2, 3])]);
      const previewEngine = new TimelineEngine({ tracks: [track] });
      const dragged = expectDefined(
        previewEngine.getClipKeyframes('kf-clip')[1],
        'dragged keyframe'
      );

      const preview = previewEngine.updateClipKeyframe(
        { clipId: 'kf-clip', keyframeId: dragged.id, time: fromSeconds(2) },
        { commit: false }
      );

      expect(toSeconds(expectDefined(preview, 'preview keyframe').time)).toBe(3);
      expect(keyframeSeconds(previewEngine.getClip('kf-clip')?.clip)).toEqual([2, 3]);

      const committed = previewEngine.updateClipKeyframe({
        clipId: 'kf-clip',
        keyframeId: dragged.id,
        time: fromSeconds(2),
      });

      expect(toSeconds(expectDefined(committed, 'committed keyframe').time)).toBe(2);
      expect(keyframeSeconds(previewEngine.getClip('kf-clip')?.clip)).toEqual([2]);
    });

    it('keeps bezier easing scoped to bezier keyframes when cloning state', () => {
      const easingEngine = new TimelineEngine({
        tracks: [
          {
            ...mockTrack,
            clips: [
              {
                ...mockClip,
                keyframes: [
                  {
                    id: 'linear-with-easing',
                    property: 'opacity',
                    time: fromSeconds(2),
                    value: 0.5,
                    interpolation: 'linear',
                    easing: { x1: 0.2, y1: 0.8, x2: 0.8, y2: 0.2 },
                  },
                  {
                    id: 'bezier-without-easing',
                    property: 'opacity',
                    time: fromSeconds(3),
                    value: 0.75,
                    interpolation: 'bezier',
                  },
                ],
              },
            ],
          },
        ],
      });

      expect(easingEngine.getClipKeyframes('clip1')[0].easing).toBeUndefined();
      expect(easingEngine.getClipKeyframes('clip1')[1].easing).toEqual({
        x1: 0.42,
        y1: 0,
        x2: 0.58,
        y2: 1,
      });
    });

    it('exposes selected keyframe geometry and hit testing', () => {
      const keyframe = engine.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(3),
        value: 0.5,
      });
      const selectedKeyframe = expectDefined(keyframe, 'selected keyframe');

      engine.selectClip('clip1');
      engine.selectClipKeyframe('clip1', selectedKeyframe.id);
      const rects = engine.getKeyframeRects({
        selectedClipOnly: true,
        rulerHeight: 32,
        trackHeight: 48,
        keyframeSize: 12,
      });

      expect(rects).toHaveLength(1);
      expect(rects[0].keyframe.selected).toBe(true);
      const hit = engine.getKeyframeAtPoint({
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
      });

      const clipRect = expectDefined(
        edgeEngine.getClipRect('clip1', { rulerHeight: 32, trackHeight: 48 }),
        'clip rect'
      );
      const rects = edgeEngine.getKeyframeRects({
        rulerHeight: 32,
        trackHeight: 48,
        keyframeSize: 12,
      });

      expect(rects).toHaveLength(2);
      expect(rects[0].rect.x).toBe(clipRect.x);
      expect(rects[1].rect.x + rects[1].rect.width).toBe(clipRect.x + clipRect.width);

      const startHit = edgeEngine.getKeyframeAtPoint({
        x: clipRect.x + 1,
        y: rects[0].rect.y + rects[0].rect.height / 2,
        rulerHeight: 32,
        trackHeight: 48,
        keyframeSize: 12,
      });
      const endHit = edgeEngine.getKeyframeAtPoint({
        x: clipRect.x + clipRect.width - 1,
        y: rects[1].rect.y + rects[1].rect.height / 2,
        rulerHeight: 32,
        trackHeight: 48,
        keyframeSize: 12,
      });

      expect(startHit?.keyframe.id).toBe('opacity-start');
      expect(endHit?.keyframe.id).toBe('opacity-end');
    });

    it('exposes keyframe curve segments and Bezier handles with shared control point math', () => {
      const curveEngine = new TimelineEngine({
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
                    interpolation: 'bezier',
                    easing: { x1: 0.2, y1: 0.8, x2: 0.8, y2: 0.2 },
                    selected: true,
                  },
                  {
                    id: 'opacity-middle',
                    property: 'opacity',
                    time: fromSeconds(3),
                    value: 0.8,
                    interpolation: 'hold',
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
      });

      const segments = curveEngine.getKeyframeCurveSegments({
        property: 'opacity',
        rulerHeight: 32,
        trackHeight: 48,
        keyframeSize: 6,
        curveHandleSize: 8,
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
        { x1: 0.2, y1: 0.8, x2: 0.8, y2: 0.2 }
      );

      expect(segments[0].controlPoint1).toEqual(expectedControlPoints.controlPoint1);
      expect(segments[0].controlPoint2).toEqual(expectedControlPoints.controlPoint2);
      expect(segments[0].handles[0].point).toEqual(expectedControlPoints.controlPoint1);
      expect(segments[0].handles[1].point).toEqual(expectedControlPoints.controlPoint2);
    });

    it('hit-tests Bezier curve handles with pointer padding', () => {
      const curveEngine = new TimelineEngine({
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
                    interpolation: 'bezier',
                    easing: { x1: 0.25, y1: 0.75, x2: 0.75, y2: 0.25 },
                  },
                  {
                    id: 'opacity-end',
                    property: 'opacity',
                    time: fromSeconds(5),
                    value: 0.8,
                  },
                ],
              },
            ],
          },
        ],
        zoomScale: 100,
      });

      const segment = expectDefined(
        curveEngine.getKeyframeCurveSegments({
          property: 'opacity',
          rulerHeight: 32,
          trackHeight: 48,
          curveHandleSize: 8,
        })[0],
        'curve segment'
      );
      const outgoing = expectDefined(segment.handles[0], 'outgoing handle');
      const exactHit = curveEngine.getKeyframeCurveHandleAtPoint({
        property: 'opacity',
        x: outgoing.point.x,
        y: outgoing.point.y,
        rulerHeight: 32,
        trackHeight: 48,
        curveHandleSize: 8,
      });
      const touchHit = curveEngine.getKeyframeCurveHandleAtPoint({
        property: 'opacity',
        x: outgoing.rect.x - 6,
        y: outgoing.rect.y - 6,
        pointerType: 'touch',
        rulerHeight: 32,
        trackHeight: 48,
        curveHandleSize: 8,
      });

      expect(exactHit?.handle).toBe('outgoing');
      expect(touchHit?.handle).toBe('outgoing');
    });

    it('filters keyframe curve segments by selected keyframes and viewport visibility', () => {
      const curveEngine = new TimelineEngine({
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
                  interpolation: 'bezier',
                },
                {
                  id: 'visible-start',
                  property: 'opacity',
                  time: fromSeconds(2),
                  value: 0.3,
                  interpolation: 'bezier',
                  easing: { x1: 0.2, y1: 1, x2: 0.8, y2: 0 },
                  selected: true,
                },
                {
                  id: 'visible-end',
                  property: 'opacity',
                  time: fromSeconds(8),
                  value: 0.7,
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
      });

      const selectedSegments = curveEngine.getKeyframeCurveSegments({
        property: 'opacity',
        selectedKeyframeOnly: true,
        rulerHeight: 32,
        trackHeight: 48,
      });
      const visibleSegments = curveEngine.getVisibleKeyframeCurveSegments({
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
      engine.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(2),
        value: 0.2,
      });
      engine.setClipKeyframe({
        clipId: 'clip1',
        property: 'opacity',
        time: fromSeconds(4),
        value: 0.8,
      });

      engine.moveClip({ clipId: 'clip1', startTime: fromSeconds(3) });
      expect(engine.getClipKeyframes('clip1').map((keyframe) => toSeconds(keyframe.time))).toEqual([
        4, 6,
      ]);

      expect(engine.splitClip('clip1', fromSeconds(5))).toBe(true);
      const clips = engine.getState().tracks[0].clips;
      expect(clips).toHaveLength(2);
      expect(clips[0].keyframes?.map((keyframe) => toSeconds(keyframe.time))).toEqual([4]);
      expect(clips[1].keyframes?.map((keyframe) => toSeconds(keyframe.time))).toEqual([6]);
    });

    it('removes out-of-range keyframes when clips are trimmed directly', () => {
      const trimEngine = new TimelineEngine({
        tracks: [createKeyframeTrack([createKeyframeClip('trimmed', 0, 10, [1, 3, 5, 8])])],
      });

      trimEngine.trimClip('trimmed', 'start', fromSeconds(2));
      expect(keyframeSeconds(trimEngine.getClip('trimmed')?.clip)).toEqual([3, 5, 8]);

      trimEngine.trimClip('trimmed', 'end', fromSeconds(6));
      expect(keyframeSeconds(trimEngine.getClip('trimmed')?.clip)).toEqual([3, 5]);
    });

    it('preserves selected clip keyframes through cut and shifts them on paste', () => {
      const cutEngine = new TimelineEngine({
        tracks: [createKeyframeTrack([createKeyframeClip('cut-source', 1, 5, [2, 4])])],
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
      });

      deleteRangeEngine.commitEdit({
        type: 'delete-range',
        startTime: fromSeconds(0),
        endTime: fromSeconds(3),
        trackIds: ['keyframe-track'],
      });

      const rippleTrimmed = expectDefined(
        deleteRangeEngine.getClip('delete-victim')?.clip,
        'ripple trimmed clip'
      );
      expect(toSeconds(rippleTrimmed.timelineStart)).toBe(0);
      expect(toSeconds(rippleTrimmed.timelineEnd)).toBe(7);
      expect(keyframeSeconds(rippleTrimmed)).toEqual([1, 5]);

      const liftRangeEngine = new TimelineEngine({
        tracks: [createKeyframeTrack([createKeyframeClip('lift-victim', 0, 10, [2, 6, 8])])],
      });

      liftRangeEngine.commitEdit({
        type: 'lift-range',
        startTime: fromSeconds(7),
        endTime: fromSeconds(12),
        trackIds: ['keyframe-track'],
      });

      const endTrimmed = expectDefined(
        liftRangeEngine.getClip('lift-victim')?.clip,
        'end trimmed clip'
      );
      expect(toSeconds(endTrimmed.timelineStart)).toBe(0);
      expect(toSeconds(endTrimmed.timelineEnd)).toBe(7);
      expect(keyframeSeconds(endTrimmed)).toEqual([2, 6]);
    });

    it('filters keyframes when overwrite edits trim clip edges', () => {
      const overwriteStartEngine = new TimelineEngine({
        tracks: [createKeyframeTrack([createKeyframeClip('start-victim', 0, 10, [1, 4, 8])])],
      });

      overwriteStartEngine.commitEdit({
        type: 'overwrite',
        clip: createKeyframeClip('start-winner', 0, 3, []),
        targetTrackId: 'keyframe-track',
        startTime: fromSeconds(0),
        snap: false,
      });

      const startTrimmed = expectDefined(
        overwriteStartEngine.getClip('start-victim')?.clip,
        'start trimmed victim'
      );
      expect(toSeconds(startTrimmed.timelineStart)).toBe(3);
      expect(keyframeSeconds(startTrimmed)).toEqual([4, 8]);

      const overwriteEndEngine = new TimelineEngine({
        tracks: [createKeyframeTrack([createKeyframeClip('end-victim', 0, 10, [1, 4, 8])])],
      });

      overwriteEndEngine.commitEdit({
        type: 'overwrite',
        clip: createKeyframeClip('end-winner', 0, 3, []),
        targetTrackId: 'keyframe-track',
        startTime: fromSeconds(7),
        snap: false,
      });

      const endTrimmed = expectDefined(
        overwriteEndEngine.getClip('end-victim')?.clip,
        'end trimmed victim'
      );
      expect(toSeconds(endTrimmed.timelineEnd)).toBe(7);
      expect(keyframeSeconds(endTrimmed)).toEqual([1, 4]);
    });
  });

  describe('Clip Custom Metadata & Undo/Redo', () => {
    it('preserves custom metadata when cloning/modifying properties', () => {
      const clip = engine.getState().tracks[0].clips[0];
      clip.metadata = { note: 'test metadata', flag: true };

      engine.updateClipProperties('clip1', { color: '#ff0000' });
      const updatedClip = engine.getState().tracks[0].clips[0];
      expect(updatedClip.color).toBe('#ff0000');
      expect(updatedClip.metadata).toEqual({ note: 'test metadata', flag: true });
    });

    it('clones metadata correctly when splitting a clip', () => {
      const clip = engine.getState().tracks[0].clips[0];
      clip.metadata = { caption: 'hello split' };

      expect(engine.splitClip('clip1', fromSeconds(2))).toBe(true);

      const track = engine.getState().tracks[0];
      expect(track.clips).toHaveLength(2);
      expect(track.clips[0].metadata).toEqual({ caption: 'hello split' });
      expect(track.clips[1].metadata).toEqual({ caption: 'hello split' });
    });

    it('restores clip metadata after undoing a delete action', () => {
      const clip = engine.getState().tracks[0].clips[0];
      clip.metadata = { tag: 'important' };
      engine.snapshot(); // snapshot current state with metadata

      engine.deleteClip('clip1');
      expect(engine.getState().tracks[0].clips).toHaveLength(0);

      engine.undo();
      const restoredClips = engine.getState().tracks[0].clips;
      expect(restoredClips).toHaveLength(1);
      expect(restoredClips[0].id).toBe('clip1');
      expect(restoredClips[0].metadata).toEqual({ tag: 'important' });
    });
  });
});
