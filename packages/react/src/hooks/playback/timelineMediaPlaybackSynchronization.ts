const delegatedSynchronizationOptions = new WeakSet<object>();

export function delegateTimelineMediaPlaybackSynchronization<Options extends object>(
  options: Options
): Options {
  const delegatedOptions: Options = { ...options };
  delegatedSynchronizationOptions.add(delegatedOptions);
  return delegatedOptions;
}

export function hasDelegatedTimelineMediaPlaybackSynchronization(options: object): boolean {
  return delegatedSynchronizationOptions.has(options);
}
