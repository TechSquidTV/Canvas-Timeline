import { describe, expect, it } from 'vite-plus/test';
import { fromSeconds } from './time';
import {
  formatRationalTimecode,
  formatTimecode,
  fromTimecodeFrameNumber,
  parseTimecode,
  parseTimecodeToRationalTime,
  resolveTimecodeFrameRate,
  toTimecodeFrameNumber,
} from './timecode';

describe('timecode utilities', () => {
  it('formats decimal timecode with centisecond precision', () => {
    expect(formatTimecode(7425)).toBe('2:03:45.00');
    expect(formatTimecode(0)).toBe('0:00.00');
    expect(formatTimecode(0.1)).toBe('0:00.10');
    expect(formatTimecode(0.105)).toBe('0:00.11');
    expect(formatTimecode(Number.NaN)).toBe('0:00.00');
    expect(formatTimecode(-1)).toBe('0:00.00');
  });

  it('formats decimal timecode with an explicit output shape', () => {
    expect(formatTimecode(62.5, { format: 'auto' })).toBe('1:02.50');
    expect(formatTimecode(62.5, { format: 'seconds' })).toBe('62.50');
    expect(formatTimecode(62.5, { format: 'minutes' })).toBe('1:02.50');
    expect(formatTimecode(62.5, { format: 'hours' })).toBe('0:01:02.50');
    expect(formatTimecode(3723.04, { format: 'minutes' })).toBe('62:03.04');
  });

  it('parses flexible decimal timecode input', () => {
    expect(parseTimecode('90')).toBe(90);
    expect(parseTimecode('90.5')).toBe(90.5);
    expect(parseTimecode('1:30')).toBe(90);
    expect(parseTimecode('1:2')).toBe(62);
    expect(parseTimecode('1:30.25')).toBe(90.25);
    expect(parseTimecode('1:02:03.04')).toBe(3723.04);
    expect(parseTimecode('90:00')).toBe(5400);
    expect(parseTimecode('0.105')).toBe(0.105);
    expect(parseTimecode('1:30.123456')).toBeCloseTo(90.123456, 12);
    expect(parseTimecode('1:02:03.4567')).toBeCloseTo(3723.4567, 12);
    expect(parseTimecode(' 1 : 30 ')).toBe(90);
    expect(parseTimecode('1 : 02 : 03.04')).toBe(3723.04);
  });

  it('parses values with unit suffixes', () => {
    expect(parseTimecode('60s')).toBe(60);
    expect(parseTimecode('60 s')).toBe(60);
    expect(parseTimecode('1.5s')).toBe(1.5);
    expect(parseTimecode('500ms')).toBe(0.5);
    expect(parseTimecode('500 ms')).toBe(0.5);
    expect(parseTimecode('2m')).toBe(120);
    expect(parseTimecode('2 min')).toBe(120);
    expect(parseTimecode('1h')).toBe(3600);
    expect(parseTimecode('1.5 h')).toBe(5400);
    expect(parseTimecode('2 hours')).toBe(7200);
    expect(parseTimecode('24f', { frameRate: 24 })).toBe(1);
    expect(parseTimecode('12 f', { frameRate: 24 })).toBe(0.5);
    expect(parseTimecode('24f')).toBeNull();

    // Compound unit entries
    expect(parseTimecode('1h20m')).toBe(4800);
    expect(parseTimecode('1h 20m')).toBe(4800);
    expect(parseTimecode('1H20M')).toBe(4800);
    expect(parseTimecode('1h 20m 30s')).toBe(4830);
    expect(parseTimecode('1m 30s')).toBe(90);
    expect(parseTimecode('1m30s 500ms')).toBe(90.5);
    expect(parseTimecode('1m 30f', { frameRate: 30 })).toBe(61);

    // Safety rejections
    expect(parseTimecode('1h 20m invalid')).toBeNull();
    expect(parseTimecode('1h 20')).toBeNull();
    expect(parseTimecode('1.s')).toBeNull();
    expect(parseTimecode('1m30s500msx')).toBeNull();
    expect(parseTimecode(`${'9'.repeat(2_000)}msx`)).toBeNull();
  });

  it('optionally rounds parsed input to centiseconds', () => {
    expect(parseTimecode('0.105', { rounding: 'centisecond' })).toBe(0.11);
    expect(parseTimecode('1:30.105', { rounding: 'centisecond' })).toBe(90.11);
    expect(parseTimecode('1:02:03.4567', { rounding: 'centisecond' })).toBe(3723.46);
  });

  it('rejects malformed decimal timecode input', () => {
    expect(parseTimecode('')).toBeNull();
    expect(parseTimecode('-1')).toBeNull();
    expect(parseTimecode('1:')).toBeNull();
    expect(parseTimecode(':30')).toBeNull();
    expect(parseTimecode('1::30')).toBeNull();
    expect(parseTimecode('1:02:03:04')).toBeNull();
    expect(parseTimecode('1:60')).toBeNull();
    expect(parseTimecode('1:02:60')).toBeNull();
    expect(parseTimecode('1:60:00')).toBeNull();
  });

  it('formats and parses non-drop frame timecode', () => {
    expect(formatTimecode(90.5, { frameRate: 24 })).toBe('00:01:30:12');
    expect(formatTimecode(1, { frameRate: 30 })).toBe('00:00:01:00');
    expect(formatTimecode(1 - 1 / 60, { frameRate: 60 })).toBe('00:00:00:59');

    expect(parseTimecode('00:01:30:12', { frameRate: 24 })).toBe(90.5);
    expect(parseTimecode('00:00:01:00', { frameRate: 30 })).toBe(1);
    expect(parseTimecode('00:00:00:59', { frameRate: 60 })).toBeCloseTo(59 / 60, 12);
  });

  it('resolves frame-rate options through the shared timecode validation path', () => {
    expect(resolveTimecodeFrameRate(24)).toBe(24);
    expect(resolveTimecodeFrameRate({ numerator: 30000, denominator: 1001 })).toBeCloseTo(
      30000 / 1001,
      12
    );
    expect(() => resolveTimecodeFrameRate(0)).toThrow(RangeError);
    expect(() => resolveTimecodeFrameRate({ numerator: 24, denominator: 0 })).toThrow(RangeError);
  });

  it('formats and parses exact fractional frame rates', () => {
    const frameRate = { numerator: 24000, denominator: 1001 };

    expect(formatTimecode(1001 / 24000, { frameRate })).toBe('00:00:00:01');
    expect(formatTimecode(1001 / 1000, { frameRate })).toBe('00:00:01:00');
    expect(parseTimecode('00:00:01:00', { frameRate })).toBeCloseTo(1001 / 1000, 12);
  });

  it('formats and parses 29.97 drop-frame timecode', () => {
    const frameRate = { numerator: 30000, denominator: 1001 };

    expect(formatTimecode(1800 / (30000 / 1001), { frameRate, dropFrame: true })).toBe(
      '00:01:00;02'
    );
    expect(formatTimecode(17982 / (30000 / 1001), { frameRate, dropFrame: true })).toBe(
      '00:10:00;00'
    );
    expect(parseTimecode('00:01:00;02', { frameRate, dropFrame: true })).toBeCloseTo(
      1800 / (30000 / 1001),
      12
    );
    expect(parseTimecode('00:01:00;00', { frameRate, dropFrame: true })).toBeNull();
  });

  it('formats and parses 59.94 drop-frame timecode', () => {
    const frameRate = { numerator: 60000, denominator: 1001 };

    expect(formatTimecode(3600 / (60000 / 1001), { frameRate, dropFrame: true })).toBe(
      '00:01:00;04'
    );
    expect(parseTimecode('00:01:00;04', { frameRate, dropFrame: true })).toBeCloseTo(
      3600 / (60000 / 1001),
      12
    );
  });

  it('throws for invalid developer frame options', () => {
    expect(() => formatTimecode(0, { frameRate: 24, dropFrame: true })).toThrow(RangeError);
    expect(() => parseTimecode('00:00:00;00', { frameRate: 24, dropFrame: true })).toThrow(
      RangeError
    );
    expect(() => formatTimecode(0, { format: 'frames' })).toThrow(RangeError);
    expect(() => parseTimecode('00:00:00:00', { frameRate: 0 })).toThrow(RangeError);
  });

  it('converts between rational time and frame numbers', () => {
    expect(toTimecodeFrameNumber(fromSeconds(0.5, 24000), 24)).toBe(12);
    expect(fromTimecodeFrameNumber(12, 24, 24000)).toEqual({ v: 12000, r: 24000 });
    expect(formatRationalTimecode(fromSeconds(90.5, 24000), { frameRate: 24 })).toBe('00:01:30:12');
    expect(parseTimecodeToRationalTime('00:01:30:12', { frameRate: 24, timebase: 24000 })).toEqual({
      v: 2172000,
      r: 24000,
    });
    expect(parseTimecodeToRationalTime('1h20m', { timebase: 24000 })).toEqual({
      v: 4800 * 24000,
      r: 24000,
    });
    expect(parseTimecodeToRationalTime('1.5s', { timebase: 24000 })).toEqual({
      v: 1.5 * 24000,
      r: 24000,
    });
  });
});
