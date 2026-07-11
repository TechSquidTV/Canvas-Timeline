import type { ReactNode } from 'react';
import { Timeline } from '@techsquidtv/canvas-timeline-react';
import { cn } from '#full-editor/shared/lib/cn';
import { TimelineSourceDropFeedback } from '#full-editor/features/timeline/TimelineSourceDropFeedback';
import { useTimelineSourceDrop } from '#full-editor/features/timeline/useTimelineSourceDrop';

interface TimelineSourceDropTargetProps {
  children: ReactNode;
}

export function TimelineSourceDropTarget({ children }: TimelineSourceDropTargetProps) {
  const { drop, dropMode, hoveredTrack, previewPatch, tracks } = useTimelineSourceDrop();

  return (
    <Timeline.Root
      className={cn(
        'timeline-fill timeline-editor-root-with-headers',
        drop.dragging && 'is-source-drop-dragging',
        drop.valid && 'is-source-drop-valid'
      )}
      {...drop.rootProps}
    >
      {children}
      {drop.dragging ? (
        <TimelineSourceDropFeedback
          dropMode={dropMode}
          dropTime={drop.dropTime}
          hoveredTrack={hoveredTrack}
          patch={previewPatch}
          tracks={tracks}
          valid={drop.valid}
        />
      ) : null}
    </Timeline.Root>
  );
}
