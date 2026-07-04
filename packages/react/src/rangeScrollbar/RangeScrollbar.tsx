import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { clamp } from '@techsquidtv/canvas-timeline-utils';

const DEFAULT_KEYBOARD_STEP = 1;
const DEFAULT_KEYBOARD_PAGE_STEP = 10;

/**
 * Controlled numeric range represented by a range scrollbar.
 *
 * `start` and `end` use the caller's domain units. For a timeline adapter those
 * units might be seconds; for a chart they might be indexes, prices, or pixels.
 */
export interface RangeScrollbarValue {
  /** Inclusive start of the visible range. */
  start: number;
  /** Inclusive end of the visible range. */
  end: number;
}

/**
 * Side of the range scrollbar thumb controlled by a resize handle.
 */
export type RangeScrollbarHandleSide = 'start' | 'end';

/** Visual and interaction axis used by a range scrollbar. */
export type RangeScrollbarOrientation = 'horizontal' | 'vertical';

/**
 * Reason a range scrollbar requested a controlled value change.
 */
export type RangeScrollbarChangeReason =
  | 'set-value'
  | 'thumb-drag'
  | 'thumb-keyboard'
  | 'handle-drag'
  | 'handle-keyboard';

/**
 * Details passed with a controlled range scrollbar value change.
 */
export interface RangeScrollbarValueChangeDetails {
  /** Interaction or imperative action that produced the next value. */
  reason: RangeScrollbarChangeReason;
  /** Handle side when a resize handle produced the change. */
  side?: RangeScrollbarHandleSide;
  /** Stable identifier for a single pointer drag interaction. */
  dragSessionId?: number;
  /** Controlled value captured when the pointer drag interaction started. */
  dragStartValue?: RangeScrollbarValue;
}

/**
 * Context passed to a range scrollbar `aria-valuetext` formatter.
 */
export interface RangeScrollbarAriaValueTextDetails {
  /** Scrollbar part whose value is being described. */
  part: 'thumb' | 'handle';
  /** Handle side when `part` is `handle`. */
  side?: RangeScrollbarHandleSide;
  /** Full controlled range represented by the scrollbar. */
  value: RangeScrollbarValue;
  /** Current range span. */
  rangeSpan: number;
  /** Minimum value in the full domain. */
  min: number;
  /** Maximum value in the full domain. */
  max: number;
}

/**
 * Options for deriving generic range scrollbar state and update helpers.
 */
export interface UseRangeScrollbarOptions {
  /** Minimum value in the full scrollable domain. */
  min: number;
  /** Maximum value in the full scrollable domain. */
  max: number;
  /** Controlled visible range. */
  value: RangeScrollbarValue;
  /** Smallest allowed visible range span. Defaults to 0. */
  minSpan?: number;
  /** Called when range scrollbar interactions request a new controlled range. */
  onValueChange?: (value: RangeScrollbarValue, details: RangeScrollbarValueChangeDetails) => void;
}

/**
 * Generic range scrollbar geometry and mutation helpers.
 */
export interface UseRangeScrollbarResult {
  /** Minimum value in the full scrollable domain. */
  min: number;
  /** Maximum value in the full scrollable domain. */
  max: number;
  /** Controlled visible range after clamping to the domain. */
  value: RangeScrollbarValue;
  /** Smallest allowed visible range span after clamping to the domain span. */
  minSpan: number;
  /** Full domain span, equal to `max - min` when positive. */
  domainSpan: number;
  /** Visible range span, equal to `value.end - value.start`. */
  rangeSpan: number;
  /** CSS percent offset for the visible range thumb. */
  thumbLeftPercent: number;
  /** CSS percent offset for the visible range thumb on the active axis. */
  thumbOffsetPercent: number;
  /** CSS percent width for the visible range thumb. */
  thumbWidthPercent: number;
  /** CSS percent size for the visible range thumb on the active axis. */
  thumbSizePercent: number;
  /** Requests an explicit visible range. */
  setValue: (value: RangeScrollbarValue, details?: RangeScrollbarValueChangeDetails) => void;
  /** Requests a pan by a domain-unit delta while preserving the current span. */
  panBy: (delta: number, details?: RangeScrollbarValueChangeDetails) => void;
  /** Requests a resize by moving one side by a domain-unit delta. */
  resizeBy: (
    side: RangeScrollbarHandleSide,
    delta: number,
    details?: RangeScrollbarValueChangeDetails
  ) => void;
}

