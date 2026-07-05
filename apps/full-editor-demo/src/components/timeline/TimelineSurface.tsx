import { Timeline } from '@techsquidtv/canvas-timeline-react';
import { CanvasRenderer } from '@techsquidtv/canvas-timeline-renderer';
import { TimelineLayers } from './TimelineLayers';

export function TimelineSurface() {
  return (
    <div className="timeline-editor-timeline-panel">
      <div className="timeline-editor-stage-row">
        <div className="timeline-stage timeline-editor-timeline-stage">
          <Timeline.Root className="timeline-fill timeline-editor-root-with-headers">
            <CanvasRenderer />
            <TimelineLayers />
          </Timeline.Root>
        </div>
        <div className="timeline-editor-vertical-scrollbar-column">
          <Timeline.VerticalScrollbar className="timeline-editor-vertical-scrollbar">
            <Timeline.VerticalScrollbarThumb className="timeline-editor-vertical-scrollbar-thumb">
              <Timeline.VerticalScrollbarHandle side="start" />
              <Timeline.VerticalScrollbarHandle side="end" />
            </Timeline.VerticalScrollbarThumb>
          </Timeline.VerticalScrollbar>
        </div>
      </div>
      <div className="timeline-scrollbar-row timeline-editor-scrollbar-row">
        <Timeline.ViewportScrollbar>
          <Timeline.ViewportScrollbarThumb>
            <Timeline.ViewportScrollbarHandle side="start" />
            <Timeline.ViewportScrollbarHandle side="end" />
          </Timeline.ViewportScrollbarThumb>
        </Timeline.ViewportScrollbar>
      </div>
    </div>
  );
}
