import { fromSeconds, toSeconds, type RationalTime } from './time';

const TIMECODE_CENTISECONDS = 100;
const TIMECODE_SECONDS_PER_MINUTE = 60;
const TIMECODE_SECONDS_PER_HOUR = 3600;
const NUMBER_SEGMENT_PATTERN = /^\d+(?:\.\d+)?$/;
const FRAME_TIMECODE_PATTERN = /^(\d+)\s*:\s*(\d+)\s*:\s*(\d+)\s*([:;])\s*(\d+)$/;
const DROP_FRAME_RATE_RATIO = 1000 / 1001;
const DROP_FRAME_RATE_TOLERANCE = 0.001;

/**
 * Frame rate accepted by frame-based timecode helpers.
 *
 * Pass a number for simple rates such as `24`, `25`, `30`, or `60`. Pass a
 * rational object for exact fractional media rates such as `{ numerator: 30000,
 * denominator: 1001 }`.
 */
export type TimecodeFrameRate = number | { numerator: number; denominator: number };

/**
 * Display shape used when formatting seconds for editable timecode text.
 *
 * `auto` keeps common decimal clock text unless a frame rate is provided. With a
 * frame rate, `auto` formats frame timecode. `seconds`, `minutes`, and `hours`
 * keep decimal centiseconds. `frames` formats `HH:MM:SS:FF`, and `drop-frame`
 * formats `HH:MM:SS;FF`.
 */
export type TimecodeFormat = 'auto' | 'seconds' | 'minutes' | 'hours' | 'frames' | 'drop-frame';

/**
 * Options for formatting a seconds value into editable timecode text.
 */
export interface TimecodeFormatOptions {
  /**
   * Preferred output shape.
   *
   * Defaults to `auto`. Use `frames` or `drop-frame` with `frameRate` for
   * frame-based media production timecode.
   */
  format?: TimecodeFormat;
  /**
   * Frame rate used for frame-based formatting.
   *
   * When provided with `format: 'auto'`, output uses `HH:MM:SS:FF` unless
   * `dropFrame` is true.
   */
  frameRate?: TimecodeFrameRate;
  /**
   * Formats frame timecode with drop-frame numbering.
   *
   * Drop-frame is supported only for 29.97/59.94-style rates. Invalid developer
   * options throw a `RangeError`.
   */
  dropFrame?: boolean;
}

/**
 * Rounding policy used when parsing editable timecode text.
 *
 * `none` preserves the decimal precision entered by the user, within normal
 * JavaScript number limits. `centisecond` rounds the parsed seconds to two
 * decimal places for legacy or display-like workflows.
 */
export type TimecodeParseRounding = 'none' | 'centisecond';

/**
 * Options for parsing editable timecode text into seconds.
 */
export interface TimecodeParseOptions {
  /**
   * Optional rounding policy applied after parsing decimal timecode forms.
   *
   * Defaults to `none` so timeline consumers can convert with `fromSeconds` and
   * let `RationalTime` perform the final tick rounding at the app's chosen
   * timebase.
   */
  rounding?: TimecodeParseRounding;
  /**
   * Frame rate required when parsing `HH:MM:SS:FF` or `HH:MM:SS;FF`.
   */
  frameRate?: TimecodeFrameRate;
  /**
   * Requires semicolon drop-frame text when true, and rejects semicolon text when
   * explicitly false.
   */
  dropFrame?: boolean;
}

/**
 * Options for parsing editable timecode text into `RationalTime`.
 */
export interface ParseTimecodeToRationalTimeOptions extends TimecodeParseOptions {
  /**
   * Tick rate used for the returned rational time.
   *
   * Defaults to `60000`, matching `fromSeconds`.
   */
  timebase?: number;
}

interface NormalizedFrameRate {
  value: number;
  nominal: number;
  dropFrames: number;
}

type CompoundTimecodeUnit = 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'frames';

