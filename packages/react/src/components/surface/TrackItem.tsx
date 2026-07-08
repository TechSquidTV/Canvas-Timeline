import React from 'react';
import { useTimeline } from '#react/hooks';

/**
 * Props for a timeline track row bound to a track id.
 */
export interface TrackItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Id of the track row that this item should size and identify in the DOM. */
  trackId: string;
}

export const TrackItem = React.forwardRef<HTMLDivElement, TrackItemProps>(
  ({ trackId, children, className = '', ...props }, ref) => {
    const { state } = useTimeline();
    const track = state.tracks.find((t) => t.id === trackId);
    const isCollapsed = track?.collapsed ?? false;
    const height = isCollapsed ? 24 : (track?.height ?? 48);

    return (
      <div
        ref={ref}
        className={`timeline-track-item relative w-full pointer-events-none transition-[height] duration-200 ${className}`}
        style={{ height: `${height}px` }}
        data-track-id={trackId}
        {...props}
      >
        {children}
      </div>
    );
  }
);

TrackItem.displayName = 'Timeline.Track';
