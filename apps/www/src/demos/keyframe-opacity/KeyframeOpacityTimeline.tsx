import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import type {
  TimelineKeyframeBezierHandle,
  TimelineKeyframeInterpolation,
  TimelineKeyframeSidePatch,
  Track,
} from '@techsquidtv/canvas-timeline-core';
import {
  Timeline,
  TimelineProvider,
  useTimeline,
  useTimelineKeyframes,
  useTimelinePlayheadTime,
} from '@techsquidtv/canvas-timeline-react';
import { useHTMLTimelineMedia } from '@techsquidtv/canvas-timeline-html-media-adapter/react';
import { CanvasRenderer } from '@techsquidtv/canvas-timeline-renderer';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { Diamond, Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { ChangeEvent, ComponentProps } from 'react';
import {
  Group as ResizablePanelGroup,
  Panel as ResizablePanel,
  Separator as ResizableHandle,
} from 'react-resizable-panels';
import type { DemoMetrics } from '#www/demos/demo-instrumentation';
import {
  findClipContainingTime,
  findOpacityKeyframeNearTime,
  getOpacityValueFromClipViewportY,
  opacityKeyframeProperty,
  opacityKeyframeValuePadding,
  toggleOpacityKeyframeAtTime,
} from '#www/demos/keyframe-opacity/keyframe-opacity-utils';
import {
  demoMarkers,
  demoTracks,
  opacityClipId,
  sampleDurationSeconds,
  sampleMediaUrl,
  sampleSourceId,
} from '#www/demos/keyframe-opacity/timeline-demo-data';
import '@techsquidtv/canvas-timeline-react/styles.css';
import '#www/demos/keyframe-opacity/timeline-editor.css';

const trackHeight = 64;
const keyframeSize = 6;
const keyframeValuePadding = opacityKeyframeValuePadding;
const previewLayerSelectors = {
  visuals: { trackKind: 'visual', sourceId: sampleSourceId },
} as const;
const sources = [{ sourceId: sampleSourceId, input: sampleMediaUrl }] as const;

interface InterpolationPreset {
  id: string;
  label: string;
  interpolation: TimelineKeyframeInterpolation;
  outgoingHandle?: TimelineKeyframeBezierHandle;
  incomingHandle?: TimelineKeyframeBezierHandle;
}

const interpolationPresets: InterpolationPreset[] = [
  { id: 'linear', label: 'Linear', interpolation: 'linear' },
  { id: 'hold', label: 'Hold', interpolation: 'hold' },
  {
    id: 'ease',
    label: 'Ease',
    interpolation: 'bezier',
    outgoingHandle: { x: 0.42, y: 0 },
    incomingHandle: { x: 0.58, y: 1 },
  },
  {
    id: 'ease-out',
    label: 'Out',
    interpolation: 'bezier',
    outgoingHandle: { x: 0.16, y: 1 },
    incomingHandle: { x: 0.3, y: 1 },
  },
];

function getInterpolationPresetId(interpolation: TimelineKeyframeInterpolation | undefined) {
  if (interpolation === 'hold') {
    return 'hold';
  }
  if (interpolation !== 'bezier') {
    return 'linear';
  }

  return 'ease';
}

function TrackKeyframeButton({
  track,
  label,
  locked,
}: {
  track: Track | null;
  label: string;
  locked: boolean;
}) {
  const { engine } = useTimeline();
  const playheadTime = useTimelinePlayheadTime();
  const clip = track ? findClipContainingTime(track, playheadTime) : null;
  const existingKeyframe = clip
    ? findOpacityKeyframeNearTime(clip, playheadTime, engine.zoomScale)
    : null;
  const evaluatedOpacity = clip
    ? (engine.getClipPropertyValueAtTime(clip.id, 'opacity', playheadTime) ?? clip.opacity ?? 1)
    : 1;
  const disabled = locked || !clip;

  const handleToggle = useCallback(() => {
    if (!clip || disabled) {
      return;
    }
    toggleOpacityKeyframeAtTime(engine, clip.id, playheadTime, evaluatedOpacity);
  }, [clip, disabled, engine, evaluatedOpacity, playheadTime]);

  return (
    <button
      type="button"
      className="timeline-editor-track-header-button timeline-editor-keyframe-button"
      onClick={handleToggle}
      disabled={disabled}
      title={
        existingKeyframe
          ? `Remove opacity keyframe from ${label}`
          : `Add opacity keyframe to ${label}`
      }
      aria-label={
        existingKeyframe
          ? `Remove opacity keyframe from ${label}`
          : `Add opacity keyframe to ${label}`
      }
      aria-pressed={Boolean(existingKeyframe)}
    >
      <Diamond aria-hidden="true" />
    </button>
  );
}

function TrackHeaderColumn() {
  const { state } = useTimeline();

  return (
    <Timeline.TrackHeaderList className="timeline-editor-track-headers">
      {state.tracks.map((track) => (
        <Timeline.TrackHeader key={track.id} trackId={track.id} geometry={{ trackHeight }}>
          {(header) => (
            <div className="timeline-editor-track-header-content timeline-editor-keyframe-track-header-content">
              <TrackKeyframeButton
                track={header.track}
                label={header.label}
                locked={header.locked}
              />
              <span className="timeline-editor-track-header-label">{header.label}</span>
              <Timeline.TrackHeaderResizeHandle trackId={track.id} />
            </div>
          )}
        </Timeline.TrackHeader>
      ))}
    </Timeline.TrackHeaderList>
  );
}

function TimelineLayers({
  onClipDoubleClick,
  onKeyframeDelete,
  onKeyframeDoubleClick,
}: {
  onClipDoubleClick: ComponentProps<typeof Timeline.ClipInteractionLayer>['onClipDoubleClick'];
  onKeyframeDelete: ComponentProps<typeof Timeline.KeyframeInteractionLayer>['onKeyframeDelete'];
  onKeyframeDoubleClick: ComponentProps<
    typeof Timeline.KeyframeInteractionLayer
  >['onKeyframeDoubleClick'];
}) {
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
      <Timeline.ClipInteractionLayer
        trackHeight={trackHeight}
        onClipDoubleClick={onClipDoubleClick}
      />
      <Timeline.KeyframeInteractionLayer
        property="opacity"
        selectedClipOnly
        trackHeight={trackHeight}
        keyframeSize={keyframeSize}
        keyframeValuePadding={keyframeValuePadding}
        onKeyframeDelete={onKeyframeDelete}
        onKeyframeDoubleClick={onKeyframeDoubleClick}
      />
      <Timeline.KeyframeTangentInteractionLayer
        property="opacity"
        selectedClipOnly
        selectedKeyframeOnly
        trackHeight={trackHeight}
        keyframeSize={keyframeSize}
        tangentHandleSize={7}
        keyframeValuePadding={keyframeValuePadding}
      />
      <Timeline.RangeSelector />
    </>
  );
}