/**
 * Props for the controlled range scrollbar root.
 */
export interface RangeScrollbarRootProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'children' | 'onChange'
> {
  /** Minimum value in the full scrollable domain. */
  min: number;
  /** Maximum value in the full scrollable domain. */
  max: number;
  /** Controlled visible range. */
  value: RangeScrollbarValue;
  /** Visual and interaction axis. Defaults to `'horizontal'`. */
  orientation?: RangeScrollbarOrientation;
  /** Smallest allowed visible range span. Defaults to 0. */
  minSpan?: number;
  /** Domain-unit nudge used by arrow-key interactions. Defaults to 1. */
  keyboardStep?: number;
  /** Domain-unit nudge used by page-key interactions. Defaults to 10. */
  keyboardPageStep?: number;
  /** Disables pointer and keyboard interactions while keeping parts rendered. */
  disabled?: boolean;
  /** Formats `aria-valuetext` for the thumb and handles. */
  getAriaValueText?: (value: number, details: RangeScrollbarAriaValueTextDetails) => string;
  /** Called when range scrollbar interactions request a new controlled range. */
  onValueChange?: (value: RangeScrollbarValue, details: RangeScrollbarValueChangeDetails) => void;
  /** Thumb and handle components rendered within the measured track. */
  children: React.ReactNode;
}

/**
 * Props for the draggable range scrollbar thumb.
 */
export interface RangeScrollbarThumbProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional custom content rendered inside the draggable visible-range thumb. */
  children?: React.ReactNode;
}

/**
 * Props for a range scrollbar resize handle.
 */
export interface RangeScrollbarHandleProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Side of the visible range controlled by this handle. */
  side: RangeScrollbarHandleSide;
  /** Optional custom content rendered inside the resize handle. */
  children?: React.ReactNode;
}

interface RangeScrollbarContextValue extends UseRangeScrollbarResult {
  rootRef: React.RefObject<HTMLDivElement | null>;
  disabled: boolean;
  getAriaValueText?: (value: number, details: RangeScrollbarAriaValueTextDetails) => string;
  keyboardStep: number;
  keyboardPageStep: number;
  draggingPart: RangeScrollbarDragPart | null;
  setDraggingPart: (part: RangeScrollbarDragPart | null) => void;
  orientation: RangeScrollbarOrientation;
}

type RangeScrollbarDragPart = 'thumb' | RangeScrollbarHandleSide;

const RangeScrollbarContext = createContext<RangeScrollbarContextValue | null>(null);

function useRangeScrollbarContext() {
  const ctx = useContext(RangeScrollbarContext);
  if (!ctx) {
    throw new Error('RangeScrollbar components must be used within RangeScrollbar.Root');
  }
  return ctx;
}

function normalizeDomain(min: number, max: number) {
  return min <= max ? { min, max } : { min: max, max: min };
}

function normalizeMinSpan(minSpan: number | undefined, domainSpan: number) {
  return clamp(Math.max(0, minSpan ?? 0), 0, Math.max(0, domainSpan));
}

function normalizeRange(
  value: RangeScrollbarValue,
  min: number,
  max: number,
  minSpan: number
): RangeScrollbarValue {
  if (max <= min) {
    return { start: min, end: min };
  }

  let start = clamp(Math.min(value.start, value.end), min, max);
  let end = clamp(Math.max(value.start, value.end), min, max);

  if (end - start < minSpan) {
    if (start + minSpan <= max) {
      end = start + minSpan;
    } else {
      end = max;
      start = max - minSpan;
    }
  }

  return { start, end };
}

function panRange(value: RangeScrollbarValue, delta: number, min: number, max: number) {
  const span = value.end - value.start;
  const nextStart = clamp(value.start + delta, min, max - span);
  return { start: nextStart, end: nextStart + span };
}

