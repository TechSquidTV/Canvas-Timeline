import { describe, it, expect, beforeEach } from 'vite-plus/test';
import { TimelineEngine } from '#core/engine';
import { createTimelineScalarKeyframeProperty } from '#core/keyframes';
import type { Clip, Track } from '#core/types';
import type { ClipCreatedEvent, ClipMoveEvent, ClipRemovedEvent } from '#core/events';
import {
  assertValidRationalTime,
  fromSeconds,
  toSeconds,
} from '@techsquidtv/canvas-timeline-utils';
import { expectDefined } from '#test-utils/assertions';

const opacityKeyframeProperty = createTimelineScalarKeyframeProperty({
  id: 'opacity',
  label: 'Opacity',
  min: 0,
  max: 1,
  defaultValue: 1,
  formatValue: (value) => `${Math.round(value * 100)}%`,
  getBaseValue: (clip) => clip.opacity ?? 1,
});

describe('TimelineEngine editing', () => {
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

    function createEditTrack(
      id: string,
      clips: Clip[],
      options: { locked?: boolean; kind?: string } = {}
    ): Track {
      return {
        id,
        kind: options.kind ?? 'visual',
        clips,
        selected: false,
        locked: options.locked ?? false,
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

      const overwritePreviewEngine = new TimelineEngine({
        tracks: [createEditTrack('track1', [createEditClip('victim', 0, 10)])],
      });

      overwritePreviewEngine.previewEdit({
        type: 'overwrite',
        clip: createEditClip('preview-winner', 0, 2),
        targetTrackId: 'track1',
        startTime: fromSeconds(3),
        snap: false,
      });

      expect(overwritePreviewEngine.getEditImpacts()).toMatchObject({
        operation: 'overwrite',
        sourceClipId: 'preview-winner',
        sourceTrackId: 'track1',
      });

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

    it('previews and commits delete-clips through the command layer', () => {
      const deleteEngine = new TimelineEngine({
        clipGroups: [{ id: 'linked-group', clipIds: ['b', 'linked'] }],
        tracks: [
          createEditTrack('track1', [createEditClip('a', 0, 2), createEditClip('b', 4, 6)]),
          createEditTrack('track2', [createEditClip('linked', 4, 6)]),
        ],
      });
      const removed: ClipRemovedEvent[] = [];
      deleteEngine.on('clip:removed', (event) => removed.push(event));

      const preview = deleteEngine.previewEdit({ type: 'delete-clips', clipIds: ['b'] });

      expect(preview.valid).toBe(true);
      expect(preview.removedClips.map((clip) => clip.id).sort()).toEqual(['b', 'linked']);
      expect(deleteEngine.getClip('b')).toBeDefined();
      expect(deleteEngine.getEditImpacts()).toMatchObject({
        operation: 'delete-clips',
        sourceClipId: 'b',
        sourceTrackId: 'track1',
      });
      expect(deleteEngine.getEditImpacts()?.impacts).toHaveLength(2);

      const result = deleteEngine.commitEdit({ type: 'delete-clips', clipIds: ['b'] });

      expect(result.committed).toBe(true);
      expect(deleteEngine.getClip('b')).toBeUndefined();
      expect(deleteEngine.getClip('linked')).toBeUndefined();
      expect(deleteEngine.clipGroups).toEqual([]);
      expect(removed.map((event) => event.clip.id).sort()).toEqual(['b', 'linked']);
      expect(removed.every((event) => event.reason === 'delete')).toBe(true);

      deleteEngine.undo();

      expect(deleteEngine.getClip('b')).toBeDefined();
      expect(deleteEngine.getClip('linked')).toBeDefined();
      expect(deleteEngine.clipGroups[0]?.clipIds).toEqual(['b', 'linked']);
    });

    it('rejects delete-clips for locked tracks and policy rejections', () => {
      const lockedEngine = new TimelineEngine({
        tracks: [
          createEditTrack('locked-track', [createEditClip('locked-clip', 0, 2)], { locked: true }),
        ],
      });

      expect(
        lockedEngine.validateEdit({ type: 'delete-clips', clipIds: ['locked-clip'] }).reason
      ).toBe('locked');

      engine.setEditPolicy({
        validateCommand: ({ command }) =>
          command.type === 'delete-clips' ? { valid: false, reason: 'policy-rejected' } : undefined,
      });

      const result = engine.commitEdit({ type: 'delete-clips', clipIds: ['clip1'] });

      expect(result.committed).toBe(false);
      expect(result.preview.reason).toBe('policy-rejected');
      expect(engine.getClip('clip1')).toBeDefined();
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

    it('commits active grouped overwrite previews so split clip ids stay stable', () => {
      const previewEngine = new TimelineEngine({
        tracks: [
          createEditTrack('track1', [createEditClip('video-victim', 0, 10)]),
          createEditTrack('track2', []),
        ],
      });
      const command = {
        type: 'overwrite-clip-group' as const,
        groupId: 'preview-group',
        placements: [
          {
            clip: createEditClip('video-winner', 0, 2),
            targetTrackId: 'track1',
            startTime: fromSeconds(3),
          },
          {
            clip: createEditClip('audio-winner', 0, 2),
            targetTrackId: 'track2',
            startTime: fromSeconds(3),
          },
        ],
        snap: false,
      };
      const preview = previewEngine.previewEdit(command);
      const previewSplitClip = expectDefined(
        preview.createdClips.find(
          (clip) => clip.id !== 'video-winner' && clip.id !== 'audio-winner'
        ),
        'preview split clip'
      );

      previewEngine.commitEdit(command);

      expect(previewEngine.getClip(previewSplitClip.id)).toBeDefined();
      expect(previewEngine.getClipGroup('preview-group')?.clipIds).toEqual([
        'video-winner',
        'audio-winner',
      ]);
    });

    it('rejects grouped placement commands through edit policy without mutation', () => {
      const policyEngine = new TimelineEngine({
        tracks: [createEditTrack('track1', []), createEditTrack('track2', [])],
      });
      policyEngine.setEditPolicy({
        canEditRange: (context) =>
          context.range?.trackId === 'track2'
            ? { valid: false, reason: 'policy-rejected' }
            : undefined,
      });
      const beforeTracks = JSON.stringify(policyEngine.tracks);
      const beforeGroups = JSON.stringify(policyEngine.clipGroups);

      const result = policyEngine.commitEdit({
        type: 'insert-clip-group',
        groupId: 'policy-group',
        placements: [
          {
            clip: createEditClip('video-drop', 0, 2),
            targetTrackId: 'track1',
            startTime: fromSeconds(1),
          },
          {
            clip: createEditClip('audio-drop', 0, 2),
            targetTrackId: 'track2',
            startTime: fromSeconds(1),
          },
        ],
        snap: false,
      });

      expect(result.committed).toBe(false);
      expect(result.preview.reason).toBe('policy-rejected');
      expect(JSON.stringify(policyEngine.tracks)).toBe(beforeTracks);
      expect(JSON.stringify(policyEngine.clipGroups)).toBe(beforeGroups);
    });

    it('emits lifecycle events and restores clip groups for grouped overwrite undo and redo', () => {
      const lifecycleEngine = new TimelineEngine({
        tracks: [
          createEditTrack('track1', [createEditClip('video-victim', 2, 4)]),
          createEditTrack('track2', [createEditClip('audio-victim', 2, 4)]),
        ],
      });
      const created: ClipCreatedEvent[] = [];
      const removed: ClipRemovedEvent[] = [];
      lifecycleEngine.on('clip:created', (event) => created.push(event));
      lifecycleEngine.on('clip:removed', (event) => removed.push(event));

      const result = lifecycleEngine.commitEdit({
        type: 'overwrite-clip-group',
        groupId: 'lifecycle-group',
        placements: [
          {
            clip: createEditClip('video-drop', 0, 2),
            targetTrackId: 'track1',
            startTime: fromSeconds(2),
          },
          {
            clip: createEditClip('audio-drop', 0, 2),
            targetTrackId: 'track2',
            startTime: fromSeconds(2),
          },
        ],
        snap: false,
      });

      expect(result.committed).toBe(true);
      expect(created.map((event) => [event.reason, event.clip.id])).toEqual([
        ['overwrite', 'video-drop'],
        ['overwrite', 'audio-drop'],
      ]);
      expect(removed.map((event) => [event.reason, event.clip.id])).toEqual([
        ['overwrite', 'video-victim'],
        ['overwrite', 'audio-victim'],
      ]);
      expect(lifecycleEngine.getClipGroup('lifecycle-group')?.clipIds).toEqual([
        'video-drop',
        'audio-drop',
      ]);

      lifecycleEngine.undo();

      expect(lifecycleEngine.getClipGroup('lifecycle-group')).toBeUndefined();
      expect(lifecycleEngine.getClip('video-drop')).toBeUndefined();
      expect(lifecycleEngine.getClip('audio-drop')).toBeUndefined();
      expect(lifecycleEngine.getClip('video-victim')).toBeDefined();
      expect(lifecycleEngine.getClip('audio-victim')).toBeDefined();

      lifecycleEngine.redo();

      expect(lifecycleEngine.getClipGroup('lifecycle-group')?.clipIds).toEqual([
        'video-drop',
        'audio-drop',
      ]);
      expect(lifecycleEngine.getClip('video-victim')).toBeUndefined();
      expect(lifecycleEngine.getClip('audio-victim')).toBeUndefined();
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
              createEditTrack('video', [
                createEditClip('clip-a', 0, 2),
                createEditClip('clip-b', 3, 5),
                createEditClip('clip-c', 6, 8),
                createEditClip('clip-d', 9, 11),
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
              createEditTrack('video', [
                createEditClip('clip-a', 0, 2),
                createEditClip('clip-b', 3, 5),
                createEditClip('clip-c', 6, 8),
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
        tracks: [createEditTrack('video', []), createEditTrack('audio', [], { kind: 'audio' })],
        keyframeProperties: [opacityKeyframeProperty],
      });
      const group = groupedEngine.insertClipGroup({
        groupId: 'import-group',
        placements: [
          {
            clip: {
              ...createEditClip('video-clip', 0, 2),
              keyframes: [
                { id: 'video-opacity', property: 'opacity', time: fromSeconds(1), value: 1 },
              ],
            },
            targetTrackId: 'video',
            startTime: fromSeconds(5),
          },
          {
            clip: createEditClip('audio-clip', 0, 2),
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
            clip: createEditClip('valid-clip', 0, 2),
            targetTrackId: 'video',
            startTime: fromSeconds(8),
          },
          {
            clip: {
              ...createEditClip('invalid-clip', 0, 2),
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

    it('commits grouped insert commands atomically and ripples affected target tracks', () => {
      const groupedEngine = new TimelineEngine({
        tracks: [
          createEditTrack('video', [createEditClip('video-after', 5, 7)]),
          createEditTrack('audio', [createEditClip('audio-after', 6, 8)], { kind: 'audio' }),
        ],
      });
      groupedEngine.setSnappingEnabled(false);

      const result = groupedEngine.commitEdit({
        type: 'insert-clip-group',
        groupId: 'dropped-av',
        label: 'Dropped AV',
        placements: [
          {
            clip: createEditClip('video-drop', 0, 2),
            targetTrackId: 'video',
            startTime: fromSeconds(3),
          },
          {
            clip: createEditClip('audio-drop', 0, 3),
            targetTrackId: 'audio',
            startTime: fromSeconds(4),
          },
        ],
        snap: false,
      });

      expect(result.committed).toBe(true);
      expect(result.preview.createdClips.map((clip) => clip.id)).toEqual([
        'video-drop',
        'audio-drop',
      ]);
      expect(result.preview.changedClips.map((clip) => clip.id).sort()).toEqual([
        'audio-after',
        'video-after',
      ]);
      expect(groupedEngine.getClipGroup('dropped-av')).toMatchObject({
        id: 'dropped-av',
        label: 'Dropped AV',
        clipIds: ['video-drop', 'audio-drop'],
      });
      expect(
        toSeconds(groupedEngine.getClip('video-after')?.clip.timelineStart ?? fromSeconds(0))
      ).toBe(7);
      expect(
        toSeconds(groupedEngine.getClip('audio-after')?.clip.timelineStart ?? fromSeconds(0))
      ).toBe(9);
    });

    it('snaps grouped insert commands with one shared delta to preserve relative offsets', () => {
      const groupedEngine = new TimelineEngine({
        markers: [
          { id: 'primary-marker', time: fromSeconds(3), label: 'Primary' },
          { id: 'secondary-marker', time: fromSeconds(6.9), label: 'Secondary' },
        ],
        tracks: [createEditTrack('video', []), createEditTrack('audio', [], { kind: 'audio' })],
        zoomScale: 100,
      });
      groupedEngine.prepareSnapping();

      const result = groupedEngine.commitEdit({
        type: 'insert-clip-group',
        groupId: 'snapped-av',
        placements: [
          {
            clip: createEditClip('video-drop', 0, 2),
            targetTrackId: 'video',
            startTime: fromSeconds(3.05),
          },
          {
            clip: createEditClip('audio-drop', 0, 2),
            targetTrackId: 'audio',
            startTime: fromSeconds(6.86),
          },
        ],
      });

      expect(result.committed).toBe(true);
      expect(
        toSeconds(groupedEngine.getClip('video-drop')?.clip.timelineStart ?? fromSeconds(0))
      ).toBeCloseTo(3);
      expect(
        toSeconds(groupedEngine.getClip('audio-drop')?.clip.timelineStart ?? fromSeconds(0))
      ).toBeCloseTo(6.81);
    });

    it('commits grouped overwrite commands atomically and trims overlaps per target track', () => {
      const groupedEngine = new TimelineEngine({
        tracks: [
          createEditTrack('video', [createEditClip('video-victim', 1, 6)]),
          createEditTrack('audio', [createEditClip('audio-victim', 2, 8)], { kind: 'audio' }),
        ],
      });
      groupedEngine.setSnappingEnabled(false);

      const result = groupedEngine.commitEdit({
        type: 'overwrite-clip-group',
        groupId: 'overwrite-av',
        placements: [
          {
            clip: createEditClip('video-drop', 0, 2),
            targetTrackId: 'video',
            startTime: fromSeconds(3),
          },
          {
            clip: createEditClip('audio-drop', 0, 3),
            targetTrackId: 'audio',
            startTime: fromSeconds(4),
          },
        ],
        snap: false,
      });

      expect(result.committed).toBe(true);
      expect(groupedEngine.getClipGroup('overwrite-av')?.clipIds).toEqual([
        'video-drop',
        'audio-drop',
      ]);
      expect(result.preview.impacts.map((impact) => impact.clipId).sort()).toEqual([
        'audio-victim',
        'video-victim',
      ]);
      expect(groupedEngine.getClip('video-victim')).toBeDefined();
      expect(groupedEngine.getClip('audio-victim')).toBeDefined();
      expect(groupedEngine.tracks[0].clips.map((clip) => clip.id)).toHaveLength(3);
      expect(groupedEngine.tracks[1].clips.map((clip) => clip.id)).toHaveLength(3);
    });

    it('rejects invalid grouped placement commands without mutating tracks or groups', () => {
      const groupedEngine = new TimelineEngine({
        tracks: [createEditTrack('video', [createEditClip('existing', 0, 2)])],
      });
      const beforeTracks = JSON.stringify(groupedEngine.tracks);
      const beforeGroups = JSON.stringify(groupedEngine.clipGroups);

      const result = groupedEngine.commitEdit({
        type: 'insert-clip-group',
        placements: [
          {
            clip: createEditClip('new-a', 0, 2),
            targetTrackId: 'video',
            startTime: fromSeconds(3),
          },
          {
            clip: createEditClip('new-a', 0, 2),
            targetTrackId: 'missing',
            startTime: fromSeconds(3),
          },
        ],
        snap: false,
      });

      expect(result.committed).toBe(false);
      expect(result.preview.reason).toBe('duplicate-id');
      expect(JSON.stringify(groupedEngine.tracks)).toBe(beforeTracks);
      expect(JSON.stringify(groupedEngine.clipGroups)).toBe(beforeGroups);
    });

    it('applies overwrite cleanup for every grouped member during drag preview', () => {
      const groupedEngine = new TimelineEngine({
        tracks: [
          createEditTrack('video', [createEditClip('video-clip', 0, 2)]),
          createEditTrack(
            'audio',
            [createEditClip('audio-clip', 0, 2), createEditClip('audio-victim', 4, 6)],
            { kind: 'audio' }
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
          createEditTrack('video', [createEditClip('video-clip', 0, 10)]),
          createEditTrack(
            'audio',
            [
              {
                ...createEditClip('audio-clip', 0, 10),
                resizable: false,
              },
            ],
            { kind: 'audio' }
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
          createEditTrack('track1', [
            createEditClip('selected-overlap', 0, 10),
            {
              ...createEditClip('selected-later', 20, 30),
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
});
