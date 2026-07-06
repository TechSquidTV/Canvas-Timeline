import { renderHook, act, fireEvent, render, createEvent } from '@testing-library/react';
import React from 'react';
import { expect, test, vi } from 'vite-plus/test';
import { TimelineContext } from './context';
import {
  createTimelineScalarKeyframeProperty,
  TimelineEngine,
  type Clip,
  type Track,
} from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimelineProvider } from './Provider';
import { expectDefined } from '../../../test-utils/assertions';
import {
  useActiveClips,
  useActiveLayers,
  useActiveMarkers,
  usePlaybackEffect,
  useTimelineMediaSync,
  useTimelineMediaPlayback,
  useTimelineEditImpacts,
  useTimelineEditCommands,
  useTimelineEditMode,
  useTimelineEditPreview,
  useTimelinePlayback,
  useTimelineRangeSelection,
  useTimelineSnapping,
  useTimelineClips,
  useTimelineClipDrag,
  useTimelineClipDropFeedback,
  useTimelineExternalClipDrop,
  useTimelineClipGroups,
  useTimelineClipRects,
  useTimelineClipboard,
  useTimelineEvent,
  useTimelineHistory,
  useTimelineKeyframeSegments,
  useTimelineKeyframeTangentDrag,
  useTimelineKeyframeDrag,
  useTimelineKeyframes,
  useTimelineMarkers,
  useTimelineRulerTicks,
  useTimelineTimePosition,
  useTimelineSelection,
  useTimelineTrack,
  useTimelineTrackDropTargets,
  useTimelineTrackHeader,
  useTimelineTrackLockControl,
  useTimelineTracks,
  useTimelineViewport,
  useTimelineVisibleClips,
  type TimelineTrackDropResult,
} from './hooks';

const opacityKeyframeProperty = createTimelineScalarKeyframeProperty({
  id: 'opacity',
  label: 'Opacity',
  min: 0,
  max: 1,
  defaultValue: 1,
  getBaseValue: (clip) => clip.opacity ?? 1,
});

const levelKeyframeProperty = createTimelineScalarKeyframeProperty({
  id: 'level',
  label: 'Level',
  min: -60,
  max: 6,
  defaultValue: 0,
});

const wrapper = ({ children, engine }: { children: React.ReactNode; engine: TimelineEngine }) => {
  return React.createElement(
    TimelineContext.Provider,
    {
      value: { engine, state: engine.getState() },
    },
    children
  );
};

function createClip(id: string, start: number, end: number, overrides: Partial<Clip> = {}): Clip {
  return {
    id,
    sourceId: `${id}-source`,
    timelineStart: fromSeconds(start),
    timelineEnd: fromSeconds(end),
    sourceStart: fromSeconds(0),
    selected: false,
    ...overrides,
  };
}

function createTrack(id: string, clips: Clip[], overrides: Partial<Track> = {}): Track {
  return {
    id,
    kind: 'visual',
    selected: false,
    locked: false,
    muted: false,
    visible: true,
    clips,
    ...overrides,
  };
}

function createDragDataTransfer(value: string): DataTransfer {
  const fileEntries: File[] = [];
  const itemEntries: DataTransferItem[] = [];
  const files: FileList = {
    length: 0,
    item: () => null,
    [Symbol.iterator]: () => fileEntries[Symbol.iterator](),
  };
  const items: DataTransferItemList = {
    length: 0,
    add: vi.fn(() => null),
    clear: vi.fn(),
    remove: vi.fn(),
    [Symbol.iterator]: () => itemEntries[Symbol.iterator](),
  };
  return {
    dropEffect: 'none',
    effectAllowed: 'all',
    files,
    items,
    types: ['text/plain'],
    clearData: vi.fn(),
    getData: vi.fn(() => value),
    setData: vi.fn(),
    setDragImage: vi.fn(),
  };
}

function createTimelineDragEvent(
  type: 'dragOver' | 'drop',
  surface: Element,
  input: { clientX: number; clientY: number; dataTransfer: DataTransfer }
) {
  const event = type === 'dragOver' ? createEvent.dragOver(surface) : createEvent.drop(surface);
  Object.defineProperty(event, 'clientX', { value: input.clientX });
  Object.defineProperty(event, 'clientY', { value: input.clientY });
  Object.defineProperty(event, 'dataTransfer', { value: input.dataTransfer });
  return event;
}

test('useTimelinePlayback', () => {
  const engine = new TimelineEngine({ tracks: [] });
  const playSpy = vi.spyOn(engine, 'play');
  const pauseSpy = vi.spyOn(engine, 'pause');
  const setPlaybackRateSpy = vi.spyOn(engine, 'setPlaybackRate');

  const { result } = renderHook(() => useTimelinePlayback(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });

  act(() => {
    expect(result.current.play()).toEqual({ ok: true });
  });
  expect(playSpy).toHaveBeenCalled();

  act(() => {
    expect(result.current.play()).toEqual({ ok: true });
  });
  expect(playSpy).toHaveBeenCalledTimes(1);

  act(() => {
    result.current.pause();
  });
  expect(pauseSpy).toHaveBeenCalled();

  act(() => {
    result.current.setPlaybackRate(1.5);
  });
  expect(setPlaybackRateSpy).toHaveBeenCalledWith(1.5);
});

test('useTimelinePlayback does not subscribe to live playhead scrubs', () => {
  const engine = new TimelineEngine({
    duration: fromSeconds(10),
    tracks: [],
  });
  let renderCount = 0;

  const { result } = renderHook(
    () => {
      renderCount += 1;
      return useTimelinePlayback();
    },
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  const rendersBeforeScrub = renderCount;

  act(() => {
    engine.updatePlayhead(fromSeconds(4));
  });

  expect(renderCount).toBe(rendersBeforeScrub);
  expect(result.current).not.toHaveProperty('playheadSeconds');
  expect(result.current).not.toHaveProperty('playheadTime');
});

test('usePlaybackEffect calls matching clip callbacks and cleans up subscriptions', () => {
  const engine = new TimelineEngine({
    duration: fromSeconds(10),
    tracks: [createTrack('video-1', [createClip('intro', 1, 3), createClip('outro', 4, 6)])],
  });
  const onEnter = vi.fn();
  const onUpdate = vi.fn();
  const onLeave = vi.fn();
  const updatedOnUpdate = vi.fn();

  const { rerender, unmount } = renderHook(
    ({ onUpdateCallback }: { onUpdateCallback: (time: ReturnType<typeof fromSeconds>) => void }) =>
      usePlaybackEffect('intro', {
        onEnter,
        onUpdate: onUpdateCallback,
        onLeave,
      }),
    {
      initialProps: { onUpdateCallback: onUpdate },
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    engine.updatePlayhead(fromSeconds(1.5));
    engine.updatePlayhead(fromSeconds(2));
  });

  expect(onEnter).toHaveBeenCalledTimes(1);
  expect(toSeconds(onEnter.mock.calls[0][0])).toBe(1.5);
  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(toSeconds(onUpdate.mock.calls[0][0])).toBe(2);
  expect(onLeave).not.toHaveBeenCalled();

  rerender({ onUpdateCallback: updatedOnUpdate });

  act(() => {
    engine.updatePlayhead(fromSeconds(2.5));
    engine.updatePlayhead(fromSeconds(4.5));
  });

  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(updatedOnUpdate).toHaveBeenCalledTimes(1);
  expect(toSeconds(updatedOnUpdate.mock.calls[0][0])).toBe(2.5);
  expect(onLeave).toHaveBeenCalledTimes(1);
  expect(toSeconds(onLeave.mock.calls[0][0])).toBe(4.5);

  unmount();

  act(() => {
    engine.updatePlayhead(fromSeconds(1.5));
  });

  expect(onEnter).toHaveBeenCalledTimes(1);
});

test('useTimelineSnapping exposes canonical snap state and commands', () => {
  const engine = new TimelineEngine({
    markers: [{ id: 'marker-1', time: fromSeconds(5), label: 'M1' }],
    playheadTime: fromSeconds(12),
    tracks: [],
    zoomScale: 100,
  });

  const { result } = renderHook(() => useTimelineSnapping(), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  expect(result.current.enabled).toBe(true);
  expect(result.current.thresholdPixels).toBe(10);

  act(() => {
    expect(result.current.setThresholdPixels(12)).toEqual({ ok: true });
    expect(result.current.setEnabled(false)).toEqual({ ok: true });
  });

  expect(result.current.enabled).toBe(false);
  expect(result.current.thresholdPixels).toBe(12);

  act(() => {
    result.current.setEnabled(true);
    result.current.prepareSnapping();
    const snap = result.current.resolveSnap(fromSeconds(5.05));
    expect(snap?.target.kind).toBe('marker');
  });

  expect(result.current.feedback.lines).toEqual([5]);
  expect(result.current.activeTarget?.ownerId).toBe('marker-1');

  act(() => {
    result.current.settle();
  });

  expect(result.current.feedback.lines).toEqual([]);
  expect(result.current.activeTarget).toBeNull();
});

test('useTimelineHistory', () => {
  const engine = new TimelineEngine({ tracks: [] });
  const undoSpy = vi.spyOn(engine, 'undo');
  const redoSpy = vi.spyOn(engine, 'redo');

  const { result } = renderHook(() => useTimelineHistory(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });

  act(() => {
    const undoResult = result.current.undo();
    expect(undoResult).toEqual({ ok: false, reason: 'unsupported' });
  });
  expect(undoSpy).not.toHaveBeenCalled();

  act(() => {
    const redoResult = result.current.redo();
    expect(redoResult).toEqual({ ok: false, reason: 'unsupported' });
  });
  expect(redoSpy).not.toHaveBeenCalled();
});

test('useTimelineClips exposes flattened clips, lookups, and presentation updates', () => {
  const engine = new TimelineEngine({
    playheadTime: fromSeconds(1.5),
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 3, {
          selected: true,
          label: 'Intro',
        }),
        createClip('main', 4, 8),
      ]),
      createTrack('video-2', [createClip('overlay', 1, 5)]),
    ],
  });
  engine.setSnappingEnabled(false);

  const { result } = renderHook(() => useTimelineClips(), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  expect(result.current.clips.map(({ clip, track }) => `${track.id}:${clip.id}`)).toEqual([
    'video-1:intro',
    'video-1:main',
    'video-2:overlay',
  ]);
  expect(result.current.selectedClipId).toBe('intro');
  expect(result.current.selectedClipTrackId).toBe('video-1');

  act(() => {
    result.current.updateClip('intro', { label: 'Cold open', opacity: 0.5 });
  });

  const updated = expectDefined(engine.getClip('intro'), 'intro clip').clip;
  expect(updated.label).toBe('Cold open');
  expect(updated.opacity).toBe(0.5);
  expect(result.current.getClip('intro')?.track.id).toBe('video-1');
  expect(result.current.canMoveClip('intro')).toBe(true);
  expect(result.current.canTrimClip('intro')).toBe(true);
  expect(result.current.canSlipClip('intro')).toBe(true);
  expect(result.current.canSlideClip('intro')).toBe(true);

  act(() => {
    expect(result.current.selectClip('overlay')).toEqual({ ok: true });
  });

  expect(engine.getClip('overlay')?.clip.selected).toBe(true);
});

