export interface MutationQueue {
  run: <T>(operation: () => Promise<T>) => Promise<T>;
}

export function createMutationQueue(): MutationQueue {
  let pending = Promise.resolve();

  return {
    run: async <T>(operation: () => Promise<T>) => {
      const result = pending.then(operation, operation);
      pending = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
  };
}
