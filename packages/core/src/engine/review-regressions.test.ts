import { expectDefined } from '#test-utils/assertions';
import { describe, expect, it } from 'vite-plus/test';
import { TimelineEngine } from '#core/engine';
import type { Clip, Track } from '#core/types';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
function clip(id: string, start = 1, end = 3): Clip {
  return {
    id,
    sourceId: id,
    timelineStart: fromSeconds(start),
    timelineEnd: fromSeconds(end),
    sourceStart: fromSeconds(0),
    selected: false,
  };
}
function track(id: string, clips: Clip[] = []): Track {
  return { id, clips, kind: 'visual', selected: false, locked: false, muted: false, visible: true };
}

describe('document transaction boundaries', () => {
  it('commits against current content after a preview', () => {
    const engine = new TimelineEngine({ tracks: [track('a', [clip('clip')])] });
    const command = {
      type: 'move',
      clipId: 'clip',
      startTime: fromSeconds(4),
      snap: false,
    } as const;
    engine.previewEdit(command);
    engine.addTrack(track('b'));
    expect(engine.commitEdit(command).committed).toBe(true);
    expect(engine.tracks.map(({ id }) => id)).toEqual(['a', 'b']);
    engine.undo();
    expect(engine.tracks.map(({ id }) => id)).toEqual(['a', 'b']);
    expect(
      toSeconds(expectDefined(engine.geometry.getClip('clip'), 'clip').clip.timelineStart)
    ).toBe(1);
  });

  it('rechecks current locks and edit policy before committing', () => {
    const engine = new TimelineEngine({ tracks: [track('a', [clip('clip')])] });
    const command = {
      type: 'trim',
      clipId: 'clip',
      edge: 'end',
      newTime: fromSeconds(4),
      snap: false,
    } as const;
    engine.previewEdit(command);
    engine.toggleLockTrack('a', true);
    expect(engine.commitEdit(command).preview.reason).toBe('locked');
    engine.toggleLockTrack('a', false);
    engine.previewEdit(command);
    engine.setEditPolicy({ validateCommand: () => ({ valid: false, reason: 'policy-rejected' }) });
    expect(engine.commitEdit(command).committed).toBe(false);
    expect(toSeconds(expectDefined(engine.geometry.getClip('clip'), 'clip').clip.timelineEnd)).toBe(
      3
    );
  });

  it('discards overwrite previews without history or content changes', () => {
    const engine = new TimelineEngine({
      tracks: [track('a', [clip('victim', 0, 10), clip('winner', 11, 13)])],
    });
    const before = engine.getState();
    const preview = engine.previewEdit({
      type: 'move',
      clipId: 'winner',
      startTime: fromSeconds(3),
      overwrite: true,
      snap: false,
    });
    expect(preview.createdClips).toHaveLength(1);
    expect(engine.getState().tracks).toBe(before.tracks);
    expect(engine.getRenderState().tracks[0].clips).toHaveLength(3);
    engine.cancelEdit();
    expect(engine.getState().tracks).toBe(before.tracks);
    expect(engine.canUndo).toBe(false);
  });

  it('rejects a whole batch when a later edit fails', () => {
    const engine = new TimelineEngine({ tracks: [track('a', [clip('clip')])] });
    const results = engine.commitEdits([
      { type: 'move', clipId: 'clip', startTime: fromSeconds(4) },
      { type: 'delete-clips', clipIds: ['missing'] },
    ]);
    expect(results.every((result) => !result.committed)).toBe(true);
    expect(
      toSeconds(expectDefined(engine.geometry.getClip('clip'), 'clip').clip.timelineStart)
    ).toBe(1);
    expect(engine.canUndo).toBe(false);
  });

  it('owns incoming time values and freezes read snapshots', () => {
    const time = { v: 60, r: 60 };
    const markerTime = { v: 120, r: 60 };
    const engine = new TimelineEngine({
      tracks: [track('a', [{ ...clip('clip'), timelineStart: time }])],
      markers: [{ id: 'marker', time: markerTime }],
    });
    time.v = 0;
    markerTime.v = 0;
    const snapshot = engine.getState();
    expect(toSeconds(snapshot.tracks[0].clips[0].timelineStart)).toBe(1);
    expect(toSeconds(expectDefined(snapshot.markers, 'markers')[0].time)).toBe(2);
    expect(() => Object.assign(snapshot.tracks[0].clips[0].timelineStart, { v: 0 })).toThrow(
      TypeError
    );
    engine.setScrollLeft(4);
    expect(engine.getState().tracks).toBe(snapshot.tracks);
  });

  it('bounds history, skips duplicate checkpoints, and truncates redo after an edit', () => {
    const engine = new TimelineEngine({
      tracks: [track('a', [clip('clip')])],
      history: { maxEntries: 3, maxBytes: 1_000_000 },
    });
    for (let index = 0; index < 6; index++) {
      engine.updateClipProperties('clip', { label: String(index) });
    }
    engine.snapshot();
    engine.undo();
    expect(engine.geometry.getClip('clip')?.clip.label).toBe('4');
    engine.undo();
    expect(engine.geometry.getClip('clip')?.clip.label).toBe('3');
    expect(engine.canUndo).toBe(false);
    engine.updateClipProperties('clip', { label: 'branch' });
    expect(engine.canRedo).toBe(false);
  });

  it('keeps only the current state when one document exceeds the byte budget', () => {
    const engine = new TimelineEngine({
      tracks: [track('a', [clip('clip')])],
      history: { maxBytes: 1 },
    });
    engine.updateClipProperties('clip', { label: 'large' });
    expect(engine.canUndo).toBe(false);
    expect(engine.geometry.getClip('clip')?.clip.label).toBe('large');
  });

  it('finds overlapping half-open intervals and evaluates live selector predicates', () => {
    const engine = new TimelineEngine({
      tracks: [track('a', [clip('long', 0, 100), clip('short', 5, 6), clip('next', 6, 7)])],
    });
    expect(engine.media.getActiveClips(fromSeconds(6)).map(({ clip }) => clip.id)).toEqual([
      'long',
      'next',
    ]);
    let allowed = false;
    const layers = { visual: { predicate: () => allowed } };
    expect(engine.media.getActiveLayers({ time: fromSeconds(6), layers }).all).toHaveLength(0);
    allowed = true;
    expect(engine.media.getActiveLayers({ time: fromSeconds(6), layers }).all).toHaveLength(2);
  });
});
