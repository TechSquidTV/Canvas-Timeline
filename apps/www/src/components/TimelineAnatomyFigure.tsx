import {
  defaultTimelineInteractionGeometry,
  TimelineEngine,
  type Marker,
  type Track,
  type VisibleTimelineClip,
} from '@techsquidtv/canvas-timeline-core';
import {
  Timeline,
  TimelineProvider,
  useTimeline,
  useTimelineVisibleClips,
} from '@techsquidtv/canvas-timeline-react';
import { CanvasRenderer } from '@techsquidtv/canvas-timeline-renderer';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { Eye, EyeOff, Lock, Unlock, Volume2, VolumeX } from 'lucide-react';
import { useMemo } from 'react';
import '@techsquidtv/canvas-timeline-react/styles.css';

type TimelineAnatomyVariant = 'ruler' | 'playhead' | 'tracks' | 'clip' | 'markers' | 'range';

interface TimelineAnatomyFigureProps {
  caption: string;
  variant: TimelineAnatomyVariant;
}

type AnatomyTrackKind = 'visual' | 'audio';
type AnatomyTrack = Track<AnatomyTrackKind>;

const clipColors = [
  'oklch(0.62 0.16 250)',
  'oklch(0.68 0.14 145)',
  'oklch(0.72 0.16 70)',
  'oklch(0.65 0.17 25)',
  'oklch(0.58 0.18 305)',
] as const;

function DOMClip({
  clip: visibleClip,
  showLabels = true,
}: {
  clip: VisibleTimelineClip<AnatomyTrackKind>;
  showLabels?: boolean;
}) {
  return (
    <div
      className={`timeline-dom-clip ${visibleClip.clip.selected ? 'is-selected' : ''}`}
      style={{
        position: 'absolute',
        left: `${visibleClip.visibleRect.x}px`,
        width: `${visibleClip.visibleRect.width}px`,
        background: visibleClip.clip.color,
      }}
    >
      {showLabels && <span className="timeline-dom-clip-label">{visibleClip.clip.label}</span>}
    </div>
  );
}

function TrackHeaderColumn() {
  const { state } = useTimeline();

  return (
    <Timeline.TrackHeaderList className="timeline-editor-track-headers">
      {state.tracks.map((currentTrack) => (
        <Timeline.TrackHeader key={currentTrack.id} trackId={currentTrack.id}>
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
                <span
                  className="timeline-editor-track-header-button timeline-editor-track-header-lock-button"
                  aria-label={header.locked ? `${header.label} locked` : `${header.label} unlocked`}
                  title={header.locked ? `${header.label} locked` : `${header.label} unlocked`}
                  data-locked={String(header.locked)}
                  role="img"
                >
                  {header.locked ? <Lock aria-hidden="true" /> : <Unlock aria-hidden="true" />}
                </span>
                <span className="timeline-editor-track-header-label">{header.label}</span>
                <Timeline.TrackHeaderResizeHandle trackId={currentTrack.id} />
              </div>
            );
          }}
        </Timeline.TrackHeader>
      ))}
    </Timeline.TrackHeaderList>
  );
}

function clip({
  color = clipColors[0],
  end,
  id,
  label,
  selected = false,
  start,
}: {
  color?: string;
  end: number;
  id: string;
  label: string;
  selected?: boolean;
  start: number;
}): AnatomyTrack['clips'][number] {
  return {
    id,
    sourceId: `${id}-source`,
    timelineStart: fromSeconds(start),
    timelineEnd: fromSeconds(end),
    sourceStart: fromSeconds(0),
    selected,
    color,
    label,
  };
}

function track({
  clips,
  height = 48,
  id,
  kind = 'visual',
  name,
}: {
  clips: AnatomyTrack['clips'];
  height?: number;
  id: string;
  kind?: AnatomyTrackKind;
  name: string;
}): AnatomyTrack {
  return {
    id,
    kind,
    name,
    locked: false,
    muted: false,
    visible: true,
    selected: false,
    height,
    clips,
  };
}

