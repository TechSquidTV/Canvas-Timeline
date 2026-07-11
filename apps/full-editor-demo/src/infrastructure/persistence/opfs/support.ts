export function hasOpfsSupport() {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}

export function isNotFoundError(error: unknown) {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
