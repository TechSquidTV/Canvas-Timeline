import type { TimecodeFrameRate } from '@techsquidtv/canvas-timeline-utils';

export type ProjectFrameRatePresetId =
  | '23.976'
  | '24'
  | '25'
  | '29.97'
  | '30'
  | '50'
  | '59.94'
  | '60';

export interface ProjectFrameRatePreset {
  id: ProjectFrameRatePresetId;
  label: string;
  timecodeFrameRate: TimecodeFrameRate;
  value: number;
}

export const projectFrameRatePresets = [
  createFractionalPreset('23.976', 24_000, 1_001),
  createIntegerPreset('24', 24),
  createIntegerPreset('25', 25),
  createFractionalPreset('29.97', 30_000, 1_001),
  createIntegerPreset('30', 30),
  createIntegerPreset('50', 50),
  createFractionalPreset('59.94', 60_000, 1_001),
  createIntegerPreset('60', 60),
] as const satisfies readonly ProjectFrameRatePreset[];

export const defaultProjectFrameRatePresetId: ProjectFrameRatePresetId = '30';

export function findProjectFrameRatePreset(
  presetId: ProjectFrameRatePresetId
): ProjectFrameRatePreset {
  const preset = projectFrameRatePresets.find((candidate) => candidate.id === presetId);
  if (preset === undefined) {
    throw new RangeError(`Unsupported project frame-rate preset: ${presetId}`);
  }
  return preset;
}

export function getProjectFrameRatePreset(frameRate: number): ProjectFrameRatePreset {
  const preset = projectFrameRatePresets.find((candidate) => Object.is(candidate.value, frameRate));
  if (preset === undefined) {
    throw new RangeError(`Unsupported project frame rate: ${frameRate}`);
  }
  return preset;
}

export function getProjectFrameRatePresetId(frameRate: number): ProjectFrameRatePresetId {
  return getProjectFrameRatePreset(frameRate).id;
}

export function isProjectFrameRatePresetId(value: string): value is ProjectFrameRatePresetId {
  return projectFrameRatePresets.some((preset) => preset.id === value);
}

export function isProjectFrameRate(frameRate: number) {
  return projectFrameRatePresets.some((preset) => Object.is(preset.value, frameRate));
}

export function formatProjectFrameRate(frameRate: number) {
  return `${getProjectFrameRatePreset(frameRate).label} fps`;
}

function createIntegerPreset(
  id: ProjectFrameRatePresetId,
  frameRate: number
): ProjectFrameRatePreset {
  return {
    id,
    label: id,
    timecodeFrameRate: frameRate,
    value: frameRate,
  };
}

function createFractionalPreset(
  id: ProjectFrameRatePresetId,
  numerator: number,
  denominator: number
): ProjectFrameRatePreset {
  return {
    id,
    label: id,
    timecodeFrameRate: { numerator, denominator },
    value: numerator / denominator,
  };
}
