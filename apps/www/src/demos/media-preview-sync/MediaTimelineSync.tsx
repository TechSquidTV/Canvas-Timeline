import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import {
  TimelineProvider,
  Timeline,
  useTimeline,
  useTimelinePlayheadTime,
} from '@techsquidtv/canvas-timeline-react';
import { formatMediabunnyTime } from '@techsquidtv/canvas-timeline-mediabunny-adapter';
import {
  useMediabunnyFrameTime,
  useMediabunnyTimelineMedia,
} from '@techsquidtv/canvas-timeline-mediabunny-adapter/react';
import { CanvasRenderer } from '@techsquidtv/canvas-timeline-renderer';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  demoMarkers,
  demoTracks,
  sampleDurationSeconds,
  sampleMediaSource,
  sampleSourceId,
} from '#www/demos/media-preview-sync/timeline-demo-data';
import type { DemoMetrics } from '#www/demos/demo-instrumentation';
import '@techsquidtv/canvas-timeline-react/styles.css';

// Timeline layer selectors tell the adapter which active clips should drive preview outputs.
const playbackRates = [0.5, 1, 2] as const;
const previewLayerSelectors = {
  visuals: { trackKind: 'visual', sourceId: sampleSourceId },
  audio: { trackKind: 'audio', sourceId: sampleSourceId },
} as const;

function formatRenderedFrame(seconds: number | null) {
  return seconds === null ? 'Pending' : formatMediabunnyTime(seconds);
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

function MediaSyncSurface({ metrics }: { metrics?: DemoMetrics }) {
  const playheadTime = useTimelinePlayheadTime();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaLoadStartedAtRef = useRef(performance.now());
  const decodeMetricReportedRef = useRef(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // The source id joins app-owned media descriptors to timeline clips without storing media in timeline state.
  const sources = useMemo(() => [sampleMediaSource], []);
  const media = useMediabunnyTimelineMedia({
    canvasRef,
    frameRate: 30,
    sources,
    layers: previewLayerSelectors,
    onError: (error) => {
      metrics?.onMediaLoadFailed?.({
        demoId: 'media-sync',
        adapter: 'mediabunny',
        mediaType: 'video_audio',
      });
      setPlaybackError(error.message);
    },
  });
  const lastFrameTime = useMediabunnyFrameTime(media.adapter);
  const { ready, status, sourceStateById, playing, playbackRate, play, pause, setPlaybackRate } =
    media;

  useEffect(() => {
    if (!ready || decodeMetricReportedRef.current) {
      return;
    }

    decodeMetricReportedRef.current = true;
    metrics?.onMediaDecodeTime?.(
      {
        demoId: 'media-sync',
        adapter: 'mediabunny',
        mediaType: 'video_audio',
      },
      performance.now() - mediaLoadStartedAtRef.current
    );
  }, [metrics, ready]);

  // Transport controls
  const handlePlayPause = useCallback(async () => {
    if (playing) {
      pause();
      setPlaybackError(null);
    } else {
      const result = await play();
      setPlaybackError(result.ok ? null : result.message);
      if (!result.ok) {
        metrics?.onMediaLoadFailed?.({
          demoId: 'media-sync',
          adapter: 'mediabunny',
          mediaType: 'video_audio',
        });
      }
    }
  }, [metrics, pause, play, playing]);
  const mediaDuration = sourceStateById.get(sampleSourceId)?.metadata?.durationSeconds ?? null;

  return (
    <div className="media-sync-demo">
      <div className="media-sync-preview">
        <div className="media-sync-monitor">
          <canvas ref={canvasRef} className="media-sync-canvas" width={1280} height={720} />
          <button
            type="button"
            className="media-sync-button media-sync-play-button"
            onClick={handlePlayPause}
            disabled={!ready}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
        </div>
        <section className="media-sync-panel" aria-label="Media sync controls">
          <h3>Mediabunny Adapter Sync</h3>
          <p className="media-sync-status">{playbackError ?? status}</p>
          <dl className="media-sync-readout">
            <dt>Timeline position</dt>
            <dd>{formatMediabunnyTime(toSeconds(playheadTime))}</dd>
            <dt>Nearest frame</dt>
            <dd>{formatRenderedFrame(lastFrameTime)}</dd>
            <dt>Source duration</dt>
            <dd>{mediaDuration === null ? 'Loading' : formatMediabunnyTime(mediaDuration)}</dd>
          </dl>
          <div className="media-sync-controls">
            {playbackRates.map((rate) => (
              <button
                key={rate}
                type="button"
                className={`media-sync-button${
                  playbackRate === rate ? ' media-sync-button-active' : ''
                }`}
                onClick={() => setPlaybackRate(rate)}
                disabled={!ready}
              >
                {rate}x
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="timeline-shell">
        <div className="timeline-stage">
          <Timeline.Root className="timeline-fill">
            <CanvasRenderer ruler={{ format: 'timecode', frameRate: 30 }} />
            <TimelineLayers />
          </Timeline.Root>
        </div>
        <div className="timeline-scrollbar-row">
          <Timeline.ViewportScrollbar>
            <Timeline.ViewportScrollbarThumb>
              <Timeline.ViewportScrollbarHandle side="start" />
              <Timeline.ViewportScrollbarHandle side="end" />
            </Timeline.ViewportScrollbarThumb>
          </Timeline.ViewportScrollbar>
        </div>
      </div>
    </div>
  );
}

// Demo entrypoint
export function MediaTimelineSync({ metrics }: { metrics?: DemoMetrics }) {
  const engine = useMemo(
    () =>
      new TimelineEngine({
        duration: fromSeconds(sampleDurationSeconds),
        playheadTime: fromSeconds(0),
        zoomScale: 12,
        tracks: demoTracks,
        markers: demoMarkers,
      }),
    []
  );

  return (
    <TimelineProvider engine={engine}>
      <MediaSyncSurface metrics={metrics} />
    </TimelineProvider>
  );
}
