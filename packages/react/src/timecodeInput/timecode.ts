import {
  formatTimecode,
  parseTimecode,
  type TimecodeFrameRate as UtilityTimecodeFrameRate,
  type TimecodeFormat,
  type TimecodeFormatOptions,
  type TimecodeParseRounding,
  type TimecodeParseOptions,
} from '@techsquidtv/canvas-timeline-utils';

/**
 * Frame rate accepted by frame-based `TimecodeInput` helpers.
 *
 * Use numbers for simple rates such as `24`, `25`, `30`, or `60`. Use rational
 * objects for exact fractional media rates such as `{ numerator: 30000,
 * denominator: 1001 }`.
 */
export type TimecodeFrameRate = UtilityTimecodeFrameRate;

/**
 * Display shape used when formatting seconds for a `TimecodeInput`.
 *
 * `auto` keeps common decimal clock text unless a frame rate is provided. With a
 * frame rate, `auto` formats frame timecode. `seconds`, `minutes`, and `hours`
 * keep decimal centiseconds. `frames` formats `HH:MM:SS:FF`, and `drop-frame`
 * formats `HH:MM:SS;FF`.
 */
export type TimecodeInputFormat = TimecodeFormat;

/**
 * Options for formatting a seconds value into editable `TimecodeInput` text.
 */
export type TimecodeInputFormatOptions = TimecodeFormatOptions;

/**
 * Rounding policy used when parsing editable `TimecodeInput` text.
 *
 * `none` preserves the decimal precision entered by the user, within normal
 * JavaScript number limits. `centisecond` rounds parsed seconds to two decimal
 * places for legacy or display-like workflows.
 */
export type TimecodeInputParseRounding = TimecodeParseRounding;

/**
 * Options for parsing editable `TimecodeInput` text into seconds.
 */
export type TimecodeInputParseOptions = TimecodeParseOptions;

/**
 * Formats seconds for editable `TimecodeInput` text.
 *
 * Decimal formats are rounded to centiseconds and clamped at zero. Frame formats
 * round to the nearest frame for the supplied frame rate. Use this at UI
 * boundaries after converting from `RationalTime` with `toSeconds`.
 *
 * @param seconds - Decimal seconds to format.
 * @param options - Optional output shape and frame-rate settings.
 * @returns Timecode text suitable for a `TimecodeInput` value.
 *
 * @example
 * ```ts
 * formatTimecodeInput(90.5); // "1:30.50"
 * formatTimecodeInput(90.5, { frameRate: 24 }); // "00:01:30:12"
 * formatTimecodeInput(60.06, {
 *   frameRate: { numerator: 30000, denominator: 1001 },
 *   dropFrame: true,
 * }); // "00:01:00;02"
 * ```
 */
export function formatTimecodeInput(
  seconds: number,
  options: TimecodeInputFormatOptions = {}
): string {
  return formatTimecode(seconds, options);
}

/**
 * Parses editable `TimecodeInput` text into seconds.
 *
 * Accepts plain seconds, decimal seconds, `m:ss`, `m:ss.cc`, `h:mm:ss`,
 * `h:mm:ss.cc`, flexible single-digit colon segments such as `1:2`, and unit
 * suffixes like `s` (seconds), `ms` (milliseconds), `m` (minutes), or `f` (frames,
 * which requires a `frameRate` option).
 *
 * Invalid, negative, missing, or out-of-range user text returns `null`. Invalid
 * developer options such as unsupported drop-frame rates throw `RangeError`.
 *
 * @param value - User-entered timecode text.
 * @param options - Optional rounding and frame-rate settings.
 * @returns Parsed seconds with the requested rounding, or `null` when invalid.
 *
 * @example
 * ```ts
 * parseTimecodeInput('90.5'); // 90.5
 * parseTimecodeInput('1:30.25'); // 90.25
 * parseTimecodeInput('60s'); // 60
 * parseTimecodeInput('500ms'); // 0.5
 * parseTimecodeInput('2m'); // 120
 * parseTimecodeInput('24f', { frameRate: 24 }); // 1
 * parseTimecodeInput('00:01:30:12', { frameRate: 24 }); // 90.5
 * parseTimecodeInput('00:01:00;02', {
 *   frameRate: { numerator: 30000, denominator: 1001 },
 *   dropFrame: true,
 * }); // 60.06
 * ```
 */
export function parseTimecodeInput(
  value: string,
  options: TimecodeInputParseOptions = {}
): number | null {
  return parseTimecode(value, options);
}
