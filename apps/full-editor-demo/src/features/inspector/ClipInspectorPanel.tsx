import { useTimelineSelection } from '@techsquidtv/canvas-timeline-react';
import { useSourceBin } from '#full-editor/features/source-bin/source-bin-context';
import { formatFrameRate } from '#full-editor/shared/lib/media-format';
import { formatRationalTime } from '#full-editor/shared/lib/timeline-format';
import type { EditorTrackKind } from '#full-editor/features/project/demo-project';

export function ClipInspectorPanel() {
  const { selectedClip, selectedClipTrackId } = useTimelineSelection<EditorTrackKind>();
  const { sources } = useSourceBin();

  if (selectedClip === null) {
    return <p className="panel-empty">Select a clip to inspect timing and media metadata.</p>;
  }

  const source = sources.find((candidate) => candidate.id === selectedClip.sourceId);
  const sourceFrameRate = source?.metadata.averageFrameRate;

  return (
    <dl className="panel-readout">
      <div>
        <dt>Clip</dt>
        <dd>{selectedClip.label ?? selectedClip.id}</dd>
      </div>
      <div>
        <dt>Track</dt>
        <dd>{selectedClipTrackId ?? 'Unknown'}</dd>
      </div>
      <div>
        <dt>Source</dt>
        <dd>{selectedClip.sourceId}</dd>
      </div>
      {sourceFrameRate !== undefined ? (
        <div>
          <dt>Source FPS</dt>
          <dd>{formatFrameRate(sourceFrameRate)} fps</dd>
        </div>
      ) : null}
      <div>
        <dt>Timeline</dt>
        <dd>
          {formatRationalTime(selectedClip.timelineStart)} -{' '}
          {formatRationalTime(selectedClip.timelineEnd)}
        </dd>
      </div>
      <div>
        <dt>Source start</dt>
        <dd>{formatRationalTime(selectedClip.sourceStart)}</dd>
      </div>
      <div>
        <dt>Opacity</dt>
        <dd>
          {selectedClip.opacity === undefined
            ? '100%'
            : `${Math.round(selectedClip.opacity * 100)}%`}
        </dd>
      </div>
    </dl>
  );
}
