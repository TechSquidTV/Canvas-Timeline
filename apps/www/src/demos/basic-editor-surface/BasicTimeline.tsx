import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { TimelineProvider, Timeline, useTimeline } from '@techsquidtv/canvas-timeline-react';
import { CanvasRenderer } from '@techsquidtv/canvas-timeline-renderer';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { useMemo } from 'react';
import { demoMarkers, demoTracks } from './timeline-demo-data';
import '@techsquidtv/canvas-timeline-react/styles.css';

function TimelineLayers() {
  const { state } = useTimeline();

  return (
    <>
      <Timeline.PlayheadArea />
      <Timeline.PlayheadGrabber />
      <Timeline.TrackList className="timeline-track-list-overlay">
        {state.tracks.map((track) => (
          <Timeline.Track key={track.id} trackId={track.id} />
        ))}
      </Timeline.TrackList>
      <Timeline.ClipInteractionLayer />
      <Timeline.RangeSelector />
    </>
  );
}

export function BasicTimeline() {
  const engine = useMemo(
    () =>
      new TimelineEngine({
        duration: fromSeconds(15),
        playheadTime: fromSeconds(2),
        zoomScale: 74,
        tracks: demoTracks,
        markers: demoMarkers,
      }),
    []
  );

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
