import {
  formatTime,
  formatTimecode,
  fromSeconds,
  resolveTimecodeFrameRate,
  toSeconds,
} from '@techsquidtv/canvas-timeline-utils';
import type {
  TimelineRulerFormatOptions,
  TimelineRulerGeometryOptions,
  TimelineRulerTick,
  TimelineRulerTickOptions,
} from '#core/types';

type SecondRulerTickOptions = TimelineRulerGeometryOptions &
  Extract<TimelineRulerFormatOptions, { format: 'seconds' }>;
type FrameRulerTickOptions = TimelineRulerGeometryOptions &
  Exclude<TimelineRulerFormatOptions, { format: 'seconds' }>;

const defaultMajorTickSpacing = 50;
const defaultTimecodeMajorTickSpacing = 72;
const minFrameSubtickSpacing = 8;
const secondTickIntervals = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];

function resolveMinimumMajorTickSpacing(
  minimumMajorTickSpacing: number | undefined,
  fallback: number
) {
  return minimumMajorTickSpacing === undefined || !Number.isFinite(minimumMajorTickSpacing)
    ? fallback
    : Math.max(fallback, minimumMajorTickSpacing);
}

function getSecondTickInterval(zoomScale: number, minimumMajorTickSpacing: number) {
  for (const interval of secondTickIntervals) {
    if (interval * zoomScale >= minimumMajorTickSpacing) {
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

function getFrameTickInterval(
  frameRate: number,
  zoomScale: number,
  minimumMajorTickSpacing: number
) {
  const pxPerFrame = zoomScale / frameRate;
  const minFramesPerTick = Math.max(1, Math.ceil(minimumMajorTickSpacing / pxPerFrame));
  const nominalFrameRate = Math.max(1, Math.round(frameRate));
  const candidates = new Set<number>();

  for (let interval = 1; interval * interval <= nominalFrameRate; interval++) {
    if (nominalFrameRate % interval === 0) {
      candidates.add(interval);
      candidates.add(nominalFrameRate / interval);
    }
  }

  for (const seconds of secondTickIntervals) {
    candidates.add(nominalFrameRate * seconds);
  }

  return (
    Array.from(candidates)
      .filter((interval) => interval >= minFramesPerTick)
      .sort((a, b) => a - b)[0] ?? minFramesPerTick
  );
}

function getFrameMediumTickInterval(
  majorFrameInterval: number,
  minorFrameInterval: number
): number | undefined {
  for (const segmentCount of [2, 5, 3, 4]) {
    const candidate = majorFrameInterval / segmentCount;
    if (
      Number.isInteger(candidate) &&
      candidate > minorFrameInterval &&
      candidate % minorFrameInterval === 0
    ) {
      return candidate;
    }
  }

  return undefined;
}

function getFrameSubTickInterval(frameRate: number, zoomScale: number, majorFrameInterval: number) {
  const pxPerFrame = zoomScale / frameRate;
  const minimumFrameInterval = Math.min(
    majorFrameInterval,
    Math.max(1, Math.ceil(minFrameSubtickSpacing / pxPerFrame))
  );
  let subTickInterval = majorFrameInterval;

  for (let divisor = 1; divisor * divisor <= majorFrameInterval; divisor++) {
    if (majorFrameInterval % divisor !== 0) {
      continue;
    }

    const complement = majorFrameInterval / divisor;
    if (divisor >= minimumFrameInterval) {
      subTickInterval = Math.min(subTickInterval, divisor);
    }
    if (complement >= minimumFrameInterval) {
      subTickInterval = Math.min(subTickInterval, complement);
    }
  }

  return subTickInterval;
}

function getSafeViewportOptions(options: TimelineRulerTickOptions) {
  return {
    scrollLeft: Math.max(0, options.scrollLeft),
    viewportWidth: Math.max(0, options.viewportWidth),
    zoomScale: Math.max(options.zoomScale || 0, 0.1),
  };
}

function getSecondRulerTicks(options: SecondRulerTickOptions): TimelineRulerTick[] {
  const { scrollLeft, viewportWidth, zoomScale } = getSafeViewportOptions(options);
  const includeLabels = options.includeLabels ?? true;
  const minimumMajorTickSpacing = resolveMinimumMajorTickSpacing(
    options.minimumMajorTickSpacing,
    defaultMajorTickSpacing
  );
  const secondsPerTick = getSecondTickInterval(zoomScale, minimumMajorTickSpacing);
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
    const isMedium =
      !isMajor &&
      subTickCount > 1 &&
      subTickCount % 2 === 0 &&
      tickIndex % (subTickCount / 2) === 0;
    const seconds = (tickIndex / subTickCount) * secondsPerTick;
    const time = fromSeconds(seconds);

    ticks.push({
      kind: isMajor ? 'major' : isMedium ? 'medium' : 'minor',
      x: Math.floor(seconds * zoomScale - scrollLeft),
      time,
      seconds,
      ...(includeLabels && isMajor ? { label: formatTime(time) } : {}),
    });
  }

  return ticks;
}

function getFrameRulerTicks(options: FrameRulerTickOptions): TimelineRulerTick[] {
  const { scrollLeft, viewportWidth, zoomScale } = getSafeViewportOptions(options);
  const includeLabels = options.includeLabels ?? true;
  const frameRate = resolveTimecodeFrameRate(options.frameRate);
  const defaultSpacing =
    includeLabels && options.format === 'timecode'
      ? defaultTimecodeMajorTickSpacing
      : defaultMajorTickSpacing;
  const minimumMajorTickSpacing = resolveMinimumMajorTickSpacing(
    options.minimumMajorTickSpacing,
    defaultSpacing
  );
  const majorFrameInterval = getFrameTickInterval(frameRate, zoomScale, minimumMajorTickSpacing);
  const minorFrameInterval = getFrameSubTickInterval(frameRate, zoomScale, majorFrameInterval);
  const mediumFrameInterval = getFrameMediumTickInterval(majorFrameInterval, minorFrameInterval);
  const startFrame = Math.floor((scrollLeft / zoomScale) * frameRate);
  const visibleEndFrame = Math.ceil(((scrollLeft + viewportWidth) / zoomScale) * frameRate);
  const maxFrame = options.duration
    ? Math.floor(toSeconds(options.duration) * frameRate)
    : Number.POSITIVE_INFINITY;
  const firstFrame = Math.max(0, Math.floor(startFrame / minorFrameInterval) * minorFrameInterval);
  const lastFrame = Math.min(visibleEndFrame, maxFrame);
  const ticks: TimelineRulerTick[] = [];

  for (let frame = firstFrame; frame <= lastFrame; frame += minorFrameInterval) {
    const kind: TimelineRulerTick['kind'] =
      frame % majorFrameInterval === 0
        ? 'major'
        : mediumFrameInterval !== undefined && frame % mediumFrameInterval === 0
          ? 'medium'
          : 'minor';
    const seconds = frame / frameRate;
    const time = fromSeconds(seconds);
    const label =
      includeLabels && kind === 'major'
        ? options.format === 'frame-number'
          ? String(frame)
          : formatTimecode(seconds, {
              frameRate: options.frameRate,
              ...options.timecodeFormatOptions,
            })
        : undefined;

    ticks.push({
      kind,
      x: Math.floor(seconds * zoomScale - scrollLeft),
      time,
      seconds,
      frame,
      ...(label !== undefined ? { label } : {}),
    });
  }

  return ticks;
}

/**
 * Builds shared viewport-space ruler ticks for canvas, DOM, and custom renderers.
 *
 * @param options - Timeline viewport and optional frame-label configuration.
 * @returns Ruler ticks clipped to the requested viewport and optional duration.
 */
export function getTimelineRulerTicks(options: TimelineRulerTickOptions): TimelineRulerTick[] {
  return options.format === 'seconds' ? getSecondRulerTicks(options) : getFrameRulerTicks(options);
}