test('useTimelineEditCommands commits typed commands and reports validation failures', () => {
  const engine = new TimelineEngine({
    tracks: [createTrack('video-1', [createClip('intro', 0, 3)])],
  });
  engine.setSnappingEnabled(false);

  const { result } = renderHook(() => useTimelineEditCommands(), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  act(() => {
    expect(result.current.moveClip({ clipId: 'missing', startTime: fromSeconds(2) })).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });

  act(() => {
    expect(result.current.moveClip({ clipId: 'intro', startTime: fromSeconds(2) }).ok).toBe(true);
  });

  expect(toSeconds(engine.getClip('intro')?.clip.timelineStart ?? fromSeconds(0))).toBe(2);

  act(() => {
    expect(
      result.current.trimClip({
        clipId: 'intro',
        edge: 'end',
        newTime: fromSeconds(2.5),
        snap: false,
      }).ok
    ).toBe(true);
  });

  act(() => {
    expect(result.current.slipClip('intro', fromSeconds(0.25)).ok).toBe(true);
    expect(result.current.slideClip({ clipId: 'intro', deltaTime: fromSeconds(0.5) }).ok).toBe(
      true
    );
  });

  expect(toSeconds(engine.getClip('intro')?.clip.sourceStart ?? fromSeconds(0))).toBe(0.25);
  expect(toSeconds(engine.getClip('intro')?.clip.timelineStart ?? fromSeconds(0))).toBe(2.5);

  act(() => {
    expect(result.current.splitClip('intro', fromSeconds(2.75)).ok).toBe(true);
  });

  const splitClipId = engine.tracks[0]?.clips.find((clip) => clip.id !== 'intro')?.id;
  expect(splitClipId).toBeDefined();

  act(() => {
    const deleteResult = result.current.deleteClip(expectDefined(splitClipId, 'split clip id'));

    expect(deleteResult.ok).toBe(true);
    expect(deleteResult.value?.committed).toBe(true);
    expect(deleteResult.value?.command.type).toBe('delete-clips');
  });

  act(() => {
    expect(
      result.current.insertClip({
        clip: createClip('inserted', 0, 1),
        targetTrackId: 'video-1',
        startTime: fromSeconds(2),
        snap: false,
      }).ok
    ).toBe(true);
  });

  expect(engine.getClip('inserted')).toBeDefined();
});

test('useTimelineEditPreview subscribes to command preview changes', () => {
  const engine = new TimelineEngine({
    tracks: [createTrack('video-1', [createClip('intro', 0, 5)])],
  });
  const { result } = renderHook(() => useTimelineEditPreview(), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  expect(result.current.previewing).toBe(false);

  act(() => {
    engine.previewEdit({
      type: 'trim',
      clipId: 'intro',
      edge: 'end',
      newTime: fromSeconds(3),
      snap: false,
    });
  });

  expect(result.current.previewing).toBe(true);
  expect(result.current.valid).toBe(true);

  act(() => {
    engine.cancelEdit();
  });

  expect(result.current.preview).toBeNull();
});

test('useTimelineEditMode owns local toolbar mode state', () => {
  const { result } = renderHook(() => useTimelineEditMode());

  expect(result.current.mode).toBe('select');
  expect(result.current.selecting).toBe(true);

  act(() => {
    result.current.setMode('overwrite');
  });

  expect(result.current.mode).toBe('overwrite');

  act(() => {
    result.current.resetMode();
  });

  expect(result.current.mode).toBe('select');
});

test('useTimelineRangeSelection adapts In/Out points to range commands', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('before', 0, 1),
        createClip('middle', 2, 4),
        createClip('after', 5, 7),
      ]),
    ],
  });

  const { result } = renderHook(() => useTimelineRangeSelection(), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  expect(result.current.hasRange).toBe(false);

  act(() => {
    result.current.setRange({ startTime: fromSeconds(2), endTime: fromSeconds(4) });
  });

  expect(result.current.hasRange).toBe(true);

  act(() => {
    expect(result.current.deleteRange({ trackIds: ['video-1'] }).ok).toBe(true);
  });

  expect(engine.getClip('middle')).toBeUndefined();
  expect(toSeconds(engine.getClip('after')?.clip.timelineStart ?? fromSeconds(0))).toBe(3);
});

test('useTimelineTrackDropTargets applies same-kind drop rules by default', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('visual-a', [createClip('clip-a', 0, 2, { selected: true })]),
      createTrack('visual-b', []),
      createTrack('audio-a', [], { kind: 'audio' }),
    ],
  });

  const { result } = renderHook(() => useTimelineTrackDropTargets(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });

  expect(result.current.canDropClipOnTrack('clip-a', 'visual-b')).toMatchObject({
    canDrop: true,
    reason: null,
  });
  expect(result.current.canDropClipOnTrack('clip-a', 'audio-a')).toMatchObject({
    canDrop: false,
    reason: 'incompatible-track-kind',
  });
});

test('useTimelineTrackDropTargets reports invalid and locked drop targets', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('visual-a', [
        createClip('clip-a', 0, 2, { selected: true }),
        createClip('locked-clip', 3, 5, { movable: false }),
      ]),
      createTrack('visual-b', []),
      createTrack('locked-target', [], { locked: true }),
    ],
  });

  const { result } = renderHook(() => useTimelineTrackDropTargets(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });

  expect(result.current.canDropClipOnTrack('missing', 'visual-b')).toEqual({
    canDrop: false,
    reason: 'not-found',
    allowCrossKindTrackMove: false,
  });
  expect(result.current.canDropClipOnTrack('clip-a', 'missing')).toEqual({
    canDrop: false,
    reason: 'invalid-track',
    allowCrossKindTrackMove: false,
  });
  expect(result.current.canDropClipOnTrack('clip-a', 'visual-b', 'missing')).toEqual({
    canDrop: false,
    reason: 'invalid-track',
    allowCrossKindTrackMove: false,
  });
  expect(result.current.canDropClipOnTrack('locked-clip', 'visual-b')).toEqual({
    canDrop: false,
    reason: 'locked',
    allowCrossKindTrackMove: false,
  });
  expect(result.current.canDropClipOnTrack('clip-a', 'locked-target')).toEqual({
    canDrop: false,
    reason: 'locked',
    allowCrossKindTrackMove: false,
  });
});

test('useTimelineTrackDropTargets normalizes custom drop guard results', () => {
  type DropGuardTestProps = {
    allowDrop: boolean | TimelineTrackDropResult;
  };
  const engine = new TimelineEngine({
    tracks: [
      createTrack('visual-a', [createClip('clip-a', 0, 2, { selected: true })]),
      createTrack('visual-b', []),
      createTrack('audio-a', [], { kind: 'audio' }),
    ],
  });

  const { result, rerender } = renderHook(
    ({ allowDrop }: DropGuardTestProps) =>
      useTimelineTrackDropTargets({
        canDropClipOnTrack: () => allowDrop,
      }),
    {
      initialProps: { allowDrop: false } as DropGuardTestProps,
      wrapper: (props) => wrapper({ ...props, engine }),
    }
  );

  expect(result.current.canDropClipOnTrack('clip-a', 'visual-b')).toEqual({
    canDrop: false,
    reason: 'unsupported',
    allowCrossKindTrackMove: false,
  });

  rerender({ allowDrop: true });

  expect(result.current.canDropClipOnTrack('clip-a', 'audio-a')).toEqual({
    canDrop: true,
    reason: null,
    allowCrossKindTrackMove: true,
  });

  rerender({
    allowDrop: {
      canDrop: false,
      reason: 'incompatible-track-kind',
      allowCrossKindTrackMove: false,
    },
  });

  expect(result.current.canDropClipOnTrack('clip-a', 'visual-b')).toEqual({
    canDrop: false,
    reason: 'incompatible-track-kind',
    allowCrossKindTrackMove: false,
  });
});

test('useTimelineExternalClipDrop resolves drag-over track and time feedback', () => {
  const engine = new TimelineEngine({
    tracks: [createTrack('visual-a', []), createTrack('audio-a', [], { kind: 'audio' })],
    zoomScale: 100,
  });

  function DropSurface() {
    const drop = useTimelineExternalClipDrop<{ id: string }>({
      resolveDragData: () => ({ id: 'asset-a' }),
      createPlacements: () => [],
      rulerHeight: 32,
      trackHeight: 48,
    });
    return React.createElement('div', {
      'data-testid': 'surface',
      'data-dragging': String(drop.dragging),
      'data-hovered-track': drop.hoveredTrackId ?? '',
      'data-drop-seconds': drop.dropSeconds ?? '',
      'data-valid': String(drop.valid),
      ...drop.rootProps,
    });
  }

  const { getByTestId } = render(
    React.createElement(TimelineProvider, { engine }, React.createElement(DropSurface))
  );
  const surface = getByTestId('surface');
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 600,
    height: 160,
    right: 600,
    bottom: 160,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

  fireEvent(
    surface,
    createTimelineDragEvent('dragOver', surface, {
      clientX: 250,
      clientY: 40,
      dataTransfer: createDragDataTransfer('asset-a'),
    })
  );

  expect(surface.getAttribute('data-dragging')).toBe('true');
  expect(surface.getAttribute('data-hovered-track')).toBe('visual-a');
  expect(Number(surface.getAttribute('data-drop-seconds'))).toBeCloseTo(2.5);
  expect(surface.getAttribute('data-valid')).toBe('true');
});

test('useTimelineExternalClipDrop reports invalid payload and rejected tracks', () => {
  const engine = new TimelineEngine({
    tracks: [createTrack('visual-a', []), createTrack('audio-a', [], { kind: 'audio' })],
    zoomScale: 100,
  });

  function DropSurface() {
    const drop = useTimelineExternalClipDrop<{ id: string }>({
      resolveDragData: (event) => {
        const id = event.dataTransfer.getData('text/plain');
        return id === '' ? null : { id };
      },
      createPlacements: () => [],
      canDropOnTrack: (context) => context.targetTrack.kind === 'visual',
      rulerHeight: 32,
      trackHeight: 48,
    });
    return React.createElement('div', {
      'data-testid': 'surface',
      'data-hovered-track': drop.hoveredTrackId ?? '',
      'data-reason': drop.reason ?? '',
      'data-valid': String(drop.valid),
      ...drop.rootProps,
    });
  }

  const { getByTestId } = render(
    React.createElement(TimelineProvider, { engine }, React.createElement(DropSurface))
  );
  const surface = getByTestId('surface');
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 600,
    height: 160,
    right: 600,
    bottom: 160,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

  fireEvent(
    surface,
    createTimelineDragEvent('dragOver', surface, {
      clientX: 250,
      clientY: 40,
      dataTransfer: createDragDataTransfer(''),
    })
  );
  expect(surface.getAttribute('data-valid')).toBe('false');
  expect(surface.getAttribute('data-reason')).toBe('unsupported');

  fireEvent(
    surface,
    createTimelineDragEvent('dragOver', surface, {
      clientX: 250,
      clientY: 96,
      dataTransfer: createDragDataTransfer('asset-a'),
    })
  );
  expect(surface.getAttribute('data-hovered-track')).toBe('audio-a');
  expect(surface.getAttribute('data-valid')).toBe('false');
  expect(surface.getAttribute('data-reason')).toBe('unsupported');
});

