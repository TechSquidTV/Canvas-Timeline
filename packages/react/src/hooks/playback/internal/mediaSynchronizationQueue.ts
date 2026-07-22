export interface MediaAdapterOperationToken {
  epoch: number;
  identity: object | undefined;
}

export class MediaSynchronizationQueue {
  private epoch = 0;
  private tail: Promise<void> = Promise.resolve();

  invalidate() {
    this.epoch += 1;
  }

  enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    const pendingOperation = this.tail.then(operation, operation);
    this.tail = pendingOperation.then(
      () => undefined,
      () => undefined
    );
    return pendingOperation;
  }

  run<Result>(
    getIdentity: () => object | undefined,
    operation: () => Promise<Result>,
    superseded: () => Result
  ): Promise<Result> {
    const token = this.capture(getIdentity());
    return this.enqueue(async () => {
      if (!this.isCurrent(token, getIdentity())) {
        return superseded();
      }

      try {
        const result = await operation();
        return this.isCurrent(token, getIdentity()) ? result : superseded();
      } catch (operationError: unknown) {
        if (!this.isCurrent(token, getIdentity())) {
          return superseded();
        }
        throw operationError;
      }
    });
  }

  capture(identity: object | undefined): MediaAdapterOperationToken {
    return { epoch: this.epoch, identity };
  }

  isCurrent(token: MediaAdapterOperationToken, identity: object | undefined) {
    return token.epoch === this.epoch && Object.is(token.identity, identity);
  }
}