function getVariantModel(variant: TimelineAnatomyVariant): {
  durationSeconds: number;
  markers?: Marker[];
  playheadSeconds: number;
  scrollLeft?: number;
  tracks: AnatomyTrack[];
  zoomScale: number;
} {
  switch (variant) {
    case 'ruler':
      return {
        durationSeconds: 18,
        playheadSeconds: 0,
        zoomScale: 72,
        tracks: [track({ id: 'empty', name: 'Ruler lane', clips: [] })],
      };
    case 'playhead':
      return {
        durationSeconds: 18,
        playheadSeconds: 8.2,
        zoomScale: 72,
        tracks: [track({ id: 'playhead', name: 'Playhead lane', clips: [] })],
      };
    case 'tracks':
      return {
        durationSeconds: 18,
        playheadSeconds: 3,
        zoomScale: 72,
        tracks: [
          track({
            id: 'v2',
            name: 'V2',
            clips: [clip({ id: 'title', label: 'Title', start: 7, end: 12, color: clipColors[1] })],
          }),
          track({
            id: 'v1',
            name: 'V1',
            clips: [clip({ id: 'video', label: 'Video', start: 1, end: 10, color: clipColors[0] })],
          }),
          track({
            id: 'a1',
            name: 'A1',
            kind: 'audio',
            clips: [clip({ id: 'audio', label: 'Audio', start: 1, end: 14, color: clipColors[3] })],
          }),
        ],
      };
    case 'clip':
      return {
        durationSeconds: 18,
        playheadSeconds: 2,
        zoomScale: 72,
        tracks: [
          track({
            id: 'clip-track',
            name: 'Clip',
            clips: [
              clip({
                id: 'clip-body',
                label: 'Clip body',
                start: 3.25,
                end: 9.75,
                color: clipColors[4],
              }),
            ],
          }),
        ],
      };
    case 'markers':
      return {
        durationSeconds: 18,
        markers: [
          { id: 'beat', time: fromSeconds(4), label: 'Beat' },
          { id: 'note', time: fromSeconds(9.5), label: 'Note' },
        ],
        playheadSeconds: 4,
        zoomScale: 72,
        tracks: [
          track({
            id: 'markers-track',
            name: 'Markers',
            clips: [clip({ id: 'interview', label: 'Interview', start: 1.2, end: 13.5 })],
          }),
        ],
      };
    case 'range':
      return {
        durationSeconds: 18,
        playheadSeconds: 5,
        zoomScale: 48,
        tracks: [
          track({
            id: 'range-video',
            name: 'Video',
            clips: [
              clip({ id: 'range-intro', label: 'Intro', start: 1, end: 6.2 }),
              clip({
                id: 'range-main',
                label: 'Main clip',
                start: 7.2,
                end: 13.8,
                color: clipColors[1],
              }),
            ],
          }),
          track({
            id: 'range-overlay',
            name: 'Overlay',
            clips: [
              clip({
                id: 'range-title',
                label: 'Title layer',
                start: 4.2,
                end: 8.8,
                color: clipColors[2],
              }),
            ],
          }),
          track({
            id: 'range-audio',
            kind: 'audio',
            name: 'Audio',
            clips: [
              clip({
                id: 'range-score',
                label: 'Dialogue + score',
                start: 0.8,
                end: 14.5,
                color: clipColors[3],
              }),
            ],
          }),
        ],
      };
  }
}

function TimelineLayers({ variant }: { variant: TimelineAnatomyVariant }) {
  const { state } = useTimeline();
  const visibleClips = useTimelineVisibleClips<AnatomyTrackKind>();
  const tracks = state.tracks;
  const showPlayhead =
    variant !== 'ruler' && variant !== 'tracks' && variant !== 'clip' && variant !== 'range';

  return (
    <>
      {showPlayhead && (
        <>
          <Timeline.PlayheadArea />
          <Timeline.PlayheadGrabber />
        </>
      )}
      <Timeline.TrackList className="timeline-track-list-overlay">
        {tracks.map((currentTrack) => (
          <Timeline.Track
            key={currentTrack.id}
            trackId={currentTrack.id}
            className="timeline-dom-track"
          >
            {visibleClips
              .filter((visibleClip) => visibleClip.track.id === currentTrack.id)
              .map((visibleClip) => (
                <DOMClip
                  key={visibleClip.clip.id}
                  clip={visibleClip}
                  showLabels={variant !== 'clip'}
                />
              ))}
            {variant === 'clip' &&
              visibleClips
                .filter((visibleClip) => visibleClip.track.id === currentTrack.id)
                .map((visibleClip) => (
                  <ClipPartLabels key={`${visibleClip.clip.id}-labels`} clip={visibleClip} />
                ))}
          </Timeline.Track>
        ))}
      </Timeline.TrackList>
      {variant === 'range' && <RangeFillOverlay />}
      <Timeline.ClipInteractionLayer />
      <Timeline.RangeSelector />
      {variant === 'markers' && <MarkerLayer />}
    </>
  );
}

function ClipPartLabels({ clip }: { clip: VisibleTimelineClip<AnatomyTrackKind> }) {
  const clipLeft = clip.visibleRect.x;
  const clipWidth = clip.visibleRect.width;
  const edgeInset = 8;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: clipLeft,
        zIndex: 8,
        width: clipWidth,
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '50%',
          left: edgeInset,
          color: 'var(--timeline-clip-text)',
          font: 'var(--timeline-font-clip)',
          fontWeight: 700,
          lineHeight: 1,
          transform: 'translateY(-50%)',
          whiteSpace: 'nowrap',
        }}
      >
        Head
      </span>
      <span
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          color: 'var(--timeline-clip-text)',
          font: 'var(--timeline-font-clip)',
          fontWeight: 700,
          lineHeight: 1,
          transform: 'translate(-50%, -50%)',
          whiteSpace: 'nowrap',
        }}
      >
        Clip body
      </span>
      <span
        style={{
          position: 'absolute',
          top: '50%',
          right: edgeInset,
          color: 'var(--timeline-clip-text)',
          font: 'var(--timeline-font-clip)',
          fontWeight: 700,
          lineHeight: 1,
          transform: 'translateY(-50%)',
          whiteSpace: 'nowrap',
        }}
      >
        Tail
      </span>
    </div>
  );
}

