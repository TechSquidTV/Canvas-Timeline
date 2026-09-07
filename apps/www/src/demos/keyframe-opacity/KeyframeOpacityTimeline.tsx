import { KeyframeInspector } from '#www/demos/keyframe-opacity/KeyframeInspector';
import type { DemoMetrics } from '#www/demos/demo-instrumentation';
import {
  findClipContainingTime,
  findOpacityKeyframeAtTime,
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
import '#www/demos/keyframe-opacity/timeline-editor.css';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import type { TimelineReadonly, Track } from '@techsquidtv/canvas-timeline-core';
import { useHTMLTimelineMedia } from '@techsquidtv/canvas-timeline-html-media-adapter/react';
import {
  Timeline,
  TimelineProvider,
  useTimeline,
  useTimelinePlayheadTime,
} from '@techsquidtv/canvas-timeline-react';
import '@techsquidtv/canvas-timeline-react/styles.css';
import { CanvasRenderer } from '@techsquidtv/canvas-timeline-renderer';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { Diamond } from 'lucide-react';
import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import type { ComponentProps } from 'react';
import {
  Separator as ResizableHandle,
  Panel as ResizablePanel,
  Group as ResizablePanelGroup,
} from 'react-resizable-panels';
const trackHeight = 64;
const keyframeSize = 6;
const keyframeValuePadding = opacityKeyframeValuePadding;
const previewLayerSelectors = {
  visuals: { trackKind: 'visual', sourceId: sampleSourceId },
} as const;
const sources = [{ sourceId: sampleSourceId, input: sampleMediaUrl }] as const;

function TrackKeyframeButton({
  track,
  label,
  locked,
}: {
  track: TimelineReadonly<Track> | null;
  label: string;
  locked: boolean;
}) {
  const { engine } = useTimeline();
  const playheadTime = useTimelinePlayheadTime();
  const clip = track ? findClipContainingTime(track, playheadTime) : null;
  const existingKeyframe = clip ? findOpacityKeyframeAtTime(clip, playheadTime) : null;
  const evaluatedOpacity = clip
    ? (engine.keyframes.getClipPropertyValueAtTime(clip.id, 'opacity', playheadTime) ??
      clip.opacity ??
      1)
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

function KeyframeOpacitySurface({ metrics }: { metrics?: DemoMetrics }) {
  const { engine } = useTimeline();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
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

  const setVideoRef = useCallback(
    (element: HTMLVideoElement | null) => {
      videoRef.current = element;
      mediaRef(element);
    },
    [mediaRef]
  );
  const handlePlayPause = useCallback(async () => {
    if (playing) {
      pause();
      setPlaybackError(null);
      return;
    }

    const result = await play();
    setPlaybackError(result.ok ? null : result.message);
  }, [pause, play, playing]);

  useEffect(() => {
    const update = () => {
      if (videoRef.current) {
        videoRef.current.style.opacity = String(
          engine.keyframes.getClipPropertyValueAtTime(opacityClipId, 'opacity') ?? 1
        );
      }
    };
    update();
    const unsubscribeTime = engine.on('playhead:scrub', update);
    const unsubscribeRender = engine.on('render', update);
    return () => {
      unsubscribeTime();
      unsubscribeRender();
    };
  }, [engine, mediaRef]);
  const handleClipDoubleClick = useCallback<
    NonNullable<ComponentProps<typeof Timeline.ClipInteractionLayer>['onClipDoubleClick']>
  >((hit, details) => {
    const value =
      details.engine.keyframes.getClipPropertyValueAtTime(hit.clip.id, 'opacity', details.time) ??
      1;
    toggleOpacityKeyframeAtTime(details.engine, hit.clip.id, details.time, value);
  }, []);
  const handleKeyframeDoubleClick = useCallback<
    NonNullable<ComponentProps<typeof Timeline.KeyframeInteractionLayer>['onKeyframeDoubleClick']>
  >(
    (entry) => {
      engine.keyframes.selectKeyframes([{ clipId: entry.clip.id, keyframeId: entry.keyframe.id }]);
      engine.updatePlayhead(entry.keyframe.time);
    },
    [engine]
  );
  const handleKeyframeDelete = useCallback(() => {
    engine.commitEdit({
      type: 'keyframes',
      edits: engine.keyframes.getSelectedKeyframes().map((ref) => ({ type: 'remove', ...ref })),
    });
  }, [engine]);

  return (
    <div className="media-sync-demo keyframe-opacity-demo">
      <div className="media-sync-preview keyframe-opacity-preview">
        <div className="media-sync-monitor keyframe-opacity-monitor">
          <video
            ref={setVideoRef}
            className="media-sync-video keyframe-opacity-video"
            preload="metadata"
            playsInline
            muted
            aria-label="Opacity keyframe preview"
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
        <KeyframeInspector />
        {playbackError && <p role="alert">{playbackError}</p>}
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
        zoomConstraints: { frameRate: 30 },
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
