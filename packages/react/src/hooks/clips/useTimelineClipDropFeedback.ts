import { useMemo } from 'react';
import type { TimelineClipDropFeedback, TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { useTimelineExternalStore } from '../core/useTimelineExternalStore';

const clipDropFeedbackEvents = ['clip:drop-feedback'] as const;
const getTimelineClipDropFeedback = (engine: TimelineEngine) => engine.getClipDropFeedback();

/** Result returned by `useTimelineClipDropFeedback`. */
export interface UseTimelineClipDropFeedbackResult {
  /** Current transient clip drop feedback. */
  feedback: TimelineClipDropFeedback;
  /** Clip currently being dragged, or null when no clip body drag is active. */
  activeClipId: string | null;
  /** Track that contained the dragged clip at drag start. */
  sourceTrackId: string | null;
  /** Track currently under the pointer, including invalid targets. */
  hoveredTrackId: string | null;
  /** Last valid track receiving the preview. */
  activeTargetTrackId: string | null;
  /** Whether the hovered track is valid for the dragged clip. */
  valid: boolean;
  /** Whether any drop feedback is active. */
  hasFeedback: boolean;
}

/**
 * Subscribes to live cross-track clip drop feedback.
 *
 * This is a focused live interaction hook intended for custom drag affordances.
 */
export function useTimelineClipDropFeedback(): UseTimelineClipDropFeedbackResult {
  const feedback = useTimelineExternalStore(clipDropFeedbackEvents, getTimelineClipDropFeedback);

  return useMemo(
    () => ({
      feedback,
      activeClipId: feedback.activeClipId,
      sourceTrackId: feedback.sourceTrackId,
      hoveredTrackId: feedback.hoveredTrackId,
      activeTargetTrackId: feedback.activeTargetTrackId,
      valid: feedback.valid,
      hasFeedback:
        feedback.activeClipId !== null ||
        feedback.sourceTrackId !== null ||
        feedback.hoveredTrackId !== null ||
        feedback.activeTargetTrackId !== null,
    }),
    [feedback]
  );
}
