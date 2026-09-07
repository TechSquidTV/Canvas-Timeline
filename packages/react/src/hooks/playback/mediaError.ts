export function toMediaError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  if (typeof cause === 'string') {
    return new Error(cause);
  }
  if (typeof cause === 'number' || typeof cause === 'boolean' || typeof cause === 'bigint') {
    return new Error(cause.toString());
  }
  return new Error('Unknown media adapter error.');
}

export function withMediaCauseMessage(message: string, cause: Error | undefined) {
  return cause?.message ? `${message} ${cause.message}` : message;
}
