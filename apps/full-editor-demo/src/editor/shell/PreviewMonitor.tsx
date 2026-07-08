import { MonitorPlay } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEditorProject } from '#full-editor/editor/project/project-context';
import { getPreviewVideoResolution } from '#full-editor/project/video-settings';
import { useEditorMediaSync } from '#full-editor/editor/shell/media-sync-context';

export function PreviewMonitor() {
  const media = useEditorMediaSync();
  const { metadata } = useEditorProject();
  const overlayText = media.hasMediaSources ? 'Loading media' : 'No media loaded';
  const previewResolution = getPreviewVideoResolution(metadata);
  const canvasStyle = {
    '--preview-aspect-height': metadata.height,
    '--preview-aspect-width': metadata.width,
  } as CSSProperties;

  return (
    <section className="preview-monitor" aria-label="Video preview">
      <div className="preview-monitor-toolbar">
        <span>
          <MonitorPlay aria-hidden="true" />
          Program
        </span>
      </div>
      <div className="preview-monitor-frame">
        <canvas
          ref={media.canvasRef}
          className="preview-monitor-canvas"
          height={previewResolution.height}
          style={canvasStyle}
          width={previewResolution.width}
        />
        {!media.ready ? <div className="preview-monitor-overlay">{overlayText}</div> : null}
      </div>
    </section>
  );
}
