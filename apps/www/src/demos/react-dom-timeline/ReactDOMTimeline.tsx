import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import {
  TimelineProvider,
  Timeline,
  useTimeline,
  useTimelineVisibleClips,
} from '@techsquidtv/canvas-timeline-react';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { useMemo } from 'react';
import { demoTracks, demoMarkers } from './timeline-demo-data';
import { ControlBar } from './timeline-controls';
import { RulerDOM, DOMClip } from './DOMTimelineComponents';
import '@techsquidtv/canvas-timeline-react/styles.css';

function TimelineLayers() {
  const { state } = useTimeline();
  const visibleClips = useTimelineVisibleClips();

  const tracks = state.tracks;

  return (
    <>
      <RulerDOM />
      <Timeline.PlayheadArea />
      <Timeline.PlayheadGrabber />
      <Timeline.TrackList className="timeline-track-list-overlay">
        {tracks.map((track) => (
          <Timeline.Track key={track.id} trackId={track.id} className="timeline-dom-track">
            {visibleClips
              .filter((clip) => clip.track.id === track.id)
              .map((clip) => (
                <DOMClip key={clip.clip.id} clip={clip} />
              ))}
          </Timeline.Track>
        ))}
      </Timeline.TrackList>
      <Timeline.ClipInteractionLayer />
      <Timeline.RangeSelector />
    </>
  );
}

export function ReactDOMTimeline() {
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
      <div className="timeline-shell timeline-controls-shell">
        <ControlBar />

        {/* Stage area */}
        <div className="timeline-stage">
          <Timeline.Root className="timeline-fill">
            <TimelineLayers />
          </Timeline.Root>
        </div>

        {/* Bottom Scrollbar row */}
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
