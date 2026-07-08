import React from 'react';
import { useTimelineScrollTop } from '#react/hooks';

export const TrackList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, className = '', ...props }, ref) => {
    const scrollTop = useTimelineScrollTop();

    return (
      <div
        ref={ref}
        className={`timeline-track-list flex flex-col w-full h-full relative z-10 pointer-events-none overflow-hidden ${className}`}
        {...props}
      >
        <div
          className="timeline-track-list-content"
          style={{ transform: `translateY(${-scrollTop}px)` }}
        >
          {children}
        </div>
      </div>
    );
  }
);

TrackList.displayName = 'Timeline.TrackList';
