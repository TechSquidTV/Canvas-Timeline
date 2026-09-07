import { TimelineEngine } from '#core/engine';
import { createTimelineScalarKeyframeProperty } from '#core/keyframes';
import type {
  Clip,
  TimelineKeyframe,
  TimelineKeyframeEditCommand,
  TimelineKeyframeInterpolation,
} from '#core/types';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { describe, expect, it, vi } from 'vite-plus/test';

const property = createTimelineScalarKeyframeProperty({
  id: 'level',
  min: 0,
  max: 1,
  defaultValue: 0,
});
function createEngine(mode: TimelineKeyframeInterpolation = 'bezier', values = [0.2, 0.8]) {
  const keys: TimelineKeyframe[] = [
    {
      id: 'a',
      property: 'level',
      time: fromSeconds(0),
      value: values[0],
      outgoing: { interpolation: mode, handle: { x: 0.15, y: 0.9 } },
    },
    {
      id: 'b',
      property: 'level',
      time: fromSeconds(10),
      value: values[1],
      incoming: { interpolation: mode, handle: { x: 0.7, y: 0.1 } },
    },
  ];
  const clip: Clip = {
    id: 'clip',
    sourceId: 'source',
    timelineStart: fromSeconds(0),
    timelineEnd: fromSeconds(10),
    sourceStart: fromSeconds(0),
    selected: true,
    keyframes: keys,
  };
  return new TimelineEngine({
    tracks: [
      {
        id: 'track',
        kind: 'visual',
        clips: [clip],
        selected: true,
        locked: false,
        muted: false,
        visible: true,
      },
    ],
    keyframeProperties: [property],
    zoomScale: 100,
  });
}
const sample = (engine: TimelineEngine, seconds: number, clipId = 'clip') =>
  engine.keyframes.getClipPropertyValueAtTime(clipId, 'level', fromSeconds(seconds));

describe.each(['linear', 'hold', 'bezier'] as const)('%s curve preservation', (mode) => {
  it('inserts an evaluated key without changing any surrounding sample', () => {
    const engine = createEngine(mode);
    const before = Array.from({ length: 101 }, (_, i) => sample(engine, i / 10));
    engine.keyframes.setClipKeyframe({
      clipId: 'clip',
      property: 'level',
      time: fromSeconds(3.7),
      value: sample(engine, 3.7) ?? 0,
    });
    before.forEach((value, i) => expect(sample(engine, i / 10)).toBeCloseTo(value ?? 0, 8));
  });
  it('preserves retained samples across trim and split, including the boundary', () => {
    const engine = createEngine(mode);
    const before = Array.from({ length: 101 }, (_, i) => sample(engine, i / 10));
    expect(
      engine.commitEdit({
        type: 'trim',
        clipId: 'clip',
        edge: 'start',
        newTime: fromSeconds(2.3),
        snap: false,
      }).committed
    ).toBe(true);
    expect(
      engine.commitEdit({ type: 'split', clipIds: ['clip'], time: fromSeconds(6.1) }).committed
    ).toBe(true);
    for (const clip of engine.tracks[0].clips) {
      for (let i = 23; i <= 100; i++) {
        if (i / 10 >= toSeconds(clip.timelineStart) && i / 10 <= toSeconds(clip.timelineEnd)) {
          expect(sample(engine, i / 10, clip.id)).toBeCloseTo(before[i] ?? 0, 8);
        }
      }
    }
    engine.undo();
    engine.undo();
    expect(engine.keyframes.getClipKeyframes('clip')).toHaveLength(2);
  });
});

it('retains constant extrapolation when a trim removes every original key', () => {
  const engine = createEngine('linear');
  engine.keyframes.updateClipKeyframe({ clipId: 'clip', keyframeId: 'a', time: fromSeconds(2) });
  engine.keyframes.updateClipKeyframe({ clipId: 'clip', keyframeId: 'b', time: fromSeconds(4) });
  engine.commitEdit({
    type: 'trim',
    clipId: 'clip',
    edge: 'start',
    newTime: fromSeconds(5),
    snap: false,
  });
  expect(sample(engine, 7)).toBe(0.8);
});

