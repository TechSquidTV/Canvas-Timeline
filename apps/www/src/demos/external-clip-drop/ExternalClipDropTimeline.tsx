import {
  TimelineEngine,
  type Clip,
  type TimelineClipGroupPlacement,
} from '@techsquidtv/canvas-timeline-core';
import {
  Timeline,
  TimelineProvider,
  useTimeline,
  useTimelineExternalClipDrop,
  type TimelineExternalClipDropContext,
} from '@techsquidtv/canvas-timeline-react';
import { CanvasRenderer } from '@techsquidtv/canvas-timeline-renderer';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { Link2, MousePointer2, Rows3 } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import {
  demoMarkers,
  demoTracks,
  externalClipAssets,
  type ExternalClipAsset,
  type ExternalClipDropTrackKind,
} from './timeline-demo-data';
import '@techsquidtv/canvas-timeline-react/styles.css';
import './timeline-editor.css';

const externalAssetMimeType = 'application/x-canvas-timeline-external-asset';

function TrackHeaderColumn() {
  const { state } = useTimeline();

  return (
    <Timeline.TrackHeaderList className="timeline-editor-track-headers">
      {state.tracks.map((track) => (
        <Timeline.TrackHeader key={track.id} trackId={track.id}>
          {(header) => (
            <div className="timeline-editor-track-header-content external-drop-track-header-content">
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

function createExternalClip(asset: ExternalClipAsset, id: string, label: string): Clip {
  return {
    id,
    sourceId: asset.sourceId,
    timelineStart: fromSeconds(0),
    timelineEnd: fromSeconds(asset.durationSeconds),
    sourceStart: fromSeconds(0),
    selected: false,
    color: asset.color,
    label,
  };
}

function ExternalDropWorkspace() {
  const { state } = useTimeline();
  const [editMode, setEditMode] = useState<'insert' | 'overwrite'>('overwrite');
  const activeAssetRef = useRef<ExternalClipAsset | null>(null);
  const clipCounterRef = useRef(1);
  const audioTrack = state.tracks.find((track) => track.kind === 'audio') ?? null;

  const resolveDragData = useCallback((event: DragEvent<HTMLElement>) => {
    const assetId = event.dataTransfer.getData(externalAssetMimeType) || activeAssetRef.current?.id;
    return externalClipAssets.find((asset) => asset.id === assetId) ?? null;
  }, []);

  const createPlacements = useCallback(
    (
      context: TimelineExternalClipDropContext<ExternalClipAsset, ExternalClipDropTrackKind>
    ): readonly TimelineClipGroupPlacement[] | null => {
      const instance = clipCounterRef.current;
      clipCounterRef.current += 1;

      if (context.data.kind === 'visual') {
        return [
          {
            clip: createExternalClip(
              context.data,
              `${context.data.id}-${instance}`,
              context.data.label
            ),
            targetTrackId: context.targetTrack.id,
            startTime: context.dropTime,
          },
        ];
      }
      if (audioTrack === null) {
        return null;
      }
      return [
        {
          clip: createExternalClip(
            context.data,
            `${context.data.id}-video-${instance}`,
            `${context.data.label} video`
          ),
          targetTrackId: context.targetTrack.id,
          startTime: context.dropTime,
        },
        {
          clip: createExternalClip(
            context.data,
            `${context.data.id}-audio-${instance}`,
            `${context.data.label} audio`
          ),
          targetTrackId: audioTrack.id,
          startTime: context.dropTime,
        },
      ];
    },
    [audioTrack]
  );

  const drop = useTimelineExternalClipDrop<ExternalClipAsset, ExternalClipDropTrackKind>({
    editMode,
    resolveDragData,
    createPlacements,
    canDropOnTrack: (context) =>
      context.targetTrack.kind === 'visual'
        ? true
        : { canDrop: false, reason: 'incompatible-track-kind' },
    group: (context) =>
      context.data.kind === 'linked-av' ? { label: `${context.data.label} group` } : null,
    snap: false,
    rulerHeight: 32,
    trackHeight: 56,
  });

  const lastResultLabel =
    drop.lastResult === null ? 'Ready' : drop.lastResult.ok ? 'Dropped' : drop.lastResult.reason;
  const targetLabel =
    drop.targetTrack?.name ?? drop.targetTrackId ?? (drop.dragging ? 'No target' : 'Idle');

  return (
    <div className="external-drop-workspace">
      <div className="external-drop-toolbar">
        <div className="external-drop-assets" aria-label="External clip assets">
          {externalClipAssets.map((asset) => (
            <div
              key={asset.id}
              className="external-drop-asset"
              draggable
              onDragStart={(event) => {
                activeAssetRef.current = asset;
                event.dataTransfer.effectAllowed = 'copy';
                event.dataTransfer.setData(externalAssetMimeType, asset.id);
              }}
              onDragEnd={() => {
                activeAssetRef.current = null;
              }}
              style={{ '--asset-color': asset.color } as CSSProperties}
              role="button"
              tabIndex={0}
            >
              {asset.kind === 'linked-av' ? (
                <Link2 aria-hidden="true" />
              ) : (
                <MousePointer2 aria-hidden="true" />
              )}
              <span>{asset.label}</span>
            </div>
          ))}
        </div>

        <div className="external-drop-controls" aria-label="External drop edit mode">
          <button
            type="button"
            className={editMode === 'overwrite' ? 'external-drop-mode-active' : undefined}
            onClick={() => setEditMode('overwrite')}
          >
            <Rows3 aria-hidden="true" />
            Overwrite
          </button>
          <button
            type="button"
            className={editMode === 'insert' ? 'external-drop-mode-active' : undefined}
            onClick={() => setEditMode('insert')}
          >
            <Rows3 aria-hidden="true" />
            Insert
          </button>
        </div>

        <div className="external-drop-readout" aria-live="polite">
          <span>{targetLabel}</span>
          <strong>{lastResultLabel}</strong>
        </div>
      </div>

      <div className="timeline-editor-body-with-headers external-drop-editor-grid">
        <div className="timeline-editor-header-panel">
          <div className="timeline-stage timeline-editor-header-stage">
            <TrackHeaderColumn />
          </div>
        </div>

        <div className="timeline-editor-timeline-panel">
          <div className="timeline-editor-stage-row">
            <div className="timeline-stage timeline-editor-timeline-stage">
              <Timeline.Root
                className={`timeline-fill timeline-editor-root-with-headers ${
                  drop.dragging ? 'external-drop-target-active' : ''
                } ${drop.valid ? 'external-drop-target-valid' : ''}`}
                {...drop.rootProps}
              >
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
  );
}

export function ExternalClipDropTimeline() {
  const engine = useMemo(
    () =>
      new TimelineEngine({
        duration: fromSeconds(14),
        playheadTime: fromSeconds(4),
        zoomScale: 76,
        tracks: demoTracks,
        markers: demoMarkers,
      }),
    []
  );

  return (
    <TimelineProvider engine={engine}>
      <div className="timeline-shell timeline-controls-shell external-drop-shell">
        <ExternalDropWorkspace />
      </div>
    </TimelineProvider>
  );
}
