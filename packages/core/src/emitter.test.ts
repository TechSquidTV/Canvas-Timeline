import { describe, expect, it, vi } from 'vite-plus/test';
import { TypedEventEmitter } from './emitter';

type PrototypeEventMap = {
  constructor: { value: number };
  toString: { value: string };
  __proto__: { value: boolean };
};

describe('TypedEventEmitter', () => {
  it('supports event names that match object prototype keys', () => {
    const emitter = new TypedEventEmitter<PrototypeEventMap>();
    const constructorListener = vi.fn();
    const toStringListener = vi.fn();
    const protoListener = vi.fn();

    emitter.on('constructor', constructorListener);
    emitter.on('toString', toStringListener);
    emitter.on('__proto__', protoListener);

    emitter.emit('constructor', { value: 1 });
    emitter.emit('toString', { value: 'value' });
    emitter.emit('__proto__', { value: true });

    expect(constructorListener).toHaveBeenCalledWith({ value: 1 });
    expect(toStringListener).toHaveBeenCalledWith({ value: 'value' });
    expect(protoListener).toHaveBeenCalledWith({ value: true });
  });

  it('unsubscribes prototype-like event names independently', () => {
    const emitter = new TypedEventEmitter<PrototypeEventMap>();
    const constructorListener = vi.fn();
    const unsubscribe = emitter.on('constructor', constructorListener);

    emitter.emit('constructor', { value: 1 });
    unsubscribe();
    emitter.emit('constructor', { value: 2 });

    expect(constructorListener).toHaveBeenCalledTimes(1);
    expect(constructorListener).toHaveBeenCalledWith({ value: 1 });
  });
});
