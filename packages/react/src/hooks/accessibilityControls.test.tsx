import { act, fireEvent, render, renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { TimelineEngine, type Clip, type Track } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimelineProvider } from '../Provider';
import { expectDefined } from '../../../../test-utils/assertions';
import {
  createTimelineKeyboardBindings,
  getTimelineKeyboardCommand,
  minimalTimelineKeyboardBindings,
  professionalEditorTimelineKeyboardBindings,
  useTimelineClipNavigation,
  useTimelineInOutRangeControl,
  useTimelineKeyboard,
  useTimelinePanControl,
  useTimelinePlayheadControl,
  useTimelineViewport,
  useTimelineViewportRangeControl,
  useTimelineViewportScrollbar,
  useTimelineZoomControl,
} from './index';
import { Root, Timeline } from '../components';

function createClip(id: string, start: number, end: number, overrides: Partial<Clip> = {}): Clip {
  return {
    id,
    sourceId: `${id}-source`,
    timelineStart: fromSeconds(start),
    timelineEnd: fromSeconds(end),
    sourceStart: fromSeconds(0),
    selected: false,
    label: id,
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
    name: id,
    ...overrides,
  };
}

function renderTimelineHook<T>(engine: TimelineEngine, hook: () => T) {
  return renderHook(hook, {
    wrapper: ({ children }) => <TimelineProvider engine={engine}>{children}</TimelineProvider>,
  });
}

