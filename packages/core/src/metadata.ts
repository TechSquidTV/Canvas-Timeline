import type { TimelineMetadata } from '#core/types';

/** Validate unchecked JavaScript input before it enters snapshots or history. */
function assertPlainMetadata(value: unknown, ancestors: Set<object>): void {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return;
  }
  if (
    typeof value !== 'object' ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null &&
      !(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype))
  ) {
    throw new TypeError(
      'Timeline metadata must contain only plain objects, arrays, and finite primitive values.'
    );
  }
  if (ancestors.has(value)) {
    throw new TypeError('Timeline metadata must not contain cycles.');
  }
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key === 'symbol' || descriptor?.get || descriptor?.set) {
      throw new TypeError('Timeline metadata must not contain symbol keys or accessors.');
    }
    assertPlainMetadata(descriptor?.value, ancestors);
  }
  ancestors.delete(value);
}

/** Own lightweight app data without retaining mutable collection or host objects. */
export function cloneTimelineMetadata(metadata: TimelineMetadata): TimelineMetadata {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new TypeError('Timeline metadata must be a plain object.');
  }
  assertPlainMetadata(metadata, new Set());
  return structuredClone(metadata);
}
