/**
 * Stores a timeline time as integer ticks at a fixed rate.
 */
export interface RationalTime {
  /** Integer tick value at the timebase stored in `r`. */
  v: number;
  /** Tick rate or denominator, expressed as ticks per second. */
  r: number;
}

/**
 * Asserts that a value is a finite rational timeline time.
 *
 * @param t - Rational timeline time to validate.
 * @param label - Field name included in thrown diagnostics.
 * @throws RangeError when the time has a non-integer tick value or invalid rate.
 */
export function assertValidRationalTime(t: RationalTime, label: string = 'RationalTime'): void {
  if (!Number.isFinite(t.v) || !Number.isInteger(t.v)) {
    throw new RangeError(`${label}.v must be a finite integer tick value.`);
  }
  if (!Number.isFinite(t.r) || t.r <= 0) {
    throw new RangeError(`${label}.r must be a positive finite tick rate.`);
  }
}

function assertFiniteSeconds(sec: number, label: string) {
  if (!Number.isFinite(sec)) {
    throw new RangeError(`${label} must be a finite number of seconds.`);
  }
}

/**
 * Converts a rational timeline time to seconds.
 *
 * @param t - Rational timeline time to convert.
 * @returns Decimal seconds represented by the rational time.
 */
export function toSeconds(t: RationalTime): number {
  assertValidRationalTime(t);
  return t.v / t.r;
}

/**
 * Converts seconds to rational timeline time at the requested tick rate.
 *
 * @param sec - Decimal seconds to convert.
 * @param rate - Tick rate to use for the returned rational time.
 * @returns Rational time rounded to the nearest tick.
 */
export function fromSeconds(sec: number, rate: number = 60000): RationalTime {
  assertFiniteSeconds(sec, 'sec');
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new RangeError('rate must be a positive finite tick rate.');
  }
  return { v: Math.round(sec * rate), r: rate };
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left;
}

function getCommonIntegerRate(a: RationalTime, b: RationalTime): number | null {
  if (!Number.isInteger(a.r) || !Number.isInteger(b.r)) {
    return null;
  }

  const divisor = greatestCommonDivisor(a.r, b.r);
  const commonRate = a.r * (b.r / divisor);
  return Number.isFinite(commonRate) && Number.isInteger(commonRate) ? commonRate : null;
}

/**
 * Adds two rational timeline times.
 *
 * @param a - First rational time.
 * @param b - Second rational time.
 * @returns Sum of both times as a rational value.
 */
export function addRational(a: RationalTime, b: RationalTime): RationalTime {
  assertValidRationalTime(a, 'a');
  assertValidRationalTime(b, 'b');
  if (a.r === b.r) {
    return { v: a.v + b.v, r: a.r };
  }
  const r = getCommonIntegerRate(a, b);
  if (r !== null) {
    return { v: a.v * (r / a.r) + b.v * (r / b.r), r };
  }
  return fromSeconds(toSeconds(a) + toSeconds(b), Math.max(a.r, b.r));
}

/**
 * Subtracts one rational timeline time from another.
 *
 * @param a - Time to subtract from.
 * @param b - Time to subtract.
 * @returns Difference between both times as a rational value.
 */
export function subRational(a: RationalTime, b: RationalTime): RationalTime {
  assertValidRationalTime(a, 'a');
  assertValidRationalTime(b, 'b');
  if (a.r === b.r) {
    return { v: a.v - b.v, r: a.r };
  }
  const r = getCommonIntegerRate(a, b);
  if (r !== null) {
    return { v: a.v * (r / a.r) - b.v * (r / b.r), r };
  }
  return fromSeconds(toSeconds(a) - toSeconds(b), Math.max(a.r, b.r));
}

/**
 * Compares two rational timeline times.
 *
 * @param a - First rational time.
 * @param b - Second rational time.
 * @returns A positive value when `a` is later, a negative value when `b` is later, and zero when equal.
 */
export function compareRational(a: RationalTime, b: RationalTime): number {
  assertValidRationalTime(a, 'a');
  assertValidRationalTime(b, 'b');
  return a.v * b.r - b.v * a.r;
}

/**
 * Returns the later of two rational timeline times.
 *
 * @param a - First rational time.
 * @param b - Second rational time.
 * @returns Whichever time represents the later moment.
 */
export function maxRational(a: RationalTime, b: RationalTime): RationalTime {
  return compareRational(a, b) > 0 ? a : b;
}

/**
 * Returns the earlier of two rational timeline times.
 *
 * @param a - First rational time.
 * @param b - Second rational time.
 * @returns Whichever time represents the earlier moment.
 */
export function minRational(a: RationalTime, b: RationalTime): RationalTime {
  return compareRational(a, b) < 0 ? a : b;
}

/**
 * Checks whether two rational timeline times represent the same moment.
 *
 * @param a - First rational time.
 * @param b - Second rational time.
 * @returns Whether both values resolve to the same second.
 */
export function rationalEquals(a: RationalTime, b: RationalTime): boolean {
  assertValidRationalTime(a, 'a');
  assertValidRationalTime(b, 'b');
  return a.v * b.r === b.v * a.r;
}

/**
 * Formats a rational timeline time as mm:ss.
 *
 * @param t - Rational timeline time to format.
 * @returns Time string in `mm:ss` format.
 */
export function formatTime(t: RationalTime): string {
  const totalSeconds = Math.floor(toSeconds(t));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Formats a rational timeline time as decimal seconds.
 *
 * @param t - Rational timeline time to format.
 * @param decimals - Number of digits to include after the decimal point.
 * @returns Seconds string rounded to the requested precision.
 */
export function formatSeconds(t: RationalTime, decimals: number = 2): string {
  return toSeconds(t).toFixed(decimals);
}
