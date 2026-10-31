import { TimelineEngine } from '#core/engine';
import * as time from '@techsquidtv/canvas-timeline-utils';
import { afterEach, expect, test, vi } from 'vite-plus/test';

function createEngine() {
  const engine = new TimelineEngine({
    zoomScale: 100,
    tracks: [
      {
        id: 'track',
        kind: 'visual',
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        clips: [
          {
            id: 'clip',
            sourceId: 'source',
            timelineStart: time.fromSeconds(0),
            timelineEnd: time.fromSeconds(5),
            sourceStart: time.fromSeconds(0),
            selected: false,
          },
        ],
      },
    ],
  });
  engine.setViewportWidth(100);
  return engine;
}

afterEach(() => vi.restoreAllMocks());

test('repeated content-bound queries do not scan unchanged clips', () => {
  const engine = createEngine();
  const compare = vi.spyOn(time, 'compareRational');

  expect(engine.maxContentTime).toEqual(time.fromSeconds(5));
  expect(compare).toHaveBeenCalled();
  compare.mockClear();

  for (let index = 0; index < 100; index++) {
    expect(engine.maxContentTime).toEqual(time.fromSeconds(5));
    expect(engine.maxScrollLeft).toBe(400);
    expect(engine.minZoomScale).toBe(20);
  }
  expect(compare).not.toHaveBeenCalled();
});

test('content-change listeners see updated bounds after extending and shrinking content', () => {
  const engine = createEngine();
  expect(engine.maxContentTime).toEqual(time.fromSeconds(5));
  const ends: number[] = [];
  engine.on('content:change', () => ends.push(time.toSeconds(engine.maxContentTime)));

  expect(
    engine.commitEdit({ type: 'move', clipId: 'clip', startTime: time.fromSeconds(5) }).committed
  ).toBe(true);
  engine.updatePlayhead(time.fromSeconds(20));
  expect(engine.getTime()).toEqual(time.fromSeconds(10));

  expect(
    engine.commitEdit({
      type: 'trim',
      clipId: 'clip',
      edge: 'end',
      newTime: time.fromSeconds(8),
    }).committed
  ).toBe(true);
  expect(engine.getTime()).toEqual(time.fromSeconds(8));

  expect(engine.commitEdit({ type: 'delete-clips', clipIds: ['clip'] }).committed).toBe(true);
  expect(time.toSeconds(engine.maxContentTime)).toBe(0);
  expect(time.toSeconds(engine.getTime())).toBe(0);
  expect(ends).toEqual([10, 8, 0]);
});

test('undo and redo clamp zoom and scroll using restored content bounds', () => {
  const engine = createEngine();
  expect(engine.maxContentTime).toEqual(time.fromSeconds(5));
  engine.commitEdit({ type: 'move', clipId: 'clip', startTime: time.fromSeconds(5) });
  engine.setScrollLeft(900);
  expect(engine.scrollLeft).toBe(900);

  engine.undo();
  expect(engine.maxContentTime).toEqual(time.fromSeconds(5));
  expect(engine.scrollLeft).toBe(400);

  engine.setZoomScale(20);
  engine.redo();
  expect(engine.maxContentTime).toEqual(time.fromSeconds(10));
  engine.setScrollLeft(100);
  expect(engine.scrollLeft).toBe(100);
  engine.setZoomScale(10);

  engine.undo();
  expect(engine.zoomScale).toBe(20);
  expect(engine.scrollLeft).toBe(0);
});

test('explicit duration overrides cached bounds and clearing it uses current content', () => {
  const engine = createEngine();
  expect(engine.maxContentTime).toEqual(time.fromSeconds(5));
  engine.setDuration(time.fromSeconds(20));
  expect(engine.maxContentTime).toEqual(time.fromSeconds(20));
  engine.setDuration(time.fromSeconds(12));
  expect(engine.maxContentTime).toEqual(time.fromSeconds(12));
  engine.commitEdit({ type: 'move', clipId: 'clip', startTime: time.fromSeconds(5) });
  expect(engine.maxContentTime).toEqual(time.fromSeconds(12));

  engine.setDuration(undefined);
  expect(engine.maxContentTime).toEqual(time.fromSeconds(10));
  engine.updatePlayhead(time.fromSeconds(20));
  expect(engine.getTime()).toEqual(time.fromSeconds(10));
});

test('returned content bounds cannot mutate cached times or document timing', () => {
  const engine = createEngine();
  Object.assign(engine.maxContentTime, { v: 0 });
  expect(engine.maxContentTime).toEqual(time.fromSeconds(5));
  expect(engine.getState().tracks[0].clips[0].timelineEnd).toEqual(time.fromSeconds(5));

  engine.setDuration(time.fromSeconds(20));
  Object.assign(engine.maxContentTime, { v: 0 });
  expect(engine.maxContentTime).toEqual(time.fromSeconds(20));
  expect(engine.getState().duration).toEqual(time.fromSeconds(20));
});
