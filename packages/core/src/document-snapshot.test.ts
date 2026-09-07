import { TimelineEngine } from '#core/engine';
import type { Clip, Track } from '#core/types';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { expect, test, vi } from 'vite-plus/test';

function createEngine() {
  const clips: Clip[] = ['a', 'b'].map((id, index) => ({
    id,
    sourceId: id,
    timelineStart: fromSeconds(index),
    timelineEnd: fromSeconds(index + 1),
    sourceStart: fromSeconds(0),
    selected: false,
    metadata: { label: id, nested: { value: 1 } },
  }));
  const track: Track = {
    id: 'track',
    kind: 'visual',
    selected: false,
    locked: false,
    muted: false,
    visible: true,
    clips,
  };
  return new TimelineEngine({ tracks: [track] });
}

test('edits preserve unchanged siblings and history restores owned values', () => {
  const engine = createEngine();
  const initial = engine.getState();
  engine.updateClipProperties('a', { label: 'updated' });
  const edited = engine.getState();
  expect(edited.tracks[0]).not.toBe(initial.tracks[0]);
  expect(edited.tracks[0].clips[1]).toBe(initial.tracks[0].clips[1]);
  expect(initial.tracks[0].clips[0].label).toBeUndefined();
  expect(Object.isFrozen(edited.tracks[0].clips[0].metadata?.nested)).toBe(true);
  engine.undo();
  expect(engine.getState().tracks[0].clips[0].label).toBeUndefined();
  engine.redo();
  expect(engine.getState().tracks[0].clips[0].label).toBe('updated');
});

test('selection snapshot comparison does not serialize the document', () => {
  const engine = createEngine();
  engine.getState();
  const serialize = vi.spyOn(JSON, 'stringify');
  try {
    engine.selectClip('a');
    const selected = engine.getState();
    expect(selected.tracks[0].clips[0].selected).toBe(true);
    expect(serialize).not.toHaveBeenCalled();
  } finally {
    serialize.mockRestore();
  }
});

test('invalid track commands are atomic and duplicate IDs are rejected', () => {
  const engine = createEngine();
  const initial = engine.getState();
  const track: Track = {
    id: 'new',
    kind: 'visual',
    selected: false,
    locked: false,
    muted: false,
    visible: true,
    clips: [],
  };
  expect(engine.addTrack({ ...track, height: Number.NaN })).toMatchObject({
    ok: false,
    reason: 'invalid-input',
  });
  expect(engine.addTrack({ ...track, id: 'track' })).toEqual({ ok: false, reason: 'duplicate-id' });
  expect(
    engine.addTrack({ ...track, clips: [{ ...initial.tracks[0].clips[0], keyframes: [] }] })
  ).toEqual({ ok: false, reason: 'duplicate-id' });
  expect(engine.setTrackHeight('track', 0)).toMatchObject({ ok: false, reason: 'invalid-input' });
  expect(engine.getState()).toBe(initial);
  expect(engine.canUndo).toBe(false);
});