it('keeps previews outside persisted state and cancels without history', () => {
  const engine = createEngine();
  const before = engine.getState().tracks;
  const command: TimelineKeyframeEditCommand = {
    type: 'keyframes',
    edits: [{ type: 'update', clipId: 'clip', keyframeId: 'a', value: 0.7 }],
  };
  expect(engine.previewEdit(command).valid).toBe(true);
  expect(engine.keyframes.getClipKeyframes('clip')[0].value).toBe(0.7);
  expect(engine.getState().tracks).toBe(before);
  expect(engine.canUndo).toBe(false);
  engine.cancelEdit();
  expect(engine.keyframes.getClipKeyframes('clip')[0].value).toBe(0.2);
  engine.previewEdit(command);
  engine.commitEdit(command);
  engine.undo();
  expect(engine.keyframes.getClipKeyframes('clip')[0].value).toBe(0.2);
  expect(engine.canUndo).toBe(false);
  engine.redo();
  expect(engine.keyframes.getClipKeyframes('clip')[0].value).toBe(0.7);
});

it('rejects invalid input and collisions atomically, without hidden mutations or events', () => {
  const engine = createEngine();
  const before = engine.getState().tracks;
  const changed = vi.fn();
  engine.on('keyframe:update', changed);
  expect(() =>
    engine.keyframes.updateClipKeyframe({
      clipId: 'clip',
      keyframeId: 'a',
      time: fromSeconds(10),
      value: NaN,
    })
  ).toThrow();
  expect(engine.getState().tracks).toBe(before);
  const invalid = engine.commitEdit({
    type: 'keyframes',
    edits: [
      { type: 'update', clipId: 'clip', keyframeId: 'a', value: 0.4 },
      {
        type: 'sides',
        clipId: 'clip',
        keyframeId: 'b',
        incoming: { interpolation: 'bezier', handle: { x: Infinity, y: 0.2 } },
      },
    ],
  });
  expect(invalid.committed).toBe(false);
  expect(engine.getState().tracks).toBe(before);
  expect(
    engine.keyframes.updateClipKeyframe({ clipId: 'clip', keyframeId: 'a', time: fromSeconds(10) })
  ).toBeNull();
  expect(engine.keyframes.getClipKeyframes('clip')).toHaveLength(2);
  expect(changed).not.toHaveBeenCalled();
  expect(engine.canUndo).toBe(false);
});

it('moves a selected group atomically, permits swaps, and keeps copy/paste independent', () => {
  const engine = createEngine();
  engine.keyframes.selectKeyframes([{ clipId: 'clip', keyframeId: 'a' }]);
  engine.keyframes.selectKeyframes([{ clipId: 'clip', keyframeId: 'b' }], 'add');
  expect(engine.keyframes.getSelectedKeyframes()).toHaveLength(2);
  const command: TimelineKeyframeEditCommand = {
    type: 'keyframes',
    edits: [
      { type: 'update', clipId: 'clip', keyframeId: 'a', time: fromSeconds(3) },
      { type: 'update', clipId: 'clip', keyframeId: 'b', time: fromSeconds(6) },
    ],
  };
  engine.commitEdit(command);
  const copied = engine.keyframes.copyKeyframes();
  expect(copied.entries.map((entry) => toSeconds(entry.keyframe.time))).toEqual([0, 3]);
  expect(engine.canPasteSelection).toBe(false);
  expect(
    engine.commitEdit(engine.keyframes.createPasteCommand(copied, fromSeconds(4))).committed
  ).toBe(true);
  expect(engine.keyframes.getClipKeyframes('clip').map((key) => toSeconds(key.time))).toEqual([
    3, 4, 6, 7,
  ]);
  engine.undo();
  expect(engine.keyframes.getClipKeyframes('clip')).toHaveLength(2);
  expect(
    engine.commitEdit(engine.keyframes.createPasteCommand(copied, fromSeconds(3))).committed
  ).toBe(false);
  expect(
    engine.commitEdit(engine.keyframes.createPasteCommand(copied, fromSeconds(9))).committed
  ).toBe(false);
  expect(engine.keyframes.getClipKeyframes('clip')).toHaveLength(2);
  expect(
    engine.commitEdit({
      type: 'keyframes',
      edits: [
        { type: 'update', clipId: 'clip', keyframeId: 'a', time: fromSeconds(6) },
        { type: 'update', clipId: 'clip', keyframeId: 'b', time: fromSeconds(3) },
      ],
    }).committed
  ).toBe(true);
  expect(engine.keyframes.getClipKeyframes('clip')[0].id).toBe('b');
});

