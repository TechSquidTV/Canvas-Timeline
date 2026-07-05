import { MonitorPlay } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEditorProject } from '@/editor/project/project-context';
import { getPreviewVideoResolution } from '@/project/video-settings';
import { useEditorMediaSync } from './media-sync-context';

export function PreviewMonitor() {
  const media = useEditorMediaSync();
  const { metadata } = useEditorProject();
  const statusText = media.playbackError ?? (media.hasMediaSources ? media.status : 'No media');
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
        <span>{statusText}</span>
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