function RangeFillOverlay() {
  const { state } = useTimeline();

  if (state.inPoint === undefined && state.outPoint === undefined) {
    return null;
  }

  const inSeconds = state.inPoint !== undefined ? toSeconds(state.inPoint) : 0;
  const outSeconds =
    state.outPoint !== undefined
      ? toSeconds(state.outPoint)
      : state.duration
        ? toSeconds(state.duration)
        : inSeconds;

  if (inSeconds >= outSeconds) {
    return null;
  }

  const left = inSeconds * state.zoomScale - state.scrollLeft;
  const width = (outSeconds - inSeconds) * state.zoomScale;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: defaultTimelineInteractionGeometry.rulerHeight,
        bottom: 0,
        left,
        zIndex: 15,
        width,
        background: 'color-mix(in oklch, var(--timeline-inout-accent) 22%, transparent)',
        pointerEvents: 'none',
      }}
    />
  );
}

function MarkerLayer() {
  const { state } = useTimeline();

  return (
    <>
      {(state.markers ?? []).map((marker) => {
        const left = toSeconds(marker.time) * state.zoomScale - state.scrollLeft;
        const markerFill = marker.color ?? 'var(--timeline-marker)';

        return (
          <div key={marker.id} style={{ pointerEvents: 'none' }}>
            <div
              style={{
                position: 'absolute',
                top: 16,
                left: left - 5,
                zIndex: 35,
                width: 10,
                height: 16,
                background: markerFill,
                clipPath: 'polygon(0 0, 100% 0, 100% 50%, 50% 100%, 0 50%)',
              }}
            />
            {marker.label && (
              <span
                style={{
                  position: 'absolute',
                  top: 22,
                  left: left + 6,
                  zIndex: 35,
                  color: 'var(--timeline-marker-text)',
                  font: 'var(--timeline-font-ruler)',
                  lineHeight: 1,
                  transform: 'translateY(-50%)',
                  whiteSpace: 'nowrap',
                }}
              >
                {marker.label}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

function TimelineShell({ variant }: { variant: TimelineAnatomyVariant }) {
  const model = useMemo(() => getVariantModel(variant), [variant]);
  const engine = useMemo(() => {
    const timeline = new TimelineEngine({
      duration: fromSeconds(model.durationSeconds),
      markers: model.markers,
      playheadTime: fromSeconds(model.playheadSeconds),
      scrollLeft: model.scrollLeft,
      tracks: model.tracks,
      zoomScale: model.zoomScale,
    });

    if (variant === 'range') {
      timeline.setInPoint(fromSeconds(4));
      timeline.setOutPoint(fromSeconds(10.5));
    }

    return timeline;
  }, [model, variant]);
  const stageHeight = variant === 'range' ? '11rem' : variant === 'tracks' ? '10rem' : '7rem';
  const showScrollbar = variant === 'ruler';
  const shellHeight = showScrollbar
    ? '9rem'
    : variant === 'range'
      ? '11rem'
      : variant === 'tracks'
        ? '10rem'
        : '7rem';

  return (
    <TimelineProvider engine={engine}>
      <div
        className={`timeline-shell${variant === 'tracks' ? ' timeline-anatomy-track-header-shell' : ''}`}
        style={{
          gridTemplateRows: showScrollbar ? `minmax(${stageHeight}, 1fr) auto` : '1fr',
          height: shellHeight,
          minHeight: shellHeight,
        }}
      >
        {variant === 'tracks' && (
          <div className="timeline-anatomy-track-header-panel">
            <TrackHeaderColumn />
          </div>
        )}
        <div className="timeline-stage" style={{ height: stageHeight, minHeight: stageHeight }}>
          <Timeline.Root className="timeline-fill">
            <CanvasRenderer showClips={false} showInOutPoints={false} />
            <TimelineLayers variant={variant} />
          </Timeline.Root>
        </div>
        {showScrollbar && (
          <div className="timeline-scrollbar-row">
            <Timeline.ViewportScrollbar>
              <Timeline.ViewportScrollbarThumb>
                <Timeline.ViewportScrollbarHandle side="start" />
                <Timeline.ViewportScrollbarHandle side="end" />
              </Timeline.ViewportScrollbarThumb>
            </Timeline.ViewportScrollbar>
          </div>
        )}
      </div>
    </TimelineProvider>
  );
}

export default function TimelineAnatomyFigure({ caption, variant }: TimelineAnatomyFigureProps) {
  return (
    <figure className="timeline-anatomy-figure" aria-label={caption}>
      <div className="docs-timeline-theme dark">
        <TimelineShell variant={variant} />
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