describe('timeline accessibility control hooks', () => {
  it('exposes Base UI-compatible playhead slider props with formatted value text', () => {
    const engine = new TimelineEngine({
      duration: fromSeconds(10),
      playheadTime: fromSeconds(2),
      tracks: [],
    });

    const { result } = renderTimelineHook(engine, () => useTimelinePlayheadControl());

    expect(result.current.rootProps.value).toEqual([2]);
    expect(result.current.valueText).toBe('2 seconds');
    expect(result.current.getAriaValueText(3.333333)).toBe('3.33 seconds');

    act(() => {
      result.current.rootProps.onValueChange([4.5]);
    });

    expect(toSeconds(engine.playheadTime)).toBe(4.5);
  });

  it('updates playhead slider max when dynamic content bounds change', () => {
    const engine = new TimelineEngine({
      tracks: [createTrack('video-a', [createClip('clip-a', 0, 2)])],
    });

    const { result } = renderTimelineHook(engine, () => useTimelinePlayheadControl());

    expect(result.current.max).toBe(2);

    act(() => {
      engine.moveClip({ clipId: 'clip-a', startTime: fromSeconds(6) });
      engine.settle();
    });

    expect(result.current.max).toBe(8);
  });

  it('exposes Base UI-compatible In/Out range props and settles on commit', () => {
    const engine = new TimelineEngine({ duration: fromSeconds(20), tracks: [] });
    const settle = vi.spyOn(engine, 'settle');
    const { result } = renderTimelineHook(engine, () => useTimelineInOutRangeControl());

    expect(result.current.rootProps.value).toEqual([0, 20]);
    expect(result.current.valueText).toBe('0 seconds to 20 seconds, duration 20 seconds');

    act(() => {
      result.current.rootProps.onValueChange([2, 8]);
      result.current.rootProps.onValueCommitted([2, 8]);
    });

    expect(toSeconds(expectDefined(engine.getState().inPoint, 'in point'))).toBe(2);
    expect(toSeconds(expectDefined(engine.getState().outPoint, 'out point'))).toBe(8);
    expect(settle).toHaveBeenCalled();
  });

  it('snaps pointer-driven In/Out range changes while ignoring the active boundary', () => {
    const engine = new TimelineEngine({
      duration: fromSeconds(20),
      markers: [{ id: 'marker-1', time: fromSeconds(5), label: 'M1' }],
      playheadTime: fromSeconds(7),
      tracks: [],
      zoomScale: 100,
    });
    engine.setInPoint(fromSeconds(4), false);
    engine.setOutPoint(fromSeconds(9), false);
    const prepareSnapping = vi.spyOn(engine, 'prepareSnapping');

    const { result } = renderTimelineHook(engine, () =>
      useTimelineInOutRangeControl({ snap: true })
    );

    act(() => {
      result.current.rootProps.onValueChange([4.05, 9], {
        activeThumbIndex: 0,
        reason: 'drag',
      });
    });

    expect(toSeconds(expectDefined(engine.getState().inPoint, 'in point'))).toBeCloseTo(4.05);
    expect(engine.getState().snapFeedback.lines).toEqual([]);

    act(() => {
      result.current.rootProps.onValueChange([5.05, 9], {
        activeThumbIndex: 0,
        reason: 'drag',
      });
    });

    expect(toSeconds(expectDefined(engine.getState().inPoint, 'in point'))).toBeCloseTo(5);
    expect(engine.getState().snapFeedback.lines).toEqual([5]);
    expect(prepareSnapping).toHaveBeenCalledTimes(1);
  });

  it('formats viewport range values for the existing scrollbar primitive', () => {
    const engine = new TimelineEngine({
      tracks: [createTrack('video-a', [createClip('clip-a', 0, 20)])],
    });
    engine.setViewportWidth(1000);
    engine.setZoomScale(100);

    const { result } = renderTimelineHook(engine, () => useTimelineViewportRangeControl());

    expect(result.current.valueText).toBe('0 seconds to 10 seconds, duration 10 seconds');
    expect(
      result.current.rootProps.getAriaValueText(5, {
        max: 20,
        min: 0,
        part: 'handle',
        rangeSpan: 10,
        side: 'end',
        value: { start: 0, end: 10 },
      })
    ).toBe('5 seconds');
  });

  it('exposes scalar zoom and pan controls without global keyboard behavior', () => {
    const engine = new TimelineEngine({
      tracks: [createTrack('video-a', [createClip('clip-a', 0, 20)])],
    });
    engine.setViewportWidth(1000);
    engine.setZoomScale(100);

    const zoom = renderTimelineHook(engine, () => useTimelineZoomControl());
    const pan = renderTimelineHook(engine, () => useTimelinePanControl());

    expect(zoom.result.current.rootProps.value).toEqual([100]);
    expect(zoom.result.current.thumbProps['aria-valuetext']).toBe('100 pixels per second');
    expect(pan.result.current.rootProps.value).toEqual([0]);
    expect(pan.result.current.thumbProps['aria-valuetext']).toBe('0 pixels');

    act(() => {
      zoom.result.current.rootProps.onValueChange([150]);
      pan.result.current.rootProps.onValueChange([250]);
    });

    expect(engine.zoomScale).toBe(150);
    expect(engine.scrollLeft).toBe(250);
  });

  it('keeps zoom control hooks within engine frame-rate bounds', () => {
    const engine = new TimelineEngine({
      duration: fromSeconds(20),
      tracks: [],
      zoomScale: 100,
      zoomConstraints: { frameRate: 24 },
    });
    engine.setViewportWidth(1000);

    const zoom = renderTimelineHook(engine, () => useTimelineZoomControl());
    const viewport = renderTimelineHook(engine, () => useTimelineViewport());

    expect(zoom.result.current.max).toBe(384);

    act(() => {
      zoom.result.current.rootProps.onValueChange([10000]);
    });

    expect(engine.zoomScale).toBe(384);

    act(() => {
      viewport.result.current.setZoomScale(10000);
    });

    expect(engine.zoomScale).toBe(384);
  });

  it('keeps viewport scrollbar zoom within engine frame-rate bounds', () => {
    const engine = new TimelineEngine({
      duration: fromSeconds(20),
      tracks: [],
      zoomScale: 100,
      zoomConstraints: { frameRate: 24 },
    });
    engine.setViewportWidth(1000);

    const viewport = renderTimelineHook(engine, () => useTimelineViewportScrollbar());

    expect(viewport.result.current.rootProps.minSpan).toBeCloseTo(1000 / 384, 12);

    act(() => {
      viewport.result.current.onValueChange(
        { start: 0, end: 1 },
        { reason: 'handle-drag', side: 'end' }
      );
    });

    expect(engine.zoomScale).toBe(384);
  });

  it('keeps root wheel zoom gestures within engine frame-rate bounds', () => {
    class MockResizeObserver {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    const engine = new TimelineEngine({
      duration: fromSeconds(20),
      tracks: [],
      zoomScale: 100,
      zoomConstraints: { frameRate: 24 },
    });
    const { container } = render(
      <TimelineProvider engine={engine}>
        <Root />
      </TimelineProvider>
    );
    const root = container.querySelector('.timeline-root') as HTMLElement;

    fireEvent.wheel(root, { ctrlKey: true, deltaY: -5000 });

    expect(engine.zoomScale).toBe(384);
    vi.unstubAllGlobals();
  });

  it('moves and trims the active canvas clip through command helpers', () => {
    const engine = new TimelineEngine({
      tracks: [createTrack('video-a', [createClip('clip-a', 0, 3, { selected: true })])],
    });
    engine.setSnappingEnabled(false);

    const { result } = renderTimelineHook(engine, () => useTimelineClipNavigation());

    act(() => {
      result.current.moveActiveClipBy(2);
    });

    let activeClip = expectDefined(engine.getClip('clip-a'), 'clip-a').clip;
    expect(toSeconds(activeClip.timelineStart)).toBe(2);
    expect(toSeconds(activeClip.timelineEnd)).toBe(5);

    act(() => {
      result.current.trimActiveClipBy('end', 1);
      result.current.trimActiveClipBy('start', 1);
    });

    activeClip = expectDefined(engine.getClip('clip-a'), 'clip-a').clip;
    expect(toSeconds(activeClip.timelineStart)).toBe(3);
    expect(toSeconds(activeClip.timelineEnd)).toBe(6);
    expect(toSeconds(activeClip.sourceStart)).toBe(1);
    expect(result.current.clipCount).toBe(1);
  });

  it('does not move or trim active clips when edit guards disallow it', () => {
    const lockedEngine = new TimelineEngine({
      tracks: [
        createTrack('locked-video', [createClip('locked-clip', 0, 3, { selected: true })], {
          locked: true,
        }),
      ],
    });
    const clipGuardEngine = new TimelineEngine({
      tracks: [
        createTrack('video-a', [
          createClip('fixed-clip', 0, 3, {
            movable: false,
            resizable: false,
            selected: true,
          }),
        ]),
      ],
    });

    const locked = renderTimelineHook(lockedEngine, () => useTimelineClipNavigation());
    const fixed = renderTimelineHook(clipGuardEngine, () => useTimelineClipNavigation());

    act(() => {
      locked.result.current.moveActiveClipBy(2);
      locked.result.current.trimActiveClipBy('end', 2);
      fixed.result.current.moveActiveClipBy(2);
      fixed.result.current.trimActiveClipBy('end', 2);
    });

    const lockedClip = expectDefined(lockedEngine.getClip('locked-clip'), 'locked-clip').clip;
    const fixedClip = expectDefined(clipGuardEngine.getClip('fixed-clip'), 'fixed-clip').clip;
    expect(toSeconds(lockedClip.timelineStart)).toBe(0);
    expect(toSeconds(lockedClip.timelineEnd)).toBe(3);
    expect(toSeconds(fixedClip.timelineStart)).toBe(0);
    expect(toSeconds(fixedClip.timelineEnd)).toBe(3);
  });

  it('navigates canvas clips through one focus target and respects cancelled keys', () => {
    const engine = new TimelineEngine({
      tracks: [
        createTrack('video-a', [
          createClip('intro', 0, 3, { selected: true }),
          createClip('main', 4, 8),
        ]),
        createTrack('video-b', [createClip('overlay', 1, 5)]),
      ],
    });

    function ClipFocusTarget({ cancelKeys = false }: { cancelKeys?: boolean }) {
      const navigation = useTimelineClipNavigation();
      return (
        <div
          data-active-clip={navigation.activeClipId ?? ''}
          data-focused={navigation.isFocusTargetFocused ? 'true' : 'false'}
          data-status={navigation.activeClipStatusText}
          {...navigation.getFocusTargetProps({
            onKeyDown: cancelKeys ? (event) => event.preventDefault() : undefined,
          })}
        />
      );
    }

    const { getByRole, rerender } = render(
      <TimelineProvider engine={engine}>
        <ClipFocusTarget />
      </TimelineProvider>
    );
    const focusTarget = getByRole('group');

    expect(focusTarget.getAttribute('data-active-clip')).toBe('intro');
    expect(focusTarget.getAttribute('aria-roledescription')).toBe('timeline clip navigator');
    expect(focusTarget.getAttribute('data-status')).toContain('Clip 1 of 3');

    fireEvent.focus(focusTarget);
    expect(focusTarget.getAttribute('data-focused')).toBe('true');

    const tabAllowed = fireEvent.keyDown(focusTarget, { key: 'Tab' });
    expect(tabAllowed).toBe(true);
    expect(focusTarget.getAttribute('data-active-clip')).toBe('intro');

    fireEvent.keyDown(focusTarget, { key: 'ArrowRight' });
    expect(focusTarget.getAttribute('data-active-clip')).toBe('main');

    fireEvent.keyDown(focusTarget, { key: 'End' });
    expect(focusTarget.getAttribute('data-active-clip')).toBe('overlay');

    fireEvent.keyDown(focusTarget, { key: 'Home' });
    expect(focusTarget.getAttribute('data-active-clip')).toBe('intro');

    fireEvent.keyDown(focusTarget, { key: 'ArrowRight' });
    expect(focusTarget.getAttribute('data-active-clip')).toBe('main');

    fireEvent.keyDown(focusTarget, { key: 'Enter' });
    expect(engine.getClip('main')?.clip.selected).toBe(true);

    fireEvent.blur(focusTarget);
    expect(focusTarget.getAttribute('data-focused')).toBe('false');

    rerender(
      <TimelineProvider engine={engine}>
        <ClipFocusTarget cancelKeys />
      </TimelineProvider>
    );
    const cancelledFocusTarget = getByRole('group');
    fireEvent.keyDown(cancelledFocusTarget, { key: 'ArrowRight' });

    expect(cancelledFocusTarget.getAttribute('data-active-clip')).toBe('main');
  });

  it('resolves built-in keyboard presets without frame-step bindings until a frame rate is supplied', () => {
    expect(getTimelineKeyboardCommand({ key: 'Space' }, minimalTimelineKeyboardBindings)).toBe(
      'togglePlayback'
    );
    expect(
      getTimelineKeyboardCommand({ key: 'i' }, professionalEditorTimelineKeyboardBindings)
    ).toBe('setInPoint');
    expect(createTimelineKeyboardBindings({ preset: 'professionalEditor' }).stepForward).toBe(
      undefined
    );

    const frameAwareBindings = createTimelineKeyboardBindings({
      frameRate: 24,
      platform: 'mac',
      preset: 'professionalEditor',
    });

    expect(getTimelineKeyboardCommand({ key: 'ArrowRight' }, frameAwareBindings)).toBe(
      'stepForward'
    );
    expect(
      getTimelineKeyboardCommand({ key: 'M', metaKey: true, shiftKey: true }, frameAwareBindings)
    ).toBe('seekToPreviousMarker');
    expect(getTimelineKeyboardCommand({ key: 'X', altKey: true }, frameAwareBindings)).toBe(
      'clearInOutPoints'
    );
  });

  it('exposes focus-scoped keyboard props without installing global handlers', () => {
    const engine = new TimelineEngine({ duration: fromSeconds(10), tracks: [] });

    function KeyboardSurface() {
      const keyboard = useTimelineKeyboard({ preset: 'minimal' });
      return (
        <>
          <div data-testid="outside" />
          <div data-testid="scope" {...keyboard.scopeProps} />
        </>
      );
    }

    const { getByTestId } = render(
      <TimelineProvider engine={engine}>
        <KeyboardSurface />
      </TimelineProvider>
    );

    fireEvent.keyDown(getByTestId('outside'), { key: 'Space' });
    expect(engine.getState().playing).toBe(false);

    const scope = getByTestId('scope');
    fireEvent.keyDown(scope, { key: 'Space' });
    expect(engine.getState().playing).toBe(false);

    scope.focus();
    fireEvent.keyDown(scope, { key: 'Space' });
    expect(engine.getState().playing).toBe(true);

    engine.pause();
  });

  it('lets interactive descendants and cancelled events keep their own keyboard behavior', () => {
    const engine = new TimelineEngine({ duration: fromSeconds(10), tracks: [] });

    const { getByLabelText, getByRole } = render(
      <TimelineProvider engine={engine}>
        <Timeline.KeyboardScope onKeyDown={(event) => event.preventDefault()}>
          <input aria-label="Clip name" />
        </Timeline.KeyboardScope>
      </TimelineProvider>
    );

    fireEvent.keyDown(getByLabelText('Clip name'), { key: 'Space' });
    expect(engine.getState().playing).toBe(false);

    const scope = getByRole('group');
    scope.focus();
    fireEvent.keyDown(scope, { key: 'Space' });
    expect(engine.getState().playing).toBe(false);
  });

  it('ignores ARIA role controls inside the keyboard scope', () => {
    const engine = new TimelineEngine({
      duration: fromSeconds(10),
      playheadTime: fromSeconds(1),
      tracks: [],
    });

    const { getByRole } = render(
      <TimelineProvider engine={engine}>
        <Timeline.KeyboardScope frameRate={24}>
          <div role="button" tabIndex={0}>
            Play preview
          </div>
          <div role="slider" tabIndex={0} aria-valuemin={0} aria-valuemax={10} aria-valuenow={1}>
            Scrub preview
          </div>
        </Timeline.KeyboardScope>
      </TimelineProvider>
    );

    const roleButton = getByRole('button');
    roleButton.focus();
    fireEvent.keyDown(roleButton, { key: 'Space' });
    expect(engine.getState().playing).toBe(false);

    const roleSlider = getByRole('slider');
    roleSlider.focus();
    fireEvent.keyDown(roleSlider, { key: 'ArrowRight' });
    expect(toSeconds(engine.playheadTime)).toBe(1);
  });

  it('supports custom keyboard bindings, disabling, and frame-accurate stepping', () => {
    const engine = new TimelineEngine({
      duration: fromSeconds(10),
      playheadTime: fromSeconds(1),
      tracks: [],
    });

    const { getByRole, rerender } = render(
      <TimelineProvider engine={engine}>
        <Timeline.KeyboardScope bindings={{ togglePlayback: [{ key: 'K' }] }} frameRate={24} />
      </TimelineProvider>
    );
    const scope = getByRole('group');
    scope.focus();

    fireEvent.keyDown(scope, { key: 'Space' });
    expect(engine.getState().playing).toBe(false);

    fireEvent.keyDown(scope, { key: 'K' });
    expect(engine.getState().playing).toBe(true);
    engine.pause();

    rerender(
      <TimelineProvider engine={engine}>
        <Timeline.KeyboardScope bindings={false} frameRate={24} />
      </TimelineProvider>
    );
    const disabledBindingsScope = getByRole('group');
    disabledBindingsScope.focus();
    fireEvent.keyDown(disabledBindingsScope, { key: 'K' });
    expect(engine.getState().playing).toBe(false);

    rerender(
      <TimelineProvider engine={engine}>
        <Timeline.KeyboardScope disabled frameRate={24} />
      </TimelineProvider>
    );
    fireEvent.keyDown(getByRole('group'), { key: 'Space' });
    expect(engine.getState().playing).toBe(false);

    rerender(
      <TimelineProvider engine={engine}>
        <Timeline.KeyboardScope frameRate={24} />
      </TimelineProvider>
    );
    const frameScope = getByRole('group');
    frameScope.focus();
    fireEvent.keyDown(frameScope, { key: 'ArrowRight' });
    expect(toSeconds(engine.playheadTime)).toBeCloseTo(1 + 1 / 24, 12);
    fireEvent.keyDown(frameScope, { key: 'ArrowLeft' });
    expect(toSeconds(engine.playheadTime)).toBeCloseTo(1, 12);
  });

  it('threads platform overrides through useTimelineKeyboard preset bindings', () => {
    const engine = new TimelineEngine({ duration: fromSeconds(10), tracks: [] });

    function KeyboardSurface() {
      const keyboard = useTimelineKeyboard({ platform: 'mac' });
      return (
        <div
          data-clear-binding={keyboard.bindings.clearInOutPoints?.[0]?.altKey ? 'option' : ''}
          {...keyboard.scopeProps}
        />
      );
    }

    const { getByRole } = render(
      <TimelineProvider engine={engine}>
        <KeyboardSurface />
      </TimelineProvider>
    );

    expect(getByRole('group').getAttribute('data-clear-binding')).toBe('option');
  });

  it('runs professional editor keyboard commands for marks, markers, snapping, and zoom', () => {
    const engine = new TimelineEngine({
      duration: fromSeconds(20),
      markers: [
        { id: 'marker-a', time: fromSeconds(2), label: 'A' },
        { id: 'marker-b', time: fromSeconds(8), label: 'B' },
      ],
      playheadTime: fromSeconds(5),
      tracks: [],
      zoomScale: 100,
    });

    const { getByRole } = render(
      <TimelineProvider engine={engine}>
        <Timeline.KeyboardScope
          bindings={{
            addMarker: [{ key: 'M' }],
            clearInOutPoints: [{ key: 'X' }],
            seekToNextMarker: [{ key: 'N' }],
            seekToPreviousMarker: [{ key: 'P' }],
            setInPoint: [{ key: 'I' }],
            setOutPoint: [{ key: 'O' }],
            toggleSnapping: [{ key: 'S' }],
            zoomIn: [{ key: '=' }],
            zoomOut: [{ key: '-' }],
          }}
        />
      </TimelineProvider>
    );
    const scope = getByRole('group');
    scope.focus();

    fireEvent.keyDown(scope, { key: 'I' });
    expect(toSeconds(expectDefined(engine.getState().inPoint, 'in point'))).toBe(5);

    engine.updatePlayhead(fromSeconds(6));
    fireEvent.keyDown(scope, { key: 'O' });
    expect(toSeconds(expectDefined(engine.getState().outPoint, 'out point'))).toBe(6);

    fireEvent.keyDown(scope, { key: 'X' });
    expect(engine.getState().inPoint).toBeUndefined();
    expect(engine.getState().outPoint).toBeUndefined();

    fireEvent.keyDown(scope, { key: 'M' });
    expect(engine.getState().markers).toHaveLength(3);

    fireEvent.keyDown(scope, { key: 'N' });
    expect(toSeconds(engine.playheadTime)).toBe(8);

    fireEvent.keyDown(scope, { key: 'P' });
    expect(toSeconds(engine.playheadTime)).toBe(6);

    fireEvent.keyDown(scope, { key: 'S' });
    expect(engine.getState().snapEnabled).toBe(false);

    fireEvent.keyDown(scope, { key: '=' });
    expect(engine.zoomScale).toBe(120);

    fireEvent.keyDown(scope, { key: '-' });
    expect(engine.zoomScale).toBe(100);
  });
});
