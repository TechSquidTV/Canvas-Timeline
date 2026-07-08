import {
  formatTime,
  formatTimecode,
  fromSeconds,
  resolveTimecodeFrameRate,
  toSeconds,
} from '@techsquidtv/canvas-timeline-utils';
import type { TimelineRulerTick, TimelineRulerTickOptions } from '#core/types';

const minMajorTickSpacing = 50;
const minFrameSubtickSpacing = 8;
const secondTickIntervals = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];

function getSecondTickInterval(zoomScale: number) {
  for (const interval of secondTickIntervals) {
    if (interval * zoomScale >= minMajorTickSpacing) {
      return interval;
    }
  }

  return secondTickIntervals[secondTickIntervals.length - 1];
}

function getSecondSubTickCount(pxPerTick: number) {
  if (pxPerTick >= 200) {
    return 10;
  }
  if (pxPerTick >= 100) {
    return 5;
  }
  if (pxPerTick >= 40) {
    return 2;
  }
  return 1;
}

function getFrameTickInterval(frameRate: number, zoomScale: number) {
  const pxPerFrame = zoomScale / frameRate;
  const minFramesPerTick = Math.max(1, Math.ceil(minMajorTickSpacing / pxPerFrame));
  const nominalFrameRate = Math.max(1, Math.round(frameRate));
  const candidates = new Set<number>([
    1,
    2,
    5,
    10,
    12,
    15,
    24,
    25,
    30,
    50,
    60,
    Math.floor(nominalFrameRate / 2),
    nominalFrameRate,
  ]);

  for (const multiplier of [2, 5, 10, 30, 60, 120]) {
    candidates.add(nominalFrameRate * multiplier);
  }

  for (let interval = 100; interval <= 360000; interval *= 10) {
    candidates.add(interval);
    candidates.add(interval * 2);
    candidates.add(interval * 5);
  }

  return (
    Array.from(candidates)
      .filter((interval) => interval >= minFramesPerTick)
      .sort((a, b) => a - b)[0] ?? minFramesPerTick
  );
}

function getFrameSubTickInterval(frameRate: number, zoomScale: number, majorFrameInterval: number) {
  const pxPerFrame = zoomScale / frameRate;
  return Math.min(majorFrameInterval, Math.max(1, Math.ceil(minFrameSubtickSpacing / pxPerFrame)));
}

function getSafeViewportOptions(options: TimelineRulerTickOptions) {
  return {
    scrollLeft: Math.max(0, options.scrollLeft),
    viewportWidth: Math.max(0, options.viewportWidth),
    zoomScale: Math.max(options.zoomScale || 0, 0.1),
  };
}

function getSecondRulerTicks(options: TimelineRulerTickOptions): TimelineRulerTick[] {
  const { scrollLeft, viewportWidth, zoomScale } = getSafeViewportOptions(options);
  const includeLabels = options.includeLabels ?? true;
  const secondsPerTick = getSecondTickInterval(zoomScale);
  const pxPerTick = secondsPerTick * zoomScale;
  const subTickCount = getSecondSubTickCount(pxPerTick);
  const startSubTick = Math.floor(scrollLeft / (pxPerTick / subTickCount));
  let endSubTick = Math.ceil((scrollLeft + viewportWidth) / (pxPerTick / subTickCount));

  if (options.duration) {
    const maxSubTick = Math.floor((toSeconds(options.duration) * subTickCount) / secondsPerTick);
    endSubTick = Math.min(endSubTick, maxSubTick);
  }

  const ticks: TimelineRulerTick[] = [];

  for (let tickIndex = startSubTick; tickIndex <= endSubTick; tickIndex++) {
    const isMajor = tickIndex % subTickCount === 0;
    const seconds = (tickIndex / subTickCount) * secondsPerTick;
    const time = fromSeconds(seconds);

    ticks.push({
      kind: isMajor ? 'major' : 'minor',
      x: Math.floor(seconds * zoomScale - scrollLeft),
      time,
      seconds,
      ...(includeLabels && isMajor ? { label: formatTime(time) } : {}),
    });
  }

  return ticks;
}

function getFrameRulerTicks(options: TimelineRulerTickOptions): TimelineRulerTick[] {
  const { scrollLeft, viewportWidth, zoomScale } = getSafeViewportOptions(options);
  const includeLabels = options.includeLabels ?? true;
  const frameRate = resolveTimecodeFrameRate(options.frameRate ?? 30);
  const majorFrameInterval = getFrameTickInterval(frameRate, zoomScale);
  const minorFrameInterval = getFrameSubTickInterval(frameRate, zoomScale, majorFrameInterval);
  const startFrame = Math.floor((scrollLeft / zoomScale) * frameRate);
  const visibleEndFrame = Math.ceil(((scrollLeft + viewportWidth) / zoomScale) * frameRate);
  const maxFrame = options.duration
    ? Math.floor(toSeconds(options.duration) * frameRate)
    : Number.POSITIVE_INFINITY;
  const firstMinorFrame = Math.max(
    0,
    Math.floor(startFrame / minorFrameInterval) * minorFrameInterval
  );
  const lastMinorFrame = Math.min(visibleEndFrame, maxFrame);
  const firstMajorFrame = Math.max(
    0,
    Math.floor(startFrame / majorFrameInterval) * majorFrameInterval
  );
  const lastMajorFrame = Math.min(visibleEndFrame, maxFrame);
  const ticksByFrame = new Map<number, TimelineRulerTick>();

  const addTick = (frame: number, kind: TimelineRulerTick['kind']) => {
    const existing = ticksByFrame.get(frame);
    if (existing && (existing.kind === 'major' || kind === 'minor')) {
      return;
    }

    const seconds = frame / frameRate;
    const time = fromSeconds(seconds);
    const label =
      includeLabels && kind === 'major'
        ? options.labelFormat === 'frame-number'
          ? String(frame)
          : formatTimecode(seconds, {
              frameRate: options.frameRate,
              ...options.timecodeFormatOptions,
            })
        : undefined;

    ticksByFrame.set(frame, {
      kind,
      x: Math.floor(seconds * zoomScale - scrollLeft),
      time,
      seconds,
      frame,
      ...(label !== undefined ? { label } : {}),
    });
  };

  for (let frame = firstMinorFrame; frame <= lastMinorFrame; frame += minorFrameInterval) {
    addTick(frame, frame % majorFrameInterval === 0 ? 'major' : 'minor');
  }

  for (let frame = firstMajorFrame; frame <= lastMajorFrame; frame += majorFrameInterval) {
    addTick(frame, 'major');
  }

  return Array.from(ticksByFrame.values()).sort((a, b) => (a.frame ?? 0) - (b.frame ?? 0));
}

/**
 * Builds shared viewport-space ruler ticks for canvas, DOM, and custom renderers.
 *
 * @param options - Timeline viewport and optional frame-label configuration.
 * @returns Ruler ticks clipped to the requested viewport and optional duration.
 */
export function getTimelineRulerTicks(options: TimelineRulerTickOptions): TimelineRulerTick[] {
  return options.frameRate === undefined
    ? getSecondRulerTicks(options)
    : getFrameRulerTicks(options);
}
