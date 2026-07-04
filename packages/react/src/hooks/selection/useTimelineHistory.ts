import { useCallback } from 'react';
import { useTimeline } from '../core/useTimeline';
import {
  timelineCommandFail,
  timelineCommandOk,
  type TimelineCommandResult,
} from '../core/timelineCommandResult';

/** Result returned by `useTimelineHistory`. */
export interface UseTimelineHistoryResult {
  /** Whether an undo snapshot is available. */
  canUndo: boolean;
  /** Whether a redo snapshot is available. */
  canRedo: boolean;
  /** Restores the previous timeline history snapshot. */
  undo: () => TimelineCommandResult;
  /** Reapplies the next timeline history snapshot. */
  redo: () => TimelineCommandResult;
}

/**
 * Provides canonical undo/redo history access for timeline editor chrome.
 *
 * @returns Undo/redo availability and commands.
 */
export function useTimelineHistory(): UseTimelineHistoryResult {
  const { engine } = useTimeline();

  const undo = useCallback(() => {
    if (!engine.canUndo) {
      return timelineCommandFail('unsupported');
    }
    engine.undo();
    return timelineCommandOk();
  }, [engine]);

  const redo = useCallback(() => {
    if (!engine.canRedo) {
      return timelineCommandFail('unsupported');
    }
    engine.redo();
    return timelineCommandOk();
  }, [engine]);

  return {
    canUndo: engine.canUndo,
    canRedo: engine.canRedo,
    undo,
    redo,
  };
}