interface CompoundTimecodeUnitMatch {
  unit: CompoundTimecodeUnit;
  nextIndex: number;
}

const COMPOUND_TIMECODE_UNITS: readonly [CompoundTimecodeUnit, readonly string[]][] = [
  ['milliseconds', ['milliseconds', 'millisecond', 'msecs', 'msec', 'ms']],
  ['seconds', ['seconds', 'second', 'secs', 'sec', 's']],
  ['minutes', ['minutes', 'minute', 'mins', 'min', 'm']],
  ['hours', ['hours', 'hour', 'hrs', 'hr', 'h']],
  ['frames', ['frames', 'frame', 'fr', 'f']],
];

function pad(number: number, width: number) {
  return number.toString().padStart(width, '0');
}

function roundTimecodeSeconds(seconds: number) {
  if (!Number.isFinite(seconds)) {
    return 0;
  }

  return Math.round(seconds * TIMECODE_CENTISECONDS) / TIMECODE_CENTISECONDS;
}

function applyTimecodeParseRounding(seconds: number, options: TimecodeParseOptions) {
  return (options.rounding ?? 'none') === 'centisecond' ? roundTimecodeSeconds(seconds) : seconds;
}

function getFrameRateValue(frameRate: TimecodeFrameRate) {
  if (typeof frameRate === 'number') {
    return frameRate;
  }

  if (
    !Number.isFinite(frameRate.numerator) ||
    !Number.isFinite(frameRate.denominator) ||
    frameRate.numerator <= 0 ||
    frameRate.denominator <= 0
  ) {
    throw new RangeError('Timecode frame rate must be a positive finite value.');
  }

  return frameRate.numerator / frameRate.denominator;
}

const objectFrameRateCache = new WeakMap<object, NormalizedFrameRate>();
const primitiveFrameRateCache = new Map<string, NormalizedFrameRate>();

function normalizeFrameRate(frameRate: TimecodeFrameRate, dropFrame: boolean): NormalizedFrameRate {
  if (typeof frameRate === 'object' && frameRate !== null) {
    let cached = objectFrameRateCache.get(frameRate);
    if (cached) {
      return cached;
    }
    const value = getFrameRateValue(frameRate);
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError('Timecode frame rate must be a positive finite value.');
    }
    const nominal = Math.round(value);
    if (nominal <= 0) {
      throw new RangeError('Timecode frame rate must round to at least one frame per second.');
    }
    if (dropFrame && !isSupportedDropFrameRate(value, nominal)) {
      throw new RangeError('Drop-frame timecode is only supported for 29.97/59.94-style rates.');
    }
    cached = {
      value,
      nominal,
      dropFrames: dropFrame ? Math.round(nominal * 0.06666666666666667) : 0,
    };
    objectFrameRateCache.set(frameRate, cached);
    return cached;
  }

  const cacheKey = `${frameRate}_${dropFrame}`;
  let cached = primitiveFrameRateCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const value = getFrameRateValue(frameRate);
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('Timecode frame rate must be a positive finite value.');
  }
  const nominal = Math.round(value);
  if (nominal <= 0) {
    throw new RangeError('Timecode frame rate must round to at least one frame per second.');
  }
  if (dropFrame && !isSupportedDropFrameRate(value, nominal)) {
    throw new RangeError('Drop-frame timecode is only supported for 29.97/59.94-style rates.');
  }
  cached = {
    value,
    nominal,
    dropFrames: dropFrame ? Math.round(nominal * 0.06666666666666667) : 0,
  };
  primitiveFrameRateCache.set(cacheKey, cached);
  return cached;
}

/**
 * Resolves a frame-rate option to frames per second.
 *
 * This uses the same validation and normalization path as the timecode
 * formatter/parser helpers, so invalid rates throw the same `RangeError`.
 *
 * @param frameRate - Frame rate to normalize.
 * @returns Frames per second.
 */
export function resolveTimecodeFrameRate(frameRate: TimecodeFrameRate): number {
  return normalizeFrameRate(frameRate, false).value;
}