test('useTimelineExternalClipDrop commits single and grouped drops', () => {
  const engine = new TimelineEngine({
    tracks: [createTrack('visual-a', []), createTrack('audio-a', [], { kind: 'audio' })],
    zoomScale: 100,
  });
  engine.setSnappingEnabled(false);

  function DropSurface() {
    const drop = useTimelineExternalClipDrop<{ kind: 'single' | 'av'; id: string }>({
      resolveDragData: (event) => {
        const value = event.dataTransfer.getData('text/plain');
        return value === 'av' ? { kind: 'av', id: 'av' } : { kind: 'single', id: 'single' };
      },
      createPlacements: (context) => {
        if (context.data.kind === 'single') {
          return [
            {
              clip: createClip('single-drop', 0, 1),
              targetTrackId: context.targetTrack.id,
              startTime: context.dropTime,
            },
          ];
        }
        return [
          {
            clip: createClip('video-drop', 0, 2),
            targetTrackId: context.targetTrack.id,
            startTime: context.dropTime,
          },
          {
            clip: createClip('audio-drop', 0, 2),
            targetTrackId: 'audio-a',
            startTime: context.dropTime,
          },
        ];
      },
      group: { groupId: 'external-av', label: 'External AV' },
      editMode: 'overwrite',
      snap: false,
      rulerHeight: 32,
      trackHeight: 48,
    });
    return React.createElement('div', {
      'data-testid': 'surface',
      'data-last-ok': drop.lastResult === null ? '' : String(drop.lastResult.ok),
      'data-dragging': String(drop.dragging),
      ...drop.rootProps,
    });
  }

  const { getByTestId } = render(
    React.createElement(TimelineProvider, { engine }, React.createElement(DropSurface))
  );
  const surface = getByTestId('surface');
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 600,
    height: 160,
    right: 600,
    bottom: 160,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

  fireEvent(
    surface,
    createTimelineDragEvent('drop', surface, {
      clientX: 100,
      clientY: 40,
      dataTransfer: createDragDataTransfer('single'),
    })
  );

  expect(engine.getClip('single-drop')).toBeDefined();
  expect(surface.getAttribute('data-last-ok')).toBe('true');
  expect(surface.getAttribute('data-dragging')).toBe('false');

  fireEvent(
    surface,
    createTimelineDragEvent('drop', surface, {
      clientX: 300,
      clientY: 40,
      dataTransfer: createDragDataTransfer('av'),
    })
  );

  expect(engine.getClip('video-drop')).toBeDefined();
  expect(engine.getClip('audio-drop')).toBeDefined();
  expect(engine.getClipGroup('external-av')).toMatchObject({
    label: 'External AV',
    clipIds: ['video-drop', 'audio-drop'],
  });
});

test('useTimelineExternalClipDrop prepares snapping before committing a drop', () => {
  const engine = new TimelineEngine({
    markers: [{ id: 'snap-marker', time: fromSeconds(2), label: 'Snap' }],
    tracks: [createTrack('visual-a', [])],
    zoomScale: 100,
  });

  function DropSurface() {
    const drop = useTimelineExternalClipDrop<{ id: string }>({
      resolveDragData: () => ({ id: 'asset-a' }),
      createPlacements: (context) => [
        {
          clip: createClip('snapped-drop', 0, 1),
          targetTrackId: context.targetTrack.id,
          startTime: context.dropTime,
        },
      ],
      rulerHeight: 32,
      trackHeight: 48,
    });
    return React.createElement('div', {
      'data-testid': 'surface',
      'data-last-ok': drop.lastResult === null ? '' : String(drop.lastResult.ok),
      ...drop.rootProps,
    });
  }

  const { getByTestId } = render(
    React.createElement(TimelineProvider, { engine }, React.createElement(DropSurface))
  );
  const surface = getByTestId('surface');
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 600,
    height: 120,
    right: 600,
    bottom: 120,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

  fireEvent(
    surface,
    createTimelineDragEvent('drop', surface, {
      clientX: 205,
      clientY: 40,
      dataTransfer: createDragDataTransfer('asset-a'),
    })
  );

  expect(surface.getAttribute('data-last-ok')).toBe('true');
  expect(
    toSeconds(engine.getClip('snapped-drop')?.clip.timelineStart ?? fromSeconds(0))
  ).toBeCloseTo(2);
});

test('useTimelineClipDrag activates cross-track targets after penetration threshold', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('visual-a', [createClip('clip-a', 0, 2, { selected: true })]),
      createTrack('visual-b', []),
    ],
  });
  engine.setSnappingEnabled(false);

  const { result } = renderHook(
    () => ({
      drag: useTimelineClipDrag({ rulerHeight: 32, trackHeight: 48 }),
      feedback: useTimelineClipDropFeedback(),
    }),
    {
      wrapper: (props) => wrapper({ ...props, engine }),
    }
  );

  act(() => {
    result.current.drag.startClipDrag({
      clipId: 'clip-a',
      clientX: 0,
      viewportY: 40,
    });
    result.current.drag.moveClipDrag({
      clientX: 20,
      viewportY: 90,
    });
  });

  expect(expectDefined(engine.getClip('clip-a'), 'clip-a').track.id).toBe('visual-a');
  expect(result.current.feedback.activeTargetTrackId).toBe('visual-a');

  act(() => {
    result.current.drag.moveClipDrag({
      clientX: 20,
      viewportY: 96,
    });
  });

  expect(expectDefined(engine.getClip('clip-a'), 'clip-a').track.id).toBe('visual-b');
  expect(result.current.feedback.activeTargetTrackId).toBe('visual-b');

  act(() => {
    result.current.drag.endClipDrag();
  });
});

test('useTimelineClipDrag measures reverse penetration from the active target track', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('visual-a', [createClip('clip-a', 0, 2, { selected: true })]),
      createTrack('visual-b', []),
      createTrack('visual-c', []),
    ],
  });
  engine.setSnappingEnabled(false);

  const { result } = renderHook(
    () => ({
      drag: useTimelineClipDrag({ rulerHeight: 32, trackHeight: 48 }),
      feedback: useTimelineClipDropFeedback(),
    }),
    {
      wrapper: (props) => wrapper({ ...props, engine }),
    }
  );

  act(() => {
    result.current.drag.startClipDrag({
      clipId: 'clip-a',
      clientX: 0,
      viewportY: 40,
    });
    result.current.drag.moveClipDrag({
      clientX: 20,
      viewportY: 144,
    });
  });

  expect(expectDefined(engine.getClip('clip-a'), 'clip-a').track.id).toBe('visual-c');
  expect(result.current.feedback.activeTargetTrackId).toBe('visual-c');

  act(() => {
    result.current.drag.moveClipDrag({
      clientX: 20,
      viewportY: 118,
    });
  });

  expect(expectDefined(engine.getClip('clip-a'), 'clip-a').track.id).toBe('visual-c');
  expect(result.current.feedback.hoveredTrackId).toBe('visual-b');
  expect(result.current.feedback.activeTargetTrackId).toBe('visual-c');

  act(() => {
    result.current.drag.moveClipDrag({
      clientX: 20,
      viewportY: 112,
    });
  });

  expect(expectDefined(engine.getClip('clip-a'), 'clip-a').track.id).toBe('visual-b');
  expect(result.current.feedback.activeTargetTrackId).toBe('visual-b');

  act(() => {
    result.current.drag.endClipDrag();
  });
});

test('useTimelineClipDrag shows invalid hover feedback while preserving the last valid target', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('visual-a', [createClip('clip-a', 0, 2, { selected: true })]),
      createTrack('audio-a', [], { kind: 'audio' }),
    ],
  });
  engine.setSnappingEnabled(false);

  const { result } = renderHook(
    () => ({
      drag: useTimelineClipDrag({ rulerHeight: 32, trackHeight: 48 }),
      feedback: useTimelineClipDropFeedback(),
    }),
    {
      wrapper: (props) => wrapper({ ...props, engine }),
    }
  );

  act(() => {
    result.current.drag.startClipDrag({
      clipId: 'clip-a',
      clientX: 0,
      viewportY: 40,
    });
    result.current.drag.moveClipDrag({
      clientX: 20,
      viewportY: 96,
    });
  });

  expect(expectDefined(engine.getClip('clip-a'), 'clip-a').track.id).toBe('visual-a');
  expect(result.current.feedback.hoveredTrackId).toBe('audio-a');
  expect(result.current.feedback.activeTargetTrackId).toBe('visual-a');
  expect(result.current.feedback.valid).toBe(false);
  expect(result.current.feedback.feedback.reason).toBe('incompatible-track-kind');

  act(() => {
    result.current.drag.endClipDrag();
  });
});

test('useTimelineClipRects exposes canonical clip geometry and updates on geometry changes', () => {
  const engine = new TimelineEngine({
    scrollLeft: 25,
    tracks: [
      createTrack('video-1', [createClip('intro', 1, 3)], {
        height: 60,
      }),
    ],
    zoomScale: 50,
  });
  let renderCount = 0;

  const { result } = renderHook(
    () => {
      renderCount += 1;
      return useTimelineClipRects();
    },
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(result.current[0]).toMatchObject({
    clipIndex: 0,
    rect: {
      clipId: 'intro',
      height: 60,
      trackId: 'video-1',
      width: 100,
      x: 25,
      y: 32,
    },
    trackIndex: 0,
  });

  const rendersBeforePlayhead = renderCount;
  act(() => {
    engine.updatePlayhead(fromSeconds(2));
  });

  expect(renderCount).toBe(rendersBeforePlayhead);

  act(() => {
    engine.setScrollLeft(0);
  });

  expect(result.current[0].rect.x).toBe(50);

  act(() => {
    engine.setTrackHeight('video-1', 72);
  });

  expect(result.current[0].rect.height).toBe(72);
});

test('useTimelineKeyframes exposes keyframe geometry, evaluation, and commands', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 4, {
          selected: true,
          keyframes: [
            {
              id: 'opacity-start',
              property: 'opacity',
              time: fromSeconds(0),
              value: 1,
            },
          ],
        }),
      ]),
    ],
    zoomScale: 100,
    keyframeProperties: [opacityKeyframeProperty],
  });

  const { result } = renderHook(
    () =>
      useTimelineKeyframes({
        clipId: 'intro',
        property: 'opacity',
        selectedClipOnly: true,
        keyframeSize: 12,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(result.current.keyframes).toHaveLength(1);
  expect(result.current.visibleKeyframes[0].rect.width).toBe(12);

  act(() => {
    result.current.setKeyframe({
      clipId: 'intro',
      property: 'opacity',
      time: fromSeconds(2),
      value: 0.25,
    });
  });

  expect(result.current.keyframes).toHaveLength(2);
  expect(result.current.getPropertyValueAtTime('intro', 'opacity', fromSeconds(1))).toBe(0.625);
  expect(
    result.current.setKeyframe({
      clipId: 'missing',
      property: 'opacity',
      time: fromSeconds(2),
      value: 0.5,
    }).reason
  ).toBe('not-found');

  act(() => {
    result.current.updateKeyframe({
      clipId: 'intro',
      keyframeId: 'opacity-start',
      outgoing: { interpolation: 'bezier', handle: { x: 0.2, y: 1 } },
    });
  });

  expect(result.current.keyframes[0].outgoing).toEqual({
    interpolation: 'bezier',
    handle: { x: 0.2, y: 1 },
  });

  act(() => {
    result.current.selectKeyframe('intro', 'opacity-start');
  });

  expect(result.current.keyframes[0].selected).toBe(true);
});

test('useTimelineKeyframes reports invalid keyframe command input', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 4, {
          selected: true,
        }),
      ]),
    ],
    keyframeProperties: [opacityKeyframeProperty],
  });

  const { result } = renderHook(() => useTimelineKeyframes({ clipId: 'intro' }), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  expect(
    result.current.setKeyframe({
      clipId: 'intro',
      property: 'opacity',
      time: fromSeconds(1),
      value: Number.NaN,
    })
  ).toEqual({
    ok: false,
    reason: 'invalid-input',
    message: 'Timeline keyframe could not be created from the provided input.',
    cause: expect.any(RangeError),
  });
});

