import { expect, test } from 'vite-plus/test';
import { createMediabunnyAdapter, formatMediabunnyTime } from '#mediabunny-adapter/index';
import { mediabunnyTestFixtures } from '#mediabunny-adapter-test/testHelpers';

const {
  createMockAudioTrack,
  createMockInput,
  createMockAudioContext,
  urlSource,
  createMockMediabunny,
} = mediabunnyTestFixtures;

test('formatMediabunnyTime formats finite and invalid values', () => {
  expect(formatMediabunnyTime(1.234)).toBe('1.23s');
  expect(formatMediabunnyTime(Number.NaN)).toBe('0.00s');
});

test('createMediabunnyAdapter rejects invalid initial volume', () => {
  const mediabunny = createMockMediabunny([]).module;

  for (const volume of [Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01]) {
    expect(() =>
      createMediabunnyAdapter({
        audio: { volume },
        mediabunny,
        sources: [],
      })
    ).toThrow('volume must be a finite number from 0 to 1.');
  }
});

test('createMediabunnyAdapter publishes audio readiness with its committed source', async () => {
  const input = createMockInput({
    videoTrack: null,
    audioTrack: createMockAudioTrack(),
  });
  const audioContext = createMockAudioContext();
  const snapshots: Array<{ audioState: string; sourceStatus: string | null }> = [];
  let currentAdapter: ReturnType<typeof createMediabunnyAdapter> | null = null;
  const adapter = createMediabunnyAdapter({
    audio: { context: audioContext as unknown as AudioContext },
    mediabunny: createMockMediabunny([input]).module,
    sources: [urlSource('audio-source', 'https://media.example/audio.webm')],
    onChange: () => {
      if (currentAdapter !== null) {
        snapshots.push({
          audioState: currentAdapter.audioStatus.state,
          sourceStatus: currentAdapter.sourceStateById.get('audio-source')?.status ?? null,
        });
      }
    },
  });
  currentAdapter = adapter;

  await expect(adapter.preloadSource('audio-source')).resolves.toMatchObject({
    ok: true,
    state: 'ready',
  });

  expect(snapshots).toEqual([
    { audioState: 'unavailable', sourceStatus: 'loading' },
    { audioState: 'running', sourceStatus: 'ready' },
  ]);
});
