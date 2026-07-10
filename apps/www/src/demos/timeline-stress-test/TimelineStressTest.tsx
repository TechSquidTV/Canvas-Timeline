import { TimelineEngine, type Track } from '@techsquidtv/canvas-timeline-core';
import {
  TimelineProvider,
  Timeline,
  useTimeline,
  useTimelineVisibleClips,
} from '@techsquidtv/canvas-timeline-react';
import { CanvasRenderer, type CanvasRendererStats } from '@techsquidtv/canvas-timeline-renderer';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  generateStressTestData,
  initialNumTracks,
  initialClipsPerTrack,
  initialDurationSeconds,
} from '#www/demos/timeline-stress-test/timeline-demo-data';
import {
  BenchmarkControls,
  type BenchmarkDisplayOptions,
} from '#www/demos/timeline-stress-test/timeline-benchmark-controls';
import type { DemoMetrics } from '#www/demos/demo-instrumentation';
import { RulerDOM, DOMClip } from '#www/demos/react-dom-timeline/DOMTimelineComponents';
import '@techsquidtv/canvas-timeline-react/styles.css';

interface BenchmarkConfig {
  numTracks: number;
  clipsPerTrack: number;
  durationSeconds: number;
}

function TimelineLayers({ displayOptions }: { displayOptions: BenchmarkDisplayOptions }) {
  const { state } = useTimeline();

  const isDom = displayOptions.rendererType === 'dom';
  const tracks = state.tracks;

  return (
    <>
      {isDom && <RulerDOM ruler={{ format: 'seconds' }} showLabels={true} />}
      <Timeline.PlayheadArea />
      <Timeline.PlayheadGrabber />
      <Timeline.TrackList className="timeline-track-list-overlay">
        {isDom ? (
          <DOMTrackRows tracks={tracks} />
        ) : (
          tracks.map((track) => <Timeline.Track key={track.id} trackId={track.id} />)
        )}
      </Timeline.TrackList>
      <Timeline.ClipInteractionLayer />
      <Timeline.RangeSelector />
    </>
  );
}

function DOMTrackRows({ tracks }: { tracks: Track[] }) {
  const visibleClips = useTimelineVisibleClips();

  return (
    <>
      {tracks.map((track) => (
        <Timeline.Track key={track.id} trackId={track.id} className="timeline-dom-track">
          {visibleClips
            .filter((clip) => clip.track.id === track.id)
            .map((clip) => (
              <DOMClip key={clip.clip.id} clip={clip} showLabels={true} />
            ))}
        </Timeline.Track>
      ))}
    </>
  );
}

function InnerTimeline({
  displayOptions,
  onRenderStats,
}: {
  displayOptions: BenchmarkDisplayOptions;
  onRenderStats?: (stats: CanvasRendererStats) => void;
}) {
  return (
    <div className="timeline-stage">
      <Timeline.Root className="timeline-fill">
        {displayOptions.rendererType === 'canvas' && (
          <CanvasRenderer
            showClipLabels={true}
            showRulerLabels={true}
            onRenderStats={onRenderStats}
          />
        )}
        <TimelineLayers displayOptions={displayOptions} />
      </Timeline.Root>
    </div>
  );
}

export function TimelineStressTest({ metrics }: { metrics?: DemoMetrics }) {
  const [config, setConfig] = useState<BenchmarkConfig>({
    numTracks: initialNumTracks,
    clipsPerTrack: initialClipsPerTrack,
    durationSeconds: initialDurationSeconds,
  });
  const [displayOptions, setDisplayOptions] = useState<BenchmarkDisplayOptions>({
    rendererType: 'canvas',
  });
  const [collectRenderStats, setCollectRenderStats] = useState(false);
  const renderStatsRef = useRef<CanvasRendererStats[]>([]);

  const handleRenderStats = useCallback((stats: CanvasRendererStats) => {
    renderStatsRef.current.push(stats);
    if (renderStatsRef.current.length > 5000) {
      renderStatsRef.current.splice(0, renderStatsRef.current.length - 5000);
    }
  }, []);

  const { tracks, markers } = useMemo(() => {
    return generateStressTestData(config.numTracks, config.clipsPerTrack, config.durationSeconds);
  }, [config.numTracks, config.clipsPerTrack, config.durationSeconds]);

  const engine = useMemo(() => {
    return new TimelineEngine({
      duration: fromSeconds(config.durationSeconds),
      playheadTime: fromSeconds(0),
      zoomScale: 50,
      tracks,
      markers,
    });
  }, [tracks, markers, config.durationSeconds]);

  const totalClips = useMemo(() => {
    return tracks.reduce((sum, track) => sum + track.clips.length, 0);
  }, [tracks]);

  // Re-key the timeline container on engine changes to force clean mount/unmount of renderer & worker
  const engineKey = `${config.numTracks}-${config.clipsPerTrack}-${config.durationSeconds}`;

  return (
    <div className="timeline-stress-layout">
      {/* Benchmark controls panel */}
      <TimelineProvider engine={engine} key={engineKey}>
        <BenchmarkControls
          config={config}
          onApplyConfig={setConfig}
          totalClips={totalClips}
          displayOptions={displayOptions}
          onDisplayOptionsChange={setDisplayOptions}
          onCollectRenderStatsChange={setCollectRenderStats}
          renderStatsRef={renderStatsRef}
          metrics={metrics}
        />

        {/* Timeline shell */}
        <div className="timeline-shell">
          <InnerTimeline
            displayOptions={displayOptions}
            onRenderStats={collectRenderStats ? handleRenderStats : undefined}
          />

          {/* Bottom Scrollbar row */}
          <div className="timeline-scrollbar-row">
            <Timeline.ViewportScrollbar>
              <Timeline.ViewportScrollbarThumb>
                <Timeline.ViewportScrollbarHandle side="start" />
                <Timeline.ViewportScrollbarHandle side="end" />
              </Timeline.ViewportScrollbarThumb>
            </Timeline.ViewportScrollbar>
          </div>
        </div>
      </TimelineProvider>
    </div>
  );
}