test('useTimelineKeyframeDrag previews keyframe time and value changes', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 4, {
          selected: true,
          keyframes: [
            {
              id: 'opacity-middle',
              property: 'opacity',
              time: fromSeconds(1),
              value: 0.5,
            },
          ],
        }),
      ]),
    ],
    zoomScale: 100,
    keyframeProperties: [opacityKeyframeProperty],
  });

  const { result } = renderHook(
    () => useTimelineKeyframeDrag({ rulerHeight: 32, trackHeight: 48, keyframeValuePadding: 7 }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );
  const rect = expectDefined(
    engine.getKeyframeRects({ rulerHeight: 32, trackHeight: 48 })[0],
    'keyframe rect'
  );

  act(() => {
    expect(
      result.current.startKeyframeDrag({
        clipId: 'intro',
        keyframeId: 'opacity-middle',
        clientX: rect.rect.x + rect.rect.width / 2,
        viewportY: rect.rect.y + rect.rect.height / 2,
        keyframeRect: rect,
      }).ok
    ).toBe(true);
  });

  act(() => {
    result.current.moveKeyframeDrag({
      clientX: rect.rect.x + rect.rect.width / 2 + 100,
      viewportY: 39,
    });
  });

  const keyframe = engine.getClipKeyframes('intro')[0];
  expect(toSeconds(keyframe.time)).toBe(2);
  expect(keyframe.value).toBe(1);

  act(() => {
    result.current.endKeyframeDrag();
  });
});

test('useTimelineKeyframeSegments exposes tangent geometry for non-opacity properties', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 4, {
          selected: true,
          keyframes: [
            {
              id: 'level-start',
              property: 'level',
              time: fromSeconds(0),
              value: -24,
              outgoing: { interpolation: 'bezier', handle: { x: 0.2, y: 0.8 } },
              selected: true,
            },
            {
              id: 'level-end',
              property: 'level',
              time: fromSeconds(4),
              value: 0,
              incoming: { interpolation: 'bezier', handle: { x: 0.8, y: 0.2 } },
            },
          ],
        }),
      ]),
    ],
    zoomScale: 100,
    keyframeProperties: [levelKeyframeProperty],
  });

  const { result } = renderHook(
    () =>
      useTimelineKeyframeSegments({
        property: 'level',
        selectedClipOnly: true,
        selectedKeyframeOnly: true,
        rulerHeight: 32,
        trackHeight: 48,
        tangentHandleSize: 8,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(result.current.visibleSegments[0].property).toBe('level');
  expect(result.current.visibleTangentHandles).toHaveLength(2);
  expect(result.current.visibleTangentHandles[0].keyframe.property).toBe('level');

  act(() => {
    expect(
      result.current.updateKeyframeSide({
        clipId: 'intro',
        keyframeId: 'level-start',
        side: 'outgoing',
        patch: {
          interpolation: 'bezier',
          handle: null,
        },
      }).ok
    ).toBe(true);
  });

  expect(engine.getClipKeyframes('intro', 'level')[0].outgoing).toEqual({
    interpolation: 'bezier',
    handle: { x: 0.42, y: 0 },
  });
});

test('useTimelineKeyframeSegments reports invalid side command input', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 4, {
          selected: true,
          keyframes: [
            {
              id: 'opacity-start',
              property: 'opacity',
              time: fromSeconds(0),
              value: 0.25,
            },
          ],
        }),
      ]),
    ],
    keyframeProperties: [opacityKeyframeProperty],
  });

  const { result } = renderHook(
    () => useTimelineKeyframeSegments({ property: 'opacity', rulerHeight: 32, trackHeight: 48 }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(
    result.current.updateKeyframeSide({
      clipId: 'intro',
      keyframeId: 'opacity-start',
      side: 'outgoing',
      patch: {
        interpolation: 'bezier',
        handle: { x: Number.NaN, y: 0.5 },
      },
    })
  ).toEqual({
    ok: false,
    reason: 'invalid-input',
    message: 'Timeline keyframe side could not be updated from the provided input.',
    cause: expect.any(RangeError),
  });
});

test('useTimelineKeyframeSegments exposes Bezier segments, tangent handles, and side commands', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 4, {
          selected: true,
          keyframes: [
            {
              id: 'opacity-start',
              property: 'opacity',
              time: fromSeconds(0),
              value: 0.25,
              outgoing: { interpolation: 'bezier', handle: { x: 0.2, y: 0.8 } },
              selected: true,
            },
            {
              id: 'opacity-end',
              property: 'opacity',
              time: fromSeconds(4),
              value: 0.75,
              incoming: { interpolation: 'bezier', handle: { x: 0.8, y: 0.2 } },
            },
          ],
        }),
      ]),
    ],
    zoomScale: 100,
    keyframeProperties: [opacityKeyframeProperty],
  });

  const { result } = renderHook(
    () =>
      useTimelineKeyframeSegments({
        property: 'opacity',
        selectedClipOnly: true,
        selectedKeyframeOnly: true,
        rulerHeight: 32,
        trackHeight: 48,
        tangentHandleSize: 8,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(result.current.visibleSegments).toHaveLength(1);
  expect(result.current.visibleTangentHandles).toHaveLength(2);
  expect(
    result.current.getTangentHandleAtPoint({
      property: 'opacity',
      x: result.current.visibleTangentHandles[0].point.x,
      y: result.current.visibleTangentHandles[0].point.y,
      rulerHeight: 32,
      trackHeight: 48,
      tangentHandleSize: 8,
    })?.side
  ).toBe('outgoing');

  act(() => {
    expect(
      result.current.updateKeyframeSide({
        clipId: 'intro',
        keyframeId: 'opacity-start',
        side: 'outgoing',
        patch: {
          interpolation: 'bezier',
          handle: { x: 0.1, y: 0.9 },
        },
      }).ok
    ).toBe(true);
  });

  expect(engine.getClipKeyframes('intro')[0].outgoing).toEqual({
    interpolation: 'bezier',
    handle: { x: 0.1, y: 0.9 },
  });
  expect(
    result.current.updateKeyframeSide({
      clipId: 'missing',
      keyframeId: 'opacity-start',
      side: 'outgoing',
      patch: {
        interpolation: 'bezier',
        handle: { x: 0.1, y: 0.9 },
      },
    }).reason
  ).toBe('not-found');
});

test('useTimelineKeyframeTangentDrag previews Bezier tangent handle changes', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 4, {
          selected: true,
          keyframes: [
            {
              id: 'opacity-start',
              property: 'opacity',
              time: fromSeconds(0),
              value: 0.25,
              outgoing: { interpolation: 'bezier', handle: { x: 0.2, y: 0.8 } },
              selected: true,
            },
            {
              id: 'opacity-end',
              property: 'opacity',
              time: fromSeconds(4),
              value: 0.75,
              incoming: { interpolation: 'bezier', handle: { x: 0.8, y: 0.2 } },
            },
          ],
        }),
      ]),
    ],
    zoomScale: 100,
    keyframeProperties: [opacityKeyframeProperty],
  });

  const { result } = renderHook(
    () =>
      useTimelineKeyframeTangentDrag({
        property: 'opacity',
        rulerHeight: 32,
        trackHeight: 48,
        tangentHandleSize: 8,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );
  const segment = expectDefined(
    engine.getKeyframeSegments({
      property: 'opacity',
      rulerHeight: 32,
      trackHeight: 48,
      tangentHandleSize: 8,
    })[0],
    'keyframe segment'
  );
  const incoming = expectDefined(segment.handles[1], 'incoming handle');

  act(() => {
    expect(
      result.current.startKeyframeTangentDrag({
        tangentHandle: incoming,
      }).ok
    ).toBe(true);
  });

  act(() => {
    result.current.moveKeyframeTangentDrag({
      viewportX: segment.startPoint.x + (segment.endPoint.x - segment.startPoint.x) * 0.6,
      viewportY: segment.startPoint.y + (segment.endPoint.y - segment.startPoint.y) * 0.4,
    });
  });

  const updatedIncoming = engine.getClipKeyframes('intro')[1].incoming?.handle;
  expect(engine.getClipKeyframes('intro')[0].outgoing?.handle).toEqual({ x: 0.2, y: 0.8 });
  expect(updatedIncoming?.x).toBeCloseTo(0.6);
  expect(updatedIncoming?.y).toBeCloseTo(0.4);

  act(() => {
    result.current.endKeyframeTangentDrag();
  });
});

test('useTimelineKeyframeTangentDrag reports invalid pointer coordinates', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 4, {
          selected: true,
          keyframes: [
            {
              id: 'opacity-start',
              property: 'opacity',
              time: fromSeconds(0),
              value: 0.25,
              outgoing: { interpolation: 'bezier', handle: { x: 0.2, y: 0.8 } },
            },
            {
              id: 'opacity-end',
              property: 'opacity',
              time: fromSeconds(4),
              value: 0.75,
              incoming: { interpolation: 'bezier', handle: { x: 0.8, y: 0.2 } },
            },
          ],
        }),
      ]),
    ],
    zoomScale: 100,
    keyframeProperties: [opacityKeyframeProperty],
  });

  const { result } = renderHook(
    () =>
      useTimelineKeyframeTangentDrag({
        property: 'opacity',
        rulerHeight: 32,
        trackHeight: 48,
        tangentHandleSize: 8,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );
  const segment = expectDefined(
    engine.getKeyframeSegments({
      property: 'opacity',
      rulerHeight: 32,
      trackHeight: 48,
      tangentHandleSize: 8,
    })[0],
    'keyframe segment'
  );

  act(() => {
    result.current.startKeyframeTangentDrag({
      tangentHandle: segment.handles[0],
    });
  });

  expect(
    result.current.moveKeyframeTangentDrag({
      viewportX: Number.NaN,
      viewportY: segment.startPoint.y,
    })
  ).toEqual({
    ok: false,
    reason: 'invalid-input',
    message: 'Timeline keyframe tangent drag requires finite viewport coordinates.',
  });
});

test('useTimelineKeyframeTangentDrag preserves vertical handle value for flat segments', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 4, {
          selected: true,
          keyframes: [
            {
              id: 'opacity-start',
              property: 'opacity',
              time: fromSeconds(0),
              value: 0.5,
              outgoing: { interpolation: 'bezier', handle: { x: 0.2, y: 0.75 } },
              selected: true,
            },
            {
              id: 'opacity-end',
              property: 'opacity',
              time: fromSeconds(4),
              value: 0.5,
              incoming: { interpolation: 'bezier', handle: { x: 0.8, y: 0.25 } },
            },
          ],
        }),
      ]),
    ],
    zoomScale: 100,
    keyframeProperties: [opacityKeyframeProperty],
  });

  const { result } = renderHook(
    () => useTimelineKeyframeTangentDrag({ property: 'opacity', rulerHeight: 32, trackHeight: 48 }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );
  const segment = expectDefined(
    engine.getKeyframeSegments({ property: 'opacity', rulerHeight: 32, trackHeight: 48 })[0],
    'flat keyframe segment'
  );

  act(() => {
    result.current.startKeyframeTangentDrag({
      tangentHandle: segment.handles[0],
    });
  });
  act(() => {
    result.current.moveKeyframeTangentDrag({
      viewportX: segment.startPoint.x + (segment.endPoint.x - segment.startPoint.x) * 0.4,
      viewportY: segment.startPoint.y + 100,
    });
  });

  expect(engine.getClipKeyframes('intro')[0].outgoing).toEqual({
    interpolation: 'bezier',
    handle: { x: 0.4, y: 0.75 },
  });
});

