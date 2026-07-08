import { Timeline, useTimelineTracks } from '@techsquidtv/canvas-timeline-react';
import type { EditorTrackKind } from '#full-editor/data/demo-project';

export function TimelineLayers() {
  const { tracks } = useTimelineTracks<EditorTrackKind>();

  return (
    <>
      <Timeline.PlayheadArea />
      <Timeline.PlayheadGrabber />
      <Timeline.TrackList className="timeline-track-list-overlay">
        {tracks.map((track) => (
          <Timeline.Track key={track.id} trackId={track.id} />
        ))}
      </Timeline.TrackList>
      <Timeline.ClipInteractionLayer />
      <Timeline.RangeSelector />
    </>
  );
}