function resizeRange(
  value: RangeScrollbarValue,
  side: RangeScrollbarHandleSide,
  delta: number,
  min: number,
  max: number,
  minSpan: number
) {
  if (side === 'start') {
    const start = clamp(value.start + delta, min, value.end - minSpan);
    return { start, end: value.end };
  }

  const end = clamp(value.end + delta, value.start + minSpan, max);
  return { start: value.start, end };
}

function keyboardDelta(
  event: React.KeyboardEvent<HTMLElement>,
  orientation: RangeScrollbarOrientation,
  keyboardStep: number,
  keyboardPageStep: number
) {
  switch (event.key) {
    case 'ArrowLeft':
      return orientation === 'horizontal' ? -keyboardStep : null;
    case 'ArrowRight':
      return orientation === 'horizontal' ? keyboardStep : null;
    case 'ArrowUp':
      return orientation === 'vertical' ? -keyboardStep : null;
    case 'ArrowDown':
      return orientation === 'vertical' ? keyboardStep : null;
    case 'PageUp':
      return -keyboardPageStep;
    case 'PageDown':
      return keyboardPageStep;
    default:
      return null;
  }
}

function beginRangeScrollbarPointerDrag(
  event: React.PointerEvent<HTMLElement>,
  onPointerMove: (event: PointerEvent) => void,
  onCleanup: () => void
) {
  if (event.button !== 0 && event.pointerType !== 'touch') {
    return false;
  }

  event.stopPropagation();

  const target = event.currentTarget;
  const pointerId = event.pointerId;
  try {
    target.setPointerCapture?.(pointerId);
  } catch {
    // Continue the window-level drag fallback if pointer capture is unavailable.
  }

  const cleanup = () => {
    try {
      target.releasePointerCapture?.(pointerId);
    } catch {
      // Ignore pointer capture release failures.
    }
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', cleanup);
    window.removeEventListener('pointercancel', cleanup);
    target.removeEventListener('lostpointercapture', cleanup);
    onCleanup();
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', cleanup);
  window.addEventListener('pointercancel', cleanup);
  target.addEventListener('lostpointercapture', cleanup);

  return true;
}

function scrollbarRoleProps(
  props: React.HTMLAttributes<HTMLDivElement>,
  orientation: RangeScrollbarOrientation,
  ariaLabel: string,
  ariaValueNow: number,
  ariaValueMin: number,
  ariaValueMax: number,
  disabled: boolean,
  ariaValueText?: string
) {
  return {
    role: props.role ?? 'scrollbar',
    tabIndex: disabled ? undefined : (props.tabIndex ?? 0),
    'aria-disabled': props['aria-disabled'] ?? (disabled ? true : undefined),
    'aria-orientation': props['aria-orientation'] ?? orientation,
    'aria-label': props['aria-label'] ?? ariaLabel,
    'aria-valuemin': props['aria-valuemin'] ?? ariaValueMin,
    'aria-valuemax': props['aria-valuemax'] ?? ariaValueMax,
    'aria-valuenow': props['aria-valuenow'] ?? ariaValueNow,
    'aria-valuetext': props['aria-valuetext'] ?? ariaValueText,
  };
}

/**
 * Derives geometry and controlled update helpers for a generic range scrollbar.
 *
 * @param options - Controlled range, domain, minimum span, and change handler.
 * @returns Clamped range state, thumb percentages, and range mutation helpers.
 *
 * @example
 * ```tsx
 * const scrollbar = useRangeScrollbar({
 *   min: 0,
 *   max: 100,
 *   value,
 *   minSpan: 5,
 *   onValueChange: setValue,
 * });
 *
 * return <span>{scrollbar.thumbWidthPercent}% visible</span>;
 * ```
 */
// oxlint-disable-next-line react-refresh/only-export-components
export function useRangeScrollbar(options: UseRangeScrollbarOptions): UseRangeScrollbarResult {
  const { max: rawMax, min: rawMin, minSpan: rawMinSpan, onValueChange, value: rawValue } = options;
  const domain = normalizeDomain(rawMin, rawMax);
  const domainSpan = Math.max(0, domain.max - domain.min);
  const minSpan = normalizeMinSpan(rawMinSpan, domainSpan);
  const value = useMemo(
    () => normalizeRange(rawValue, domain.min, domain.max, minSpan),
    [domain.max, domain.min, minSpan, rawValue]
  );

  const setValue = useCallback(
    (nextValue: RangeScrollbarValue, details?: RangeScrollbarValueChangeDetails) => {
      const normalized = normalizeRange(nextValue, domain.min, domain.max, minSpan);
      onValueChange?.(normalized, details ?? { reason: 'set-value' });
    },
    [domain.max, domain.min, minSpan, onValueChange]
  );

  const panBy = useCallback(
    (delta: number, details?: RangeScrollbarValueChangeDetails) => {
      setValue(panRange(value, delta, domain.min, domain.max), details);
    },
    [domain.max, domain.min, setValue, value]
  );

  const resizeBy = useCallback(
    (side: RangeScrollbarHandleSide, delta: number, details?: RangeScrollbarValueChangeDetails) => {
      setValue(resizeRange(value, side, delta, domain.min, domain.max, minSpan), details);
    },
    [domain.max, domain.min, minSpan, setValue, value]
  );

  const rangeSpan = value.end - value.start;
  const thumbLeftPercent = domainSpan > 0 ? ((value.start - domain.min) / domainSpan) * 100 : 0;
  const thumbWidthPercent = domainSpan > 0 ? (rangeSpan / domainSpan) * 100 : 100;
  const thumbOffsetPercent = thumbLeftPercent;
  const thumbSizePercent = thumbWidthPercent;

  return useMemo(
    () => ({
      min: domain.min,
      max: domain.max,
      value,
      minSpan,
      domainSpan,
      rangeSpan,
      thumbLeftPercent,
      thumbOffsetPercent,
      thumbWidthPercent,
      thumbSizePercent,
      setValue,
      panBy,
      resizeBy,
    }),
    [
      domain.min,
      domain.max,
      value,
      minSpan,
      domainSpan,
      rangeSpan,
      thumbLeftPercent,
      thumbOffsetPercent,
      thumbWidthPercent,
      thumbSizePercent,
      setValue,
      panBy,
      resizeBy,
    ]
  );
}

/**
 * Root element for a controlled generic range scrollbar.
 *
 * @param props - Controlled domain, visible range, keyboard options, and DOM props.
 * @returns A measured range scrollbar track that provides context to thumb and handles.
 *
 * @example
 * ```tsx
 * <RangeScrollbar.Root min={0} max={100} value={value} onValueChange={setValue}>
 *   <RangeScrollbar.Thumb>
 *     <RangeScrollbar.Handle side="start" />
 *     <RangeScrollbar.Handle side="end" />
 *   </RangeScrollbar.Thumb>
 * </RangeScrollbar.Root>
 * ```
 */
export const RangeScrollbarRoot = React.forwardRef<HTMLDivElement, RangeScrollbarRootProps>(
  (
    {
      children,
      className = '',
      disabled = false,
      keyboardPageStep = DEFAULT_KEYBOARD_PAGE_STEP,
      keyboardStep = DEFAULT_KEYBOARD_STEP,
      getAriaValueText,
      max,
      min,
      minSpan,
      onValueChange,
      orientation = 'horizontal',
      style,
      value,
      ...props
    },
    forwardedRef
  ) => {
    const internalRef = useRef<HTMLDivElement>(null);
    const [draggingPart, setDraggingPart] = useState<RangeScrollbarDragPart | null>(null);
    const controls = useRangeScrollbar({ min, max, value, minSpan, onValueChange });

    const rootRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        internalRef.current = node;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef]
    );

    const contextValue = useMemo(
      () => ({
        ...controls,
        rootRef: internalRef,
        disabled,
        getAriaValueText,
        keyboardStep,
        keyboardPageStep,
        orientation,
        draggingPart,
        setDraggingPart,
      }),
      [
        controls,
        disabled,
        getAriaValueText,
        keyboardStep,
        keyboardPageStep,
        orientation,
        draggingPart,
      ]
    );

    return (
      <RangeScrollbarContext.Provider value={contextValue}>
        <div
          ref={rootRef}
          className={['range-scrollbar', className].filter(Boolean).join(' ')}
          data-disabled={disabled ? '' : undefined}
          data-orientation={orientation}
          style={{ position: 'relative', ...style }}
          {...props}
        >
          {children}
        </div>
      </RangeScrollbarContext.Provider>
    );
  }
);