test('useTimelineVisibleClips filters the viewport and returns clipped source ranges', () => {
  const engine = new TimelineEngine({
    scrollLeft: 150,
    tracks: [
      createTrack('video-1', [
        createClip('visible', 1, 5, { sourceStart: fromSeconds(10) }),
        createClip('outside', 8, 9),
      ]),
    ],
    zoomScale: 100,
  });
  let renderCount = 0;

  const { result } = renderHook(
    () => {
      renderCount += 1;
      return useTimelineVisibleClips({ viewportWidth: 200 });
    },
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(result.current.map(({ clip }) => clip.id)).toEqual(['visible']);
  expect(result.current[0].visibleRect).toMatchObject({
    clipId: 'visible',
    width: 200,
    x: 0,
  });
  expect(toSeconds(result.current[0].visibleTimelineStartTime)).toBeCloseTo(1.5);
  expect(toSeconds(result.current[0].visibleSourceEndTime)).toBeCloseTo(12.5);

  const rendersBeforePlayhead = renderCount;
  act(() => {
    engine.updatePlayhead(fromSeconds(2));
  });

  expect(renderCount).toBe(rendersBeforePlayhead);

  act(() => {
    engine.setZoomScale(50);
  });

  expect(result.current[0].visibleRect.width).toBeCloseTo(88.888);
});

test('useTimelineRulerTicks returns shared ruler geometry and updates on viewport changes', () => {
  const engine = new TimelineEngine({
    duration: fromSeconds(10),
    scrollLeft: 0,
    tracks: [],
    zoomScale: 50,
  });
  engine.setViewportWidth(200);
  let renderCount = 0;

  const { result } = renderHook(
    () => {
      renderCount += 1;
      return useTimelineRulerTicks();
    },
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(result.current[0]).toMatchObject({
    kind: 'major',
    label: '00:00',
    x: 0,
  });
  expect(result.current[result.current.length - 1].x).toBe(200);

  const rendersBeforePlayhead = renderCount;
  act(() => {
    engine.updatePlayhead(fromSeconds(2));
  });

  expect(renderCount).toBe(rendersBeforePlayhead);

  act(() => {
    engine.setScrollLeft(20);
  });

  expect(result.current[0].seconds).toBeCloseTo(0.2);
  expect(result.current[0].x).toBe(0);

  act(() => {
    engine.setZoomScale(150);
  });

  expect(result.current[0].x).toBe(-20);

  act(() => {
    engine.setViewportWidth(100);
  });

  expect(result.current[result.current.length - 1].x).toBe(100);

  act(() => {
    engine.setDuration(fromSeconds(0.5));
  });

  expect(result.current[result.current.length - 1].seconds).toBeLessThanOrEqual(0.5);
});

test('useTimelineRulerTicks passes frame-rate label options through', () => {
  const engine = new TimelineEngine({
    duration: fromSeconds(15),
    tracks: [],
    zoomScale: 50,
  });
  engine.setViewportWidth(200);
  engine.setZoomScale(50);

  const { result } = renderHook(
    () => useTimelineRulerTicks({ frameRate: 24, labelFormat: 'frame-number' }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(
    result.current
      .filter((tick) => tick.kind === 'major')
      .map((tick) => tick.label)
      .slice(0, 5)
  ).toEqual(['0', '24', '48', '72', '96']);
});

test('useTimelineClipboard exposes reactive clipboard state and command results', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [
        createClip('intro', 0, 3, {
          selected: true,
        }),
      ]),
    ],
  });

  const { result } = renderHook(() => useTimelineClipboard(), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  expect(result.current.canCopy).toBe(true);
  expect(result.current.canCut).toBe(true);
  expect(result.current.canPaste).toBe(false);
  expect(result.current.clipboardCount).toBe(0);

  act(() => {
    expect(result.current.copySelection()).toEqual({ ok: true });
  });

  expect(result.current.canPaste).toBe(true);
  expect(result.current.clipboardCount).toBe(1);

  act(() => {
    expect(result.current.pasteSelection(fromSeconds(5), 'video-1')).toEqual({ ok: true });
  });

  expect(engine.tracks[0].clips).toHaveLength(2);
});

test('useTimelineMarkers exposes marker commands without live playhead renders', () => {
  const engine = new TimelineEngine({
    duration: fromSeconds(10),
    markers: [
      { id: 'before', time: fromSeconds(2), label: 'Before' },
      { id: 'current', time: fromSeconds(5), label: 'Current' },
      { id: 'after', time: fromSeconds(8), label: 'After' },
    ],
    playheadTime: fromSeconds(5),
    tracks: [],
  });
  let renderCount = 0;

  const { result } = renderHook(
    () => {
      renderCount += 1;
      return useTimelineMarkers();
    },
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(result.current.markers.map((marker) => marker.id)).toEqual(['before', 'current', 'after']);
  expect(result.current).not.toHaveProperty('activeMarker');
  expect(result.current).not.toHaveProperty('nearestMarker');

  const rendersBeforeScrub = renderCount;

  act(() => {
    engine.updatePlayhead(fromSeconds(6));
  });

  expect(renderCount).toBe(rendersBeforeScrub);

  act(() => {
    expect(result.current.seekToNextMarker()).toEqual({
      ok: true,
      value: { id: 'after', time: fromSeconds(8), label: 'After' },
    });
  });

  expect(toSeconds(engine.playheadTime)).toBe(8);
});

test('useActiveMarkers derives marker navigation from the current playhead', () => {
  const engine = new TimelineEngine({
    duration: fromSeconds(10),
    markers: [
      { id: 'before', time: fromSeconds(2), label: 'Before' },
      { id: 'current', time: fromSeconds(5), label: 'Current' },
      { id: 'after', time: fromSeconds(8), label: 'After' },
    ],
    playheadTime: fromSeconds(5),
    tracks: [],
  });
  let renderCount = 0;

  const { result } = renderHook(
    () => {
      renderCount += 1;
      return useActiveMarkers();
    },
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(result.current.activeMarker?.id).toBe('current');
  expect(result.current.nearestMarker?.id).toBe('current');
  expect(result.current.previousMarker?.id).toBe('before');
  expect(result.current.nextMarker?.id).toBe('after');

  const rendersBeforeScrub = renderCount;

  act(() => {
    engine.updatePlayhead(fromSeconds(8));
  });

  expect(renderCount).toBeGreaterThan(rendersBeforeScrub);
  expect(result.current.activeMarker?.id).toBe('after');
  expect(result.current.previousMarker?.id).toBe('current');
  expect(result.current.nextMarker).toBeNull();
});

test('useTimelineSelection derives and clears clip and track selection', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [createClip('intro', 0, 3)]),
      createTrack('video-2', [createClip('overlay', 1, 5)], { selected: true }),
    ],
  });

  const { result } = renderHook(() => useTimelineSelection(), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  expect(result.current.selectedTrackId).toBe('video-2');
  expect(result.current.selectedClipId).toBeNull();

  act(() => {
    result.current.selectClip('intro');
  });

  expect(result.current.selectedClipId).toBe('intro');
  expect(result.current.selectedClipTrackId).toBe('video-1');

  act(() => {
    result.current.clearSelection();
  });

  expect(result.current.selectedClipId).toBeNull();
  expect(result.current.selectedTrackId).toBeNull();
});

test('useTimelineClipGroups exposes grouping commands and selected group state', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video', [createClip('video-clip', 0, 8)]),
      createTrack('audio', [createClip('audio-clip', 0, 8)], { kind: 'audio' }),
    ],
  });

  const groupsHook = renderHook(() => useTimelineClipGroups(), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });
  const selectionHook = renderHook(() => useTimelineSelection(), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });
  const editHook = renderHook(() => useTimelineEditCommands(), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  act(() => {
    expect(groupsHook.result.current.groupClips(['video-clip', 'audio-clip']).ok).toBe(true);
  });

  expect(groupsHook.result.current.groups).toHaveLength(1);

  act(() => {
    selectionHook.result.current.selectClip('video-clip');
  });

  expect(selectionHook.result.current.selectedClipIds).toEqual(['video-clip', 'audio-clip']);
  expect(selectionHook.result.current.selectedGroupId).toBe(groupsHook.result.current.groups[0].id);

  act(() => {
    expect(editHook.result.current.splitSelectedClipsAtTime(fromSeconds(4)).ok).toBe(true);
  });

  expect(engine.clipGroups).toHaveLength(2);

  act(() => {
    expect(groupsHook.result.current.ungroupSelectedClips().ok).toBe(true);
  });

  expect(engine.clipGroups.length).toBeLessThan(2);
});

test('useTimelineClipGroups ungroups every selected clip group', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video', [
        createClip('video-a', 0, 2),
        createClip('video-b', 3, 5),
        createClip('video-c', 6, 8),
        createClip('video-d', 9, 11),
      ]),
    ],
  });
  engine.createClipGroup({ id: 'group-a', clipIds: ['video-a', 'video-b'] });
  engine.createClipGroup({ id: 'group-b', clipIds: ['video-c', 'video-d'] });

  const groupsHook = renderHook(() => useTimelineClipGroups(), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });
  const selectionHook = renderHook(() => useTimelineSelection(), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  act(() => {
    selectionHook.result.current.selectClips(['video-a', 'video-c']);
  });
  act(() => {
    expect(groupsHook.result.current.ungroupSelectedClips().ok).toBe(true);
  });

  expect(engine.clipGroups).toEqual([]);
});