function formatSeconds(seconds: number) {
  return `${seconds.toFixed(2)}s`;
}

function KeyframeOpacitySurface({ metrics }: { metrics?: DemoMetrics }) {
  const { engine } = useTimeline();
  const playheadTime = useTimelinePlayheadTime();
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const keyframes = useTimelineKeyframes({
    clipId: opacityClipId,
    property: 'opacity',
    selectedClipOnly: true,
    trackHeight,
    keyframeSize,
    keyframeValuePadding,
  });
  const selectedKeyframe = keyframes.keyframes.find((keyframe) => keyframe.selected);
  const evaluatedOpacity =
    keyframes.getPropertyValueAtTime(opacityClipId, 'opacity', playheadTime) ?? 1;
  const sliderValue = selectedKeyframe?.value ?? evaluatedOpacity;
  const activeTime = selectedKeyframe?.time ?? playheadTime;
  const interpolationPresetId = selectedKeyframe
    ? getInterpolationPresetId(
        selectedKeyframe.outgoing?.interpolation ?? selectedKeyframe.incoming?.interpolation
      )
    : null;
  const { mediaRef, playing, play, pause, ready } = useHTMLTimelineMedia({
    sources,
    layers: previewLayerSelectors,
    onError: (error) => {
      metrics?.onMediaLoadFailed?.({
        demoId: 'keyframe-opacity',
        adapter: 'html-media',
        mediaType: 'video',
      });
      setPlaybackError(error.message);
    },
  });

  const handlePlayPause = useCallback(async () => {
    if (playing) {
      pause();
      setPlaybackError(null);
      return;
    }

    const result = await play();
    setPlaybackError(result.ok ? null : result.message);
  }, [pause, play, playing]);

  const handleSetKeyframe = useCallback(() => {
    keyframes.setKeyframe({
      clipId: opacityClipId,
      property: 'opacity',
      time: playheadTime,
      value: evaluatedOpacity,
    });
  }, [evaluatedOpacity, keyframes, playheadTime]);

  const handleDeleteKeyframe = useCallback(() => {
    if (!selectedKeyframe) {
      return;
    }

    keyframes.removeKeyframe(opacityClipId, selectedKeyframe.id);
  }, [keyframes, selectedKeyframe]);

  const handleSetInterpolationPreset = useCallback(
    (preset: InterpolationPreset) => {
      if (!selectedKeyframe) {
        return;
      }

      const propertyKeyframes = engine
        .getClipKeyframes(opacityClipId, opacityKeyframeProperty.id)
        .sort((left, right) => toSeconds(left.time) - toSeconds(right.time));
      const selectedIndex = propertyKeyframes.findIndex(
        (keyframe) => keyframe.id === selectedKeyframe.id
      );
      const hasIncomingSegment = selectedIndex > 0;
      const hasOutgoingSegment = selectedIndex >= 0 && selectedIndex < propertyKeyframes.length - 1;
      const incomingPatch: TimelineKeyframeSidePatch | undefined = hasIncomingSegment
        ? {
            interpolation: preset.interpolation,
            ...(preset.incomingHandle === undefined ? {} : { handle: preset.incomingHandle }),
          }
        : undefined;
      const outgoingPatch: TimelineKeyframeSidePatch | undefined = hasOutgoingSegment
        ? {
            interpolation: preset.interpolation,
            ...(preset.outgoingHandle === undefined ? {} : { handle: preset.outgoingHandle }),
          }
        : undefined;

      if (incomingPatch === undefined && outgoingPatch === undefined) {
        return;
      }

      engine.updateClipKeyframeSides({
        clipId: opacityClipId,
        keyframeId: selectedKeyframe.id,
        incoming: incomingPatch,
        outgoing: outgoingPatch,
      });
    },
    [engine, selectedKeyframe]
  );

  const handleClipDoubleClick = useCallback<
    NonNullable<ComponentProps<typeof Timeline.ClipInteractionLayer>['onClipDoubleClick']>
  >((hit, details) => {
    const value = getOpacityValueFromClipViewportY(hit, details.viewportY);
    toggleOpacityKeyframeAtTime(details.engine, hit.clip.id, details.time, value);
  }, []);

  const handleKeyframeDoubleClick = useCallback<
    NonNullable<ComponentProps<typeof Timeline.KeyframeInteractionLayer>['onKeyframeDoubleClick']>
  >(
    (entry) => {
      keyframes.removeKeyframe(entry.clip.id, entry.keyframe.id);
    },
    [keyframes]
  );

  const handleKeyframeDelete = useCallback<
    NonNullable<ComponentProps<typeof Timeline.KeyframeInteractionLayer>['onKeyframeDelete']>
  >(
    (entry) => {
      keyframes.removeKeyframe(entry.clip.id, entry.keyframe.id);
    },
    [keyframes]
  );

  const handleOpacityChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.currentTarget.value);
      if (!Number.isFinite(value)) {
        return;
      }

      if (selectedKeyframe) {
        keyframes.updateKeyframe({
          clipId: opacityClipId,
          keyframeId: selectedKeyframe.id,
          value,
        });
        return;
      }

      keyframes.setKeyframe({
        clipId: opacityClipId,
        property: 'opacity',
        time: playheadTime,
        value,
      });
    },
    [keyframes, playheadTime, selectedKeyframe]
  );

  return (
    <div className="media-sync-demo keyframe-opacity-demo">
      <div className="media-sync-preview keyframe-opacity-preview">
        <div className="media-sync-monitor keyframe-opacity-monitor">
          <video
            ref={mediaRef}
            className="media-sync-video keyframe-opacity-video"
            preload="metadata"
            playsInline
            muted
            aria-label="Opacity keyframe preview"
            style={{ opacity: evaluatedOpacity }}
          />
          <button
            type="button"
            className="media-sync-button media-sync-play-button"
            onClick={handlePlayPause}
            disabled={!ready}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
        </div>
        <section
          className="media-sync-panel keyframe-opacity-panel"
          aria-label="Opacity keyframe controls"
        >
          <h3>Opacity Keyframes</h3>
          <p className="media-sync-status keyframe-opacity-status">
            {playbackError ?? (ready ? 'Ready' : 'Loading media')}
          </p>
          <dl className="media-sync-readout keyframe-opacity-readout">
            <dt>Timeline position</dt>
            <dd>{formatSeconds(toSeconds(playheadTime))}</dd>
            <dt>Opacity</dt>
            <dd>{Math.round(sliderValue * 100)}%</dd>
            <dt>{selectedKeyframe ? 'Selected keyframe' : 'Active time'}</dt>
            <dd>{formatSeconds(toSeconds(activeTime))}</dd>
            <dt>Curve</dt>
            <dd>
              {selectedKeyframe
                ? interpolationPresets.find((preset) => preset.id === interpolationPresetId)?.label
                : 'None'}
            </dd>
          </dl>
          <input
            className="keyframe-opacity-slider"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={sliderValue}
            aria-label="Opacity"
            onChange={handleOpacityChange}
          />
          <div className="keyframe-opacity-curve-controls" aria-label="Interpolation">
            {interpolationPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="media-sync-button keyframe-opacity-curve-button"
                onClick={() => {
                  handleSetInterpolationPreset(preset);
                }}
                disabled={!selectedKeyframe}
                aria-pressed={interpolationPresetId === preset.id}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="media-sync-controls keyframe-opacity-actions">
            <button
              type="button"
              className="media-sync-button keyframe-opacity-button"
              onClick={handleSetKeyframe}
              title="Set opacity keyframe"
            >
              <Plus aria-hidden="true" />
              Set
            </button>
            <button
              type="button"
              className="media-sync-button keyframe-opacity-button"
              onClick={handleDeleteKeyframe}
              disabled={!selectedKeyframe}
              title="Delete selected keyframe"
            >
              <Trash2 aria-hidden="true" />
              Delete
            </button>
          </div>
        </section>
      </div>

      <div className="timeline-shell timeline-editor-controls-shell keyframe-opacity-timeline-shell">
        <ResizablePanelGroup
          className="timeline-editor-body-with-headers"
          orientation="horizontal"
          resizeTargetMinimumSize={{ coarse: 28, fine: 8 }}
        >
          <ResizablePanel
            defaultSize="7.75rem"
            groupResizeBehavior="preserve-pixel-size"
            maxSize="16rem"
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
                    <CanvasRenderer
                      showClipLabels={false}
                      keyframeProperty={opacityKeyframeProperty.id}
                    />
                    <TimelineLayers
                      onClipDoubleClick={handleClipDoubleClick}
                      onKeyframeDelete={handleKeyframeDelete}
                      onKeyframeDoubleClick={handleKeyframeDoubleClick}
                    />
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
    </div>
  );
}

export function KeyframeOpacityTimeline({ metrics }: { metrics?: DemoMetrics }) {
  const engine = useMemo(
    () =>
      new TimelineEngine({
        duration: fromSeconds(sampleDurationSeconds),
        playheadTime: fromSeconds(0),
        zoomScale: 32,
        tracks: demoTracks,
        markers: demoMarkers,
        keyframeProperties: [opacityKeyframeProperty],
      }),
    []
  );

  return (
    <TimelineProvider engine={engine}>
      <KeyframeOpacitySurface metrics={metrics} />
    </TimelineProvider>
  );
}
