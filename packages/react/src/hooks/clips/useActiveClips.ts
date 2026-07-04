import type { Clip } from '@techsquidtv/canvas-timeline-core';
import { useTimeline } from '../core/useTimeline';
import { useTimelinePlayheadTime } from '../playback/useTimelinePlayheadTime';

/**
 * Returns clips that intersect the current playhead time.
 *
 * A clip is active when the playhead is at or after `timelineStart` and before
 * `timelineEnd`. Clips on hidden tracks, muted tracks, and clips marked
 * `disabled` are omitted. The returned array contains clips only; read the
 * timeline state when you also need the containing track id.
 *
 * @returns Active, enabled clips on visible, unmuted tracks at the current playhead time.
 *
 * @example
 * ```tsx
 * const activeClips = useActiveClips();
 *
 * return activeClips.map((clip) => <span key={clip.id}>{clip.label}</span>);
 * ```
 */
export function useActiveClips() {
  const { engine } = useTimeline();
  const playheadTime = useTimelinePlayheadTime();

  return engine.getActiveClips(playheadTime).map(({ clip }) => clip) satisfies Clip[];
}
