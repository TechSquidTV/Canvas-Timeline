/**
 * A general, generic type-safe event emitter class.
 * Extended by components needing typed event publishing and subscription contracts.
 */
export class TypedEventEmitter<M extends object> {
  private listeners: Partial<{ [K in keyof M]: Set<(payload: M[K]) => void> }> =
    Object.create(null);

  /**
   * Subscribes to a typed event.
   *
   * @param event - Event name key in the event map.
   * @param callback - Event listener payload callback.
   * @returns Unsubscribe function clean up handler.
   */
  on<K extends keyof M & string>(event: K, callback: (payload: M[K]) => void): () => void {
    let listeners = this.listeners[event];
    if (!listeners) {
      listeners = new Set();
      this.listeners[event] = listeners;
    }
    listeners.add(callback);
    return () => {
      this.listeners[event]?.delete(callback);
    };
  }

  /**
   * Emits a typed event to all active subscribers.
   *
   * Supports type-safety by enforcing key-value mapping and allows omitting
   * the payload argument entirely if the map type is void.
   *
   * @param event - Event name key in the event map.
   * @param args - Event payload tuple for the selected event, omitted for void events.
   */
  emit<K extends keyof M & string>(event: K, ...args: M[K] extends void ? [] : [M[K]]): void {
    const payload = args[0] as M[K];
    this.listeners[event]?.forEach((cb) => cb(payload));
  }
}
