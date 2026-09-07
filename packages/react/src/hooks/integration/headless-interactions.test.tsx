import { TimelineProvider } from '#react/Provider';
import { Timeline } from '#react/components';
import {
  useTimelineClipTrim,
  useTimelineKeyboard,
  useTimelineMarkers,
  useTimelineMediaSync,
} from '#react/hooks';
import {
  createClip,
  createTrack,
  createMediaSyncEngine,
  mediaSyncLayers,
  wrapper,
} from '#react/hooks/integration/testHelpers';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vite-plus/test';

afterEach(() => vi.restoreAllMocks());

function createEngine() {
  const engine = new TimelineEngine({
    zoomScale: 100,
    duration: fromSeconds(10),
    tracks: [createTrack('track', [createClip('clip', 1, 5, { sourceStart: fromSeconds(2) })])],
  });
  engine.setViewportWidth(100);
  return engine;
}

function endSeconds(engine: TimelineEngine) {
  const found = engine.geometry.getClip('clip');
  if (!found) {
    throw new Error('Expected clip');
  }
  return toSeconds(found.clip.timelineEnd);
}

test('headless trims preview without document or render churn, commit once, and undo', () => {
  const engine = createEngine();
  let renders = 0;
  const { result } = renderHook(
    () => {
      renders++;
      return useTimelineClipTrim();
    },
    { wrapper: (props) => wrapper({ ...props, engine }) }
  );
  act(() => {
    expect(result.current.startClipTrim({ clipId: 'clip', edge: 'end', clientX: 500 }).ok).toBe(
      true
    );
  });
  expect(result.current.trimming).toBe(true);
  const before = renders;
  act(() => {
    expect(result.current.moveClipTrim({ clientX: 600 }).ok).toBe(true);
  });
  expect(renders).toBe(before);
  expect(endSeconds(engine)).toBe(5);
  act(() => {
    engine.setZoomScale(200);
    expect(result.current.moveClipTrim({ clientX: 650 }).ok).toBe(true);
  });
  act(() => {
    expect(result.current.endClipTrim().ok).toBe(true);
  });
  expect(endSeconds(engine)).toBe(6.5);
  expect(result.current.trimming).toBe(false);
  act(() => engine.undo());
  expect(endSeconds(engine)).toBe(5);
  expect(engine.canUndo).toBe(false);
});