RangeScrollbarRoot.displayName = 'RangeScrollbar.Root';

/**
 * Draggable thumb representing the visible range within a larger domain.
 *
 * @param props - DOM props and optional content for the visible range thumb.
 * @returns An absolutely positioned thumb with pointer and keyboard pan behavior.
 */
export const RangeScrollbarThumb = React.forwardRef<HTMLDivElement, RangeScrollbarThumbProps>(
  ({ children, className = '', style, ...props }, ref) => {
    const {
      disabled,
      domainSpan,
      getAriaValueText,
      draggingPart,
      keyboardPageStep,
      keyboardStep,
      max,
      min,
      orientation,
      panBy,
      rangeSpan,
      rootRef,
      setDraggingPart,
      setValue,
      thumbOffsetPercent,
      thumbSizePercent,
      value,
    } = useRangeScrollbarContext();
    const dragSessionIdRef = useRef(0);

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
      props.onPointerDown?.(event);
      if (event.defaultPrevented || disabled || domainSpan <= 0) {
        return;
      }

      const startPointerPosition = orientation === 'vertical' ? event.clientY : event.clientX;
      const initialValue = value;
      const dragSessionId = (dragSessionIdRef.current += 1);
      const rect = rootRef.current?.getBoundingClientRect();
      const trackSize = (orientation === 'vertical' ? rect?.height : rect?.width) || 1;

      const onPointerMove = (moveEvent: PointerEvent) => {
        const pointerPosition = orientation === 'vertical' ? moveEvent.clientY : moveEvent.clientX;
        const delta = ((pointerPosition - startPointerPosition) / trackSize) * domainSpan;
        const nextValue = panRange(initialValue, delta, min, max);
        setValue(nextValue, { reason: 'thumb-drag', dragSessionId, dragStartValue: initialValue });
      };

      if (beginRangeScrollbarPointerDrag(event, onPointerMove, () => setDraggingPart(null))) {
        setDraggingPart('thumb');
      }
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      props.onKeyDown?.(event);
      if (event.defaultPrevented || disabled) {
        return;
      }

      const delta = keyboardDelta(event, orientation, keyboardStep, keyboardPageStep);
      if (delta === null) {
        return;
      }

      event.preventDefault();
      panBy(delta, { reason: 'thumb-keyboard' });
    };

    const roleProps = scrollbarRoleProps(
      props,
      orientation,
      'Range window',
      value.start,
      min,
      Math.max(min, max - rangeSpan),
      disabled,
      getAriaValueText?.(value.start, {
        max,
        min,
        part: 'thumb',
        rangeSpan,
        value,
      })
    );

    return (
      <div
        ref={ref}
        className={['range-scrollbar-thumb', className].filter(Boolean).join(' ')}
        data-disabled={disabled ? '' : undefined}
        data-dragging={draggingPart === 'thumb' ? '' : undefined}
        style={{
          position: 'absolute',
          ...(orientation === 'vertical'
            ? {
                bottom: 'auto',
                left: 0,
                right: 0,
                top: `${thumbOffsetPercent}%`,
                height: `${thumbSizePercent}%`,
              }
            : {
                bottom: 0,
                left: `${thumbOffsetPercent}%`,
                right: 'auto',
                top: 0,
                width: `${thumbSizePercent}%`,
              }),
          ...style,
        }}
        {...props}
        {...roleProps}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    );
  }
);

