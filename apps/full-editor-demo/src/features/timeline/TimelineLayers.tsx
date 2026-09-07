import { useEditorTracks } from '#full-editor/features/timeline/useEditorTracks';
import { Timeline } from '@techsquidtv/canvas-timeline-react';
export function TimelineLayers() {
  const { tracks } = useEditorTracks();

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
