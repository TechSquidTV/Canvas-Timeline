import { renderHook, act, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { expect, test, vi } from 'vite-plus/test';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimelineProvider } from '#react/Provider';
import { expectDefined } from '#test-utils/assertions';
import {
  useActiveClips,
  useActiveLayers,
  useActiveMarkers,
  useTimelineEditImpacts,
  useTimelineEditCommands,
  useTimelineClipGroups,
  useTimelineClipboard,
  useTimelineEvent,
  useTimelineMarkers,
  useTimelineRulerTicks,
  useTimelineTimePosition,
  useTimelineSelection,
  useTimelineTrack,
  useTimelineTrackHeader,
  useTimelineTrackLockControl,
  useTimelineTracks,
  useTimelineViewport,
  useTimelineVisibleClips,
} from '#react/hooks';

import {
  createClip,
  createMediaSyncEngine,
  createTrack,
  wrapper,
} from '#react/hooks/integration/test-helpers';

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
    () =>
      useTimelineRulerTicks({
        format: 'frame-number',
        frameRate: 24,
        minimumMajorTickSpacing: 100,
      }),
    {
      wrapper: ({ children }) => React.createElement(TimelineProvider, { engine }, children),
    }
  );

  expect(
    result.current
      .filter((tick) => tick.kind === 'major')
      .map((tick) => tick.label)
      .slice(0, 5)
  ).toEqual(['0', '48', '96']);
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
