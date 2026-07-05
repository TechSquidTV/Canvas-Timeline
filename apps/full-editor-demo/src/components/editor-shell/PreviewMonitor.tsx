import { MonitorPlay } from 'lucide-react';
import { useEditorMediaSync } from './media-sync-context';

export function PreviewMonitor() {
  const media = useEditorMediaSync();
  const statusText = media.playbackError ?? (media.hasMediaSources ? media.status : 'No media');
  const overlayText = media.hasMediaSources ? 'Loading media' : 'No media loaded';

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
          width={1280}
          height={720}
        />
        {!media.ready ? <div className="preview-monitor-overlay">{overlayText}</div> : null}
      </div>
    </section>
  );
}
