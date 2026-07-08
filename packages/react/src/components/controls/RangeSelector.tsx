import React from 'react';
import { Slider } from '@base-ui/react/slider';
import type { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { type RationalTime, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { formatTimelineTimeValue } from '#react/accessibility';
import {
  type TimelineInOutRangeControlOptions,
  useTimeline,
  useTimelineInOutRangeControl,
} from '#react/hooks';

/** Timeline range boundary controlled by an In/Out grabber. */
export type InOutBoundary = 'in' | 'out';

/** Render-prop payload for custom range selector grabber children. */
export interface RangeSelectorGrabberRenderProps {
  /** Whether the grabber is actively being dragged. */
  dragging: boolean;
  /** Current boundary time. */
  time: RationalTime;
  /** Timeline engine that owns the boundary. */
  engine: TimelineEngine;
  /** Which In/Out boundary this grabber controls. */
  boundary: InOutBoundary;
}

/** Custom node or render prop used inside an In/Out range selector grabber. */
export type RangeSelectorGrabberChildren =
  | React.ReactNode
  | ((props: RangeSelectorGrabberRenderProps) => React.ReactNode);

/**
 * Props for the RangeSelector Root component.
 */
export interface RangeSelectorRootProps extends Omit<
  React.ComponentPropsWithoutRef<typeof Slider.Root>,
  'value' | 'defaultValue' | 'onValueChange' | 'onValueCommitted'
> {
  /** Optional custom slider parts rendered inside the range selector root. */
  children?: React.ReactNode;
  /** Whether pointer-driven changes should snap to timeline targets. */
  snap?: boolean;
  /** Called after a range value commit has settled the engine. */
  onValueCommitted?: TimelineInOutRangeControlOptions['onValueCommitted'];
}

/**
 * Headless, provider-aware root component for selection/loop boundary range sliders.
 * Wired directly to the `TimelineEngine`'s inPoint and outPoint state.
 */
export const RangeSelectorRoot = React.forwardRef<HTMLDivElement, RangeSelectorRootProps>(
  (
    { children, className = '', min = 0, max, onPointerDown, onValueCommitted, step, ...props },
    ref
  ) => {
    const { snap = false, ...rootProps } = props;
    const rangeControl = useTimelineInOutRangeControl({ min, max, onValueCommitted, snap, step });

    return (
      <Slider.Root
        ref={ref}
        {...rootProps}
        {...rangeControl.rootProps}
        className={['timeline-range-selector', className].filter(Boolean).join(' ')}
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown?.(e);
        }}
      >
        {children}
      </Slider.Root>
    );
  }
);

RangeSelectorRoot.displayName = 'Timeline.RangeSelector.Root';

/**
 * Props for the high-level timeline range selector overlay.
 */
export interface RangeSelectorProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Minimum timeline time in seconds. Defaults to 0. */
  min?: number;
  /** Maximum timeline time in seconds. Defaults to timeline content end or 100. */
  max?: number;
  /** Whether pointer-driven boundary drags should snap to timeline targets. */
  snap?: boolean;
  /** Fallback slider step used when deriving an empty content max. */
  step?: number;
  /** Custom composable In-point grabber node or render prop function. */
  inPointChildren?: RangeSelectorGrabberChildren;
  /** Custom composable Out-point grabber node or render prop function. */
  outPointChildren?: RangeSelectorGrabberChildren;
}

/**
 * Slider control wrapper for range selection.
 */