test('trims reject bad starts, cancel on unmount, and preserve another interaction preview', () => {
  const engine = createEngine();
  const { result, unmount } = renderHook(() => useTimelineClipTrim(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  expect(result.current.moveClipTrim({ clientX: 0 })).toMatchObject({ reason: 'unsupported' });
  expect(
    result.current.startClipTrim({ clipId: 'missing', edge: 'end', clientX: 0 })
  ).toMatchObject({ reason: 'not-found' });
  expect(result.current.startClipTrim({ clipId: 'clip', edge: 'end', clientX: NaN })).toMatchObject(
    { reason: 'invalid-input' }
  );
  act(() => {
    result.current.startClipTrim({ clipId: 'clip', edge: 'end', clientX: 500 });
    result.current.moveClipTrim({ clientX: 600 });
  });
  expect(result.current.moveClipTrim({ clientX: NaN })).toMatchObject({ reason: 'invalid-input' });
  act(() => {
    result.current.cancelClipTrim();
  });
  expect(engine.getEditPreview()).toBeNull();
  expect(endSeconds(engine)).toBe(5);
  act(() => {
    result.current.startClipTrim({ clipId: 'clip', edge: 'end', clientX: 500 });
    result.current.moveClipTrim({ clientX: 600 });
  });
  const foreign = engine.previewEdit({ type: 'move', clipId: 'clip', startTime: fromSeconds(2) });
  act(() => {
    expect(result.current.endClipTrim()).toMatchObject({ reason: 'unsupported' });
  });
  expect(engine.getEditPreview()).toBe(foreign);
  act(() => {
    result.current.startClipTrim({ clipId: 'clip', edge: 'end', clientX: 500 });
    result.current.moveClipTrim({ clientX: 600 });
  });
  unmount();
  expect(engine.getEditPreview()).toBeNull();
  expect(engine.canUndo).toBe(false);
});

test('trims prepare snapping and recheck locks at commit', () => {
  const engine = createEngine();
  engine.addMarker(fromSeconds(6));
  const { result } = renderHook(() => useTimelineClipTrim(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  act(() => {
    result.current.startClipTrim({ clipId: 'clip', edge: 'end', clientX: 500 });
    result.current.moveClipTrim({ clientX: 596 });
  });
  expect(engine.getEditPreview()?.valid).toBe(true);
  act(() => {
    result.current.endClipTrim();
  });
  expect(endSeconds(engine)).toBe(6);
  act(() => {
    result.current.startClipTrim({ clipId: 'clip', edge: 'end', clientX: 600 });
    result.current.moveClipTrim({ clientX: 700 });
    engine.toggleLockTrack('track', true);
  });
  act(() => {
    expect(result.current.endClipTrim()).toMatchObject({ reason: 'locked' });
  });
  expect(endSeconds(engine)).toBe(6);
  expect(
    result.current.startClipTrim({ clipId: 'clip', edge: 'start', clientX: 100 })
  ).toMatchObject({ reason: 'locked' });
});

test('keyboard commands and retained marker commands use current state without subscriptions', () => {
  const engine = createEngine();
  let renders = 0;
  const { result } = renderHook(
    () => {
      renders++;
      return useTimelineKeyboard({ frameRate: 24 });
    },
    { wrapper: (props) => wrapper({ ...props, engine }) }
  );
  const before = renders;
  const execute = result.current.executeCommand;
  act(() => {
    engine.addMarker(fromSeconds(2));
    engine.updatePlayhead(fromSeconds(1));
    engine.setZoomScale(50);
    engine.renameTrack('track', 'New');
  });
  expect(renders).toBe(before);
  act(() => {
    void execute('seekToNextMarker');
    void execute('zoomIn');
    void execute('toggleSnapping');
    void execute('toggleSnapping');
  });
  expect(toSeconds(engine.playheadTime)).toBe(2);
  expect(engine.zoomScale).toBe(60);
  expect(engine.getState().snapEnabled).toBe(true);
  expect(renders).toBe(before);
  const markers = renderHook(() => useTimelineMarkers(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  const seekNext = markers.result.current.seekToNextMarker;
  act(() => {
    engine.addMarker(fromSeconds(3));
    expect(seekNext().ok).toBe(true);
  });
  expect(toSeconds(engine.playheadTime)).toBe(3);
});

test('keyboard scopes await injected media startup and use the external clock', async () => {
  const engine = createMediaSyncEngine();
  const nativePlay = vi.spyOn(engine, 'play');
  let resolveStart = (_value: boolean) => {};
  const startup = new Promise<boolean>((resolve) => {
    resolveStart = resolve;
  });
  const startClock = vi.fn(() => startup);
  const stopClock = vi.fn();
  const onCommandResult = vi.fn();
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  function Surface() {
    const media = useTimelineMediaSync({
      layers: mediaSyncLayers,
      adapter: { getClockTime: () => 1, startClock, stopClock },
      ready: true,
    });
    return (
      <Timeline.KeyboardScope
        commandHandlers={{ togglePlayback: () => (media.playing ? media.pause() : media.play()) }}
        onCommandResult={onCommandResult}
      >
        <input aria-label="Name" />
      </Timeline.KeyboardScope>
    );
  }
  const { getByRole, getByLabelText } = render(
    <TimelineProvider engine={engine}>
      <Surface />
    </TimelineProvider>
  );
  const scope = getByRole('group');
  scope.focus();
  fireEvent.keyDown(scope, { key: 'Space' });
  fireEvent.keyDown(scope, { key: 'Space', repeat: true });
  await waitFor(() => expect(startClock).toHaveBeenCalledOnce());
  expect(onCommandResult).not.toHaveBeenCalled();
  expect(nativePlay).not.toHaveBeenCalled();
  await act(async () => {
    resolveStart(true);
  });
  await waitFor(() =>
    expect(onCommandResult).toHaveBeenCalledWith(
      'togglePlayback',
      expect.objectContaining({ ok: true })
    )
  );
  expect(engine.getState().playing).toBe(true);
  fireEvent.keyDown(scope, { key: 'Space' });
  expect(stopClock).toHaveBeenCalled();
  expect(engine.getState().playing).toBe(false);
  getByLabelText('Name').focus();
  fireEvent.keyDown(getByLabelText('Name'), { key: 'Space' });
  expect(startClock).toHaveBeenCalledOnce();
});

test('keyboard scopes surface rejected overrides and preserve structured failures', async () => {
  const engine = createEngine();
  const onCommandError = vi.fn();
  const onCommandResult = vi.fn();
  const failure = new Error('clock unavailable');
  const rejected = vi.fn(() => Promise.reject(failure));
  const { getByRole, rerender } = render(
    <TimelineProvider engine={engine}>
      <Timeline.KeyboardScope
        commandHandlers={{ togglePlayback: rejected }}
        onCommandError={onCommandError}
      />
    </TimelineProvider>
  );
  const scope = getByRole('group');
  scope.focus();
  fireEvent.keyDown(scope, { key: 'Space' });
  await waitFor(() => expect(onCommandError).toHaveBeenCalledWith(failure, 'togglePlayback'));
  rerender(
    <TimelineProvider engine={engine}>
      <Timeline.KeyboardScope
        commandHandlers={{
          togglePlayback: () => ({ ok: false, reason: 'not-ready', message: 'Loading media' }),
        }}
        onCommandResult={onCommandResult}
      />
    </TimelineProvider>
  );
  fireEvent.keyDown(scope, { key: 'Space' });
  await waitFor(() =>
    expect(onCommandResult).toHaveBeenCalledWith('togglePlayback', {
      ok: false,
      reason: 'not-ready',
      message: 'Loading media',
    })
  );
  expect(engine.getState().playing).toBe(false);
});

test('trim ownership resets when the provider engine changes, and a click does not create history', () => {
  const previousEngine = createEngine();
  let engine = previousEngine;
  const { result, rerender } = renderHook(() => useTimelineClipTrim(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });
  act(() => {
    result.current.startClipTrim({ clipId: 'clip', edge: 'end', clientX: 500 });
    result.current.moveClipTrim({ clientX: 600 });
  });
  engine = createEngine();
  rerender();
  expect(result.current.trimming).toBe(false);
  expect(previousEngine.getEditPreview()).toBeNull();
  expect(endSeconds(previousEngine)).toBe(5);
  act(() => {
    result.current.startClipTrim({ clipId: 'clip', edge: 'end', clientX: 500 });
    result.current.endClipTrim();
  });
  expect(engine.canUndo).toBe(false);
});

test('keyboard options report malformed frame or zoom steps as invalid input', () => {
  const engine = createEngine();
  const { result } = renderHook(
    () => useTimelineKeyboard({ frameRate: 24, frameStepCount: -1, zoomStepRatio: NaN }),
    { wrapper: (props) => wrapper({ ...props, engine }) }
  );
  const before = engine.getState();
  expect(result.current.executeCommand('stepForward')).toMatchObject({
    ok: false,
    reason: 'invalid-input',
  });
  expect(result.current.executeCommand('zoomIn')).toMatchObject({
    ok: false,
    reason: 'invalid-input',
  });
  expect(engine.getState()).toBe(before);
});
