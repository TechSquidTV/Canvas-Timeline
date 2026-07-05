import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import {
  Timeline,
  TimelineProvider,
  useTimeline,
  useTimelineClipGroups,
  useTimelineEditCommands,
  useTimelinePlayheadTime,
  useTimelineSelection,
} from '@techsquidtv/canvas-timeline-react';
import { CanvasRenderer } from '@techsquidtv/canvas-timeline-renderer';
import { compareRational, fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { Link2, Scissors, Unlink } from 'lucide-react';
import { useMemo } from 'react';
import { demoMarkers, demoTracks, linkedClipGroupLabel } from './timeline-demo-data';
import '@techsquidtv/canvas-timeline-react/styles.css';
import './timeline-editor.css';

function TrackHeaderColumn() {
  const { state } = useTimeline();

  return (
    <Timeline.TrackHeaderList className="timeline-editor-track-headers">
      {state.tracks.map((track) => (
        <Timeline.TrackHeader key={track.id} trackId={track.id}>
          {(header) => (
            <div className="timeline-editor-track-header-content clip-grouping-track-header-content">
              <span className="timeline-editor-track-header-label">{header.label}</span>
            </div>
          )}
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

function GroupingToolbar() {
  const playheadTime = useTimelinePlayheadTime();
  const { splitSelectedClipsAtTime } = useTimelineEditCommands();
  const { selectedClipIds, selectedClips } = useTimelineSelection();
  const { getClipGroupClips, groupClips, selectedGroup, selectedGroupId, ungroupSelectedClips } =
    useTimelineClipGroups();
  const canGroup = selectedClipIds.length >= 2 && selectedGroupId === null;
  const canUngroup = selectedGroupId !== null;
  const selectedOverlappingClipCount = selectedClips.filter(
    (clip) =>
      compareRational(playheadTime, clip.timelineStart) > 0 &&
      compareRational(playheadTime, clip.timelineEnd) < 0
  ).length;
  const selectedGroupMembers =
    selectedGroup === null
      ? []
      : getClipGroupClips(selectedGroup.id).map((entry) => entry.clip.label ?? entry.clip.id);

  return (
    <div className="clip-grouping-toolbar">
      <div className="clip-grouping-toolbar-actions">
        <button
          type="button"
          className="timeline-control-button"
          onClick={() => groupClips(selectedClipIds, linkedClipGroupLabel)}
          disabled={!canGroup}
          title={canGroup ? 'Group selected clips' : 'Select both clips to group them'}
        >
          <Link2 aria-hidden="true" />
          Group selected
        </button>
        <button
          type="button"
          className="timeline-control-button"
          onClick={() => ungroupSelectedClips()}
          disabled={!canUngroup}
          title={canUngroup ? 'Ungroup selected clips' : 'Select a grouped clip to ungroup it'}
        >
          <Unlink aria-hidden="true" />
          Ungroup selected
        </button>
        <button
          type="button"
          className="timeline-control-button"
          onClick={() => splitSelectedClipsAtTime(playheadTime)}
          disabled={selectedOverlappingClipCount === 0}
          title={
            selectedOverlappingClipCount > 0
              ? 'Cut selected clips at playhead'
              : 'Select clips that overlap the playhead'
          }
        >
          <Scissors aria-hidden="true" />
          Cut selected
        </button>
      </div>

      <div className="clip-grouping-selection-readout" aria-live="polite">
        <span className="clip-grouping-readout-item">
          <span className="clip-grouping-readout-label">Selected</span>
          <strong>{selectedClipIds.length}</strong>
        </span>
        <span className="clip-grouping-readout-item">
          <span className="clip-grouping-readout-label">Group</span>
          <strong>{selectedGroup?.label ?? 'None'}</strong>
        </span>
        <span className="clip-grouping-readout-item clip-grouping-readout-item-wide">
          <span className="clip-grouping-readout-label">Members</span>
          <strong>
            {selectedGroupMembers.length > 0 ? selectedGroupMembers.join(' + ') : 'None'}
          </strong>
        </span>
      </div>
    </div>
  );
}

export function ClipGroupingImportTimeline() {
  const engine = useMemo(
    () =>
      new TimelineEngine({
        duration: fromSeconds(15),
        playheadTime: fromSeconds(6.5),
        zoomScale: 76,
        tracks: demoTracks,
        markers: demoMarkers,
      }),
    []
  );

  return (
    <TimelineProvider engine={engine}>
      <div className="timeline-shell timeline-controls-shell clip-grouping-shell">
        <GroupingToolbar />

        <div className="timeline-editor-body-with-headers clip-grouping-editor-grid">
          <div className="timeline-editor-header-panel">
            <div className="timeline-stage timeline-editor-header-stage">
              <TrackHeaderColumn />
            </div>
          </div>

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
        </div>
      </div>
    </TimelineProvider>
  );
}
