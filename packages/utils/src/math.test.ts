import { describe, expect, it } from 'vite-plus/test';
import { clamp, round } from './math';

describe('math utilities', () => {
  it('clamps values to inclusive bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('rounds values to the requested decimal precision', () => {
    expect(round(12.5)).toBe(13);
    expect(round(12.345, 2)).toBe(12.35);
    expect(round(12.344, 2)).toBe(12.34);
    expect(round(-1.235, 2)).toBe(-1.24);
  });
});
