import { Timeline } from '@techsquidtv/canvas-timeline-react';
import { CanvasRenderer } from '@techsquidtv/canvas-timeline-renderer';
import { TimelineLayers } from '#full-editor/components/timeline/TimelineLayers';
import { TimelineSourceDropTarget } from '#full-editor/components/timeline/TimelineSourceDropTarget';
import { useEditorProject } from '#full-editor/editor/project/project-context';
import { getProjectFrameRatePreset } from '#full-editor/project/frame-rate';

export function TimelineSurface() {
  const { metadata } = useEditorProject();
  const { timecodeFrameRate } = getProjectFrameRatePreset(metadata.frameRate);

  return (
    <div className="timeline-editor-timeline-panel">
      <div className="timeline-editor-stage-row">
        <div className="timeline-stage timeline-editor-timeline-stage">
          <TimelineSourceDropTarget>
            <CanvasRenderer
              ruler={{
                frameRate: timecodeFrameRate,
                timecodeFormatOptions: { frameRate: timecodeFrameRate },
              }}
            />
            <TimelineLayers />
          </TimelineSourceDropTarget>
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
