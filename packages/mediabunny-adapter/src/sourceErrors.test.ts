import { expect, test, vi } from 'vite-plus/test';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { createMediabunnyAdapter, type MediabunnySourceInput } from '#mediabunny-adapter/index';
import { mediabunnyTestFixtures } from '#mediabunny-adapter-test/testHelpers';

const { createMockInput, createMockMediabunny, createActiveClip, createActiveLayers } =
  mediabunnyTestFixtures;

const sourceInputs = [
  'https://media.example/video.mp4',
  new URL('https://media.example/video.mp4'),
  new Request('https://media.example/video.mp4'),
  { kind: 'url', url: 'https://media.example/video.mp4' },
  new Blob(['media']),
  new File(['media'], 'video.mp4'),
] as const satisfies readonly MediabunnySourceInput[];

test.each(sourceInputs)('recovers background input errors for %s', async (input) => {
  const firstInput = createMockInput();
  const fallbackInput = createMockInput({ metadataDuration: 9 });
  const mock = createMockMediabunny([firstInput, fallbackInput]);
  const adapter = createMediabunnyAdapter({
    mediabunny: mock.module,
    sources: [{ sourceId: 'source-1', input, fallbacks: ['https://media.example/fallback.mp4'] }],
  });
  await adapter.preloadSource('source-1');
  const previousSnapshot = adapter.sourceStateById;
  const handler = (mock.createdUrlSourceOptions[0] ?? mock.createdBlobSourceOptions[0])
    ?.handleUnhandledError;
  expect(handler).toBeTypeOf('function');
  const error = new Error('background read failed');
  handler?.(error);
  handler?.(error);

  await expect(adapter.preloadSource('source-1')).resolves.toMatchObject({ ok: true });
  expect(adapter.sourceStateById).not.toBe(previousSnapshot);
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'ready',
    selectedInputIndex: 1,
    attempts: [
      { inputIndex: 0, status: 'ready' },
      { inputIndex: 0, status: 'failed', error },
      { inputIndex: 1, status: 'ready' },
    ],
    metadata: { durationSeconds: 9 },
  });
  expect(firstInput.dispose).toHaveBeenCalledOnce();
  expect(mock.constructInput).toHaveBeenCalledTimes(2);
  adapter.dispose();
});

test('preserves caller URL options and reports terminal background failures to transport', async () => {
  const observer = vi.fn();
  const mock = createMockMediabunny([createMockInput()]);
  const adapter = createMediabunnyAdapter({
    mediabunny: mock.module,
    sources: [
      {
        sourceId: 'source-1',
        input: {
          kind: 'url',
          url: 'https://media.example/video.mp4',
          urlSourceOptions: { maxCacheSize: 1024, handleUnhandledError: observer },
        },
      },
    ],
  });
  await adapter.preloadSource('source-1');
  expect(mock.createdUrlSourceOptions[0]?.maxCacheSize).toBe(1024);
  mock.createdUrlSourceOptions[0]?.handleUnhandledError?.('background failure');
  await expect(adapter.preloadSource('source-1')).resolves.toMatchObject({ ok: false });
  expect(observer).toHaveBeenCalledExactlyOnceWith('background failure');
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    status: 'failed',
    error: expect.objectContaining({ message: 'background failure' }),
  });
  await expect(
    adapter.seek(fromSeconds(0), createActiveLayers([createActiveClip('visual', 'source-1', 0)], 0))
  ).rejects.toThrow('background failure');
  adapter.dispose();
});

test('fails a load attempt when background reading fails before metadata finishes', async () => {
  const initial = createMockInput();
  const mock = createMockMediabunny([initial, createMockInput()]);
  initial.getFirstTimestamp.mockImplementation(async () => {
    mock.createdUrlSourceOptions[0]?.handleUnhandledError?.(new Error('prefetch failed'));
    return 0;
  });
  const adapter = createMediabunnyAdapter({
    mediabunny: mock.module,
    sources: [{ sourceId: 'source-1', input: sourceInputs[0], fallbacks: [sourceInputs[1]] }],
  });
  await expect(adapter.preloadSource('source-1')).resolves.toMatchObject({ ok: true });
  expect(adapter.sourceStateById.get('source-1')).toMatchObject({
    selectedInputIndex: 1,
    attempts: [{ status: 'failed' }, { status: 'ready' }],
  });
  expect(initial.getDurationFromMetadata).not.toHaveBeenCalled();
  expect(initial.dispose).toHaveBeenCalledOnce();
  adapter.dispose();
});

test.each(['unload', 'replace', 'dispose'] as const)(
  'ignores background callbacks after %s',
  async (action) => {
    const mock = createMockMediabunny([createMockInput(), createMockInput()]);
    const adapter = createMediabunnyAdapter({
      mediabunny: mock.module,
      sources: [{ sourceId: 'source-1', input: sourceInputs[0] }],
    });
    await adapter.preloadSource('source-1');
    const handler = mock.createdUrlSourceOptions[0]?.handleUnhandledError;
    if (action === 'unload') {
      adapter.unloadSource('source-1');
    } else if (action === 'replace') {
      await adapter.replaceSource({ sourceId: 'source-1', input: sourceInputs[1] });
    } else {
      adapter.dispose();
    }
    const snapshot = adapter.sourceStateById;
    handler?.(new Error('late failure'));
    await Promise.resolve();
    expect(adapter.sourceStateById).toBe(snapshot);
    expect(adapter.error).toBeNull();
    adapter.dispose();
  }
);

test('keeps the current source when a replacement has a background load failure', async () => {
  const replacement = createMockInput();
  const mock = createMockMediabunny([createMockInput(), replacement]);
  replacement.getFirstTimestamp.mockImplementation(async () => {
    mock.createdUrlSourceOptions[1]?.handleUnhandledError?.(new Error('replacement failed'));
    return 0;
  });
  const adapter = createMediabunnyAdapter({
    mediabunny: mock.module,
    sources: [{ sourceId: 'source-1', input: sourceInputs[0] }],
  });
  await adapter.preloadSource('source-1');
  const previousState = adapter.sourceStateById.get('source-1');
  await expect(
    adapter.replaceSource({ sourceId: 'source-1', input: sourceInputs[1] })
  ).resolves.toMatchObject({
    ok: false,
    error: expect.objectContaining({ message: 'replacement failed' }),
  });
  expect(adapter.sourceStateById.get('source-1')).toBe(previousState);
  expect(replacement.dispose).toHaveBeenCalledOnce();
  adapter.dispose();
});