test('useTimelineViewport derives visible range and controls viewport state', () => {
  const engine = new TimelineEngine({
    duration: fromSeconds(20),
    scrollLeft: 200,
    tracks: [createTrack('video-1', [createClip('intro', 0, 10)])],
    zoomScale: 100,
  });
  engine.setViewportWidth(1000);

  const { result } = renderHook(() => useTimelineViewport(), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  expect(result.current.scrollLeft).toBe(200);
  expect(result.current.zoomScale).toBe(100);
  expect(result.current.viewportWidth).toBe(1000);
  expect(toSeconds(result.current.maxContentTime)).toBe(20);
  expect(result.current.maxScrollLeft).toBe(1000);
  expect(result.current.visibleStartSeconds).toBe(2);
  expect(result.current.visibleEndSeconds).toBe(12);
  expect(result.current.visibleDurationSeconds).toBe(10);
  expect(result.current.viewportDurationSeconds).toBe(10);

  act(() => {
    result.current.setZoomScale(200);
    result.current.setScrollLeft(400);
    result.current.setViewportWidth(800);
    result.current.setDuration(fromSeconds(12));
  });

  expect(result.current.zoomScale).toBe(200);
  expect(result.current.scrollLeft).toBe(400);
  expect(result.current.viewportWidth).toBe(800);
  expect(toSeconds(expectDefined(result.current.duration, 'viewport duration'))).toBe(12);
  expect(result.current.visibleStartSeconds).toBe(2);
  expect(result.current.visibleEndSeconds).toBe(6);
});

test('useTimelineEvent subscribes with latest handler and supports disabled subscriptions', () => {
  const engine = new TimelineEngine({ tracks: [] });
  const firstHandler = vi.fn();
  const secondHandler = vi.fn();

  const { rerender } = renderHook(
    ({ enabled, handler }: { enabled: boolean; handler: (rate: number) => void }) => {
      useTimelineEvent('playback:rate', handler, { enabled });
      useTimelineEvent('state:settled', () => handler(-1), { enabled });
    },
    {
      initialProps: { enabled: true, handler: firstHandler },
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    engine.setPlaybackRate(1.5);
  });

  expect(firstHandler).toHaveBeenCalledWith(1.5);

  rerender({ enabled: true, handler: secondHandler });

  act(() => {
    engine.setPlaybackRate(2);
    engine.setSnappingEnabled(false);
  });

  expect(firstHandler).toHaveBeenCalledTimes(1);
  expect(secondHandler).toHaveBeenCalledWith(2);
  expect(secondHandler).toHaveBeenCalledWith(-1);

  rerender({ enabled: false, handler: secondHandler });

  act(() => {
    engine.setPlaybackRate(0.5);
  });

  expect(secondHandler).not.toHaveBeenCalledWith(0.5);
});

test('useTimelineTracks exposes visible and hidden tracks with visibility commands', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [], {
        name: 'Video 1',
        selected: true,
        targeted: true,
      }),
      createTrack('audio-1', [], {
        kind: 'audio',
        visible: false,
      }),
    ],
  });

  const { result } = renderHook(() => useTimelineTracks<'visual' | 'audio'>(), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  expect(result.current.selectedTrack?.id).toBe('video-1');
  expect(result.current.visibleTracks.map((track) => track.id)).toEqual(['video-1']);
  expect(result.current.hiddenTracks.map((track) => track.id)).toEqual(['audio-1']);
  expect(result.current.targetedTracks.map((track) => track.id)).toEqual(['video-1']);

  act(() => {
    expect(result.current.toggleVisibility('audio-1', true)).toEqual({ ok: true });
  });

  expect(engine.getState().tracks.find((track) => track.id === 'audio-1')?.visible).toBe(true);
  expect(result.current.visibleTracks.map((track) => track.id)).toEqual(['video-1', 'audio-1']);

  act(() => {
    expect(result.current.toggleVisibility('missing')).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });
});

test('useTimelineTrack exposes one track with geometry and commands', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [], {
        height: 64,
        kind: 'visual',
        name: 'Video 1',
        selected: true,
      }),
    ],
  });

  const { result } = renderHook(() => useTimelineTrack<'visual'>('video-1'), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  expect(result.current.exists).toBe(true);
  expect(result.current.kind).toBe('visual');
  expect(result.current.name).toBe('Video 1');
  expect(result.current.height).toBe(64);
  expect(result.current.rect).toMatchObject({ trackId: 'video-1', y: 32, height: 64 });

  act(() => {
    expect(result.current.setVisible(false)).toEqual({ ok: true });
    expect(result.current.setMuted(true)).toEqual({ ok: true });
    expect(result.current.setLocked(true)).toEqual({ ok: true });
    expect(result.current.setTrackTarget(true)).toEqual({ ok: true });
    expect(result.current.setTrackGroup('group-a')).toEqual({ ok: true });
    expect(result.current.setTrackHeight(80)).toEqual({ ok: true });
  });

  const track = expectDefined(engine.getState().tracks[0], 'track');
  expect(track.visible).toBe(false);
  expect(track.muted).toBe(true);
  expect(track.locked).toBe(true);
  expect(track.targeted).toBe(true);
  expect(track.groupId).toBe('group-a');
  expect(track.height).toBe(80);
  expect(result.current.visible).toBe(false);
  expect(result.current.height).toBe(80);
});

test('useTimelineTrack and header adapter report missing tracks as failed commands', () => {
  const engine = new TimelineEngine({ tracks: [] });

  const trackHook = renderHook(() => useTimelineTrack('missing'), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });
  const headerHook = renderHook(() => useTimelineTrackHeader('missing'), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  expect(trackHook.result.current.exists).toBe(false);
  expect(trackHook.result.current.setVisible(false)).toEqual({
    ok: false,
    reason: 'not-found',
  });
  expect(headerHook.result.current.label).toBe('missing');
  expect(headerHook.result.current.rootProps.style).toEqual({ height: '0px' });
});

test('useTimelineTrackHeader returns DOM-ready state attributes', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [], {
        height: 72,
        locked: true,
        name: 'Video 1',
        selected: true,
        visible: false,
      }),
    ],
  });

  const { result } = renderHook(() => useTimelineTrackHeader('video-1'), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  expect(result.current.label).toBe('Video 1');
  expect(result.current.rootProps).toMatchObject({
    role: 'group',
    'aria-label': 'Video 1',
    'aria-disabled': true,
    'data-track-id': 'video-1',
    'data-track-selected': 'true',
    'data-track-visible': 'false',
    'data-track-locked': 'true',
    style: { height: '72px' },
  });
});

test('useTimelineTrackLockControl exposes lock state, commands, and button props', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [], {
        name: 'Video 1',
      }),
    ],
  });

  const { result } = renderHook(() => useTimelineTrackLockControl('video-1'), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  expect(result.current.exists).toBe(true);
  expect(result.current.locked).toBe(false);
  expect(result.current.buttonProps).toMatchObject({
    type: 'button',
    'aria-label': 'Lock Video 1',
    'aria-pressed': false,
    title: 'Lock Video 1',
    disabled: false,
    'data-track-id': 'video-1',
    'data-track-locked': 'false',
  });

  act(() => {
    expect(result.current.setLocked(true)).toEqual({ ok: true });
  });

  expect(engine.getState().tracks[0]?.locked).toBe(true);
  expect(result.current.locked).toBe(true);
  expect(result.current.buttonProps).toMatchObject({
    'aria-label': 'Unlock Video 1',
    'aria-pressed': true,
    title: 'Unlock Video 1',
    'data-track-locked': 'true',
  });

  act(() => {
    expect(result.current.toggleLock()).toEqual({ ok: true });
  });

  expect(engine.getState().tracks[0]?.locked).toBe(false);
  expect(result.current.locked).toBe(false);
});

test('useTimelineTrackLockControl disables missing track button props', () => {
  const engine = new TimelineEngine({ tracks: [] });

  const { result } = renderHook(() => useTimelineTrackLockControl('missing'), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  expect(result.current.exists).toBe(false);
  expect(result.current.label).toBe('missing');
  expect(result.current.buttonProps).toMatchObject({
    'aria-label': 'Lock missing',
    'aria-pressed': false,
    disabled: true,
    'data-track-id': 'missing',
    'data-track-locked': 'false',
  });

  expect(result.current.setLocked(true)).toEqual({ ok: false, reason: 'not-found' });
  expect(result.current.toggleLock()).toEqual({ ok: false, reason: 'not-found' });
});

test('useTimelineTrackLockControl button props toggle the rendered lock button', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [], {
        name: 'Video 1',
      }),
    ],
  });

  function TrackLockButton() {
    const lockControl = useTimelineTrackLockControl('video-1');
    return React.createElement(
      'button',
      lockControl.buttonProps,
      lockControl.locked ? 'Locked' : 'Unlocked'
    );
  }

  const { getByRole } = render(
    React.createElement(TimelineProvider, { engine }, React.createElement(TrackLockButton))
  );

  const lockButton = getByRole('button', { name: 'Lock Video 1' });
  expect(lockButton.getAttribute('aria-pressed')).toBe('false');
  expect(lockButton.textContent).toBe('Unlocked');

  fireEvent.click(lockButton);

  expect(engine.getState().tracks[0]?.locked).toBe(true);
  const unlockButton = getByRole('button', { name: 'Unlock Video 1' });
  expect(unlockButton.getAttribute('aria-pressed')).toBe('true');
  expect(unlockButton.textContent).toBe('Locked');
});

test('useTimelineTimePosition keeps inline position event subscriptions stable', () => {
  const engine = new TimelineEngine({ tracks: [] });
  const onSpy = vi.spyOn(engine, 'on');
  const time = fromSeconds(1);

  const { rerender, unmount } = renderHook(
    ({ label }: { label: string }) => {
      void label;
      return useTimelineTimePosition<HTMLDivElement>({
        engine,
        time,
        positionEvents: ['render', 'playhead:scrub'],
      });
    },
    {
      initialProps: { label: 'first' },
    }
  );

  expect(onSpy).toHaveBeenCalledTimes(2);

  rerender({ label: 'second' });

  expect(onSpy).toHaveBeenCalledTimes(2);

  unmount();
  onSpy.mockRestore();
});

test('useActiveClips returns enabled clips on visible, unmuted tracks at the playhead', () => {
  const engine = new TimelineEngine({
    playheadTime: fromSeconds(4.5),
    tracks: [
      {
        id: 'video-1',
        kind: 'visual',
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        clips: [
          {
            id: 'active',
            sourceId: 'source-1',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(5),
            sourceStart: fromSeconds(0),
            selected: false,
          },
          {
            id: 'disabled',
            sourceId: 'source-2',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(10),
            sourceStart: fromSeconds(0),
            selected: false,
            disabled: true,
          },
          {
            id: 'future',
            sourceId: 'source-3',
            timelineStart: fromSeconds(6),
            timelineEnd: fromSeconds(10),
            sourceStart: fromSeconds(0),
            selected: false,
          },
        ],
      },
      {
        id: 'video-2',
        kind: 'visual',
        selected: false,
        locked: false,
        muted: true,
        visible: true,
        clips: [
          {
            id: 'muted-track',
            sourceId: 'source-4',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(10),
            sourceStart: fromSeconds(0),
            selected: false,
          },
        ],
      },
      {
        id: 'video-3',
        kind: 'visual',
        selected: false,
        locked: false,
        muted: false,
        visible: false,
        clips: [
          {
            id: 'hidden-track',
            sourceId: 'source-5',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(10),
            sourceStart: fromSeconds(0),
            selected: false,
          },
        ],
      },
    ],
  });

  const { result } = renderHook(() => useActiveClips(), {
    wrapper: (props) => wrapper({ ...props, engine }),
  });

  expect(result.current.map((clip) => clip.id)).toEqual(['active']);
});

function createLayeredMediaEngine() {
  return new TimelineEngine({
    playheadTime: fromSeconds(2),
    tracks: [
      {
        id: 'video-1',
        kind: 'visual',
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        clips: [
          {
            id: 'primary-video',
            sourceId: 'source-1',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(5),
            sourceStart: fromSeconds(0),
            selected: false,
          },
        ],
      },
      {
        id: 'video-2',
        kind: 'visual',
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        clips: [
          {
            id: 'overlay-video',
            sourceId: 'source-2',
            timelineStart: fromSeconds(1),
            timelineEnd: fromSeconds(4),
            sourceStart: fromSeconds(10),
            selected: false,
          },
        ],
      },
      {
        id: 'audio-1',
        kind: 'audio',
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        clips: [
          {
            id: 'audio',
            sourceId: 'source-1',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(5),
            sourceStart: fromSeconds(0),
            selected: false,
          },
        ],
      },
    ],
  });
}

