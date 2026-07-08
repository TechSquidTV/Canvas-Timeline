import { describe, expect, it } from 'vite-plus/test';
import {
  addRational,
  assertValidRationalTime,
  fromSeconds,
  subRational,
  toSeconds,
} from '#utils/time';

describe('rational time utilities', () => {
  it('rejects invalid rational times with field-specific messages', () => {
    expect(() => assertValidRationalTime({ v: Number.NaN, r: 24000 }, 'playheadTime')).toThrow(
      'playheadTime.v must be a finite integer tick value.'
    );
    expect(() => assertValidRationalTime({ v: 1, r: 0 }, 'clip.timelineStart')).toThrow(
      'clip.timelineStart.r must be a positive finite tick rate.'
    );
  });

  it('rejects invalid seconds and rates before creating rational time', () => {
    expect(() => fromSeconds(Number.POSITIVE_INFINITY)).toThrow(
      'sec must be a finite number of seconds.'
    );
    expect(() => fromSeconds(1, 0)).toThrow('rate must be a positive finite tick rate.');
  });

  it('validates operands used by rational arithmetic', () => {
    expect(() => toSeconds({ v: 0.5, r: 24000 })).toThrow(
      'RationalTime.v must be a finite integer tick value.'
    );
    expect(() => addRational(fromSeconds(1), { v: 1, r: Number.NaN })).toThrow(
      'b.r must be a positive finite tick rate.'
    );
  });

  it('uses the least common tick rate for mixed-rate arithmetic', () => {
    const timelineTime = fromSeconds(6.5);
    const dragTime = fromSeconds(6.25, 24000);

    const delta = subRational(dragTime, timelineTime);
    const moved = addRational(timelineTime, delta);

    expect(delta.r).toBe(120000);
    expect(moved.r).toBe(120000);
    expect(toSeconds(moved)).toBeCloseTo(6.25);
  });
});
