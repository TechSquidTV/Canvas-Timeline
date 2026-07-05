import {
  useTimelineClips,
  useTimelineState,
  useTimelineTracks,
} from '@techsquidtv/canvas-timeline-react';
import type { EditorTrackKind } from '@/data/demo-project';
import { useEditorProject } from '@/editor/project/project-context';
import { formatRationalTime } from '@/lib/timeline-format';
import { formatVideoResolution } from '@/project/video-settings';

export function ProjectPanel() {
  const state = useTimelineState();
  const { metadata } = useEditorProject();
  const { clips } = useTimelineClips<EditorTrackKind>();
  const { tracks } = useTimelineTracks<EditorTrackKind>();

  return (
    <dl className="panel-readout">
      <div>
        <dt>Project</dt>
        <dd>{metadata.title}</dd>
      </div>
      <div>
        <dt>Duration</dt>
        <dd>{formatRationalTime(state.duration)}</dd>
      </div>
      <div>
        <dt>Resolution</dt>
        <dd>{formatVideoResolution(metadata)}</dd>
      </div>
      <div>
        <dt>Frame rate</dt>
        <dd>{metadata.frameRate} fps</dd>
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
