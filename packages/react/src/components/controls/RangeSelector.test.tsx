import React from 'react';
import { act, render, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimelineProvider } from '../../Provider';
import { RangeSelector } from './RangeSelector';

function renderHighLevelRangeSelector(
  engine: TimelineEngine,
  props: React.ComponentProps<typeof RangeSelector> = {}
) {
  return render(
    <TimelineProvider engine={engine}>
      <RangeSelector {...props} />
    </TimelineProvider>
  );
}

function renderRangeSelector(engine: TimelineEngine) {
  return render(
    <TimelineProvider engine={engine}>
      <RangeSelector.Root>
        <RangeSelector.Control>
          <RangeSelector.Track>
            <RangeSelector.Indicator />
            <RangeSelector.Thumb index={0} aria-label="Min limit" />
            <RangeSelector.Thumb index={1} aria-label="Max limit" />
          </RangeSelector.Track>
        </RangeSelector.Control>
      </RangeSelector.Root>
    </TimelineProvider>
  );
}

function renderRangeSelectorRoot(
  engine: TimelineEngine,
  props: React.ComponentProps<typeof RangeSelector.Root>
) {
  return render(
    <TimelineProvider engine={engine}>
      <RangeSelector.Root {...props}>
        <RangeSelector.Control>
          <RangeSelector.Track>
            <RangeSelector.Indicator />
            <RangeSelector.Thumb index={0} aria-label="Min limit" />
            <RangeSelector.Thumb index={1} aria-label="Max limit" />
          </RangeSelector.Track>
        </RangeSelector.Control>
      </RangeSelector.Root>
    </TimelineProvider>
  );
}