it('supports curves between equal-valued keys and linked tangents across unequal durations', () => {
  const engine = createEngine('bezier', [0.5, 0.5]);
  engine.keyframes.updateClipKeyframeSide({
    clipId: 'clip',
    keyframeId: 'b',
    side: 'incoming',
    patch: { handle: { x: 0.7, y: 0.9 } },
  });
  expect(sample(engine, 5)).toBeGreaterThan(0.7);
  const middle = engine.keyframes.setClipKeyframe({
    clipId: 'clip',
    property: 'level',
    time: fromSeconds(4),
    value: 0.5,
  });
  expect(middle).not.toBeNull();
  if (!middle) {
    return;
  }
  engine.keyframes.updateClipKeyframe({
    clipId: 'clip',
    keyframeId: middle.id,
    tangentMode: 'linked',
  });
  engine.keyframes.updateClipKeyframeSide({
    clipId: 'clip',
    keyframeId: middle.id,
    side: 'outgoing',
    patch: { interpolation: 'bezier', handle: { x: 0.3, y: 0.7 } },
  });
  const key = engine.keyframes
    .getClipKeyframes('clip')
    .find((candidate) => candidate.id === middle.id);
  const incoming = key?.incoming?.handle;
  const outgoing = key?.outgoing?.handle;
  expect(incoming).toBeDefined();
  expect(outgoing).toBeDefined();
  if (incoming && outgoing) {
    expect((0.5 - incoming.y) / (4 * (1 - incoming.x))).toBeCloseTo(
      (outgoing.y - 0.5) / (6 * outgoing.x),
      8
    );
  }
});

it('pastes complete Bezier shapes without later insertion overwriting copied handles', () => {
  const engine = createEngine();
  engine.keyframes.updateClipKeyframe({ clipId: 'clip', keyframeId: 'a', time: fromSeconds(1) });
  engine.keyframes.updateClipKeyframe({ clipId: 'clip', keyframeId: 'b', time: fromSeconds(2) });
  const copied = engine.keyframes.copyKeyframes([
    { clipId: 'clip', keyframeId: 'a' },
    { clipId: 'clip', keyframeId: 'b' },
  ]);
  const before = Array.from({ length: 11 }, (_, i) => sample(engine, 1 + i / 10));
  engine.keyframes.setClipKeyframe({
    clipId: 'clip',
    property: 'level',
    time: fromSeconds(10),
    value: 0.1,
  });
  const result = engine.commitEdit(engine.keyframes.createPasteCommand(copied, fromSeconds(5)));
  expect(result.committed).toBe(true);
  before.forEach((value, i) => expect(sample(engine, 5 + i / 10)).toBeCloseTo(value ?? 0, 8));
  const keys = engine.keyframes.getClipKeyframes('clip');
  expect(keys.find((key) => toSeconds(key.time) === 5)?.outgoing).toEqual(
    copied.entries[0].keyframe.outgoing
  );
});

it('keeps allocated key identities stable between repeated previews and commit', () => {
  const engine = createEngine();
  const command: TimelineKeyframeEditCommand = {
    type: 'keyframes',
    edits: [{ type: 'set', clipId: 'clip', property: 'level', time: fromSeconds(5), value: 0.5 }],
  };
  const first = engine.previewEdit(command).changedClips[0].keyframes?.[1].id;
  expect(engine.previewEdit(command).changedClips[0].keyframes?.[1].id).toBe(first);
  engine.commitEdit(command);
  expect(engine.keyframes.getClipKeyframes('clip')[1].id).toBe(first);
});

it('keeps bounded flat Bezier curves inside the property range despite floating-point roundoff', () => {
  const engine = createEngine('bezier', [1, 1]);
  engine.commitEdit({
    type: 'keyframes',
    edits: [
      {
        type: 'update',
        clipId: 'clip',
        keyframeId: 'a',
        outgoing: { interpolation: 'bezier', handle: { x: 0.15, y: 1 } },
      },
      {
        type: 'update',
        clipId: 'clip',
        keyframeId: 'b',
        incoming: { interpolation: 'bezier', handle: { x: 0.7, y: 1 } },
      },
    ],
  });
  for (let i = 1; i < 1000; i++) {
    expect(sample(engine, i / 100)).toBeCloseTo(1, 12);
  }
});