function isSupportedDropFrameRate(value: number, nominal: number) {
  if (nominal !== 30 && nominal !== 60) {
    return false;
  }

  return Math.abs(value - nominal * DROP_FRAME_RATE_RATIO) <= DROP_FRAME_RATE_TOLERANCE;
}

function getFrameTimecodeOptions(options: TimecodeFormatOptions) {
  const format = options.format ?? 'auto';
  const dropFrame = options.dropFrame === true || format === 'drop-frame';

  if (
    (format === 'frames' || format === 'drop-frame' || dropFrame) &&
    options.frameRate === undefined
  ) {
    throw new RangeError('Frame-based timecode formatting requires a frameRate option.');
  }

  if (options.frameRate === undefined) {
    return null;
  }

  if (format === 'seconds' || format === 'minutes' || format === 'hours') {
    normalizeFrameRate(options.frameRate, dropFrame);
    return null;
  }

  return {
    dropFrame,
    frameRate: normalizeFrameRate(options.frameRate, dropFrame),
  };
}

function addDropFrameLabels(frameNumber: number, frameRate: NormalizedFrameRate) {
  const framesPer10Minutes =
    frameRate.nominal * TIMECODE_SECONDS_PER_MINUTE * 10 - frameRate.dropFrames * 9;
  const framesPerMinute = frameRate.nominal * TIMECODE_SECONDS_PER_MINUTE - frameRate.dropFrames;
  const tenMinuteChunks = Math.floor(frameNumber / framesPer10Minutes);
  const remainder = frameNumber % framesPer10Minutes;

  return (
    frameNumber +
    frameRate.dropFrames * 9 * tenMinuteChunks +
    frameRate.dropFrames *
      Math.floor(Math.max(0, remainder - frameRate.dropFrames) / framesPerMinute)
  );
}

function dropFrameLabelToFrameNumber(
  hours: number,
  minutes: number,
  seconds: number,
  frames: number,
  frameRate: NormalizedFrameRate
) {
  if (seconds === 0 && frames < frameRate.dropFrames && minutes % 10 !== 0) {
    return null;
  }

  const totalMinutes = hours * TIMECODE_SECONDS_PER_MINUTE + minutes;
  const labelFrameNumber =
    (hours * TIMECODE_SECONDS_PER_HOUR + minutes * TIMECODE_SECONDS_PER_MINUTE + seconds) *
      frameRate.nominal +
    frames;
  const droppedFrames = frameRate.dropFrames * (totalMinutes - Math.floor(totalMinutes / 10));

  return labelFrameNumber - droppedFrames;
}

