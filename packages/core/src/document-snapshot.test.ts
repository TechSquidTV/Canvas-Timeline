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

test('constructor owns playback times and restores range boundaries', () => {
  const playheadTime = { v: 3, r: 1 };
  const duration = { v: 10, r: 1 };
  const inPoint = { v: 2, r: 1 };
  const outPoint = { v: 8, r: 1 };
  const engine = new TimelineEngine({ tracks: [], playheadTime, duration, inPoint, outPoint });
  const initial = engine.getState();
  for (const time of [playheadTime, duration, inPoint, outPoint]) {
    time.v = 99;
  }
  expect(engine.getState()).toBe(initial);
  expect(engine.getTime()).toEqual({ v: 3, r: 1 });
  expect(engine.maxContentTime).toEqual({ v: 10, r: 1 });
  expect(initial.inPoint).toEqual({ v: 2, r: 1 });
  expect(initial.outPoint).toEqual({ v: 8, r: 1 });
  engine.play({ clock: 'external' });
  expect(engine.updateExternalPlaybackTime(fromSeconds(9)).action).toBe('pause');
  expect(engine.getTime()).toEqual({ v: 8, r: 1 });
});

test.each(['height', 'scrollTop'])(
  'track height batches reject invalid %s without partial mutations',
  (field) => {
    const engine = createEngine();
    const initial = engine.getState();
    const settled = vi.fn();
    const resize = vi.fn();
    engine.on('state:settled', settled);
    engine.on('track:resize', resize);
    const updates = [{ trackId: 'track', height: 100 }];
    if (field === 'height') {
      updates.push({ trackId: 'track', height: Number.NaN });
    }
    expect(() =>
      engine.setTrackHeights(updates, field === 'scrollTop' ? { scrollTop: Number.NaN } : {})
    ).toThrow(RangeError);
    expect(engine.getState()).toBe(initial);
    expect(engine.geometry.getClip('a')?.track.height).toBeUndefined();
    expect(engine.canUndo).toBe(false);
    expect(settled).not.toHaveBeenCalled();
    expect(resize).not.toHaveBeenCalled();
  }
);

test('geometry and active-media queries share frozen document records', () => {
  const engine = createEngine();
  const initial = engine.getState();
  const queries = [
    engine.geometry.getClip('a'),
    engine.geometry.getClipAtPoint({ x: 50, y: 40 }),
    engine.geometry.getClipRects()[0],
    engine.geometry.getVisibleTimelineClips()[0],
    engine.media.getActiveClips(fromSeconds(0.5))[0],
  ];
  for (const query of queries) {
    expect(query?.clip).toBe(initial.tracks[0].clips[0]);
    expect(query?.track).toBe(initial.tracks[0]);
    expect(() => Object.assign(query?.clip ?? {}, { label: 'leaked' })).toThrow(TypeError);
    expect(() => Object.assign(query?.track ?? {}, { locked: true })).toThrow(TypeError);
  }
  expect(engine.geometry.getTrackAtPoint({ y: 40 })?.track).toBe(initial.tracks[0]);
  expect(engine.canUndo).toBe(false);
  expect(engine.getState()).toBe(initial);
  engine.selectClip('a');
  expect(engine.media.getActiveClips(fromSeconds(0.5))[0].clip.selected).toBe(true);
  expect(initial.tracks[0].clips[0].selected).toBe(false);
  engine.updateClipProperties('a', { label: 'command' });
  engine.undo();
  expect(engine.geometry.getClip('a')?.clip.label).toBeUndefined();
});

test('geometry reads frozen preview records while clip lookup retains committed content', () => {
  const engine = createEngine();
  engine.previewEdit({ type: 'move', clipId: 'a', startTime: fromSeconds(4), snap: false });
  const previewClip = engine.getRenderState().tracks[0].clips.find(({ id }) => id === 'a');
  const rect = engine.geometry.getClipRects().find(({ clip }) => clip.id === 'a');
  expect(rect?.clip).toBe(previewClip);
  expect(() => Object.assign(rect?.clip ?? {}, { label: 'leaked' })).toThrow(TypeError);
  expect(engine.geometry.getClip('a')?.clip.timelineStart).toEqual(fromSeconds(0));
  engine.cancelEdit();
  expect(engine.canUndo).toBe(false);
});

const cyclicMetadata: Record<string, object> = {};
cyclicMetadata.self = cyclicMetadata;

test.each([
  new Map([['value', { nested: 1 }]]),
  new Set([1]),
  new Date(),
  new Uint8Array([1]),
  new ArrayBuffer(1),
  /expression/,
  1n,
  Number.NaN,
  Infinity,
  Symbol('value'),
  () => 1,
  cyclicMetadata,
])('rejects unsupported metadata before it enters the document: %s', (value) => {
  const engine = createEngine();
  const initial = engine.getState();
  const invalidClip: Clip = {
    id: 'invalid',
    sourceId: 'source',
    timelineStart: fromSeconds(2),
    timelineEnd: fromSeconds(3),
    sourceStart: fromSeconds(0),
    selected: false,
  };
  // Model unchecked JavaScript callers without weakening the public TypeScript contract.
  Object.assign(invalidClip, { metadata: { value } });
  expect(
    () => new TimelineEngine({ tracks: [{ ...initial.tracks[0], clips: [invalidClip] }] })
  ).toThrow(/metadata/);
  expect(
    engine.addTrack({ ...initial.tracks[0], id: 'invalid-track', clips: [invalidClip] })
  ).toMatchObject({ ok: false, reason: 'invalid-input' });
  expect(engine.getState()).toBe(initial);
  expect(engine.canUndo).toBe(false);
});

test('plain metadata arrays are owned and immutable throughout undo and redo', () => {
  const metadata = { values: [{ count: 1 }], optional: undefined, empty: null };
  const engine = new TimelineEngine({
    tracks: [
      {
        ...createEngine().tracks[0],
        clips: [
          {
            id: 'clip',
            sourceId: 'source',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(1),
            sourceStart: fromSeconds(0),
            selected: false,
            metadata,
          },
        ],
      },
    ],
  });
  const initial = engine.getState();
  metadata.values[0].count = 99;
  expect(initial.tracks[0].clips[0].metadata).toEqual({
    values: [{ count: 1 }],
    optional: undefined,
    empty: null,
  });
  expect(Object.isFrozen(initial.tracks[0].clips[0].metadata?.values)).toBe(true);
  engine.updateClipProperties('clip', { label: 'changed' });
  engine.undo();
  expect(engine.getState().tracks[0].clips[0].metadata).toEqual(
    initial.tracks[0].clips[0].metadata
  );
  engine.redo();
  expect(engine.getState().tracks[0].clips[0].metadata).toEqual(
    initial.tracks[0].clips[0].metadata
  );
});
