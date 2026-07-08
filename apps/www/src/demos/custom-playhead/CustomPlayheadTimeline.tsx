import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { TimelineProvider, Timeline, useTimeline } from '@techsquidtv/canvas-timeline-react';
import { CanvasRenderer } from '@techsquidtv/canvas-timeline-renderer';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { useMemo } from 'react';
import { demoMarkers, demoTracks } from '#www/demos/custom-playhead/timeline-demo-data';
import '@techsquidtv/canvas-timeline-react/styles.css';

function CustomInPointGrabber({ dragging }: { dragging: boolean }) {
  return (
    <div className="relative h-full w-full">
      <div
        className={`absolute bottom-0 left-1/2 top-0 w-[2px] -translate-x-1/2 bg-gradient-to-b from-emerald-500 to-transparent transition-all duration-150 ${
          dragging ? 'opacity-100 shadow-[0_0_8px_#10b981]' : 'opacity-85'
        }`}
        style={{ pointerEvents: 'auto' }}
      />
    </div>
  );
}

function CustomOutPointGrabber({ dragging }: { dragging: boolean }) {
  return (
    <div className="relative h-full w-full">
      <div
        className={`absolute bottom-0 left-1/2 top-0 w-[2px] -translate-x-1/2 bg-gradient-to-b from-rose-500 to-transparent transition-all duration-150 ${
          dragging ? 'opacity-100 shadow-[0_0_8px_#f43f5e]' : 'opacity-85'
        }`}
        style={{ pointerEvents: 'auto' }}
      />
    </div>
  );
}

function TimelineLayers() {
  const { state } = useTimeline();

  return (
    <>
      <Timeline.PlayheadArea />

      {/* Composed custom playhead grabber using the render prop interface */}
      <Timeline.PlayheadGrabber>
        {({ dragging }) => {
          return (
            <div className="relative h-full w-full">
              {/* Custom Handle Diamond */}
              <div
                className={`absolute left-1/2 -ml-1.5 top-[2px] w-3 h-3 rotate-45 border border-violet-500 bg-gradient-to-br from-violet-600 to-indigo-700 shadow-sm transition-all duration-150 ${
                  dragging
                    ? 'scale-110 opacity-95 shadow-violet-500/50'
                    : 'opacity-80 hover:opacity-95'
                }`}
                style={{ pointerEvents: 'auto' }}
              />

              {/* Custom 2px Glowing Gradient Line (Starts at the bottom tip of the diamond handle) */}
              <div
                className={`absolute left-1/2 -ml-[1px] top-[16px] bottom-0 w-[2px] bg-gradient-to-b from-violet-500 via-indigo-500 to-transparent transition-all duration-150 ${
                  dragging ? 'opacity-100 shadow-[0_0_8px_#8b5cf6]' : 'opacity-85'
                }`}
                style={{ pointerEvents: 'auto' }}
              />
            </div>
          );
        }}
      </Timeline.PlayheadGrabber>

      <Timeline.TrackList className="timeline-track-list-overlay">
        {state.tracks.map((track) => (
          <Timeline.Track key={track.id} trackId={track.id} />
        ))}
      </Timeline.TrackList>
      <Timeline.ClipInteractionLayer />
      <Timeline.RangeSelector
        inPointChildren={CustomInPointGrabber}
        outPointChildren={CustomOutPointGrabber}
      />
    </>
  );
}

export function CustomPlayheadTimeline() {
  const engine = useMemo(() => {
    const timeline = new TimelineEngine({
      duration: fromSeconds(15),
      playheadTime: fromSeconds(2),
      zoomScale: 74,
      tracks: demoTracks,
      markers: demoMarkers,
    });
    timeline.setInPoint(fromSeconds(3));
    timeline.setOutPoint(fromSeconds(11));
    return timeline;
  }, []);

  return (
    <TimelineProvider engine={engine}>
      <div className="timeline-shell">
        <div className="timeline-stage">
          <Timeline.Root className="timeline-fill">
            <CanvasRenderer />
            <TimelineLayers />
          </Timeline.Root>
        </div>
        <div className="timeline-scrollbar-row">
          <Timeline.ViewportScrollbar>
            <Timeline.ViewportScrollbarThumb>
              <Timeline.ViewportScrollbarHandle side="start" />
              <Timeline.ViewportScrollbarHandle side="end" />
            </Timeline.ViewportScrollbarThumb>
          </Timeline.ViewportScrollbar>
        </div>
      </div>
    </TimelineProvider>
  );
}