function formatFrameTimecode(seconds: number, frameRate: NormalizedFrameRate, dropFrame: boolean) {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const realFrameNumber = Math.max(0, Math.round(safeSeconds * frameRate.value));
  const labelFrameNumber = dropFrame
    ? addDropFrameLabels(realFrameNumber, frameRate)
    : realFrameNumber;
  const framesPerHour = frameRate.nominal * TIMECODE_SECONDS_PER_HOUR;
  const framesPerMinute = frameRate.nominal * TIMECODE_SECONDS_PER_MINUTE;
  const hours = Math.floor(labelFrameNumber / framesPerHour);
  const minutes = Math.floor((labelFrameNumber % framesPerHour) / framesPerMinute);
  const wholeSeconds = Math.floor((labelFrameNumber % framesPerMinute) / frameRate.nominal);
  const frames = labelFrameNumber % frameRate.nominal;
  const frameDigits = Math.max(2, (frameRate.nominal - 1).toString().length);
  const separator = dropFrame ? ';' : ':';

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(wholeSeconds, 2)}${separator}${pad(
    frames,
    frameDigits
  )}`;
}

function parseFrameTimecode(value: string, options: TimecodeParseOptions) {
  const match = FRAME_TIMECODE_PATTERN.exec(value);
  if (!match) {
    return undefined;
  }

  if (options.frameRate === undefined) {
    return null;
  }

  const [, hoursPart, minutesPart, secondsPart, separator, framesPart] = match;
  const usesDropFrameSeparator = separator === ';';
  if (options.dropFrame === true && !usesDropFrameSeparator) {
    return null;
  }

  if (options.dropFrame === false && usesDropFrameSeparator) {
    return null;
  }

  const frameRate = normalizeFrameRate(options.frameRate, usesDropFrameSeparator);
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);
  const seconds = Number(secondsPart);
  const frames = Number(framesPart);

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    !Number.isFinite(frames) ||
    minutes >= TIMECODE_SECONDS_PER_MINUTE ||
    seconds >= TIMECODE_SECONDS_PER_MINUTE ||
    frames >= frameRate.nominal
  ) {
    return null;
  }

  const frameNumber = usesDropFrameSeparator
    ? dropFrameLabelToFrameNumber(hours, minutes, seconds, frames, frameRate)
    : (hours * TIMECODE_SECONDS_PER_HOUR + minutes * TIMECODE_SECONDS_PER_MINUTE + seconds) *
        frameRate.nominal +
      frames;

  return frameNumber === null ? null : frameNumber / frameRate.value;
}

function validateParseOptions(options: TimecodeParseOptions) {
  if (options.dropFrame === true && options.frameRate === undefined) {
    throw new RangeError('Drop-frame timecode parsing requires a frameRate option.');
  }

  if (options.frameRate !== undefined) {
    normalizeFrameRate(options.frameRate, options.dropFrame === true);
  }
}

function validateTimebase(timebase: number) {
  if (!Number.isFinite(timebase) || timebase <= 0) {
    throw new RangeError('Timecode timebase must be a positive finite value.');
  }
}

function readCompoundTimecodeUnit(value: string, index: number): CompoundTimecodeUnitMatch | null {
  const remaining = value.slice(index).toLowerCase();

  for (const [unit, candidates] of COMPOUND_TIMECODE_UNITS) {
    const match = candidates.find((candidate) => remaining.startsWith(candidate));

    if (match) {
      return { unit, nextIndex: index + match.length };
    }
  }

  return null;
}

function parseCompoundTimecodeNumber(value: string, index: number) {
  let nextIndex = index;

  while (nextIndex < value.length && isAsciiDigit(value[nextIndex])) {
    nextIndex += 1;
  }

  if (nextIndex === index) {
    return null;
  }

  if (value[nextIndex] === '.') {
    const decimalStart = nextIndex + 1;
    nextIndex = decimalStart;

    while (nextIndex < value.length && isAsciiDigit(value[nextIndex])) {
      nextIndex += 1;
    }

    if (nextIndex === decimalStart) {
      return null;
    }
  }

  return {
    value: value.slice(index, nextIndex),
    nextIndex,
  };
}

function parseCompoundTimecode(value: string, options: TimecodeParseOptions) {
  const input = value.replace(/\s+/g, '');
  let index = 0;
  let totalSeconds = 0;
  let parsedUnitCount = 0;

  while (index < input.length) {
    const numberMatch = parseCompoundTimecodeNumber(input, index);

    if (!numberMatch) {
      return parsedUnitCount > 0 ? null : undefined;
    }

    const unitMatch = readCompoundTimecodeUnit(input, numberMatch.nextIndex);

    if (!unitMatch) {
      return parsedUnitCount > 0 ? null : undefined;
    }

    const numericValue = Number(numberMatch.value);

    if (unitMatch.unit === 'milliseconds') {
      totalSeconds += numericValue / 1000;
    } else if (unitMatch.unit === 'seconds') {
      totalSeconds += numericValue;
    } else if (unitMatch.unit === 'minutes') {
      totalSeconds += numericValue * TIMECODE_SECONDS_PER_MINUTE;
    } else if (unitMatch.unit === 'hours') {
      totalSeconds += numericValue * TIMECODE_SECONDS_PER_HOUR;
    } else {
      if (options.frameRate === undefined) {
        return null;
      }

      totalSeconds += numericValue / getFrameRateValue(options.frameRate);
    }

    parsedUnitCount += 1;
    index = unitMatch.nextIndex;
  }

  return parsedUnitCount > 0 ? totalSeconds : undefined;
}

function isAsciiDigit(value: string | undefined) {
  return value !== undefined && value >= '0' && value <= '9';
}

/**
 * Formats seconds for flexible editable timecode text.
 *
 * Decimal formats are rounded to centiseconds and clamped at zero. Non-finite
 * values are treated as zero. Frame formats round to the nearest frame for the
 * supplied frame rate.
 *
 * @param seconds - Decimal seconds to format.
 * @param options - Optional output shape and frame-rate settings.
 * @returns Timecode text suitable for timeline UI.
 *
 * @example
 * ```ts
 * formatTimecode(90.5); // "1:30.50"
 * formatTimecode(90.5, { frameRate: 24 }); // "00:01:30:12"
 * formatTimecode(60.06, { frameRate: { numerator: 30000, denominator: 1001 }, dropFrame: true }); // "00:01:00;02"
 * ```
 */
export function formatTimecode(seconds: number, options: TimecodeFormatOptions = {}): string {
  const frameOptions = getFrameTimecodeOptions(options);
  if (frameOptions) {
    return formatFrameTimecode(seconds, frameOptions.frameRate, frameOptions.dropFrame);
  }

  const roundedCentiseconds = Math.max(
    0,
    Math.round((Number.isFinite(seconds) ? seconds : 0) * TIMECODE_CENTISECONDS)
  );
  const totalSeconds = Math.floor(roundedCentiseconds / TIMECODE_CENTISECONDS);
  const centiseconds = roundedCentiseconds % TIMECODE_CENTISECONDS;
  const hours = Math.floor(totalSeconds / TIMECODE_SECONDS_PER_HOUR);
  const minutes = Math.floor(
    (totalSeconds % TIMECODE_SECONDS_PER_HOUR) / TIMECODE_SECONDS_PER_MINUTE
  );
  const totalMinutes = Math.floor(totalSeconds / TIMECODE_SECONDS_PER_MINUTE);
  const remainingSeconds = totalSeconds % TIMECODE_SECONDS_PER_MINUTE;
  const fraction = centiseconds.toString().padStart(2, '0');
  const format = options.format ?? 'auto';

  if (format === 'seconds') {
    return `${totalSeconds}.${fraction}`;
  }

  if (format === 'minutes') {
    return `${totalMinutes}:${remainingSeconds.toString().padStart(2, '0')}.${fraction}`;
  }

  if (format === 'hours' || hours > 0) {
    return `${[
      hours,
      minutes.toString().padStart(2, '0'),
      remainingSeconds.toString().padStart(2, '0'),
    ].join(':')}.${fraction}`;
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}.${fraction}`;
}

