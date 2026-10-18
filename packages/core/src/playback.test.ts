import { TimelineEngine } from '#core/engine';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { afterEach, expect, test, vi } from 'vite-plus/test';

function createPlayback(rate = 24) {
  let frame: FrameRequestCallback = () => {};
  let milliseconds = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => milliseconds);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const engine = new TimelineEngine({
    tracks: [],
    playheadTime: fromSeconds(0, rate),
    duration: fromSeconds(100, rate),
  });
  return {
    engine,
    advance: (seconds: number, frames = 60) => {
      const start = milliseconds;
      for (let index = 1; index <= frames; index++) {
        milliseconds = start + (seconds * 1000 * index) / frames;
        frame(milliseconds);
      }
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test.each([1, 24, 25, 30, 60, 24000])(
  'internal playback retains sub-tick time at %i ticks/second',
  (rate) => {
    const { engine, advance } = createPlayback(rate);
    engine.play();
    advance(10, 600);
    expect(toSeconds(engine.getTime())).toBe(10);
    engine.pause();
  }
);

test('internal playback carries fractional ticks through rate changes and rebases after a seek', () => {
  const { engine, advance } = createPlayback();
  engine.play();
  advance(1);
  engine.setPlaybackRate(0.5);
  advance(1);
  expect(toSeconds(engine.getTime())).toBe(1.5);
  engine.setTime(fromSeconds(10, 24));
  advance(1);
  expect(toSeconds(engine.getTime())).toBe(10.5);
  engine.pause();
  engine.play();
  advance(1);
  expect(toSeconds(engine.getTime())).toBe(11);
  engine.pause();
});

test('internal playback resets fractional carry when looping and stops at an exact target', () => {
  const { engine, advance } = createPlayback();
  engine.setInPoint(fromSeconds(2, 24));
  engine.setOutPoint(fromSeconds(3, 24));
  engine.setTime(fromSeconds(2, 24));
  engine.play({ loop: true });
  advance(1);
  expect(toSeconds(engine.getTime())).toBe(2);
  advance(0.5, 30);
  expect(toSeconds(engine.getTime())).toBe(2.5);
  engine.pause();
  engine.play({ toTime: fromSeconds(2.75, 24) });
  advance(0.5, 30);
  expect(toSeconds(engine.getTime())).toBe(2.75);
  expect(engine.getState().playing).toBe(false);
  engine.pause();
});

test('seeking discards the prior frame remainder', () => {
  const { engine, advance } = createPlayback();
  engine.play();
  advance(0.016, 1);
  engine.setTime(fromSeconds(10, 24));
  advance(0.006, 1);
  expect(toSeconds(engine.getTime())).toBe(10);
  engine.pause();
  engine.play();
  advance(0.016, 1);
  expect(toSeconds(engine.getTime())).toBe(10);
  engine.pause();
});

// Bypass normalization through the mutable event state to exercise the playback guard itself.
test.each([4, 8])(
  'internal looping pauses instead of reseeking an invalid in-point at %s',
  (start) => {
    const { engine, advance } = createPlayback();
    engine.on('state:inOut', ({ state }) => {
      state.inPoint = fromSeconds(start, 24);
    });
    engine.setInOutRange(fromSeconds(2, 24), fromSeconds(4, 24));
    engine.play({ loop: true });
    const onScrub = vi.fn();
    engine.on('playhead:scrub', onScrub);
    advance(5, 1);
    expect(engine.getState().playing).toBe(false);
    expect(toSeconds(engine.getTime())).toBe(4);
    expect(onScrub).toHaveBeenCalledOnce();
    advance(1);
    expect(onScrub).toHaveBeenCalledOnce();
  }
);

test.each([4, 8])(
  'external looping pauses at the boundary for an invalid in-point at %s',
  (start) => {
    const { engine } = createPlayback();
    engine.on('state:inOut', ({ state }) => {
      state.inPoint = fromSeconds(start, 24);
    });
    engine.setInOutRange(fromSeconds(2, 24), fromSeconds(4, 24));
    engine.play({ clock: 'external', loop: true });
    expect(engine.updateExternalPlaybackTime(fromSeconds(5, 24))).toEqual({
      action: 'pause',
      reason: 'in-out',
      time: fromSeconds(4, 24),
    });
    expect(engine.getState().playing).toBe(false);
  }
);

test.each(['in', 'out'] as const)(
  'loop playback advances after crossing the %s boundary',
  (boundary) => {
    const { engine, advance } = createPlayback();
    if (boundary === 'in') {
      engine.setOutPoint(fromSeconds(4, 24));
      engine.setInPoint(fromSeconds(8, 24));
    } else {
      engine.setInPoint(fromSeconds(8, 24));
      engine.setOutPoint(fromSeconds(4, 24));
    }
    engine.setTime(fromSeconds(8, 24));
    engine.play({ loop: true });
    const scrubTimes: number[] = [];
    engine.on('playhead:scrub', (time) => scrubTimes.push(toSeconds(time)));
    advance(1, 24);
    expect(toSeconds(engine.getTime())).toBe(9);
    expect(scrubTimes).toHaveLength(24);
    expect(new Set(scrubTimes).size).toBe(scrubTimes.length);
    engine.pause();
  }
);
