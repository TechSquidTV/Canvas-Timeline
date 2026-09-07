import { ClipInteractionLayer } from '#react/components/interactions/ClipInteractionLayer';
import { resetTimelineTapState } from '#react/components/interactions/tapState';
import { useTimeline } from '#react/hooks/core/useTimeline';
import { TimelineProvider } from '#react/Provider';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import type { Clip, Track } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
function getElementPrototypeMethod<
  K extends 'getBoundingClientRect' | 'setPointerCapture' | 'releasePointerCapture',
>(name: K): Element[K] | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, name);
  return typeof descriptor?.value === 'function' ? (descriptor.value as Element[K]) : undefined;
}

function restoreElementPrototypeMethod<
  K extends 'getBoundingClientRect' | 'setPointerCapture' | 'releasePointerCapture',
>(name: K, method: Element[K] | undefined): void {
  if (method) {
    Element.prototype[name] = method;
    return;
  }
  Reflect.deleteProperty(Element.prototype, name);
}

const originalGetBoundingClientRect = getElementPrototypeMethod('getBoundingClientRect');
const originalSetPointerCapture = getElementPrototypeMethod('setPointerCapture');
const originalReleasePointerCapture = getElementPrototypeMethod('releasePointerCapture');

beforeEach(() => {
  resetTimelineTapState();
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    width: 1000,
    height: 200,
    top: 32,
    left: 0,
    bottom: 232,
    right: 1000,
    x: 0,
    y: 32,
    toJSON: () => {},
  }));
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  restoreElementPrototypeMethod('getBoundingClientRect', originalGetBoundingClientRect);
  restoreElementPrototypeMethod('setPointerCapture', originalSetPointerCapture);
  restoreElementPrototypeMethod('releasePointerCapture', originalReleasePointerCapture);
  vi.restoreAllMocks();
});

function createClip(id: string, start: number, end: number, overrides: Partial<Clip> = {}): Clip {
  return {
    id,
    sourceId: `source-${id}`,
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
    clips,
    selected: false,
    locked: false,
    muted: false,
    visible: true,
    ...overrides,
  };
}

function createEngine(tracks: Track[]) {
  return new TimelineEngine({
    tracks,
    playheadTime: fromSeconds(0),
    zoomScale: 100,
  });
}

function fireLostPointerCapture(target: Element, pointerId: number) {
  const event = new Event('lostpointercapture', { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: 'mouse' },
  });

  fireEvent(target, event);
}