export const RangeSelectorControl = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Slider.Control>
>(({ className = '', ...props }, ref) => {
  return (
    <Slider.Control
      ref={ref}
      className={['timeline-range-selector-control', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
});

RangeSelectorControl.displayName = 'Timeline.RangeSelector.Control';

/**
 * Slider track wrapper for range selection.
 */
export const RangeSelectorTrack = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Slider.Track>
>(({ className = '', ...props }, ref) => {
  return (
    <Slider.Track
      ref={ref}
      className={['timeline-range-selector-track', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
});

RangeSelectorTrack.displayName = 'Timeline.RangeSelector.Track';

/**
 * Slider indicator wrapper for range selection.
 */
export const RangeSelectorIndicator = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Slider.Indicator>
>(({ className = '', ...props }, ref) => {
  return (
    <Slider.Indicator
      ref={ref}
      className={['timeline-range-selector-indicator', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
});

RangeSelectorIndicator.displayName = 'Timeline.RangeSelector.Indicator';

function getDefaultThumbLabel(index: number | undefined) {
  if (index === 0) {
    return 'In point';
  }
  if (index === 1) {
    return 'Out point';
  }
  return 'Timeline range point';
}

/**
 * Slider thumb wrapper for range selection.
 */
export const RangeSelectorThumb = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Slider.Thumb>
>(({ className = '', getAriaLabel, getAriaValueText, index, ...props }, ref) => {
  const ariaLabel = props['aria-label'];
  const ariaValueText = props['aria-valuetext'];

  return (
    <Slider.Thumb
      ref={ref}
      className={['timeline-range-selector-thumb', className].filter(Boolean).join(' ')}
      getAriaLabel={
        getAriaLabel ?? (ariaLabel === undefined ? () => getDefaultThumbLabel(index) : undefined)
      }
      getAriaValueText={
        getAriaValueText ??
        (ariaValueText === undefined
          ? (_formattedValue, value) => formatTimelineTimeValue(value)
          : undefined)
      }
      index={index}
      {...props}
    />
  );
});

RangeSelectorThumb.displayName = 'Timeline.RangeSelector.Thumb';

interface RangeBoundaryGrabberProps {
  boundary: InOutBoundary;
  children?: RangeSelectorGrabberChildren;
  engine: TimelineEngine;
  time: RationalTime;
}

function RangeBoundaryGrabber({ boundary, children, engine, time }: RangeBoundaryGrabberProps) {
  const [dragging, setDragging] = React.useState(false);
  const cleanupRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const renderChildren =
    typeof children === 'function'
      ? children({
          boundary,
          dragging,
          engine,
          time,
        })
      : children;
  const defaultChildren = (
    <div className="timeline-time-grabber-highlight timeline-range-selector-grabber-highlight">
      <div className="timeline-time-grabber-line timeline-range-selector-grabber-line" />
      <div className="timeline-time-grabber-handle timeline-range-selector-grabber-handle" />
    </div>
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || (event.pointerType !== 'touch' && event.button !== 0)) {
      return;
    }

    const target = event.currentTarget;
    const cleanup = () => {
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
      target.removeEventListener('lostpointercapture', cleanup);
      cleanupRef.current = null;
      setDragging(false);
    };

    cleanupRef.current?.();
    cleanupRef.current = cleanup;
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
    target.addEventListener('lostpointercapture', cleanup);
    setDragging(true);
  };

  return (
    <RangeSelectorThumb
      aria-label={boundary === 'in' ? 'In point' : 'Out point'}
      className="timeline-range-selector-grabber"
      data-boundary={boundary}
      data-index={boundary === 'in' ? 0 : 1}
      index={boundary === 'in' ? 0 : 1}
      onPointerDown={handlePointerDown}
      title={boundary === 'in' ? 'Drag In point' : 'Drag Out point'}
    >
      {renderChildren ?? defaultChildren}
    </RangeSelectorThumb>
  );
}

const RangeSelectorComponent = React.forwardRef<HTMLDivElement, RangeSelectorProps>(
  (
    {
      className = '',
      inPointChildren,
      max,
      min = 0,
      onPointerDown,
      outPointChildren,
      snap = true,
      step,
      style,
      ...props
    },
    forwardedRef
  ) => {
    const { engine, state } = useTimeline();
    const internalRef = React.useRef<HTMLDivElement>(null);

    const resolveMax = React.useCallback(() => {
      if (max !== undefined) {
        return max;
      }
      const contentMax = toSeconds(engine.maxContentTime);
      return contentMax > min ? contentMax : Math.max(100, min + (step ?? 0.01));
    }, [engine, max, min, step]);

    const updateGeometry = React.useCallback(() => {
      if (!internalRef.current) {
        return;
      }

      const width = Math.max(0, resolveMax() - min) * engine.zoomScale;
      const x = min * engine.zoomScale - engine.scrollLeft;
      internalRef.current.style.width = `${width}px`;
      internalRef.current.style.transform = `translateX(${x}px)`;
    }, [engine, min, resolveMax]);

    const ref = React.useCallback(
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

    React.useEffect(() => {
      updateGeometry();
      const unsubRender = engine.on('render', updateGeometry);
      const unsubSettled = engine.on('state:settled', updateGeometry);
      const unsubHistory = engine.on('history:change', updateGeometry);
      return () => {
        unsubRender();
        unsubSettled();
        unsubHistory();
      };
    }, [engine, updateGeometry]);

    const resolvedMax = resolveMax();

    return (
      <RangeSelectorRoot
        ref={ref}
        className={['timeline-range-selector-overlay', className].filter(Boolean).join(' ')}
        max={resolvedMax}
        min={min}
        onPointerDown={onPointerDown}
        snap={snap}
        step={step}
        style={style}
        {...props}
      >
        <RangeSelectorControl>
          <RangeSelectorTrack>
            <RangeSelectorIndicator />
            {state.inPoint ? (
              <RangeBoundaryGrabber boundary="in" engine={engine} time={state.inPoint}>
                {inPointChildren}
              </RangeBoundaryGrabber>
            ) : null}
            {state.outPoint ? (
              <RangeBoundaryGrabber boundary="out" engine={engine} time={state.outPoint}>
                {outPointChildren}
              </RangeBoundaryGrabber>
            ) : null}
          </RangeSelectorTrack>
        </RangeSelectorControl>
      </RangeSelectorRoot>
    );
  }
);

RangeSelectorComponent.displayName = 'Timeline.RangeSelector';

// oxlint-disable-next-line react-refresh/only-export-components
export const RangeSelector = Object.assign(RangeSelectorComponent, {
  Root: RangeSelectorRoot,
  Control: RangeSelectorControl,
  Track: RangeSelectorTrack,
  Indicator: RangeSelectorIndicator,
  Thumb: RangeSelectorThumb,
});