/**
 * Parses flexible editable timecode text into seconds.
 *
 * Accepts plain seconds, decimal seconds, `m:ss`, `m:ss.cc`, `h:mm:ss`,
 * `h:mm:ss.cc`, flexible single-digit colon segments such as `1:2`, and unit
 * suffixes like `s` (seconds), `ms` (milliseconds), `m` (minutes), or `f` (frames,
 * which requires a `frameRate` option).
 *
 * Invalid, negative, missing, or out-of-range user text returns `null`.
 * Invalid developer options such as unsupported drop-frame rates throw
 * `RangeError`.
 *
 * @param value - User-entered timecode text.
 * @param options - Optional rounding and frame-rate settings.
 * @returns Parsed seconds with the requested rounding, or `null` when invalid.
 */
export function parseTimecode(value: string, options: TimecodeParseOptions = {}): number | null {
  validateParseOptions(options);

  const trimmed = value.trim();

  if (!trimmed || trimmed.startsWith('-')) {
    return null;
  }

  const compoundSeconds = parseCompoundTimecode(trimmed, options);
  if (compoundSeconds !== undefined) {
    return compoundSeconds === null ? null : applyTimecodeParseRounding(compoundSeconds, options);
  }

  const frameSeconds = parseFrameTimecode(trimmed, options);
  if (frameSeconds !== undefined) {
    return frameSeconds === null ? null : applyTimecodeParseRounding(frameSeconds, options);
  }

  if (NUMBER_SEGMENT_PATTERN.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) ? applyTimecodeParseRounding(seconds, options) : null;
  }

  const parts = trimmed.split(':').map((part) => part.trim());
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }

  const hasHours = parts.length === 3;
  const [hoursPart, minutesPart, secondsPart] = hasHours ? parts : ['0', parts[0], parts[1]];

  if (
    !/^\d+$/.test(hoursPart) ||
    !/^\d+$/.test(minutesPart) ||
    !NUMBER_SEGMENT_PATTERN.test(secondsPart)
  ) {
    return null;
  }

  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);
  const seconds = Number(secondsPart);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    (hasHours && minutes >= TIMECODE_SECONDS_PER_MINUTE) ||
    seconds >= TIMECODE_SECONDS_PER_MINUTE
  ) {
    return null;
  }

  return applyTimecodeParseRounding(
    hours * TIMECODE_SECONDS_PER_HOUR + minutes * TIMECODE_SECONDS_PER_MINUTE + seconds,
    options
  );
}