test('useActiveLayers returns layer-aware groups and stable primary clips', () => {
  const engine = createLayeredMediaEngine();

  const { result } = renderHook(
    () =>
      useActiveLayers({
        layers: {
          visuals: { trackKind: 'visual' },
          audio: { trackKind: 'audio' },
          sourceOne: { sourceId: 'source-1' },
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(result.current.layers.visuals.map(({ clip }) => clip.id)).toEqual([
    'primary-video',
    'overlay-video',
  ]);
  expect(result.current.layers.audio.map(({ clip }) => clip.id)).toEqual(['audio']);
  expect(result.current.layers.sourceOne.map(({ clip }) => clip.id)).toEqual([
    'primary-video',
    'audio',
  ]);
  expect(result.current.primary.visuals?.clip.id).toBe('primary-video');
  expect(result.current.primary.audio?.clip.id).toBe('audio');
  expect(result.current.hasActiveClips).toBe(true);
});

test('useActiveLayers updates from playhead changes and respects explicit time', () => {
  const engine = createLayeredMediaEngine();

  const { result } = renderHook(
    () =>
      useActiveLayers({
        layers: {
          visuals: { trackKind: 'visual' },
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(result.current.layers.visuals.map(({ clip }) => clip.id)).toEqual([
    'primary-video',
    'overlay-video',
  ]);

  act(() => {
    engine.setTime(fromSeconds(4.5));
  });

  expect(result.current.layers.visuals.map(({ clip }) => clip.id)).toEqual(['primary-video']);

  const explicit = renderHook(
    () =>
      useActiveLayers({
        time: fromSeconds(2),
        layers: {
          visuals: { trackKind: 'visual' },
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(explicit.result.current.layers.visuals.map(({ clip }) => clip.id)).toEqual([
    'primary-video',
    'overlay-video',
  ]);
});

test('useActiveLayers updates when clips move under the current playhead', () => {
  const engine = createMediaSyncEngine();

  const { result } = renderHook(
    () =>
      useActiveLayers({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
          audio: { trackKind: 'audio', sourceId: 'source-1' },
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(result.current.primary.visuals?.clip.id).toBe('video-clip');
  expect(result.current.primary.audio?.clip.id).toBe('audio-clip');

  act(() => {
    engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(6) });
  });

  expect(result.current.primary.visuals).toBeUndefined();
  expect(result.current.primary.audio?.clip.id).toBe('audio-clip');
});

test('useActiveLayers updates when tracks are muted under the current playhead', () => {
  const engine = createMediaSyncEngine();

  const { result } = renderHook(
    () =>
      useActiveLayers({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
          audio: { trackKind: 'audio', sourceId: 'source-1' },
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(result.current.primary.visuals?.clip.id).toBe('video-clip');
  expect(result.current.primary.audio?.clip.id).toBe('audio-clip');

  act(() => {
    engine.toggleMuteTrack('video-1', true);
  });

  expect(result.current.primary.visuals).toBeUndefined();
  expect(result.current.primary.audio?.clip.id).toBe('audio-clip');
});

test('useTimelineEditImpacts subscribes to live edit impact changes', () => {
  const engine = new TimelineEngine({
    playheadTime: fromSeconds(0),
    tracks: [
      {
        id: 'video-1',
        kind: 'visual',
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        clips: [
          {
            id: 'clip-1',
            sourceId: 'source-1',
            timelineStart: fromSeconds(1),
            timelineEnd: fromSeconds(5.5),
            sourceStart: fromSeconds(0),
            selected: false,
          },
          {
            id: 'clip-2',
            sourceId: 'source-2',
            timelineStart: fromSeconds(6.5),
            timelineEnd: fromSeconds(12.5),
            sourceStart: fromSeconds(0),
            selected: true,
          },
        ],
      },
    ],
  });

  const { result } = renderHook(() => useTimelineEditImpacts(), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  expect(result.current.activeEdit).toBeNull();
  expect(result.current.hasImpacts).toBe(false);
  expect(result.current.getImpactForClip('clip-1')).toBeNull();

  act(() => {
    engine.startDrag();
    engine.moveClip({ clipId: 'clip-2', startTime: fromSeconds(3) });
  });

  expect(result.current.operation).toBe('overwrite');
  expect(result.current.sourceClipId).toBe('clip-2');
  expect(result.current.sourceTrackId).toBe('video-1');
  expect(result.current.hasImpacts).toBe(true);
  expect(result.current.impacts).toHaveLength(1);
  expect(result.current.getImpactForClip('clip-1')).toMatchObject({
    clipId: 'clip-1',
    trackId: 'video-1',
    effect: 'trim-end',
    cutEnd: true,
  });

  act(() => {
    engine.endDrag();
  });

  expect(result.current.activeEdit).toBeNull();
  expect(result.current.impacts).toEqual([]);
  expect(result.current.operation).toBeNull();
  expect(result.current.hasImpacts).toBe(false);
});

test('useTimelineEditImpacts subscribes to source-less command preview impacts', () => {
  const engine = new TimelineEngine({
    tracks: [
      createTrack('video-1', [createClip('intro', 0, 5), createClip('outro', 6, 8)]),
      createTrack('video-2', [createClip('overlay', 2, 4)]),
    ],
  });

  const { result } = renderHook(() => useTimelineEditImpacts(), {
    wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
  });

  act(() => {
    engine.previewEdit({
      type: 'delete-range',
      startTime: fromSeconds(1),
      endTime: fromSeconds(3),
      trackIds: ['video-1'],
      ripple: false,
    });
  });

  expect(result.current.operation).toBe('delete-range');
  expect(result.current.sourceClipId).toBeNull();
  expect(result.current.sourceTrackId).toBeNull();
  expect(result.current.hasImpacts).toBe(true);
  expect(result.current.getImpactForClip('intro')).toMatchObject({
    clipId: 'intro',
    trackId: 'video-1',
    effect: 'split',
  });
  expect(result.current.getImpactForClip('overlay')).toBeNull();

  act(() => {
    engine.cancelEdit();
  });

  expect(result.current.activeEdit).toBeNull();
  expect(result.current.impacts).toEqual([]);
});

function createMediaSyncEngine() {
  return new TimelineEngine({
    duration: fromSeconds(12),
    playheadTime: fromSeconds(1),
    tracks: [
      {
        id: 'video-1',
        kind: 'visual',
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        clips: [
          {
            id: 'video-clip',
            sourceId: 'source-1',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(5),
            sourceStart: fromSeconds(10),
            selected: false,
          },
        ],
      },
      {
        id: 'audio-1',
        kind: 'audio',
        selected: false,
        locked: false,
        muted: false,
        visible: true,
        clips: [
          {
            id: 'audio-clip',
            sourceId: 'source-1',
            timelineStart: fromSeconds(0),
            timelineEnd: fromSeconds(5),
            sourceStart: fromSeconds(20),
            selected: false,
          },
        ],
      },
    ],
  });
}

const mediaSyncLayers = {
  visuals: { trackKind: 'visual', sourceId: 'source-1' },
  audio: { trackKind: 'audio', sourceId: 'source-1' },
} as const;

test('useTimelineMediaPlayback starts external playback and advances from clock time', () => {
  const engine = createMediaSyncEngine();
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const syncLayers = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => clockTime,
        layers: mediaSyncLayers,
        syncLayers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.play()).toEqual({ ok: true });
  });

  expect(engine.getState().playing).toBe(true);
  expect(syncLayers).toHaveBeenCalledTimes(1);
  expect(syncLayers.mock.calls[0][0].activeLayers.primary.visuals?.clip.id).toBe('video-clip');

  clockTime = 2.25;
  act(() => {
    tick?.(16);
  });

  expect(engine.getState().playing).toBe(true);
  expect(engine.getTime()).toEqual(fromSeconds(2.25));

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback stops external sync when the engine is paused outside the hook', () => {
  const engine = createMediaSyncEngine();
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const stopClock = vi.fn();
  const syncLayers = vi.fn();
  const onStatus = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => clockTime,
        stopClock,
        layers: mediaSyncLayers,
        syncLayers,
        onStatus,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.play()).toEqual({ ok: true });
  });

  act(() => {
    engine.pause();
  });

  expect(stopClock).toHaveBeenCalledTimes(1);
  expect(syncLayers).toHaveBeenLastCalledWith(
    expect.objectContaining({
      reason: 'pause',
      timelineTime: fromSeconds(1),
    })
  );
  expect(onStatus).toHaveBeenLastCalledWith('paused');

  clockTime = 3;
  act(() => {
    tick?.(16);
  });

  expect(engine.getTime()).toEqual(fromSeconds(1));

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback pauses on content gaps and runs cleanup callbacks', () => {
  const engine = createMediaSyncEngine();
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const syncLayers = vi.fn();
  const onStatus = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => clockTime,
        layers: mediaSyncLayers,
        syncLayers,
        onStatus,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.play()).toEqual({ ok: true });
  });

  clockTime = 7;
  act(() => {
    tick?.(16);
  });

  expect(engine.getState().playing).toBe(false);
  expect(syncLayers).toHaveBeenLastCalledWith(
    expect.objectContaining({
      reason: 'gap',
      timelineTime: fromSeconds(7),
      activeLayers: expect.objectContaining({ hasActiveClips: false }),
    })
  );
  expect(onStatus).toHaveBeenLastCalledWith('content-gap');

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback keeps playing while only the audio layer remains active', () => {
  const engine = createMediaSyncEngine();
  engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(6) });
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const syncLayers = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => clockTime,
        layers: mediaSyncLayers,
        syncLayers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.play()).toEqual({ ok: true });
  });

  expect(engine.getState().playing).toBe(true);
  expect(syncLayers).toHaveBeenCalledTimes(1);
  expect(syncLayers.mock.calls[0][0].activeLayers.primary.visuals).toBeUndefined();
  expect(syncLayers.mock.calls[0][0].activeLayers.primary.audio?.clip.id).toBe('audio-clip');

  clockTime = 1.25;
  act(() => {
    tick?.(16);
  });

  expect(engine.getState().playing).toBe(true);
  expect(syncLayers).toHaveBeenCalledTimes(2);

  clockTime = 1.5;
  act(() => {
    tick?.(32);
  });

  expect(engine.getState().playing).toBe(true);
  expect(syncLayers).toHaveBeenCalledTimes(3);

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback reports updated layers when a clip sync key changes', () => {
  const engine = createMediaSyncEngine();
  let clockTime = 1;
  let tick: FrameRequestCallback | undefined;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const syncLayers = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => clockTime,
        layers: { audio: mediaSyncLayers.audio },
        syncLayers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.play()).toEqual({ ok: true });
  });
  expect(syncLayers).toHaveBeenCalledTimes(1);

  act(() => {
    engine.slipClip('audio-clip', fromSeconds(0.5));
  });

  clockTime = 1.5;
  act(() => {
    tick?.(16);
  });

  expect(syncLayers).toHaveBeenCalledTimes(2);
  expect(syncLayers.mock.calls[1][0].activeLayers.primary.audio?.clip.id).toBe('audio-clip');
  expect(syncLayers.mock.calls[1][0].reason).toBe('tick');

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaPlayback updates playback rate and resyncs media', () => {
  const engine = createMediaSyncEngine();
  const syncLayers = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => 1,
        layers: { audio: mediaSyncLayers.audio },
        syncLayers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.setPlaybackRate(2)).toEqual({ ok: true });
  });

  expect(engine.getPlaybackRate()).toBe(2);
  expect(syncLayers).toHaveBeenLastCalledWith(
    expect.objectContaining({
      reason: 'rate',
      timelineTime: fromSeconds(1),
    })
  );
});

