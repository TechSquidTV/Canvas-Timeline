import { renderHook, act, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { expect, test, vi } from 'vite-plus/test';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimelineProvider } from '#react/Provider';
import { expectDefined } from '#test-utils/assertions';
import {
  usePlaybackEffect,
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
  useTimelineClipRects,
  useTimelineHistory,
  useTimelineTrackDropTargets,
  type TimelineTrackDropResult,
} from '#react/hooks';

import {
  createClip,
  createDragDataTransfer,
  createTimelineDragEvent,
  createTrack,
  wrapper,
} from '#react/hooks/integration/test-helpers';

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