describe('RangeSelector', () => {
  it('renders the high-level full-height timeline range selector', () => {
    const engine = new TimelineEngine({
      duration: fromSeconds(20),
      scrollLeft: 12,
      tracks: [],
      zoomScale: 10,
    });

    const { container } = renderHighLevelRangeSelector(engine);
    const root = container.querySelector('.timeline-range-selector-overlay') as HTMLElement;

    expect(root).not.toBeNull();
    expect(root.style.width).toBe('1000px');
    expect(root.style.transform).toBe('translateX(0px)');
    expect(container.querySelector('.timeline-range-selector-control')).not.toBeNull();
    expect(container.querySelector('.timeline-range-selector-track')).not.toBeNull();
    expect(container.querySelector('.timeline-range-selector-indicator')).not.toBeNull();
    expect(container.querySelectorAll('.timeline-range-selector-grabber')).toHaveLength(0);
    expect(container.querySelectorAll('.timeline-time-grabber-line')).toHaveLength(0);
  });

  it('renders high-level in and out thumbs only for set endpoints', () => {
    const inPointEngine = new TimelineEngine({ duration: fromSeconds(100), tracks: [] });
    inPointEngine.setInPoint(fromSeconds(15));

    const inPointRender = renderHighLevelRangeSelector(inPointEngine);
    let grabbers = inPointRender.container.querySelectorAll('.timeline-range-selector-grabber');
    expect(grabbers).toHaveLength(1);
    expect(grabbers[0].getAttribute('data-boundary')).toBe('in');
    expect(grabbers[0].getAttribute('data-index')).toBe('0');
    inPointRender.unmount();

    const outPointEngine = new TimelineEngine({ duration: fromSeconds(100), tracks: [] });
    outPointEngine.setOutPoint(fromSeconds(45));

    const outPointRender = renderHighLevelRangeSelector(outPointEngine);
    grabbers = outPointRender.container.querySelectorAll('.timeline-range-selector-grabber');
    expect(grabbers).toHaveLength(1);
    expect(grabbers[0].getAttribute('data-boundary')).toBe('out');
    expect(grabbers[0].getAttribute('data-index')).toBe('1');
    outPointRender.unmount();

    const rangeEngine = new TimelineEngine({ duration: fromSeconds(100), tracks: [] });
    rangeEngine.setInPoint(fromSeconds(15));
    rangeEngine.setOutPoint(fromSeconds(45));

    const rangeRender = renderHighLevelRangeSelector(rangeEngine);
    grabbers = rangeRender.container.querySelectorAll('.timeline-range-selector-grabber');
    expect(grabbers).toHaveLength(2);
    expect(grabbers[0].getAttribute('data-boundary')).toBe('in');
    expect(grabbers[1].getAttribute('data-boundary')).toBe('out');
  });

  it('renders high-level in and out grabbers with shared line structure and no default head', () => {
    const engine = new TimelineEngine({ duration: fromSeconds(100), tracks: [] });
    engine.setInPoint(fromSeconds(15));
    engine.setOutPoint(fromSeconds(45));

    const { container } = renderHighLevelRangeSelector(engine);
    const grabbers = container.querySelectorAll('.timeline-range-selector-grabber');

    expect(grabbers).toHaveLength(2);
    for (const grabber of grabbers) {
      expect(grabber.querySelector('.timeline-time-grabber-highlight')).not.toBeNull();
      expect(grabber.querySelector('.timeline-time-grabber-line')).not.toBeNull();
      expect(grabber.querySelector('.timeline-time-grabber-handle')).not.toBeNull();
      expect(grabber.querySelector('.timeline-range-selector-grabber-highlight')).not.toBeNull();
      expect(grabber.querySelector('.timeline-range-selector-grabber-line')).not.toBeNull();
      expect(grabber.querySelector('.timeline-range-selector-grabber-handle')).not.toBeNull();
    }
  });

  it('supports custom high-level in and out grabber render props', () => {
    const engine = new TimelineEngine({ duration: fromSeconds(100), tracks: [] });
    engine.setInPoint(fromSeconds(15));
    engine.setOutPoint(fromSeconds(45));

    const { container } = renderHighLevelRangeSelector(engine, {
      inPointChildren: ({ boundary, dragging, engine: renderEngine, time }) => (
        <div
          className="custom-in-grabber"
          data-boundary={boundary}
          data-dragging={dragging}
          data-engine-match={renderEngine === engine}
        >
          {time.v / time.r}
        </div>
      ),
      outPointChildren: ({ boundary, dragging, engine: renderEngine, time }) => (
        <div
          className="custom-out-grabber"
          data-boundary={boundary}
          data-dragging={dragging}
          data-engine-match={renderEngine === engine}
        >
          {time.v / time.r}
        </div>
      ),
    });

    const inGrabber = container.querySelector('.custom-in-grabber');
    const outGrabber = container.querySelector('.custom-out-grabber');

    expect(inGrabber?.getAttribute('data-boundary')).toBe('in');
    expect(inGrabber?.getAttribute('data-dragging')).toBe('false');
    expect(inGrabber?.getAttribute('data-engine-match')).toBe('true');
    expect(inGrabber?.textContent).toBe('15');
    expect(outGrabber?.getAttribute('data-boundary')).toBe('out');
    expect(outGrabber?.getAttribute('data-dragging')).toBe('false');
    expect(outGrabber?.getAttribute('data-engine-match')).toBe('true');
    expect(outGrabber?.textContent).toBe('45');
  });

  it('updates high-level in and out grabbers through Base UI range inputs', () => {
    const engine = new TimelineEngine({
      duration: fromSeconds(100),
      tracks: [],
      zoomScale: 100,
    });
    engine.setInPoint(fromSeconds(15));
    engine.setOutPoint(fromSeconds(45));
    const settle = vi.spyOn(engine, 'settle');

    const { container } = renderHighLevelRangeSelector(engine, { snap: false });
    const inputs = container.querySelectorAll('input[type="range"]');

    expect(inputs).toHaveLength(2);

    fireEvent.change(inputs[0], { target: { value: '16' } });

    expect(engine.getState().inPoint?.v).toBe(fromSeconds(16).v);
    expect(engine.getState().outPoint?.v).toBe(fromSeconds(45).v);

    fireEvent.change(inputs[1], { target: { value: '44' } });

    expect(engine.getState().inPoint?.v).toBe(fromSeconds(16).v);
    expect(engine.getState().outPoint?.v).toBe(fromSeconds(44).v);
    expect(settle).toHaveBeenCalledTimes(2);
  });

  it('passes pointer dragging state to high-level grabber render props', () => {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    const engine = new TimelineEngine({ duration: fromSeconds(100), tracks: [] });
    engine.setInPoint(fromSeconds(15));

    const { container } = renderHighLevelRangeSelector(engine, {
      inPointChildren: ({ dragging }) => (
        <div className="custom-in-grabber" data-dragging={dragging} />
      ),
    });
    const grabber = container.querySelector('[data-boundary="in"]') as HTMLElement;
    const custom = container.querySelector('.custom-in-grabber') as HTMLElement;

    expect(custom.getAttribute('data-dragging')).toBe('false');

    fireEvent.pointerDown(grabber, {
      button: 0,
      clientX: 100,
      pointerId: 1,
      pointerType: 'mouse',
    });

    expect(custom.getAttribute('data-dragging')).toBe('true');

    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(custom.getAttribute('data-dragging')).toBe('false');
  });

  it('exposes high-level Base UI thumb labels, values, and keyboard updates', () => {
    const engine = new TimelineEngine({ duration: fromSeconds(100), tracks: [] });
    engine.setInPoint(fromSeconds(15));
    engine.setOutPoint(fromSeconds(45));

    const { container } = renderHighLevelRangeSelector(engine, { step: 1 });
    const inputs = container.querySelectorAll('input[type="range"]');

    expect(inputs).toHaveLength(2);
    expect(inputs[0].getAttribute('aria-label')).toBe('In point');
    expect(inputs[0].getAttribute('aria-valuenow')).toBe('15');
    expect(inputs[0].getAttribute('aria-valuetext')).toBe('15 seconds');
    expect(inputs[1].getAttribute('aria-label')).toBe('Out point');
    expect(inputs[1].getAttribute('aria-valuenow')).toBe('45');
    expect(inputs[1].getAttribute('aria-valuetext')).toBe('45 seconds');

    fireEvent.keyDown(inputs[0], { key: 'ArrowRight' });

    expect(engine.getState().inPoint?.v).toBe(fromSeconds(16).v);
  });

  it('keeps high-level range selector geometry in sync with timeline renders', () => {
    const engine = new TimelineEngine({
      duration: fromSeconds(20),
      tracks: [],
      zoomScale: 10,
    });
    engine.setViewportWidth(100);
    const { container } = renderHighLevelRangeSelector(engine);
    const root = container.querySelector('.timeline-range-selector-overlay') as HTMLElement;

    act(() => {
      engine.setScrollLeft(40);
    });

    expect(root.style.transform).toBe('translateX(-40px)');
  });

  it('keeps high-level range thumbs in overlay-local coordinates while scrolled', () => {
    const engine = new TimelineEngine({
      duration: fromSeconds(20),
      tracks: [],
      zoomScale: 10,
    });
    engine.setViewportWidth(100);
    engine.setInPoint(fromSeconds(10));
    const { container } = renderHighLevelRangeSelector(engine);
    const root = container.querySelector('.timeline-range-selector-overlay') as HTMLElement;
    const grabber = container.querySelector('[data-boundary="in"]') as HTMLElement;

    act(() => {
      engine.setScrollLeft(40);
    });

    expect(root.style.transform).toBe('translateX(-40px)');
    expect(grabber.className).not.toContain('timeline-time-grabber');
    expect(grabber.style.transform).toBe('');
  });

  it('renders range selector with correct DOM elements', () => {
    const engine = new TimelineEngine({ duration: fromSeconds(100), tracks: [] });
    const { container } = renderRangeSelector(engine);

    expect(container.querySelector('.timeline-range-selector')).not.toBeNull();
    expect(container.querySelector('.timeline-range-selector-control')).not.toBeNull();
    expect(container.querySelector('.timeline-range-selector-track')).not.toBeNull();
    expect(container.querySelector('.timeline-range-selector-indicator')).not.toBeNull();
    expect(container.querySelectorAll('.timeline-range-selector-thumb')).toHaveLength(2);
  });

  it('binds engine In/Out points to the slider thumb values', () => {
    const engine = new TimelineEngine({ duration: fromSeconds(100), tracks: [] });
    engine.setInPoint(fromSeconds(15));
    engine.setOutPoint(fromSeconds(45));

    const { container } = renderRangeSelector(engine);
    const inputs = container.querySelectorAll('input[type="range"]');

    expect(inputs).toHaveLength(2);
    expect((inputs[0] as HTMLInputElement).value).toBe('15');
    expect((inputs[1] as HTMLInputElement).value).toBe('45');
  });

  it('provides default thumb labels and formatted value text', () => {
    const engine = new TimelineEngine({ duration: fromSeconds(100), tracks: [] });
    engine.setInPoint(fromSeconds(15));
    engine.setOutPoint(fromSeconds(45));

    const { container } = render(
      <TimelineProvider engine={engine}>
        <RangeSelector.Root>
          <RangeSelector.Control>
            <RangeSelector.Track>
              <RangeSelector.Indicator />
              <RangeSelector.Thumb index={0} />
              <RangeSelector.Thumb index={1} />
            </RangeSelector.Track>
          </RangeSelector.Control>
        </RangeSelector.Root>
      </TimelineProvider>
    );

    const inputs = container.querySelectorAll('input[type="range"]');

    expect(inputs).toHaveLength(2);
    expect(inputs[0].getAttribute('aria-label')).toBe('In point');
    expect(inputs[0].getAttribute('aria-valuetext')).toBe('15 seconds');
    expect(inputs[1].getAttribute('aria-label')).toBe('Out point');
    expect(inputs[1].getAttribute('aria-valuetext')).toBe('45 seconds');
  });

  it('forwards custom slider step to the Base UI range inputs', () => {
    const engine = new TimelineEngine({ duration: fromSeconds(100), tracks: [] });
    const { container } = renderRangeSelectorRoot(engine, { step: 0.5 });
    const inputs = container.querySelectorAll('input[type="range"]');

    expect(inputs).toHaveLength(2);
    expect((inputs[0] as HTMLInputElement).step).toBe('0.5');
    expect((inputs[1] as HTMLInputElement).step).toBe('0.5');
  });

  it('accepts Base UI range collision props on the low-level root', () => {
    const engine = new TimelineEngine({ duration: fromSeconds(100), tracks: [] });
    const { container } = renderRangeSelectorRoot(engine, { thumbCollisionBehavior: 'none' });

    expect(container.querySelectorAll('input[type="range"]')).toHaveLength(2);
  });

  it('updates engine In/Out points when range inputs emit change events', () => {
    const engine = new TimelineEngine({ duration: fromSeconds(100), tracks: [] });
    const { container } = renderRangeSelector(engine);
    const inputs = container.querySelectorAll('input[type="range"]');

    expect(inputs).toHaveLength(2);

    // Simulate user sliding the minimum thumb
    fireEvent.change(inputs[0], { target: { value: '20' } });
    expect(engine.getState().inPoint?.v).toBe(fromSeconds(20).v);

    // Simulate user sliding the maximum thumb
    fireEvent.change(inputs[1], { target: { value: '80' } });
    expect(engine.getState().outPoint?.v).toBe(fromSeconds(80).v);
  });

  it('stops pointer-down propagation while preserving caller handlers', () => {
    const engine = new TimelineEngine({ duration: fromSeconds(100), tracks: [] });
    const onRootPointerDown = vi.fn();
    const onParentPointerDown = vi.fn();

    const { container } = render(
      <TimelineProvider engine={engine}>
        <div onPointerDown={onParentPointerDown}>
          <RangeSelector.Root onPointerDown={onRootPointerDown}>
            <RangeSelector.Control>
              <RangeSelector.Track>
                <RangeSelector.Indicator />
                <RangeSelector.Thumb index={0} aria-label="Min limit" />
                <RangeSelector.Thumb index={1} aria-label="Max limit" />
              </RangeSelector.Track>
            </RangeSelector.Control>
          </RangeSelector.Root>
        </div>
      </TimelineProvider>
    );

    const root = container.querySelector('.timeline-range-selector');
    expect(root).not.toBeNull();

    fireEvent.pointerDown(root as Element);

    expect(onRootPointerDown).toHaveBeenCalledTimes(1);
    expect(onParentPointerDown).not.toHaveBeenCalled();
  });

  it('settles the engine and preserves caller handlers when slider values are committed', () => {
    const engine = new TimelineEngine({ duration: fromSeconds(100), tracks: [] });
    const settle = vi.spyOn(engine, 'settle');
    const onValueCommitted = vi.fn();

    const { container } = renderRangeSelectorRoot(engine, { onValueCommitted });
    const inputs = container.querySelectorAll('input[type="range"]');

    expect(inputs).toHaveLength(2);

    fireEvent.change(inputs[0], { target: { value: '25' } });

    expect(settle).toHaveBeenCalledTimes(1);
    expect(onValueCommitted).toHaveBeenCalledTimes(1);
  });
});
