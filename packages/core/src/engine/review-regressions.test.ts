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
  it('undo and redo clear previews before notifying document subscribers', () => {
    const engine = new TimelineEngine({ tracks: [track('a', [clip('clip')])] });
    const move = (seconds: number) =>
      ({ type: 'move', clipId: 'clip', startTime: fromSeconds(seconds), snap: false }) as const;
    engine.commitEdit(move(4));
    for (const restore of [() => engine.undo(), () => engine.redo()]) {
      engine.previewEdit(move(7));
      const unsubscribe = engine.on('content:change', () => {
        expect(engine.getEditPreview()).toBeNull();
        expect(engine.getRenderState().tracks).toBe(engine.getState().tracks);
      });
      restore();
      unsubscribe();
      expect(engine.getEditPreview()).toBeNull();
    }
    expect(toSeconds(engine.tracks[0].clips[0].timelineStart)).toBe(4);
  });

  it('reconciles both viewport axes when history restores smaller content', () => {
    const engine = new TimelineEngine({ tracks: [track('a', [clip('clip')])] });
    engine.setViewportWidth(100);
    engine.addTrack({ ...track('tall', [clip('late', 40, 50)]), height: 2000 });
    engine.setScrollTop(1000);
    engine.setScrollLeft(1000);
    let scrollChanges = 0;
    engine.on('scroll:change', () => scrollChanges++);
    engine.undo();
    expect(engine.scrollTop).toBe(0);
    expect(engine.scrollLeft).toBeLessThanOrEqual(engine.maxScrollLeft);
    expect(scrollChanges).toBe(1);
    engine.redo();
    expect(engine.scrollTop).toBeLessThanOrEqual(engine.maxScrollTop);
  });

  it.each([2, 4])('rejects a roll boundary outside clip bounds at %ss', (boundary) => {
    const engine = new TimelineEngine({
      tracks: [
        track('a', [
          { ...clip('left', 0, 3), maxEnd: fromSeconds(3) },
          { ...clip('right', 3, 6), minStart: fromSeconds(3) },
        ]),
      ],
    });
    const command = {
      type: 'roll-trim',
      leftClipId: 'left',
      rightClipId: 'right',
      boundaryTime: fromSeconds(boundary),
      snap: false,
    } as const;
    expect(engine.validateEdit(command)).toMatchObject({ valid: false, reason: 'source-bounds' });
    expect(engine.commitEdit(command).committed).toBe(false);
    expect(engine.canUndo).toBe(false);
  });

  it('owns marker results, event payloads, and nested snap updates', () => {
    const engine = new TimelineEngine({ tracks: [] });
    engine.on('marker:add', ({ marker }) => {
      marker.label = 'event mutation';
    });
    engine.on('marker:update', ({ marker }) => {
      marker.description = 'event mutation';
    });
    const added = engine.addMarker(fromSeconds(1), 'Original');
    expect(added.label).toBe('Original');
    added.label = 'return mutation';
    const snap = { priority: 5 };
    const updated = expectDefined(
      engine.updateMarker(added.id, { snap, description: 'Updated' }),
      'updated marker'
    );
    snap.priority = 100;
    updated.description = 'return mutation';
    if (typeof updated.snap === 'object') {
      updated.snap.priority = 200;
    }
    engine.invalidateContent();
    expect(engine.markers[0]).toMatchObject({
      label: 'Original',
      description: 'Updated',
      snap: { priority: 5 },
    });
    engine.undo();
    expect(engine.markers[0]).toMatchObject({ label: 'Original' });
    expect(engine.markers[0].description).toBeUndefined();
  });

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

  it('owns the active-query time independently of the caller', () => {
    const engine = new TimelineEngine({
      tracks: [track('a', [clip('first', 0, 2), clip('second', 3, 5)])],
    });
    const time = { v: 1, r: 1 };
    const initial = engine.media.getActiveClips(time);
    time.v = 4;
    expect(initial[0].timelineTime).toEqual({ v: 1, r: 1 });
    expect(engine.media.getActiveClips(time).map(({ clip }) => clip.id)).toEqual(['second']);
  });

  it('keeps returned arrays and derived timing out of its active-media cache', () => {
    const engine = new TimelineEngine({ tracks: [track('a', [clip('first', 0, 2)])] });
    const active = engine.media.getActiveClips(fromSeconds(1));
    const entry = expectDefined(active[0], 'active clip');
    entry.sourceTime = fromSeconds(100);
    Object.assign(entry.sourceRange.start, { v: 999 });
    Object.assign(entry.timelineTime, { v: 999 });
    active.pop();
    const again = engine.media.getActiveClips(fromSeconds(1));
    expect(again.map(({ clip }) => clip.id)).toEqual(['first']);
    expect(toSeconds(again[0].sourceTime)).toBe(1);
    expect(toSeconds(again[0].sourceRange.start)).toBe(0);
    expect(toSeconds(again[0].timelineTime)).toBe(1);
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
