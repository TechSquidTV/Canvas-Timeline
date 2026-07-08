import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import {
  TimelineProvider,
  Timeline,
  useTimeline,
  useTimelineTrackLockControl,
} from '@techsquidtv/canvas-timeline-react';
import { CanvasRenderer } from '@techsquidtv/canvas-timeline-renderer';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { Eye, EyeOff, Lock, Unlock, Volume2, VolumeX } from 'lucide-react';
import { useMemo } from 'react';
import {
  Group as ResizablePanelGroup,
  Panel as ResizablePanel,
  Separator as ResizableHandle,
} from 'react-resizable-panels';
import { demoMarkers, demoTracks } from '#www/demos/timeline-editor-controls/timeline-demo-data';
import { ControlBar } from '#www/demos/timeline-editor-controls/timeline-controls';
import '@techsquidtv/canvas-timeline-react/styles.css';
import '#www/demos/timeline-editor-controls/timeline-editor.css';

function TrackLockButton({ trackId }: { trackId: string }) {
  const lockControl = useTimelineTrackLockControl(trackId);

  return (
    <button
      {...lockControl.buttonProps}
      className="timeline-editor-track-header-button timeline-editor-track-header-lock-button"
    >
      {lockControl.locked ? <Lock aria-hidden="true" /> : <Unlock aria-hidden="true" />}
    </button>
  );
}

function TrackHeaderColumn() {
  const { state } = useTimeline();

  return (
    <Timeline.TrackHeaderList className="timeline-editor-track-headers">
      {state.tracks.map((track) => (
        <Timeline.TrackHeader key={track.id} trackId={track.id}>
          {(header) => {
            const outputControl =
              header.kind === 'audio' ? (
                <button
                  type="button"
                  className="timeline-editor-track-header-button"
                  onClick={() => header.setMuted(!header.muted)}
                  title={header.muted ? `Unmute ${header.label}` : `Mute ${header.label}`}
                  aria-label={header.muted ? `Unmute ${header.label}` : `Mute ${header.label}`}
                  aria-pressed={header.muted}
                >
                  {header.muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
                </button>
              ) : (
                <button
                  type="button"
                  className="timeline-editor-track-header-button"
                  onClick={() => header.setVisible(!header.visible)}
                  title={header.visible ? `Hide ${header.label}` : `Show ${header.label}`}
                  aria-label={header.visible ? `Hide ${header.label}` : `Show ${header.label}`}
                  aria-pressed={!header.visible}
                >
                  {header.visible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                </button>
              );

            return (
              <div className="timeline-editor-track-header-content">
                {outputControl}
                <TrackLockButton trackId={track.id} />
                <span className="timeline-editor-track-header-label">{header.label}</span>
                <Timeline.TrackHeaderResizeHandle trackId={track.id} />
              </div>
            );
          }}
        </Timeline.TrackHeader>
      ))}
    </Timeline.TrackHeaderList>
  );
}

function TimelineLayers() {
  const { state } = useTimeline();

  return (
    <>
      <Timeline.PlayheadArea />
      <Timeline.PlayheadGrabber />
      <Timeline.TrackList className="timeline-track-list-overlay">
        {state.tracks.map((track) => (
          <Timeline.Track key={track.id} trackId={track.id} />
        ))}
      </Timeline.TrackList>
      <Timeline.ClipInteractionLayer />
      <Timeline.RangeSelector />
    </>
  );
}

export function TimelineEditorControls() {
  const engine = useMemo(
    () =>
      new TimelineEngine({
        duration: fromSeconds(15),
        playheadTime: fromSeconds(2),
        zoomScale: 74,
        tracks: demoTracks,
        markers: demoMarkers,
      }),
    []
  );

  return (
    <TimelineProvider engine={engine}>
      <div className="timeline-shell timeline-controls-shell timeline-editor-controls-shell">
        <ControlBar />

        <ResizablePanelGroup
          className="timeline-editor-body-with-headers"
          orientation="horizontal"
          resizeTargetMinimumSize={{ coarse: 28, fine: 8 }}
        >
          <ResizablePanel
            defaultSize="7.75rem"
            groupResizeBehavior="preserve-pixel-size"
            maxSize="20rem"
            minSize="7.75rem"
          >
            <div className="timeline-editor-header-panel">
              <div className="timeline-stage timeline-editor-header-stage">
                <TrackHeaderColumn />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle
            aria-label="Resize track header column"
            className="timeline-editor-column-resize-handle"
          />

          <ResizablePanel minSize="0">
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
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TimelineProvider>
  );
}