RangeScrollbarThumb.displayName = 'RangeScrollbar.Thumb';

/**
 * Resize handle for moving one side of the visible range.
 *
 * @param props - Handle side, DOM props, and optional custom content.
 * @returns An absolutely positioned range resize handle.
 */
export const RangeScrollbarHandle = React.forwardRef<HTMLDivElement, RangeScrollbarHandleProps>(
  ({ children, className = '', side, style, ...props }, ref) => {
    const {
      disabled,
      domainSpan,
      draggingPart,
      getAriaValueText,
      keyboardPageStep,
      keyboardStep,
      max,
      min,
      minSpan,
      orientation,
      resizeBy,
      rootRef,
      setDraggingPart,
      setValue,
      value,
    } = useRangeScrollbarContext();
    const dragSessionIdRef = useRef(0);

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
      props.onPointerDown?.(event);
      if (event.defaultPrevented || disabled || domainSpan <= 0) {
        return;
      }

      const startPointerPosition = orientation === 'vertical' ? event.clientY : event.clientX;
      const initialValue = value;
      const dragSessionId = (dragSessionIdRef.current += 1);
      const rect = rootRef.current?.getBoundingClientRect();
      const trackSize = (orientation === 'vertical' ? rect?.height : rect?.width) || 1;

      const onPointerMove = (moveEvent: PointerEvent) => {
        const pointerPosition = orientation === 'vertical' ? moveEvent.clientY : moveEvent.clientX;
        const delta = ((pointerPosition - startPointerPosition) / trackSize) * domainSpan;
        const nextValue = resizeRange(initialValue, side, delta, min, max, minSpan);
        setValue(nextValue, {
          reason: 'handle-drag',
          side,
          dragSessionId,
          dragStartValue: initialValue,
        });
      };

      if (beginRangeScrollbarPointerDrag(event, onPointerMove, () => setDraggingPart(null))) {
        setDraggingPart(side);
      }
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      props.onKeyDown?.(event);
      if (event.defaultPrevented || disabled) {
        return;
      }

      const delta = keyboardDelta(event, orientation, keyboardStep, keyboardPageStep);
      if (delta === null) {
        return;
      }

      event.preventDefault();
      resizeBy(side, delta, { reason: 'handle-keyboard', side });
    };

    const valueMin = side === 'start' ? min : value.start + minSpan;
    const valueMax = side === 'start' ? value.end - minSpan : max;
    const roleProps = scrollbarRoleProps(
      props,
      orientation,
      side === 'start' ? 'Range start' : 'Range end',
      value[side],
      valueMin,
      valueMax,
      disabled,
      getAriaValueText?.(value[side], {
        max,
        min,
        part: 'handle',
        rangeSpan: value.end - value.start,
        side,
        value,
      })
    );

    return (
      <div
        ref={ref}
        className={['range-scrollbar-handle', className].filter(Boolean).join(' ')}
        data-disabled={disabled ? '' : undefined}
        data-dragging={draggingPart === side ? '' : undefined}
        style={{
          position: 'absolute',
          ...(orientation === 'vertical'
            ? side === 'start'
              ? {
                  bottom: 'auto',
                  height: '10px',
                  left: 0,
                  right: 0,
                  top: 0,
                }
              : {
                  bottom: 0,
                  height: '10px',
                  left: 0,
                  right: 0,
                  top: 'auto',
                }
            : side === 'start'
              ? {
                  bottom: 0,
                  left: 0,
                  right: 'auto',
                  top: 0,
                  width: '10px',
                }
              : {
                  bottom: 0,
                  left: 'auto',
                  right: 0,
                  top: 0,
                  width: '10px',
                }),
          ...style,
        }}
        {...props}
        data-side={side}
        {...roleProps}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    );
  }
);

RangeScrollbarHandle.displayName = 'RangeScrollbar.Handle';

/**
 * Namespace of generic controlled range scrollbar primitives.
 */
// oxlint-disable-next-line react-refresh/only-export-components
export const RangeScrollbar = {
  /** Root controlled range scrollbar track. */
  Root: RangeScrollbarRoot,
  /** Draggable visible range thumb. */
  Thumb: RangeScrollbarThumb,
  /** Resize handle for the start or end of the visible range. */
  Handle: RangeScrollbarHandle,
};
