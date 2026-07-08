import { describe, expect, it } from 'vite-plus/test';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { getTimelineRulerTicks } from '#core/ruler';

describe('getTimelineRulerTicks', () => {
  it('returns second ruler ticks with major labels and minor subdivisions', () => {
    const ticks = getTimelineRulerTicks({
      duration: fromSeconds(15),
      scrollLeft: 0,
      viewportWidth: 200,
      zoomScale: 50,
    });

    expect(ticks.map(({ kind, label, x }) => ({ kind, label, x })).slice(0, 5)).toEqual([
      { kind: 'major', label: '00:00', x: 0 },
      { kind: 'minor', label: undefined, x: 25 },
      { kind: 'major', label: '00:01', x: 50 },
      { kind: 'minor', label: undefined, x: 75 },
      { kind: 'major', label: '00:02', x: 100 },
    ]);
  });

  it('clamps ticks to duration and shifts positions by scroll offset', () => {
    const ticks = getTimelineRulerTicks({
      duration: fromSeconds(1.25),
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
      frameRate: 24,
      labelFormat: 'frame-number',
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

  it('preserves frame labels when minor ticks do not align to major frames', () => {
    const ticks = getTimelineRulerTicks({
      duration: fromSeconds(20),
      frameRate: 24,
      labelFormat: 'frame-number',
      scrollLeft: 0,
      viewportWidth: 70,
      zoomScale: 7,
    });

    expect(ticks.find((tick) => tick.frame === 200)).toMatchObject({
      kind: 'major',
      label: '200',
    });
  });

  it('returns frame-aware ruler ticks with timecode labels', () => {
    const ticks = getTimelineRulerTicks({
      duration: fromSeconds(2),
      frameRate: 24,
      scrollLeft: 0,
      viewportWidth: 100,
      zoomScale: 50,
    });

    expect(ticks.find((tick) => tick.kind === 'major')?.label).toBe('00:00:00:00');
  });

  it('can omit labels while preserving tick geometry', () => {
    const ticks = getTimelineRulerTicks({
      includeLabels: false,
      scrollLeft: 0,
      viewportWidth: 100,
      zoomScale: 50,
    });

    expect(ticks.some((tick) => tick.kind === 'major')).toBe(true);
    expect(ticks.every((tick) => tick.label === undefined)).toBe(true);
  });
});
