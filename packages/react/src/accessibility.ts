import type { Clip, Track } from '@techsquidtv/canvas-timeline-core';
import { subRational, toSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';

/**
 * Options for formatting a single timeline time value for assistive technology.
 */
export interface TimelineTimeValueFormatOptions {
  /** Decimal places to keep for sub-second values. Defaults to 2. */
  precision?: number;
}

/**
 * Options for formatting a timeline start/end range for assistive technology.
 */
export interface TimelineRangeValueFormatOptions extends TimelineTimeValueFormatOptions {
  /** Whether to include the computed range duration. Defaults to false. */
  includeDuration?: boolean;
}

function toTimelineSeconds(value: RationalTime | number | undefined) {
  if (value === undefined) {
    return 0;
  }
  return typeof value === 'number' ? value : toSeconds(value);
}

function normalizeSeconds(value: number, precision: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** precision;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatSecondsNumber(value: number, precision: number) {
  const normalized = normalizeSeconds(value, precision);
  if (precision <= 0) {
    return Math.round(normalized).toString();
  }

  return normalized.toFixed(precision).replace(/\.?0+$/, '');
}

function formatUnit(value: number, singular: string, plural: string) {
  return `${value} ${Math.abs(value) === 1 ? singular : plural}`;
}

/**
 * Formats a timeline time for assistive technology.
 *
 * The result intentionally avoids timecode punctuation and raw floating point
 * artifacts so controls can use it as `aria-valuetext`.
 *
 * @param value - Timeline time to format, as rational time or decimal seconds.
 * @param options - Optional decimal precision for the spoken time value.
 */
export function formatTimelineTimeValue(
  value: RationalTime | number | undefined,
  options: TimelineTimeValueFormatOptions = {}
) {
  const precision = options.precision ?? 2;
  const secondsValue = normalizeSeconds(toTimelineSeconds(value), precision);
  const sign = secondsValue < 0 ? '-' : '';
  const absoluteSeconds = Math.abs(secondsValue);

  if (absoluteSeconds < 60) {
    const seconds = formatSecondsNumber(absoluteSeconds, precision);
    return `${sign}${formatUnit(Number(seconds), 'second', 'seconds')}`;
  }

  const minutes = Math.floor(absoluteSeconds / 60);
  const seconds = absoluteSeconds - minutes * 60;
  const formattedSeconds = formatSecondsNumber(seconds, precision);

  return `${sign}${formatUnit(minutes, 'minute', 'minutes')}, ${formatUnit(
    Number(formattedSeconds),
    'second',
    'seconds'
  )}`;
}

/**
 * Formats a start/end timeline range for assistive technology.
 *
 * @param start - Range start time, as rational time or decimal seconds.
 * @param end - Range end time, as rational time or decimal seconds.
 * @param options - Optional precision and duration display settings.
 */
export function formatTimelineRangeValue(
  start: RationalTime | number | undefined,
  end: RationalTime | number | undefined,
  options: TimelineRangeValueFormatOptions = {}
) {
  const range = `${formatTimelineTimeValue(start, options)} to ${formatTimelineTimeValue(
    end,
    options
  )}`;

  if (!options.includeDuration) {
    return range;
  }

  const duration = Math.max(0, toTimelineSeconds(end) - toTimelineSeconds(start));
  return `${range}, duration ${formatTimelineTimeValue(duration, options)}`;
}

function getTrackLabel<TrackKind = string>(track?: Track<TrackKind>) {
  return track?.name?.trim() || track?.id;
}

/**
 * Returns a concise clip name suitable for labels or active-item summaries.
 *
 * @param clip - Timeline clip to describe.
 * @param track - Optional track containing the clip.
 */
export function getClipAccessibleName<TrackKind = string>(clip: Clip, track?: Track<TrackKind>) {
  const clipLabel = clip.label?.trim() || clip.id;
  const trackLabel = getTrackLabel(track);
  return trackLabel ? `${clipLabel} on ${trackLabel}` : clipLabel;
}

/**
 * Returns a richer clip description without requiring one DOM node per clip.
 *
 * @param clip - Timeline clip whose timing and edit state should be described.
 * @param track - Optional track containing the clip.
 */
export function getClipAccessibleDescription<TrackKind = string>(
  clip: Clip,
  track?: Track<TrackKind>
) {
  const duration = subRational(clip.timelineEnd, clip.timelineStart);
  const parts = [
    `starts at ${formatTimelineTimeValue(clip.timelineStart)}`,
    `ends at ${formatTimelineTimeValue(clip.timelineEnd)}`,
    `duration ${formatTimelineTimeValue(duration)}`,
  ];

  if (track?.locked) {
    parts.push('track locked');
  }
  if (track?.muted) {
    parts.push('track muted');
  }
  if (clip.selected) {
    parts.push('selected');
  }
  if (clip.disabled) {
    parts.push('disabled');
  }
  if (clip.movable === false) {
    parts.push('movement disabled');
  }
  if (clip.resizable === false) {
    parts.push('trimming disabled');
  }

  return parts.join(', ');
}
