/**
 * Restricts a number to an inclusive minimum and maximum range.
 *
 * @param value - Number to clamp.
 * @param min - Inclusive lower bound.
 * @param max - Inclusive upper bound.
 * @returns `value` constrained to the inclusive range.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Rounds a number to the requested number of decimal places.
 *
 * @param value - Number to round.
 * @param decimals - Number of decimal places to keep.
 * @returns Rounded number.
 */
export function round(value: number, decimals: number = 0): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}