test('useTimelineMediaPlayback returns command failures for content gaps', () => {
  const engine = createMediaSyncEngine();
  engine.setTime(fromSeconds(8));
  const syncLayers = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaPlayback({
        getClockTime: () => 8,
        layers: mediaSyncLayers,
        syncLayers,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.play()).toEqual({ ok: false, reason: 'content-gap' });
  });

  expect(engine.getState().playing).toBe(false);
  expect(syncLayers).toHaveBeenLastCalledWith(
    expect.objectContaining({
      reason: 'gap',
      timelineTime: fromSeconds(8),
      activeLayers: expect.objectContaining({ hasActiveClips: false }),
    })
  );
});

test('useTimelineMediaSync seeks to first media and starts an external adapter clock', async () => {
  const engine = createMediaSyncEngine();
  engine.setTime(fromSeconds(8));
  let clockTime = 0;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const startClock = vi.fn((timelineTime) => {
    clockTime = toSeconds(timelineTime);
    return true;
  });
  const resumeClock = vi.fn();
  const seek = vi.fn();
  const syncLayers = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
          audio: { trackKind: 'audio', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => clockTime,
          startClock,
          resumeClock,
          seek,
          syncLayers,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true, time: fromSeconds(0) });
  });

  expect(engine.getTime()).toEqual(fromSeconds(0));
  expect(seek).toHaveBeenCalledWith(
    fromSeconds(0),
    expect.objectContaining({ hasActiveClips: true })
  );
  expect(startClock).toHaveBeenCalledWith(fromSeconds(0), 1);
  expect(resumeClock).toHaveBeenCalledWith(1);
  expect(syncLayers).toHaveBeenCalledWith(
    expect.objectContaining({
      reason: 'play',
      timelineTime: fromSeconds(0),
      activeLayers: expect.objectContaining({
        primary: expect.objectContaining({
          visuals: expect.objectContaining({ clip: expect.objectContaining({ id: 'video-clip' }) }),
        }),
      }),
    })
  );

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync stops the adapter clock when paused', async () => {
  const engine = createMediaSyncEngine();
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const startClock = vi.fn(() => true);
  const stopClock = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock,
          stopClock,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({ ok: true, time: fromSeconds(1) });
  });

  act(() => {
    expect(result.current.pause()).toEqual({ ok: true });
  });

  expect(startClock).toHaveBeenCalledWith(fromSeconds(1), 1);
  expect(stopClock).toHaveBeenCalledTimes(1);
  expect(engine.getState().playing).toBe(false);

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync reports missing media and does not start playback', async () => {
  const engine = new TimelineEngine({ tracks: [] });
  const startClock = vi.fn(() => true);
  const onError = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual' },
        },
        adapter: {
          getClockTime: () => 0,
          startClock,
        },
        onError,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({
      ok: false,
      reason: 'no-content',
      message: 'No timeline content is available.',
    });
  });

  expect(startClock).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledWith('No timeline content is available.');
});

test('useTimelineMediaSync reports not-ready adapters without starting playback', async () => {
  const engine = createMediaSyncEngine();
  const startClock = vi.fn(() => true);
  const onError = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        ready: false,
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 0,
          startClock,
        },
        onError,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({
      ok: false,
      reason: 'not-ready',
      message: 'Media adapter is not ready.',
    });
  });

  expect(startClock).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledWith('Media adapter is not ready.');
});

test('useTimelineMediaSync awaits async clock startup failures', async () => {
  const engine = createMediaSyncEngine();
  const startClock = vi.fn(async () => false);
  const resumeClock = vi.fn(async () => {});
  const onError = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 0,
          startClock,
          resumeClock,
        },
        onError,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({
      ok: false,
      reason: 'clock-failed',
      message: 'Media clock could not start.',
    });
  });

  expect(resumeClock).toHaveBeenCalledWith(1);
  expect(startClock).toHaveBeenCalledWith(fromSeconds(1), 1);
  expect(engine.getState().playing).toBe(false);
  expect(onError).toHaveBeenCalledWith('Media clock could not start.');
});

test('useTimelineMediaSync converts adapter startup exceptions into a play result', async () => {
  const engine = createMediaSyncEngine();
  const startClock = vi.fn(() => {
    throw new Error('blocked');
  });
  const stopClock = vi.fn();
  const onError = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 0,
          startClock,
          stopClock,
        },
        onError,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({
      ok: false,
      reason: 'clock-failed',
      message: 'Media clock could not start. blocked',
      cause: expect.any(Error),
    });
  });

  expect(startClock).toHaveBeenCalledWith(fromSeconds(1), 1);
  expect(stopClock).toHaveBeenCalled();
  expect(engine.getState().playing).toBe(false);
  expect(onError).toHaveBeenCalledWith('Media clock could not start. blocked');
});

test('useTimelineMediaSync converts timeline sync exceptions into a play result', async () => {
  const engine = createMediaSyncEngine();
  const startClock = vi.fn(() => true);
  const stopClock = vi.fn();
  const onError = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 0,
          startClock,
          stopClock,
          syncLayers: () => {
            throw new Error('render failed');
          },
        },
        onError,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  await act(async () => {
    await expect(result.current.play()).resolves.toEqual({
      ok: false,
      reason: 'timeline-failed',
      message: 'Timeline playback could not start. render failed',
      cause: expect.any(Error),
    });
  });

  expect(startClock).toHaveBeenCalledWith(fromSeconds(1), 1);
  expect(stopClock).toHaveBeenCalled();
  expect(engine.getState().playing).toBe(false);
  expect(onError).toHaveBeenCalledWith('Timeline playback could not start. render failed');
});

test('useTimelineMediaSync forwards playback rate changes to the adapter', () => {
  const engine = createMediaSyncEngine();
  const setClockRate = vi.fn();
  const syncLayers = vi.fn();

  const { result } = renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          audio: { trackKind: 'audio', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock: () => true,
          setClockRate,
          syncLayers,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    expect(result.current.setPlaybackRate(2)).toEqual({ ok: true });
  });

  expect(setClockRate).toHaveBeenCalledWith(2);
  expect(engine.getPlaybackRate()).toBe(2);
  expect(syncLayers).toHaveBeenLastCalledWith(
    expect.objectContaining({
      reason: 'rate',
      timelineTime: fromSeconds(1),
    })
  );
});

test('useTimelineMediaSync seeks paused preview on initial ready mount', () => {
  const engine = createMediaSyncEngine();
  let previewTick: FrameRequestCallback | undefined;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    previewTick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi.fn();

  renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock: () => true,
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(rafSpy).toHaveBeenCalledTimes(1);
  expect(seek).not.toHaveBeenCalled();

  act(() => {
    previewTick?.(16);
  });

  expect(seek).toHaveBeenCalledWith(
    fromSeconds(1),
    expect.objectContaining({
      primary: expect.objectContaining({
        visuals: expect.objectContaining({ clip: expect.objectContaining({ id: 'video-clip' }) }),
      }),
    })
  );

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync schedules initial paused preview when adapter becomes ready', () => {
  const engine = createMediaSyncEngine();
  let ready = false;
  const previewTicks: FrameRequestCallback[] = [];
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    previewTicks.push(callback);
    return previewTicks.length;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi.fn();

  const { rerender } = renderHook(
    () =>
      useTimelineMediaSync({
        ready,
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock: () => true,
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(rafSpy).not.toHaveBeenCalled();

  ready = true;
  rerender();

  expect(rafSpy).toHaveBeenCalledTimes(1);

  act(() => {
    previewTicks[0]?.(16);
  });

  expect(seek).toHaveBeenCalledTimes(1);

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync refreshes paused preview when a clip move changes active layers', () => {
  const engine = createMediaSyncEngine();
  let previewTick: FrameRequestCallback | undefined;
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    previewTick = callback;
    return 1;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi.fn();

  renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
          audio: { trackKind: 'audio', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock: () => true,
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(6) });
  });

  expect(seek).not.toHaveBeenCalled();

  act(() => {
    previewTick?.(16);
  });

  expect(seek).toHaveBeenCalledTimes(1);
  expect(seek.mock.calls[0][0]).toEqual(fromSeconds(1));
  expect(seek.mock.calls[0][1].primary.visuals).toBeUndefined();
  expect(seek.mock.calls[0][1].primary.audio?.clip.id).toBe('audio-clip');

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync skips paused preview seeks until the adapter is ready', () => {
  const engine = createMediaSyncEngine();
  let ready = false;
  const previewTicks: FrameRequestCallback[] = [];
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    previewTicks.push(callback);
    return previewTicks.length;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi.fn();

  const { rerender } = renderHook(
    () =>
      useTimelineMediaSync({
        ready,
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
          audio: { trackKind: 'audio', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock: () => true,
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(6) });
  });

  expect(rafSpy).not.toHaveBeenCalled();
  expect(seek).not.toHaveBeenCalled();

  ready = true;
  rerender();

  act(() => {
    engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(7) });
  });

  expect(rafSpy).toHaveBeenCalledTimes(1);

  act(() => {
    previewTicks[0]?.(16);
  });

  expect(seek).toHaveBeenCalledTimes(1);

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync skips a queued paused preview seek if the adapter becomes unready', () => {
  const engine = createMediaSyncEngine();
  let ready = true;
  const previewTicks: FrameRequestCallback[] = [];
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    previewTicks.push(callback);
    return previewTicks.length;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi.fn();

  const { rerender } = renderHook(
    () =>
      useTimelineMediaSync({
        ready,
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
          audio: { trackKind: 'audio', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock: () => true,
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(6) });
  });

  expect(rafSpy).toHaveBeenCalledTimes(1);

  ready = false;
  rerender();

  act(() => {
    previewTicks[0]?.(16);
  });

  expect(seek).not.toHaveBeenCalled();

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync coalesces initial and media edit events into one paused preview seek', () => {
  const engine = createMediaSyncEngine();
  const previewTicks: FrameRequestCallback[] = [];
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    previewTicks.push(callback);
    return previewTicks.length;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi.fn();

  renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
          audio: { trackKind: 'audio', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock: () => true,
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(6) });
    engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(7) });
    engine.slipClip('audio-clip', fromSeconds(0.5));
  });

  expect(rafSpy).toHaveBeenCalledTimes(1);

  act(() => {
    previewTicks[0]?.(16);
  });

  expect(seek).toHaveBeenCalledTimes(1);

  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

test('useTimelineMediaSync skips paused preview seeks while playback is active', () => {
  const engine = createMediaSyncEngine();
  engine.play({ clock: 'external' });
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const seek = vi.fn();

  renderHook(
    () =>
      useTimelineMediaSync({
        layers: {
          visuals: { trackKind: 'visual', sourceId: 'source-1' },
          audio: { trackKind: 'audio', sourceId: 'source-1' },
        },
        adapter: {
          getClockTime: () => 1,
          startClock: () => true,
          seek,
        },
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  act(() => {
    engine.moveClip({ clipId: 'video-clip', startTime: fromSeconds(6) });
  });

  expect(rafSpy).not.toHaveBeenCalled();
  expect(seek).not.toHaveBeenCalled();

  act(() => {
    engine.pause();
  });
  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});
