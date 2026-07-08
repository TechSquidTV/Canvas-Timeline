import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import {
  TimelineProvider,
  Timeline,
  useTimeline,
  useTimelinePlayheadTime,
} from '@techsquidtv/canvas-timeline-react';
import { useHTMLTimelineMedia } from '@techsquidtv/canvas-timeline-html-media-adapter';
import { CanvasRenderer } from '@techsquidtv/canvas-timeline-renderer';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  demoMarkers,
  demoTracks,
  sampleDurationSeconds,
  sampleMediaUrl,
  sampleSourceId,
} from '#www/demos/html-media-sync/timeline-demo-data';
import type { DemoMetrics } from '#www/demos/demo-instrumentation';
import '@techsquidtv/canvas-timeline-react/styles.css';

// Demo configuration
const playbackRates = [0.5, 1, 2] as const;
const previewLayerSelectors = {
  visuals: { trackKind: 'visual', sourceId: sampleSourceId },
} as const;

interface MediaReadout {
  status: string;
  sourceDuration: number | null;
  sourceTime: number | null;
}

function formatMediaSeconds(seconds: number | null, pendingLabel = 'Pending') {
  return seconds === null || !Number.isFinite(seconds) ? pendingLabel : `${seconds.toFixed(2)}s`;
}

// Timeline chrome
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

// HTML media preview and timeline sync
function HTMLMediaSyncSurface({ metrics }: { metrics?: DemoMetrics }) {
  const playheadTime = useTimelinePlayheadTime();
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaLoadStartedAtRef = useRef(performance.now());
  const decodeMetricReportedRef = useRef(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [mediaReadout, setMediaReadout] = useState<MediaReadout>({
    status: 'Loading media metadata.',
    sourceDuration: null,
    sourceTime: null,
  });

  // Adapter setup
  const sources = useMemo(
    () => ({
      [sampleSourceId]: sampleMediaUrl,
    }),
    []
  );
  const { playing, playbackRate, play, pause, setPlaybackRate, ready } = useHTMLTimelineMedia({
    ref: videoRef,
    sources,
    layers: previewLayerSelectors,
    onError: (message) => {
      metrics?.onMediaLoadFailed?.({
        demoId: 'html-media-sync',
        adapter: 'html-media',
        mediaType: 'video',
      });
      setPlaybackError(message);
    },
  });

  // Native media element readout
  const updateMediaReadout = useCallback((status?: string) => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }

    setMediaReadout((currentReadout) => ({
      status: status ?? currentReadout.status,
      sourceDuration: Number.isFinite(video.duration) ? video.duration : null,
      sourceTime: video.currentTime,
    }));
  }, []);

  const recordDecodeTime = useCallback(() => {
    if (decodeMetricReportedRef.current) {
      return;
    }

    decodeMetricReportedRef.current = true;
    metrics?.onMediaDecodeTime?.(
      {
        demoId: 'html-media-sync',
        adapter: 'html-media',
        mediaType: 'video',
      },
      performance.now() - mediaLoadStartedAtRef.current
    );
  }, [metrics]);

  const recordMediaLoadFailed = useCallback(() => {
    metrics?.onMediaLoadFailed?.({
      demoId: 'html-media-sync',
      adapter: 'html-media',
      mediaType: 'video',
    });
  }, [metrics]);

  // Transport controls
  const handlePlayPause = useCallback(async () => {
    if (playing) {
      pause();
      setPlaybackError(null);
      updateMediaReadout('Paused on timeline playhead.');
    } else {
      const result = await play();
      setPlaybackError(result.ok ? null : result.message);
      if (result.ok) {
        updateMediaReadout('Playing from native media element.');
      } else {
        recordMediaLoadFailed();
      }
    }
  }, [pause, play, playing, recordMediaLoadFailed, updateMediaReadout]);

  const readyStatus = ready ? mediaReadout.status : 'Connecting HTML media element.';

  return (
    <div className="media-sync-demo">
      <div className="media-sync-preview">
        <div className="media-sync-monitor">
          <video
            ref={videoRef}
            className="media-sync-video"
            preload="metadata"
            playsInline
            aria-label="HTML media preview"
            onLoadedMetadata={() => {
              recordDecodeTime();
              updateMediaReadout('Ready');
            }}
            onError={recordMediaLoadFailed}
            onDurationChange={() => updateMediaReadout()}
            onTimeUpdate={() => updateMediaReadout()}
            onSeeking={() => updateMediaReadout('Seeking source media.')}
            onWaiting={() => updateMediaReadout('Buffering media.')}
            onPlaying={() => updateMediaReadout('Playing from native media element.')}
            onPause={() => updateMediaReadout('Paused on timeline playhead.')}
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
        <section className="media-sync-panel" aria-label="HTML media sync controls">
          <h3>HTML Media Adapter Sync</h3>
          <p className="media-sync-status">{playbackError ?? readyStatus}</p>
          <dl className="media-sync-readout">
            <dt>Timeline position</dt>
            <dd>{formatMediaSeconds(toSeconds(playheadTime))}</dd>
            <dt>Element time</dt>
            <dd>{formatMediaSeconds(mediaReadout.sourceTime)}</dd>
            <dt>Source duration</dt>
            <dd>{formatMediaSeconds(mediaReadout.sourceDuration, 'Loading')}</dd>
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
            <CanvasRenderer />
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
export function HTMLMediaTimelineSync({ metrics }: { metrics?: DemoMetrics }) {
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
      <HTMLMediaSyncSurface metrics={metrics} />
    </TimelineProvider>
  );
}
