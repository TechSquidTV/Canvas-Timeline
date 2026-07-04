import { createContext } from 'react';
import type { TimelineEngine, TimelineState } from '@techsquidtv/canvas-timeline-core';

/**
 * Interface representing the context bundle of the timeline provider.
 */
export interface TimelineContextValue {
  /** The core timeline engine controller. */
  engine: TimelineEngine;
  /** Reactive, read-only copy of the engine's current state model. */
  state: TimelineState;
}

/**
 * React context containing the global engine controller and its reactive state model.
 */
export const TimelineContext = createContext<TimelineContextValue | null>(null);
