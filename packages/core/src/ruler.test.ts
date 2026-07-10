import { describe, expect, it } from 'vite-plus/test';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { getTimelineRulerTicks } from '#core/ruler';
import { expectDefined } from '#test-utils/assertions';

describe('getTimelineRulerTicks', () => {
  it('returns second ruler ticks with major labels and minor subdivisions', () => {
    const ticks = getTimelineRulerTicks({
      duration: fromSeconds(15),
      format: 'seconds',
      scrollLeft: 0,
      viewportWidth: 200,
      zoomScale: 50,
    });

    expect(ticks.map(({ kind, label, x }) => ({ kind, label, x })).slice(0, 5)).toEqual([
      { kind: 'major', label: '00:00', x: 0 },
      { kind: 'medium', label: undefined, x: 25 },
      { kind: 'major', label: '00:01', x: 50 },
      { kind: 'medium', label: undefined, x: 75 },
      { kind: 'major', label: '00:02', x: 100 },
    ]);
  });

  it('clamps ticks to duration and shifts positions by scroll offset', () => {
    const ticks = getTimelineRulerTicks({
      duration: fromSeconds(1.25),
      format: 'seconds',
      scrollLeft: 25,
      viewportWidth: 500,
      zoomScale: 100,
    });

    expect(ticks[0]).toMatchObject({
      kind: 'minor',
      x: -5,
    });
    expect(toSeconds(ticks[0].time)).toBeCloseTo(0.2);
    expect(ticks[ticks.length - 1].seconds).toBeCloseTo(1.2);
    expect(ticks.every((tick) => tick.seconds <= 1.25)).toBe(true);
  });

  it('returns frame-aware ruler ticks with frame-number labels', () => {
    const ticks = getTimelineRulerTicks({
      duration: fromSeconds(15),
      format: 'frame-number',
      frameRate: 24,
      scrollLeft: 0,
      viewportWidth: 200,
      zoomScale: 50,
    });
    const majorTicks = ticks.filter((tick) => tick.kind === 'major');

    expect(majorTicks.map((tick) => tick.label).slice(0, 5)).toEqual(['0', '24', '48', '72', '96']);
    expect(ticks[1]).toMatchObject({
      frame: 4,
      kind: 'minor',
    });
  });

  it('aligns frame subticks to an even subdivision of each major interval', () => {
    const ticks = getTimelineRulerTicks({
      duration: fromSeconds(2),
      format: 'timecode',
      frameRate: 30,
      scrollLeft: 0,
      viewportWidth: 100,
      zoomScale: 150,
    });

    expect(ticks.map((tick) => tick.frame)).toEqual([0, 3, 6, 9, 12, 15, 18]);
    expect(ticks.find((tick) => tick.frame === 15)).toMatchObject({ kind: 'major' });
  });

  it('preserves frame labels when subticks share the major cadence', () => {
    const ticks = getTimelineRulerTicks({
      duration: fromSeconds(20),
      format: 'frame-number',
      frameRate: 24,
      scrollLeft: 0,
      viewportWidth: 70,
      zoomScale: 7,
    });

    expect(ticks.find((tick) => tick.frame === 240)).toMatchObject({
      kind: 'major',
      label: '240',
    });
    expect(ticks.map((tick) => tick.frame)).toEqual([0, 30, 60, 90, 120, 150, 180, 210, 240]);
  });

  it('returns frame-aware ruler ticks with timecode labels', () => {
    const ticks = getTimelineRulerTicks({
      duration: fromSeconds(2),
      format: 'timecode',
      frameRate: 24,
      scrollLeft: 0,
      viewportWidth: 100,
      zoomScale: 50,
    });

    expect(ticks.find((tick) => tick.kind === 'major')?.label).toBe('00:00:00:00');
  });

  it('supports drop-frame numbering without duplicating the ruler frame rate', () => {
    const ticks = getTimelineRulerTicks({
      duration: fromSeconds(2),
      format: 'timecode',
      frameRate: { numerator: 30000, denominator: 1001 },
      scrollLeft: 0,
      timecodeFormatOptions: { dropFrame: true },
      viewportWidth: 100,
      zoomScale: 50,
    });

    expect(ticks.find((tick) => tick.kind === 'major')?.label).toBe('00:00:00;00');
  });

  it('keeps full timecode labels spaced apart at the full editor default zoom', () => {
    const ticks = getTimelineRulerTicks({
      duration: fromSeconds(36),
      format: 'timecode',
      frameRate: 30,
      scrollLeft: 0,
      viewportWidth: 500,
      zoomScale: 38,
    });
    const majorTicks = ticks.filter((tick) => tick.kind === 'major');

    expect(majorTicks.map((tick) => tick.label).slice(0, 3)).toEqual([
      '00:00:00:00',
      '00:00:02:00',
      '00:00:04:00',
    ]);
    expect(
      majorTicks
        .slice(1)
        .every(
          (tick, index) => tick.x - expectDefined(majorTicks[index], `major tick ${index}`).x >= 72
        )
    ).toBe(true);
  });

  it('honors a custom minimum major tick spacing', () => {
    const ticks = getTimelineRulerTicks({
      duration: fromSeconds(15),
      format: 'frame-number',
      frameRate: 24,
      minimumMajorTickSpacing: 100,
      scrollLeft: 0,
      viewportWidth: 200,
      zoomScale: 50,
    });

    expect(
      ticks
        .filter((tick) => tick.kind === 'major')
        .map((tick) => tick.label)
        .slice(0, 2)
    ).toEqual(['0', '48']);
  });

  it('applies custom minimum spacing to second-based rulers', () => {
    const ticks = getTimelineRulerTicks({
      duration: fromSeconds(15),
      format: 'seconds',
      minimumMajorTickSpacing: 120,
      scrollLeft: 0,
      viewportWidth: 500,
      zoomScale: 50,
    });

    expect(
      ticks
        .filter((tick) => tick.kind === 'major')
        .map((tick) => tick.label)
        .slice(0, 2)
    ).toEqual(['00:00', '00:05']);
  });

  it('can omit labels while preserving tick geometry', () => {
    const ticks = getTimelineRulerTicks({
      format: 'seconds',
      includeLabels: false,
      scrollLeft: 0,
      viewportWidth: 100,
      zoomScale: 50,
    });

    expect(ticks.some((tick) => tick.kind === 'major')).toBe(true);
    expect(ticks.every((tick) => tick.label === undefined)).toBe(true);
  });

  it('derives major frame intervals from the project rate', () => {
    const ticks = getTimelineRulerTicks({
      duration: fromSeconds(4),
      format: 'frame-number',
      frameRate: 24,
      minimumMajorTickSpacing: 51,
      scrollLeft: 0,
      viewportWidth: 220,
      zoomScale: 48,
    });

    expect(
      ticks
        .filter((tick) => tick.kind === 'major')
        .map((tick) => tick.frame)
        .slice(0, 3)
    ).toEqual([0, 48, 96]);
  });

  it('adds a medium visual tier without disturbing the minor cadence', () => {
    const ticks = getTimelineRulerTicks({
      duration: fromSeconds(1),
      format: 'timecode',
      frameRate: 30,
      scrollLeft: 0,
      viewportWidth: 80,
      zoomScale: 80,
    });

    expect(ticks.map(({ frame, kind }) => ({ frame, kind }))).toEqual([
      { frame: 0, kind: 'major' },
      { frame: 3, kind: 'minor' },
      { frame: 6, kind: 'minor' },
      { frame: 9, kind: 'minor' },
      { frame: 12, kind: 'minor' },
      { frame: 15, kind: 'medium' },
      { frame: 18, kind: 'minor' },
      { frame: 21, kind: 'minor' },
      { frame: 24, kind: 'minor' },
      { frame: 27, kind: 'minor' },
      { frame: 30, kind: 'major' },
    ]);
  });
});
