/** Compares scalar or shallow collection snapshots without allocating another value. */
export function shallowEqual<Value>(previous: Value, next: Value): boolean {
  if (Object.is(previous, next)) {
    return true;
  }
  if (
    typeof previous !== 'object' ||
    previous === null ||
    typeof next !== 'object' ||
    next === null
  ) {
    return false;
  }
  if (Object.getPrototypeOf(previous) !== Object.getPrototypeOf(next)) {
    return false;
  }
  if (!Array.isArray(next) && Object.getPrototypeOf(next) !== Object.prototype) {
    return false;
  }
  if (Array.isArray(previous) && Array.isArray(next) && previous.length !== next.length) {
    return false;
  }
  const keys = Object.keys(next) as (keyof Value)[];
  return (
    keys.length === Object.keys(previous).length &&
    keys.every((key) => Object.hasOwn(previous, key) && Object.is(previous[key], next[key]))
  );
}
