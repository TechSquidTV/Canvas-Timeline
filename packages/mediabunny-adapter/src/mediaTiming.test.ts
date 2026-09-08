import { expect, test } from 'vite-plus/test';
import * as mediabunny from 'mediabunny';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { createMediabunnyAdapter } from '#mediabunny-adapter/index';
import { mediabunnyTestFixtures } from '#mediabunny-adapter-test/testHelpers';

const { createMockInput, createMockMediabunny, createActiveClip } = mediabunnyTestFixtures;

test('preserves negative media timestamps when mapping frames and metadata to logical source time', async () => {
  const input = createMockInput({ firstTimestamp: -0.5, metadataDuration: 2 });
  const mock = createMockMediabunny([input]);
  const adapter = createMediabunnyAdapter({
    mediabunny: mock.module,
    sources: [
      {
        sourceId: 'source-1',
        input: 'https://media.example/video.ts',
        timing: { sourceTimeSeconds: 10, mediaTimeSeconds: 0 },
      },
    ],
  });
  await adapter.preloadSource('source-1');
  expect(adapter.sourceStateById.get('source-1')?.metadata).toMatchObject({
    firstTimestampSeconds: -0.5,
    sourceFirstTimestampSeconds: 9.5,
    presentationStartTimestampSeconds: 0,
    endTimestampSeconds: 2,
    sourceEndTimestampSeconds: 12,
    durationSeconds: 2,
  });
  expect(input.computeDuration).not.toHaveBeenCalled();
  const frame = await adapter.getFrame({
    ...createActiveClip('visual', 'source-1', 0),
    sourceTime: fromSeconds(9.75),
  });
  expect(mock.canvasSink.getCanvas).toHaveBeenCalledWith(-0.25);
  expect(frame?.timestamp).toBe(9.75);
  adapter.dispose();
});

test.each([-0.5, 2])('reads Matroska duration with a %ss timestamp origin', async (start) => {
  const target = new mediabunny.BufferTarget();
  const output = new mediabunny.Output({ format: new mediabunny.MkvOutputFormat(), target });
  const source = new mediabunny.EncodedAudioPacketSource('pcm-s16');
  output.addAudioTrack(source);
  await output.start();
  const sampleRate = 8000;
  for (let index = 0; index < 4; index += 1) {
    await source.add(
      new mediabunny.EncodedPacket(new Uint8Array(sampleRate), 'key', start + index * 0.5, 0.5),
      { decoderConfig: { codec: 'pcm-s16', sampleRate, numberOfChannels: 1 } }
    );
  }
  await output.finalize();
  const buffer = target.buffer;
  if (buffer === null) {
    throw new Error('Matroska fixture was not finalized');
  }
  const input = new mediabunny.Input({
    formats: mediabunny.ALL_FORMATS,
    source: new mediabunny.BufferSource(buffer),
  });
  const adapter = createMediabunnyAdapter({
    mediabunny,
    sources: [{ sourceId: 'source-1', input: { kind: 'input', input } }],
  });
  try {
    await expect(adapter.preloadSource('source-1')).resolves.toMatchObject({ ok: true });
    expect(adapter.sourceStateById.get('source-1')?.metadata).toMatchObject({
      firstTimestampSeconds: start,
      presentationStartTimestampSeconds: Math.max(0, start),
      endTimestampSeconds: start + 2,
      durationSeconds: start + 2 - Math.max(0, start),
    });
  } finally {
    adapter.dispose();
    input.dispose();
  }
});
