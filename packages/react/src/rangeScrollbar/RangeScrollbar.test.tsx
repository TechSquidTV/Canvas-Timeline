import { fireEvent, render } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import {
  RangeScrollbar,
  type RangeScrollbarValue,
  type RangeScrollbarValueChangeDetails,
} from '#react/rangeScrollbar/RangeScrollbar';

interface ControlledRangeScrollbarProps {
  initialValue?: RangeScrollbarValue;
  minSpan?: number;
  onValueChange?: (value: RangeScrollbarValue, details: RangeScrollbarValueChangeDetails) => void;
  getAriaValueText?: React.ComponentProps<typeof RangeScrollbar.Root>['getAriaValueText'];
  orientation?: React.ComponentProps<typeof RangeScrollbar.Root>['orientation'];
  thumbProps?: React.HTMLAttributes<HTMLDivElement>;
  startHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  endHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

function ControlledRangeScrollbar({
  endHandleProps,
  initialValue = { start: 20, end: 60 },
  minSpan = 10,
  onValueChange,
  getAriaValueText,
  orientation,
  startHandleProps,
  thumbProps,
}: ControlledRangeScrollbarProps) {
  const [value, setValue] = useState(initialValue);

  return (
    <RangeScrollbar.Root
      min={0}
      max={100}
      value={value}
      minSpan={minSpan}
      keyboardStep={5}
      keyboardPageStep={20}
      getAriaValueText={getAriaValueText}
      orientation={orientation}
      onValueChange={(nextValue, details) => {
        onValueChange?.(nextValue, details);
        setValue(nextValue);
      }}
    >
      <RangeScrollbar.Thumb {...thumbProps}>
        <RangeScrollbar.Handle side="start" {...startHandleProps} />
        <div className="range-scrollbar-fill" />
        <RangeScrollbar.Handle side="end" {...endHandleProps} />
      </RangeScrollbar.Thumb>
    </RangeScrollbar.Root>
  );
}

function mockRootWidth(root: HTMLElement, width = 1000) {
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
    bottom: 10,
    height: 10,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

function mockRootHeight(root: HTMLElement, height = 1000) {
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
    bottom: height,
    height,
    left: 0,
    right: 10,
    top: 0,
    width: 10,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

describe('RangeScrollbar', () => {
  it('calculates thumb geometry from a controlled value', () => {
    const { container } = render(<ControlledRangeScrollbar />);
    const thumb = container.querySelector('.range-scrollbar-thumb') as HTMLElement;

    expect(thumb.style.left).toBe('20%');
    expect(thumb.style.width).toBe('40%');
  });

  it('calculates vertical thumb geometry from a controlled value', () => {
    const { container } = render(<ControlledRangeScrollbar orientation="vertical" />);
    const root = container.querySelector('.range-scrollbar') as HTMLElement;
    const thumb = container.querySelector('.range-scrollbar-thumb') as HTMLElement;

    expect(root.getAttribute('data-orientation')).toBe('vertical');
    expect(thumb.style.top).toBe('20%');
    expect(thumb.style.height).toBe('40%');
    expect(thumb.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('pans the range by dragging the thumb without changing span', () => {
    const onValueChange = vi.fn();
    const { container } = render(<ControlledRangeScrollbar onValueChange={onValueChange} />);
    const root = container.querySelector('.range-scrollbar') as HTMLElement;
    const thumb = container.querySelector('.range-scrollbar-thumb') as HTMLElement;
    mockRootWidth(root);

    fireEvent.pointerDown(thumb, {
      button: 0,
      clientX: 0,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(window, { clientX: 100, pointerId: 1 });

    expect(onValueChange).toHaveBeenLastCalledWith(
      { start: 30, end: 70 },
      expect.objectContaining({
        reason: 'thumb-drag',
        dragSessionId: expect.any(Number),
        dragStartValue: { start: 20, end: 60 },
      })
    );
    expect(thumb.getAttribute('data-dragging')).toBe('');
  });

  it('resizes start and end handles while respecting minSpan and bounds', () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <ControlledRangeScrollbar
        initialValue={{ start: 20, end: 60 }}
        minSpan={20}
        onValueChange={onValueChange}
      />
    );
    const root = container.querySelector('.range-scrollbar') as HTMLElement;
    const startHandle = container.querySelector('[data-side="start"]') as HTMLElement;
    const endHandle = container.querySelector('[data-side="end"]') as HTMLElement;
    mockRootWidth(root);

    fireEvent.pointerDown(startHandle, {
      button: 0,
      clientX: 0,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(window, { clientX: 500, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(onValueChange).toHaveBeenLastCalledWith(
      { start: 40, end: 60 },
      expect.objectContaining({
        reason: 'handle-drag',
        side: 'start',
        dragSessionId: expect.any(Number),
        dragStartValue: { start: 20, end: 60 },
      })
    );

    fireEvent.pointerDown(endHandle, {
      button: 0,
      clientX: 0,
      pointerId: 2,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(window, { clientX: 800, pointerId: 2 });

    expect(onValueChange).toHaveBeenLastCalledWith(
      { start: 40, end: 100 },
      expect.objectContaining({
        reason: 'handle-drag',
        side: 'end',
        dragSessionId: expect.any(Number),
        dragStartValue: { start: 40, end: 60 },
      })
    );
  });

  it('supports keyboard panning and handle resizing', () => {
    const onValueChange = vi.fn();
    const { container } = render(<ControlledRangeScrollbar onValueChange={onValueChange} />);
    const thumb = container.querySelector('.range-scrollbar-thumb') as HTMLElement;
    const startHandle = container.querySelector('[data-side="start"]') as HTMLElement;

    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenLastCalledWith(
      { start: 25, end: 65 },
      { reason: 'thumb-keyboard' }
    );

    fireEvent.keyDown(startHandle, { key: 'PageDown' });
    expect(onValueChange).toHaveBeenLastCalledWith(
      { start: 45, end: 65 },
      { reason: 'handle-keyboard', side: 'start' }
    );
  });

  it('supports vertical keyboard panning and dragging', () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <ControlledRangeScrollbar orientation="vertical" onValueChange={onValueChange} />
    );
    const root = container.querySelector('.range-scrollbar') as HTMLElement;
    const thumb = container.querySelector('.range-scrollbar-thumb') as HTMLElement;
    mockRootHeight(root);

    fireEvent.keyDown(thumb, { key: 'ArrowDown' });
    expect(onValueChange).toHaveBeenLastCalledWith(
      { start: 25, end: 65 },
      { reason: 'thumb-keyboard' }
    );

    fireEvent.pointerDown(thumb, {
      button: 0,
      clientY: 0,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(window, { clientY: 100, pointerId: 1 });

    expect(onValueChange).toHaveBeenLastCalledWith(
      { start: 35, end: 75 },
      expect.objectContaining({
        reason: 'thumb-drag',
        dragSessionId: expect.any(Number),
        dragStartValue: { start: 25, end: 65 },
      })
    );
  });

  it('positions vertical handles on opposite thumb edges without stretching them', () => {
    const { container } = render(<ControlledRangeScrollbar orientation="vertical" />);
    const startHandle = container.querySelector('[data-side="start"]') as HTMLElement;
    const endHandle = container.querySelector('[data-side="end"]') as HTMLElement;

    expect(startHandle.style.top).toBe('0px');
    expect(startHandle.style.bottom).toBe('auto');
    expect(startHandle.style.height).toBe('10px');
    expect(endHandle.style.top).toBe('auto');
    expect(endHandle.style.bottom).toBe('0px');
    expect(endHandle.style.height).toBe('10px');
  });

  it('provides default and overridable scrollbar semantics', () => {
    const { container } = render(
      <ControlledRangeScrollbar
        thumbProps={{ 'aria-label': 'Visible slice' }}
        startHandleProps={{ 'aria-label': 'Slice start' }}
      />
    );
    const thumb = container.querySelector('.range-scrollbar-thumb');
    const startHandle = container.querySelector('[data-side="start"]');
    const endHandle = container.querySelector('[data-side="end"]');

    expect(thumb?.getAttribute('role')).toBe('scrollbar');
    expect(thumb?.getAttribute('tabindex')).toBe('0');
    expect(thumb?.getAttribute('aria-orientation')).toBe('horizontal');
    expect(thumb?.getAttribute('aria-label')).toBe('Visible slice');
    expect(startHandle?.getAttribute('aria-label')).toBe('Slice start');
    expect(endHandle?.getAttribute('aria-label')).toBe('Range end');
  });

  it('provides overridable formatted value text for scrollbar parts', () => {
    const { container } = render(
      <ControlledRangeScrollbar
        getAriaValueText={(value, details) =>
          details.part === 'thumb' ? `${details.value.start}-${details.value.end}` : `${value}s`
        }
      />
    );
    const thumb = container.querySelector('.range-scrollbar-thumb');
    const startHandle = container.querySelector('[data-side="start"]');
    const endHandle = container.querySelector('[data-side="end"]');

    expect(thumb?.getAttribute('aria-valuetext')).toBe('20-60');
    expect(startHandle?.getAttribute('aria-valuetext')).toBe('20s');
    expect(endHandle?.getAttribute('aria-valuetext')).toBe('60s');
  });

  it('lets consumers cancel internal keyboard handling', () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <ControlledRangeScrollbar
        onValueChange={onValueChange}
        thumbProps={{ onKeyDown: (event) => event.preventDefault() }}
      />
    );
    const thumb = container.querySelector('.range-scrollbar-thumb') as HTMLElement;

    fireEvent.keyDown(thumb, { key: 'ArrowRight' });

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('lets consumers cancel internal thumb dragging', () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <ControlledRangeScrollbar
        onValueChange={onValueChange}
        thumbProps={{ onPointerDown: (event) => event.preventDefault() }}
      />
    );
    const thumb = container.querySelector('.range-scrollbar-thumb') as HTMLElement;

    fireEvent.pointerDown(thumb, {
      button: 0,
      clientX: 0,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(window, { clientX: 100, pointerId: 1 });

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('does not mark parts as dragging for non-primary mouse buttons', () => {
    const onValueChange = vi.fn();
    const { container } = render(<ControlledRangeScrollbar onValueChange={onValueChange} />);
    const thumb = container.querySelector('.range-scrollbar-thumb') as HTMLElement;
    const startHandle = container.querySelector('[data-side="start"]') as HTMLElement;

    fireEvent.pointerDown(thumb, {
      button: 2,
      clientX: 0,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(window, { clientX: 100, pointerId: 1 });

    expect(thumb.hasAttribute('data-dragging')).toBe(false);
    expect(onValueChange).not.toHaveBeenCalled();

    fireEvent.pointerDown(startHandle, {
      button: 2,
      clientX: 0,
      pointerId: 2,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(window, { clientX: 100, pointerId: 2 });

    expect(startHandle.hasAttribute('data-dragging')).toBe(false);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('removes drag listeners on pointer cancellation', () => {
    const onValueChange = vi.fn();
    const { container } = render(<ControlledRangeScrollbar onValueChange={onValueChange} />);
    const root = container.querySelector('.range-scrollbar') as HTMLElement;
    const thumb = container.querySelector('.range-scrollbar-thumb') as HTMLElement;
    mockRootWidth(root);

    fireEvent.pointerDown(thumb, {
      button: 0,
      clientX: 0,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(window, { clientX: 100, pointerId: 1 });
    fireEvent.pointerCancel(window, { pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 200, pointerId: 1 });

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(thumb.hasAttribute('data-dragging')).toBe(false);
  });
});