/**
 * Converts a rational time to the nearest source frame number.
 *
 * @param time - Rational timeline time to convert.
 * @param frameRate - Media frame rate used to count frames.
 * @returns Zero-based frame number rounded to the nearest frame.
 */
export function toTimecodeFrameNumber(time: RationalTime, frameRate: TimecodeFrameRate): number {
  const normalizedFrameRate = normalizeFrameRate(frameRate, false);
  return Math.max(0, Math.round(toSeconds(time) * normalizedFrameRate.value));
}

/**
 * Converts a zero-based frame number to rational timeline time.
 *
 * @param frameNumber - Zero-based frame number.
 * @param frameRate - Media frame rate used by the frame number.
 * @param timebase - Tick rate for the returned rational time. Defaults to `60000`.
 * @returns Rational timeline time rounded to the nearest `timebase` tick.
 */
export function fromTimecodeFrameNumber(
  frameNumber: number,
  frameRate: TimecodeFrameRate,
  timebase: number = 60000
): RationalTime {
  if (!Number.isInteger(frameNumber) || frameNumber < 0) {
    throw new RangeError('Timecode frame number must be a non-negative integer.');
  }

  validateTimebase(timebase);

  const normalizedFrameRate = normalizeFrameRate(frameRate, false);
  return fromSeconds(frameNumber / normalizedFrameRate.value, timebase);
}

/**
 * Formats a `RationalTime` as editable timecode text.
 *
 * @param time - Rational timeline time to format.
 * @param options - Optional output shape and frame-rate settings.
 * @returns Timecode text suitable for timeline UI.
 */
export function formatRationalTimecode(
  time: RationalTime,
  options: TimecodeFormatOptions = {}
): string {
  return formatTimecode(toSeconds(time), options);
}

/**
 * Parses editable timecode text into `RationalTime`.
 *
 * @param value - User-entered timecode text.
 * @param options - Optional parse settings and output timebase.
 * @returns Rational timeline time, or `null` when the text is invalid.
 */
export function parseTimecodeToRationalTime(
  value: string,
  options: ParseTimecodeToRationalTimeOptions = {}
): RationalTime | null {
  const { timebase = 60000, ...parseOptions } = options;
  validateTimebase(timebase);

  const seconds = parseTimecode(value, parseOptions);
  return seconds === null ? null : fromSeconds(seconds, timebase);
}
