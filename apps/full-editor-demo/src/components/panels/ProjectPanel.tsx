import {
  useTimelineClips,
  useTimelineState,
  useTimelineTracks,
} from '@techsquidtv/canvas-timeline-react';
import { demoProject, type EditorTrackKind } from '@/data/demo-project';
import { formatRationalTime } from '@/lib/timeline-format';

export function ProjectPanel() {
  const state = useTimelineState();
  const { clips } = useTimelineClips<EditorTrackKind>();
  const { tracks } = useTimelineTracks<EditorTrackKind>();

  return (
    <dl className="panel-readout">
      <div>
        <dt>Project</dt>
        <dd>{demoProject.title}</dd>
      </div>
      <div>
        <dt>Duration</dt>
        <dd>{formatRationalTime(state.duration)}</dd>
      </div>
      <div>
        <dt>Frame rate</dt>
        <dd>{demoProject.frameRate} fps</dd>
      </div>
      <div>
        <dt>Tracks</dt>
        <dd>{tracks.length}</dd>
      </div>
      <div>
        <dt>Clips</dt>
        <dd>{clips.length}</dd>
      </div>
    </dl>
  );
}
