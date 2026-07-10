import { describe, expect, it } from 'vite-plus/test';
import {
  defaultProjectFrameRatePresetId,
  findProjectFrameRatePreset,
  formatProjectFrameRate,
  getProjectFrameRatePreset,
  isProjectFrameRate,
  projectFrameRatePresets,
} from '#full-editor/project/frame-rate';

describe('project frame-rate presets', () => {
  it('provides the supported rates with 30 fps as the default', () => {
    expect(defaultProjectFrameRatePresetId).toBe('30');
    expect(projectFrameRatePresets.map((preset) => preset.id)).toEqual([
      '23.976',
      '24',
      '25',
      '29.97',
      '30',
      '50',
      '59.94',
      '60',
    ]);
  });

  it('retains exact rational definitions for fractional APIs', () => {
    expect(findProjectFrameRatePreset('23.976')).toMatchObject({
      timecodeFrameRate: { numerator: 24_000, denominator: 1_001 },
      value: 24_000 / 1_001,
    });
    expect(findProjectFrameRatePreset('29.97')).toMatchObject({
      timecodeFrameRate: { numerator: 30_000, denominator: 1_001 },
      value: 30_000 / 1_001,
    });
    expect(findProjectFrameRatePreset('59.94')).toMatchObject({
      timecodeFrameRate: { numerator: 60_000, denominator: 1_001 },
      value: 60_000 / 1_001,
    });
  });

  it('maps persisted numeric values back to their preset definitions', () => {
    expect(getProjectFrameRatePreset(30_000 / 1_001).id).toBe('29.97');
    expect(isProjectFrameRate(60)).toBe(true);
    expect(isProjectFrameRate(48)).toBe(false);
    expect(formatProjectFrameRate(30_000 / 1_001)).toBe('29.97 fps');
  });
});
