import { useTimeline } from '@techsquidtv/canvas-timeline-react';
import { demoProject } from '@/data/demo-project';
import { formatRationalTime } from '@/lib/timeline-format';

export function ProjectPanel() {
  const { state } = useTimeline();
  const clipCount = state.tracks.reduce((count, track) => count + track.clips.length, 0);

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
        <dd>{state.tracks.length}</dd>
      </div>
      <div>
        <dt>Clips</dt>
        <dd>{clipCount}</dd>
      </div>
    </dl>
  );
}
