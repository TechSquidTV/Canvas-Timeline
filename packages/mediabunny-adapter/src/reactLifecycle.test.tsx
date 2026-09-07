import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { expect, test, vi } from 'vite-plus/test';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { TimelineProvider } from '@techsquidtv/canvas-timeline-react';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { useMediabunnyAdapter, useMediabunnyTimelineMedia } from '#mediabunny-adapter/react';
import {
  mediabunnyTestFixtures,
  type MockVideoTrack,
  type MockCanvasSink,
  type MockWrappedCanvas,
} from '#mediabunny-adapter-test/testHelpers';

const {
  createMockInput,
  createMockMediabunny,
  createMockVideoTrack,
  createClip,
  createTrack,
  urlSource,
} = mediabunnyTestFixtures;

test('useMediabunnyAdapter preserves explicit replacements across equivalent inline registries', async () => {
  let resolveReplacementTrack = (_track: MockVideoTrack | null) => {};
  const replacementInput = createMockInput({ metadataDuration: 9 });
  replacementInput.getPrimaryVideoTrack = vi.fn(
    () =>
      new Promise<MockVideoTrack | null>((resolve) => {
        resolveReplacementTrack = resolve;
      })
  );
  const mock = createMockMediabunny([
    createMockInput(),
    replacementInput,
    createMockInput({ metadataDuration: 12 }),
  ]);
  const { result, rerender, unmount } = renderHook(
    ({ sourceUrl, reversed }: { sourceUrl: string; reversed: boolean }) => {
      const sources = [urlSource('source-1', sourceUrl), urlSource('source-2', '/second.mp4')];
      return useMediabunnyAdapter({
        mediabunny: mock.module,
        sources: reversed ? sources.reverse() : sources,
      });
    },
    { initialProps: { sourceUrl: '/original.mp4', reversed: false } }
  );
  try {
    await act(async () => {
      await result.current.preloadSource('source-1');
    });
    const originalAdapter = result.current;
    let replacement: ReturnType<typeof originalAdapter.replaceSource> | undefined;
    act(() => {
      replacement = result.current.replaceSource(urlSource('source-1', '/proxy.mp4'));
    });
    await waitFor(() => expect(replacementInput.getPrimaryVideoTrack).toHaveBeenCalledOnce());
    rerender({ sourceUrl: '/original.mp4', reversed: true });
    await act(async () => {
      resolveReplacementTrack(createMockVideoTrack());
      await expect(replacement).resolves.toMatchObject({ ok: true, state: 'ready' });
    });
    rerender({ sourceUrl: '/original.mp4', reversed: false });
    expect(result.current).toBe(originalAdapter);
    expect(result.current.sourceStateById.get('source-1')?.metadata?.durationSeconds).toBe(9);
    expect(mock.constructInput).toHaveBeenCalledTimes(2);
    expect(replacementInput.dispose).not.toHaveBeenCalled();

    rerender({ sourceUrl: '/updated.mp4', reversed: false });
    await act(async () => {
      await result.current.preloadSource('source-1');
    });
    expect(replacementInput.dispose).toHaveBeenCalledOnce();
    expect(result.current.sourceStateById.get('source-1')?.metadata?.durationSeconds).toBe(12);
    expect(mock.createdUrlSources).toEqual(['/original.mp4', '/proxy.mp4', '/updated.mp4']);
  } finally {
    unmount();
  }
});

test('useMediabunnyTimelineMedia pauses when terminal decoder recovery settles between ticks', async () => {
  const decoderError = new Error('terminal decoder failure');
  const canvasSink: MockCanvasSink = {
    getCanvas: vi.fn(async (timestamp) => ({
      canvas: document.createElement('canvas'),
      timestamp,
      duration: 1 / 30,
    })),
    canvases: vi.fn(async function* () {
      yield await Promise.reject<MockWrappedCanvas>(decoderError);
    }),
  };
  const mock = createMockMediabunny([createMockInput(), createMockInput()], { canvasSink });
  const engine = new TimelineEngine({
    duration: fromSeconds(5),
    playheadTime: fromSeconds(1),
    tracks: [createTrack('visual', [createClip('clip-1', 'source-1', 0, 0)])],
  });
  let tick: FrameRequestCallback | undefined;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const onError = vi.fn();
  const { result, unmount } = renderHook(
    () =>
      useMediabunnyTimelineMedia({
        mediabunny: mock.module,
        sources: [urlSource('source-1', '/video.mp4')],
        layers: { visuals: { trackKind: 'visual' } },
        onError,
      }),
    { wrapper: ({ children }) => <TimelineProvider engine={engine}>{children}</TimelineProvider> }
  );
  try {
    act(() => {
      result.current.canvasRef(document.createElement('canvas'));
    });
    await act(async () => {
      await expect(result.current.play()).resolves.toMatchObject({ ok: true });
    });
    await waitFor(() => {
      expect(result.current.sourceStateById.get('source-1')?.status).toBe('failed');
    });
    expect(engine.getState().playing).toBe(true);
    await act(async () => {
      tick?.(16);
    });
    await waitFor(() => expect(engine.getState().playing).toBe(false));
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ reason: 'sync-failed' }));
    expect(mock.constructInput).toHaveBeenCalledTimes(1);
  } finally {
    unmount();
  }
});
