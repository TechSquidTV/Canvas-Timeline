import type { SnapTargetOptions } from '#core/snapping';
import type { TimelineSnapTarget, TimelineState } from '#core/types';

/**
 * Options for building snap targets before a drag, trim, or range-boundary edit.
 */
export type SnapPreparationOptions = SnapTargetOptions & {
  /** Exclude a clip id from snap targets so a dragged clip does not snap to itself. */
  ignoreClipId?: string;
  /** Editing operation that consumes the prepared snap targets. */
  operation?: TimelineSnapInteractionOperation;
};

/** Timeline interaction currently preparing or resolving snap targets. */
export type TimelineSnapInteractionOperation = 'move' | 'trim' | 'in-out' | 'custom';

/** Context passed to runtime snap target providers. */
export interface TimelineSnapProviderContext extends SnapPreparationOptions {
  /** Current mutable timeline state owned by the engine. */
  state: TimelineState;
  /** Current zoom scale in pixels per second. */
  zoomScale: number;
  /** Snap threshold converted to seconds for the current zoom scale. */
  thresholdSeconds: number;
}

/** Runtime source of app-defined snap targets such as grids, beats, and captions. */
export type TimelineSnapProvider = (context: TimelineSnapProviderContext) => TimelineSnapTarget[];
