export interface TimelineMediaPlaybackSynchronizationRunner {
  run: <Result>(operation: () => Promise<Result>, superseded: () => Result) => Promise<Result>;
}

const delegatedSynchronizationOptions = new WeakMap<
  object,
  TimelineMediaPlaybackSynchronizationRunner
>();

export function delegateTimelineMediaPlaybackSynchronization<Options extends object>(
  options: Options,
  runner: TimelineMediaPlaybackSynchronizationRunner
): Options {
  const delegatedOptions: Options = { ...options };
  delegatedSynchronizationOptions.set(delegatedOptions, runner);
  return delegatedOptions;
}

export function getDelegatedTimelineMediaPlaybackSynchronization(
  options: object
): TimelineMediaPlaybackSynchronizationRunner | undefined {
  return delegatedSynchronizationOptions.get(options);
}
