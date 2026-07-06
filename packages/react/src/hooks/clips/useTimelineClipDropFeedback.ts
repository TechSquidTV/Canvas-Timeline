import { useMemo } from 'react';
import type { TimelineClipDropFeedback, TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { useTimelineExternalStore } from '../core/useTimelineExternalStore';

const clipDropFeedbackEvents = ['clip:drop-feedback'] as const;
const getTimelineClipDropFeedback = (engine: TimelineEngine) => engine.getClipDropFeedback();

/**
 * Result returned by `useTimelineClipDropFeedback`.
 *
 * @remarks
 *
 * The fields are intentionally transient and mirror the current pointer drag
 * state. Use them for status text, track row highlighting, or custom invalid
 * target feedback while {@link useTimelineClipDrag} or `Timeline.ClipInteractionLayer`
 * owns the actual drag operation.
 *
 * @see {@link useTimelineClipDrag}
 * @see {@link https://canvastimeline.com/docs/tracks-and-clips | Tracks and clips}
 */
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
 * @remarks
 *
 * This is a focused live interaction hook intended for custom drag affordances.
 * It subscribes to `clip:drop-feedback` instead of the broad provider snapshot,
 * so components can react while the pointer crosses tracks without turning the
 * entire editor shell into drag-time React state.
 *
 * @returns Current clip drag feedback and convenience fields for custom UI.
 *
 * @example
 * ```tsx
 * import { useTimelineClipDropFeedback } from '@techsquidtv/canvas-timeline-react/hooks';
 *
 * export function DropStatus() {
 *   const feedback = useTimelineClipDropFeedback();
 *
 *   if (!feedback.hasFeedback) {
 *     return null;
 *   }
 *
 *   return (
 *     <p role="status">
 *       {feedback.valid ? 'Drop to move clip' : `Cannot drop here: ${feedback.feedback.reason}`}
 *     </p>
 *   );
 * }
 * ```
 *
 * @see {@link useTimelineClipDrag}
 * @see {@link https://canvastimeline.com/docs/react-hooks | React editor hooks}
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
