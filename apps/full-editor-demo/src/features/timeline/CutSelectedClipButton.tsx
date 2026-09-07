import { Button } from '#full-editor/shared/ui/button';
import {
  useTimeline,
  useTimelineSelection,
  useTimelineEditCommands,
} from '@techsquidtv/canvas-timeline-react';
import { toSeconds } from '@techsquidtv/canvas-timeline-utils';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { Scissors } from 'lucide-react';
interface TimelineBoundedClip {
  timelineEnd: RationalTime;
  timelineStart: RationalTime;
}

export function CutSelectedClipButton({ playheadSeconds }: { playheadSeconds: number }) {
  const { engine } = useTimeline();
  const { selectedClip } = useTimelineSelection();
  const { splitClip } = useTimelineEditCommands();
  const canCutSelectedClip =
    selectedClip !== null && containsTimelineSeconds(selectedClip, playheadSeconds);

  return (
    <Button
      aria-label="Cut selected clip at playhead"
      disabled={!canCutSelectedClip}
      iconOnly
      onClick={() => {
        const currentPlayheadTime = engine.getTime();
        if (
          selectedClip !== null &&
          containsTimelineSeconds(selectedClip, toSeconds(currentPlayheadTime))
        ) {
          splitClip(selectedClip.id, currentPlayheadTime);
        }
      }}
      title={
        canCutSelectedClip
          ? 'Cut selected clip at playhead'
          : 'Select a clip and place the playhead inside it'
      }
      variant="ghost"
    >
      <Scissors aria-hidden="true" />
    </Button>
  );
}

function containsTimelineSeconds(clip: TimelineBoundedClip, timeSeconds: number) {
  return timeSeconds > toSeconds(clip.timelineStart) && timeSeconds < toSeconds(clip.timelineEnd);
}
