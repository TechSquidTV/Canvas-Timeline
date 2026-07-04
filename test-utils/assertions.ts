export function expectDefined<T>(value: T, label: string): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(`${label} should be defined.`);
  }

  return value;
}