describe('ClipInteractionLayer', () => {
  it('renders constant DOM and only one active affordance for many clips', () => {
    const clips = Array.from({ length: 100 }, (_, index) =>
      createClip(`clip-${index}`, index * 2, index * 2 + 1)
    );
    const engine = createEngine([createTrack('track-1', clips)]);

    const { container } = render(
      <TimelineProvider engine={engine}>
        <ClipInteractionLayer />
      </TimelineProvider>
    );

    const layer = container.querySelector('.timeline-clip-interaction-layer') as Element;
    expect(layer).toBeTruthy();
    expect(container.querySelectorAll('.timeline-clip-interaction-overlay')).toHaveLength(0);

    fireEvent.pointerMove(layer, {
      clientX: 100,
      clientY: 40,
      pointerType: 'mouse',
    });

    expect(container.querySelectorAll('.timeline-clip-interaction-layer')).toHaveLength(1);
    expect(container.querySelectorAll('.timeline-clip-interaction-overlay')).toHaveLength(1);
    expect(container.querySelectorAll('.timeline-clip-interaction-handle')).toHaveLength(2);
  });

  it('provides one focusable clip navigator without per-clip DOM', async () => {
    const engine = createEngine([
      createTrack('track-1', [createClip('intro', 0, 2), createClip('main', 3, 6)]),
    ]);

    const { container, getByRole } = render(
      <TimelineProvider engine={engine}>
        <ClipInteractionLayer />
      </TimelineProvider>
    );

    const layer = getByRole('group');
    expect(layer.getAttribute('tabindex')).toBe('0');
    expect(layer.getAttribute('aria-roledescription')).toBe('timeline clip navigator');
    expect(layer.getAttribute('aria-label')).toContain('Clip 1 of 2');

    fireEvent.focus(layer);

    await waitFor(() => {
      expect(container.querySelectorAll('.timeline-clip-interaction-overlay')).toHaveLength(1);
    });

    const overlay = container.querySelector('.timeline-clip-interaction-overlay') as Element;
    expect(overlay.getAttribute('data-focus-visible')).toBe('true');
    expect(container.querySelectorAll('.timeline-clip-interaction-layer')).toHaveLength(1);

    const tabAllowed = fireEvent.keyDown(layer, { key: 'Tab' });
    expect(tabAllowed).toBe(true);

    fireEvent.keyDown(layer, { key: 'ArrowRight' });
    expect(layer.getAttribute('aria-label')).toContain('main');
    expect(engine.geometry.getClip('main')?.clip.selected).toBe(false);

    fireEvent.keyDown(layer, { key: 'Enter' });
    expect(engine.geometry.getClip('main')?.clip.selected).toBe(true);
  });

  it('can disable built-in keyboard navigation for custom editor focus models', () => {
    const engine = createEngine([createTrack('track-1', [createClip('clip-1', 1, 5)])]);

    const { container } = render(
      <TimelineProvider engine={engine}>
        <ClipInteractionLayer keyboardNavigation={false} />
      </TimelineProvider>
    );

    const layer = container.querySelector('.timeline-clip-interaction-layer') as HTMLElement;
    expect(layer.getAttribute('role')).toBeNull();
    expect(layer.getAttribute('tabindex')).toBeNull();
  });

  it('uses a not-allowed cursor over locked clip edit regions', () => {
    const engine = createEngine([
      createTrack('track-1', [createClip('clip-1', 1, 5)], { locked: true }),
    ]);

    const { container } = render(
      <TimelineProvider engine={engine}>
        <ClipInteractionLayer />
      </TimelineProvider>
    );

    const layer = container.querySelector('.timeline-clip-interaction-layer') as HTMLElement;
    fireEvent.pointerMove(layer, {
      clientX: 130,
      clientY: 40,
      pointerType: 'mouse',
    });
    expect(layer.style.cursor).toBe('not-allowed');

    fireEvent.pointerMove(layer, {
      clientX: 105,
      clientY: 40,
      pointerType: 'mouse',
    });
    expect(layer.style.cursor).toBe('not-allowed');
  });

  it('moves a clip body through delegated pointer interaction', () => {
    const engine = createEngine([createTrack('track-1', [createClip('clip-1', 1, 5)])]);
    const moveClip = vi.spyOn(engine, 'previewEdit');

    const { container } = render(
      <TimelineProvider engine={engine}>
        <ClipInteractionLayer />
      </TimelineProvider>
    );

    const layer = container.querySelector('.timeline-clip-interaction-layer') as Element;
    fireEvent.pointerDown(layer, {
      clientX: 130,
      clientY: 40,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(layer, {
      clientX: 150,
      clientY: 40,
      pointerType: 'mouse',
      pointerId: 1,
    });
    fireEvent.pointerUp(layer, {
      clientX: 150,
      clientY: 40,
      pointerType: 'mouse',
      pointerId: 1,
    });

    expect(moveClip).toHaveBeenCalledWith(
      expect.objectContaining({
        clipId: 'clip-1',
        startTime: expect.objectContaining({ r: 24000, v: 28800 }),
        targetTrackId: 'track-1',
      })
    );
    expect(moveClip).toHaveBeenCalledTimes(1);
  });

  it('selects all group members when clicking one grouped clip', () => {
    const engine = createEngine([
      createTrack('video', [createClip('video-clip', 1, 5)]),
      createTrack('audio', [createClip('audio-clip', 1, 5)], { kind: 'audio' }),
    ]);
    engine.createClipGroup({ id: 'linked-av', clipIds: ['video-clip', 'audio-clip'] });

    const { container } = render(
      <TimelineProvider engine={engine}>
        <ClipInteractionLayer />
      </TimelineProvider>
    );

    const layer = container.querySelector('.timeline-clip-interaction-layer') as Element;
    fireEvent.pointerDown(layer, {
      clientX: 130,
      clientY: 40,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
    });

    expect(engine.geometry.getClip('video-clip')?.clip.selected).toBe(true);
    expect(engine.geometry.getClip('audio-clip')?.clip.selected).toBe(true);
  });

  it('toggles ungrouped clips into multi-selection with shift-click', () => {
    const engine = createEngine([
      createTrack('track-1', [
        createClip('clip-a', 1, 3, { selected: true }),
        createClip('clip-b', 4, 6),
      ]),
    ]);

    const { container } = render(
      <TimelineProvider engine={engine}>
        <ClipInteractionLayer />
      </TimelineProvider>
    );

    const layer = container.querySelector('.timeline-clip-interaction-layer') as Element;
    fireEvent.pointerDown(layer, {
      clientX: 430,
      clientY: 40,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
      shiftKey: true,
    });

    expect(engine.geometry.getClip('clip-a')?.clip.selected).toBe(true);
    expect(engine.geometry.getClip('clip-b')?.clip.selected).toBe(true);

    fireEvent.pointerDown(layer, {
      clientX: 430,
      clientY: 40,
      pointerType: 'mouse',
      button: 0,
      pointerId: 2,
      shiftKey: true,
    });

    expect(engine.geometry.getClip('clip-a')?.clip.selected).toBe(true);
    expect(engine.geometry.getClip('clip-b')?.clip.selected).toBe(false);
  });

  it('toggles grouped clips into multi-selection with shift-click', () => {
    const engine = createEngine([
      createTrack('video', [createClip('video-clip', 1, 5)]),
      createTrack('audio', [createClip('audio-clip', 1, 5)], { kind: 'audio' }),
    ]);
    engine.createClipGroup({ id: 'linked-av', clipIds: ['video-clip', 'audio-clip'] });
    engine.selectClip(null);

    const { container } = render(
      <TimelineProvider engine={engine}>
        <ClipInteractionLayer />
      </TimelineProvider>
    );

    const layer = container.querySelector('.timeline-clip-interaction-layer') as Element;
    fireEvent.pointerDown(layer, {
      clientX: 130,
      clientY: 40,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
      shiftKey: true,
    });

    expect(engine.geometry.getClip('video-clip')?.clip.selected).toBe(true);
    expect(engine.geometry.getClip('audio-clip')?.clip.selected).toBe(true);

    fireEvent.pointerDown(layer, {
      clientX: 130,
      clientY: 40,
      pointerType: 'mouse',
      button: 0,
      pointerId: 2,
      shiftKey: true,
    });

    expect(engine.geometry.getClip('video-clip')?.clip.selected).toBe(false);
    expect(engine.geometry.getClip('audio-clip')?.clip.selected).toBe(false);
  });

  it('starts body drags after shift-click selection', () => {
    const engine = createEngine([
      createTrack('track-1', [
        createClip('clip-a', 1, 3, { selected: true }),
        createClip('clip-b', 4, 6),
      ]),
    ]);
    const moveClip = vi.spyOn(engine, 'previewEdit');

    const { container } = render(
      <TimelineProvider engine={engine}>
        <ClipInteractionLayer />
      </TimelineProvider>
    );

    const layer = container.querySelector('.timeline-clip-interaction-layer') as Element;
    fireEvent.pointerDown(layer, {
      clientX: 430,
      clientY: 40,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
      shiftKey: true,
    });
    fireEvent.pointerMove(layer, {
      clientX: 450,
      clientY: 40,
      pointerType: 'mouse',
      pointerId: 1,
    });
    fireEvent.pointerUp(layer, {
      clientX: 450,
      clientY: 40,
      pointerType: 'mouse',
      pointerId: 1,
    });

    expect(moveClip).toHaveBeenCalledWith(
      expect.objectContaining({
        clipId: 'clip-b',
        targetTrackId: 'track-1',
      })
    );
  });

  it('reports clip double-click hits without starting a drag', () => {
    const engine = createEngine([createTrack('track-1', [createClip('clip-1', 1, 5)])]);
    const moveClip = vi.spyOn(engine, 'previewEdit');
    const onClipDoubleClick = vi.fn();

    const { container } = render(
      <TimelineProvider engine={engine}>
        <ClipInteractionLayer onClipDoubleClick={onClipDoubleClick} />
      </TimelineProvider>
    );

    const layer = container.querySelector('.timeline-clip-interaction-layer') as Element;
    fireEvent.pointerDown(layer, {
      clientX: 130,
      clientY: 40,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
      timeStamp: 1000,
    });
    fireEvent.pointerUp(layer, {
      clientX: 130,
      clientY: 40,
      pointerType: 'mouse',
      pointerId: 1,
    });
    fireEvent.pointerDown(layer, {
      clientX: 130,
      clientY: 40,
      pointerType: 'mouse',
      button: 0,
      pointerId: 2,
      timeStamp: 1100,
    });

    expect(onClipDoubleClick).toHaveBeenCalledTimes(1);
    expect(onClipDoubleClick).toHaveBeenCalledWith(
      expect.objectContaining({
        clip: expect.objectContaining({ id: 'clip-1' }),
        region: 'body',
      }),
      expect.objectContaining({
        engine,
        time: expect.objectContaining({ r: 24000, v: 31200 }),
        viewportX: 130,
        viewportY: 40,
      })
    );
    expect(moveClip).not.toHaveBeenCalled();
  });

  it('moves a clip body across same-kind tracks after vertical snap activation', () => {
    const engine = createEngine([
      createTrack('track-1', [createClip('clip-1', 1, 5)]),
      createTrack('track-2', []),
    ]);

    const { container } = render(
      <TimelineProvider engine={engine}>
        <ClipInteractionLayer />
      </TimelineProvider>
    );
    const layer = container.querySelector('.timeline-clip-interaction-layer') as Element;

    fireEvent.pointerDown(layer, {
      clientX: 130,
      clientY: 40,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(layer, {
      clientX: 150,
      clientY: 96,
      pointerType: 'mouse',
      pointerId: 1,
    });
    fireEvent.pointerUp(layer, {
      clientX: 150,
      clientY: 96,
      pointerType: 'mouse',
      pointerId: 1,
    });

    expect(engine.geometry.getClip('clip-1')?.track.id).toBe('track-2');
  });

  it('refreshes the active overlay once per drag frame', () => {
    const engine = createEngine([createTrack('track-1', [createClip('clip-1', 1, 5)])]);
    const getClipRect = vi.spyOn(engine.geometry, 'getClipRect');

    const { container } = render(
      <TimelineProvider engine={engine}>
        <ClipInteractionLayer />
      </TimelineProvider>
    );

    const layer = container.querySelector('.timeline-clip-interaction-layer') as Element;
    fireEvent.pointerDown(layer, {
      clientX: 130,
      clientY: 40,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
    });

    getClipRect.mockClear();

    fireEvent.pointerMove(layer, {
      clientX: 150,
      clientY: 40,
      pointerType: 'mouse',
      pointerId: 1,
    });

    expect(getClipRect).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(layer, {
      clientX: 150,
      clientY: 40,
      pointerType: 'mouse',
      pointerId: 1,
    });
  });

  it('trims a clip edge through delegated pointer interaction', () => {
    const engine = createEngine([createTrack('track-1', [createClip('clip-1', 1, 5)])]);
    const trimClip = vi.spyOn(engine, 'previewEdit');

    const { container } = render(
      <TimelineProvider engine={engine}>
        <ClipInteractionLayer />
      </TimelineProvider>
    );

    const layer = container.querySelector('.timeline-clip-interaction-layer') as Element;
    fireEvent.pointerDown(layer, {
      clientX: 105,
      clientY: 40,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(layer, {
      clientX: 125,
      clientY: 40,
      pointerType: 'mouse',
      pointerId: 1,
    });
    fireEvent.pointerUp(layer, {
      clientX: 125,
      clientY: 40,
      pointerType: 'mouse',
      pointerId: 1,
    });

    expect(trimClip).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'trim',
        clipId: 'clip-1',
        edge: 'start',
      })
    );
    expect(trimClip).toHaveBeenCalledTimes(1);
    const command = trimClip.mock.calls[0]?.[0];
    if (command?.type !== 'trim') {
      throw new Error('Expected trim command');
    }
    expect(toSeconds(command.newTime)).toBe(1.2);
  });

  it.each(['mouse', 'touch'])(
    'cancels a %s trim without reading layout during moves',
    (pointerType) => {
      const engine = createEngine([createTrack('track-1', [createClip('clip-1', 1, 5)])]);
      const { container } = render(
        <TimelineProvider engine={engine}>
          <ClipInteractionLayer />
        </TimelineProvider>
      );
      const layer = container.querySelector('.timeline-clip-interaction-layer');
      if (!layer) {
        throw new Error('Missing interaction layer');
      }
      fireEvent.pointerDown(layer, {
        clientX: 498,
        clientY: 40,
        pointerType,
        button: 0,
        pointerId: 1,
      });
      const readLayout = vi.spyOn(layer, 'getBoundingClientRect');
      readLayout.mockClear();
      fireEvent.pointerMove(layer, { clientX: 550, clientY: 40, pointerType, pointerId: 1 });
      expect(engine.getEditPreview()?.command.type).toBe('trim');
      expect(readLayout).not.toHaveBeenCalled();
      fireEvent.pointerCancel(layer, { pointerType, pointerId: 1 });
      expect(engine.getEditPreview()).toBeNull();
      const found = engine.geometry.getClip('clip-1');
      if (!found) {
        throw new Error('Missing clip');
      }
      expect(toSeconds(found.clip.timelineEnd)).toBe(5);
    }
  );

  it('ends an active edit when pointer capture is lost', () => {
    const engine = createEngine([createTrack('track-1', [createClip('clip-1', 1, 5)])]);
    const endDrag = vi.spyOn(engine, 'cancelEdit');

    const { container } = render(
      <TimelineProvider engine={engine}>
        <ClipInteractionLayer />
      </TimelineProvider>
    );

    const layer = container.querySelector('.timeline-clip-interaction-layer') as Element;
    fireEvent.pointerDown(layer, {
      clientX: 130,
      clientY: 40,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
    });
    fireLostPointerCapture(layer, 1);

    expect(endDrag).toHaveBeenCalled();
  });

  it('clears selection when pressing blank track space', () => {
    const engine = createEngine([
      createTrack('track-1', [createClip('clip-1', 1, 5, { selected: true })]),
    ]);

    const { container } = render(
      <TimelineProvider engine={engine}>
        <ClipInteractionLayer />
      </TimelineProvider>
    );

    const layer = container.querySelector('.timeline-clip-interaction-layer') as Element;
    fireEvent.pointerDown(layer, {
      clientX: 50,
      clientY: 40,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
    });

    expect(engine.geometry.getClip('clip-1')?.clip.selected).toBe(false);
  });

  it('does not rerender provider subscribers during drag-frame move events', () => {
    const engine = createEngine([
      createTrack('track-1', [createClip('clip-1', 1, 5, { selected: true })]),
    ]);
    let subscriberRenders = 0;

    function RenderCounter() {
      useTimeline();
      subscriberRenders++;
      return null;
    }

    const { container } = render(
      <TimelineProvider engine={engine}>
        <RenderCounter />
        <ClipInteractionLayer />
      </TimelineProvider>
    );

    const layer = container.querySelector('.timeline-clip-interaction-layer') as Element;
    fireEvent.pointerDown(layer, {
      clientX: 130,
      clientY: 40,
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
    });

    const rendersAfterSelection = subscriberRenders;

    fireEvent.pointerMove(layer, {
      clientX: 140,
      clientY: 40,
      pointerType: 'mouse',
      pointerId: 1,
    });
    fireEvent.pointerMove(layer, {
      clientX: 150,
      clientY: 40,
      pointerType: 'mouse',
      pointerId: 1,
    });

    expect(subscriberRenders).toBe(rendersAfterSelection);

    fireEvent.pointerUp(layer, {
      clientX: 150,
      clientY: 40,
      pointerType: 'mouse',
      pointerId: 1,
    });
  });
});
