import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '#full-editor/shared/ui/resizable';
import { TimelineCommandBar } from '#full-editor/features/timeline/TimelineCommandBar';
import { TimelineSurface } from '#full-editor/features/timeline/TimelineSurface';
import { TrackHeaderColumn } from '#full-editor/features/timeline/TrackHeaderColumn';
import { TransportBar } from '#full-editor/features/timeline/TransportBar';

export function TimelineDock({ compact = false }: { compact?: boolean }) {
  return (
    <section className="full-editor-timeline-dock" aria-label="Timeline editor">
      <div className="timeline-editor-command-strip">
        <TransportBar />
        <TimelineCommandBar />
      </div>
      <ResizablePanelGroup
        className="timeline-editor-body-with-headers"
        orientation="horizontal"
        resizeTargetMinimumSize={{ coarse: 44, fine: 8 }}
      >
        <ResizablePanel
          className="editor-shell-panel editor-track-header-shell-panel"
          defaultSize={compact ? '7.5rem' : '13rem'}
          groupResizeBehavior="preserve-pixel-size"
          maxSize={compact ? '9rem' : '22rem'}
          minSize={compact ? '7.5rem' : '10rem'}
        >
          <div className="timeline-editor-header-panel">
            <div className="timeline-stage timeline-editor-header-stage">
              <TrackHeaderColumn />
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize track header column" withHandle />
        <ResizablePanel className="editor-shell-panel editor-timeline-surface-panel" minSize="0">
          <TimelineSurface />
        </ResizablePanel>
      </ResizablePanelGroup>
    </section>
  );
}
