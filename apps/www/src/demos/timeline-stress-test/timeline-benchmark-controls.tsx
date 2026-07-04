import { useTimeline } from '@techsquidtv/canvas-timeline-react';
import type { CanvasRendererStats } from '@techsquidtv/canvas-timeline-renderer';
import { fromSeconds, round, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import {
  type Dispatch,
  type FormEvent,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { DemoMetrics } from '../demo-instrumentation';
import type { TimelineMetricContext, TimelineMetricOperation } from '../../lib/metrics-common';

interface BenchmarkConfig {
  numTracks: number;
  clipsPerTrack: number;
  durationSeconds: number;
}

export interface BenchmarkDisplayOptions {
  rendererType: 'canvas' | 'dom';
}

interface BenchmarkControlsProps {
  config: BenchmarkConfig;
  onApplyConfig: (newConfig: BenchmarkConfig) => void;
  totalClips: number;
  displayOptions: BenchmarkDisplayOptions;
  onDisplayOptionsChange: Dispatch<SetStateAction<BenchmarkDisplayOptions>>;
  onCollectRenderStatsChange: (collect: boolean) => void;
  renderStatsRef: MutableRefObject<CanvasRendererStats[]>;
  metrics?: DemoMetrics;
}

const roundMetric = (value: number) => round(value, 1);

const percentile = (values: number[], ratio: number) => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
};

const gradeForFrames = (avgFps: number, minFps: number) => {
  if (avgFps >= 58 && minFps >= 45) {
    return 'S+';
  }
  if (avgFps >= 55 && minFps >= 40) {
    return 'A';
  }
  if (avgFps >= 45 && minFps >= 30) {
    return 'B';
  }
  if (avgFps >= 30 && minFps >= 20) {
    return 'C';
  }
  return 'D';
};

const summarizeFrames = (frameTimes: number[]) => {
  const totalFrames = frameTimes.length;
  const totalDurationSec = frameTimes.reduce((a, b) => a + b, 0) / 1000;
  const avgFps = totalDurationSec > 0 ? totalFrames / totalDurationSec : 0;
  const maxFrameMs = frameTimes.length > 0 ? Math.max(...frameTimes) : 0;
  const minFps = maxFrameMs > 0 ? 1000 / maxFrameMs : 0;

  return {
    avgFps,
    minFps,
    p95FrameMs: percentile(frameTimes, 0.95),
    totalFrames,
  };
};

const summarizeWorkerStats = (stats: CanvasRendererStats[]) => {
  const durations = stats.map((entry) => entry.drawDurationMs);
  const total = durations.reduce((a, b) => a + b, 0);

  return {
    workerDraws: stats.length,
    workerAvgMs: durations.length > 0 ? total / durations.length : 0,
    workerMaxMs: durations.length > 0 ? Math.max(...durations) : 0,
  };
};

export function BenchmarkControls({
  config,
  onApplyConfig,
  totalClips,
  displayOptions,
  onDisplayOptionsChange,
  onCollectRenderStatsChange,
  renderStatsRef,
  metrics,
}: BenchmarkControlsProps) {
  const configKey = [config.numTracks, config.clipsPerTrack, config.durationSeconds].join(':');

  return (
    <BenchmarkControlsInner
      key={configKey}
      config={config}
      onApplyConfig={onApplyConfig}
      totalClips={totalClips}
      displayOptions={displayOptions}
      onDisplayOptionsChange={onDisplayOptionsChange}
      onCollectRenderStatsChange={onCollectRenderStatsChange}
      renderStatsRef={renderStatsRef}
      metrics={metrics}
    />
  );
}

function BenchmarkControlsInner({
  config,
  onApplyConfig,
  totalClips,
  displayOptions,
  onDisplayOptionsChange,
  onCollectRenderStatsChange,
  renderStatsRef,
  metrics,
}: BenchmarkControlsProps) {
  const { engine, state } = useTimeline();

  // Local draft state for controls so slider dragging is smooth
  const [draftTracks, setDraftTracks] = useState(config.numTracks);
  const [draftClips, setDraftClips] = useState(config.clipsPerTrack);
  const [draftDuration, setDraftDuration] = useState(config.durationSeconds);

  // FPS tracking
  const [fps, setFps] = useState(60);
  const fpsRef = useRef<{ frames: number; lastTime: number }>({ frames: 0, lastTime: 0 });

  // Benchmark scrubbing state
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<{
    type: 'scrub' | 'zoom';
    avgFps: number;
    minFps: number;
    p95FrameMs: number;
    grade: string;
    frameCount: number;
    engineAvgMs?: number;
    engineMaxMs?: number;
    renderEvents?: number;
    settledEvents?: number;
    zoomEvents?: number;
    scrollEvents?: number;
    workerDraws?: number;
    workerAvgMs?: number;
    workerMaxMs?: number;
  } | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const benchmarkRunIdRef = useRef(0);
  const lastFpsMetricAtRef = useRef(0);

  const createMetricContext = useCallback(
    (): TimelineMetricContext => ({
      demoId: 'stress-test',
      renderer: displayOptions.rendererType,
      trackCount: config.numTracks,
      clipCount: totalClips,
    }),
    [config.numTracks, displayOptions.rendererType, totalClips]
  );

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      onCollectRenderStatsChange(false);
    };
  }, [onCollectRenderStatsChange]);

  // Monitor FPS in the background
  useEffect(() => {
    let animId: number;
    fpsRef.current.lastTime = performance.now();

    const tick = () => {
      const now = performance.now();
      fpsRef.current.frames++;

      if (now - fpsRef.current.lastTime >= 500) {
        const computedFps = Math.round(
          (fpsRef.current.frames * 1000) / (now - fpsRef.current.lastTime)
        );
        setFps(computedFps);
        if (now - lastFpsMetricAtRef.current >= 5000) {
          metrics?.onTimelineFpsSample?.(createMetricContext(), computedFps);
          lastFpsMetricAtRef.current = now;
        }
        fpsRef.current.frames = 0;
        fpsRef.current.lastTime = now;
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [createMetricContext, metrics]);

  const reportBenchmarkMetrics = (
    operation: TimelineMetricOperation,
    frameTimes: readonly number[],
    interactionLatencies: readonly number[]
  ) => {
    const context = createMetricContext();

    metrics?.onTimelineFrameTimes?.(context, frameTimes, operation);
    metrics?.onTimelineInteractionLatencies?.(context, operation, interactionLatencies);
    metrics?.onTimelineWorkerRenderStats?.(
      context,
      renderStatsRef.current.map((entry) => ({
        reason: entry.reason,
        durationMs: entry.drawDurationMs,
      }))
    );
  };

  // Automated Benchmark Scrubbing
  const runScrubBenchmark = () => {
    if (isBenchmarking) {
      return;
    }

    cleanupRef.current?.();
    const runId = benchmarkRunIdRef.current + 1;
    benchmarkRunIdRef.current = runId;
    let animationFrameId = 0;
    let cancelled = false;
    const cleanup = () => {
      cancelled = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      onCollectRenderStatsChange(false);
    };
    cleanupRef.current = cleanup;

    setIsBenchmarking(true);
    setBenchmarkResult(null);
    renderStatsRef.current = [];
    onCollectRenderStatsChange(true);

    const duration = toSeconds(state.duration || fromSeconds(config.durationSeconds));
    const originalPlayhead = toSeconds(state.playheadTime);

    // Pause playback if running to control scrub exclusively
    engine.pause();

    const frameTimes: number[] = [];
    const interactionLatencies: number[] = [];
    let lastFrameTime = performance.now();
    let elapsedFrames = 0;
    const testDurationMs = 4000; // 4 seconds test
    const startTime = performance.now();

    const benchmarkStep = () => {
      if (cancelled || benchmarkRunIdRef.current !== runId) {
        return;
      }

      const now = performance.now();
      const delta = now - lastFrameTime;
      lastFrameTime = now;

      // Track frame times (ms per frame)
      if (elapsedFrames > 0) {
        frameTimes.push(delta);
      }
      elapsedFrames++;

      // Programmatically advance playhead over a range
      const testElapsed = now - startTime;
      const progress = (testElapsed % 1000) / 1000; // loop playhead position every 1s
      const nextTimeSec = progress * Math.min(30, duration); // scrub within the first 30 seconds

      const updateStartedAt = performance.now();
      engine.updatePlayhead(fromSeconds(nextTimeSec));
      interactionLatencies.push(performance.now() - updateStartedAt);

      if (testElapsed < testDurationMs) {
        animationFrameId = requestAnimationFrame(benchmarkStep);
      } else {
        // Benchmark complete! Analyze results
        cleanupRef.current = null;
        onCollectRenderStatsChange(false);
        setIsBenchmarking(false);
        engine.updatePlayhead(fromSeconds(originalPlayhead)); // restore original playhead
        engine.settle();

        const frameSummary = summarizeFrames(frameTimes);
        const workerSummary = summarizeWorkerStats(renderStatsRef.current);
        reportBenchmarkMetrics('scrub', frameTimes, interactionLatencies);

        setBenchmarkResult({
          type: 'scrub',
          avgFps: roundMetric(frameSummary.avgFps),
          minFps: roundMetric(frameSummary.minFps),
          p95FrameMs: roundMetric(frameSummary.p95FrameMs),
          grade: gradeForFrames(frameSummary.avgFps, frameSummary.minFps),
          frameCount: frameSummary.totalFrames,
          workerDraws: workerSummary.workerDraws,
          workerAvgMs: roundMetric(workerSummary.workerAvgMs),
          workerMaxMs: roundMetric(workerSummary.workerMaxMs),
        });
      }
    };

    animationFrameId = requestAnimationFrame(benchmarkStep);
  };

  const runZoomBenchmark = () => {
    if (isBenchmarking) {
      return;
    }

    cleanupRef.current?.();
    const runId = benchmarkRunIdRef.current + 1;
    benchmarkRunIdRef.current = runId;
    let animationFrameId = 0;
    let finishTimeoutId = 0;
    let cancelled = false;
    let unsubscribers: Array<() => void> = [];
    const cleanup = () => {
      cancelled = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (finishTimeoutId) {
        window.clearTimeout(finishTimeoutId);
      }
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      unsubscribers = [];
      onCollectRenderStatsChange(false);
    };
    cleanupRef.current = cleanup;

    setIsBenchmarking(true);
    setBenchmarkResult(null);
    renderStatsRef.current = [];
    onCollectRenderStatsChange(true);

    const originalZoom = engine.zoomScale;
    const originalScrollLeft = engine.scrollLeft;
    const viewportWidth = state.viewportWidth || 1000;
    const duration = toSeconds(state.duration || fromSeconds(config.durationSeconds));
    const minAllowedZoom = duration > 0 ? viewportWidth / duration : originalZoom;
    const minZoom = Math.max(minAllowedZoom, originalZoom * 0.65);
    const maxZoom = Math.max(minZoom, originalZoom * 1.6);
    const midZoom = (minZoom + maxZoom) / 2;
    const zoomAmplitude = (maxZoom - minZoom) / 2;

    engine.pause();

    const frameTimes: number[] = [];
    const engineTimes: number[] = [];
    const eventCounts = {
      render: 0,
      settled: 0,
      zoom: 0,
      scroll: 0,
    };
    unsubscribers = [
      engine.on('render', () => {
        eventCounts.render++;
      }),
      engine.on('state:settled', () => {
        eventCounts.settled++;
      }),
      engine.on('zoom:change', () => {
        eventCounts.zoom++;
      }),
      engine.on('scroll:change', () => {
        eventCounts.scroll++;
      }),
    ];

    let lastFrameTime = performance.now();
    let elapsedFrames = 0;
    const testDurationMs = 4000;
    const startTime = performance.now();

    const finishBenchmark = () => {
      if (cancelled || benchmarkRunIdRef.current !== runId) {
        return;
      }

      cleanupRef.current = null;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      unsubscribers = [];
      onCollectRenderStatsChange(false);

      engine.setZoomScale(originalZoom);
      engine.setScrollLeft(originalScrollLeft);
      engine.settle();

      const frameSummary = summarizeFrames(frameTimes);
      const workerSummary = summarizeWorkerStats(renderStatsRef.current);
      const totalEngineMs = engineTimes.reduce((a, b) => a + b, 0);
      reportBenchmarkMetrics('zoom', frameTimes, engineTimes);

      setIsBenchmarking(false);
      setBenchmarkResult({
        type: 'zoom',
        avgFps: roundMetric(frameSummary.avgFps),
        minFps: roundMetric(frameSummary.minFps),
        p95FrameMs: roundMetric(frameSummary.p95FrameMs),
        grade: gradeForFrames(frameSummary.avgFps, frameSummary.minFps),
        frameCount: frameSummary.totalFrames,
        engineAvgMs: roundMetric(engineTimes.length > 0 ? totalEngineMs / engineTimes.length : 0),
        engineMaxMs: roundMetric(engineTimes.length > 0 ? Math.max(...engineTimes) : 0),
        renderEvents: eventCounts.render,
        settledEvents: eventCounts.settled,
        zoomEvents: eventCounts.zoom,
        scrollEvents: eventCounts.scroll,
        workerDraws: workerSummary.workerDraws,
        workerAvgMs: roundMetric(workerSummary.workerAvgMs),
        workerMaxMs: roundMetric(workerSummary.workerMaxMs),
      });
    };

    const benchmarkStep = () => {
      if (cancelled || benchmarkRunIdRef.current !== runId) {
        return;
      }

      const now = performance.now();
      const delta = now - lastFrameTime;
      lastFrameTime = now;

      if (elapsedFrames > 0) {
        frameTimes.push(delta);
      }
      elapsedFrames++;

      const testElapsed = now - startTime;
      const phase = (testElapsed / 1000) * Math.PI * 2;
      const nextZoom = midZoom + Math.sin(phase) * zoomAmplitude;
      const updateStartedAt = performance.now();
      engine.setZoomScale(nextZoom);
      engineTimes.push(performance.now() - updateStartedAt);

      if (testElapsed < testDurationMs) {
        animationFrameId = requestAnimationFrame(benchmarkStep);
      } else {
        finishTimeoutId = window.setTimeout(finishBenchmark, 100);
      }
    };

    animationFrameId = requestAnimationFrame(benchmarkStep);
  };

  const handleApply = (e: FormEvent) => {
    e.preventDefault();
    cleanupRef.current?.();
    cleanupRef.current = null;
    benchmarkRunIdRef.current++;
    setIsBenchmarking(false);
    onApplyConfig({
      numTracks: draftTracks,
      clipsPerTrack: draftClips,
      durationSeconds: draftDuration,
    });
  };

  return (
    <div className="timeline-benchmark-panel">
      {/* Configuration Form */}
      <form onSubmit={handleApply} className="timeline-benchmark-form">
        <h3 className="timeline-benchmark-section-title">Configure Stress Test</h3>

        <div className="timeline-benchmark-control-group">
          <label htmlFor="input-tracks">
            <span>Tracks:</span>
            <span className="value-badge">{draftTracks}</span>
          </label>
          <input
            id="input-tracks"
            type="range"
            min="1"
            max="250"
            value={draftTracks}
            onChange={(e) => setDraftTracks(parseInt(e.target.value, 10))}
            className="timeline-control-slider"
          />
        </div>

        <div className="timeline-benchmark-control-group">
          <label htmlFor="input-clips">
            <span>Clips per Track:</span>
            <span className="value-badge">{draftClips}</span>
          </label>
          <input
            id="input-clips"
            type="range"
            min="0"
            max="50"
            value={draftClips}
            onChange={(e) => setDraftClips(parseInt(e.target.value, 10))}
            className="timeline-control-slider"
          />
        </div>

        <div className="timeline-benchmark-control-group">
          <label htmlFor="input-duration">
            <span>Duration:</span>
            <span className="value-badge">{draftDuration}s</span>
          </label>
          <input
            id="input-duration"
            type="range"
            min="10"
            max="1800"
            step="10"
            value={draftDuration}
            onChange={(e) => setDraftDuration(parseInt(e.target.value, 10))}
            className="timeline-control-slider"
          />
        </div>

        <button type="submit" className="timeline-benchmark-submit-btn">
          Apply & Regenerate
        </button>
      </form>

      <div className="timeline-benchmark-diagnostics">
        <h3 className="timeline-benchmark-section-title">Diagnostics</h3>
        <div className="timeline-benchmark-control-group timeline-benchmark-control-group-spaced">
          <label htmlFor="select-renderer" className="timeline-benchmark-renderer-label">
            Renderer:
          </label>
          <select
            id="select-renderer"
            className="timeline-control-select"
            value={displayOptions.rendererType}
            onChange={(event) =>
              onDisplayOptionsChange((current) => ({
                ...current,
                rendererType: event.target.value as 'canvas' | 'dom',
              }))
            }
          >
            <option value="canvas">Canvas (Worker)</option>
            <option value="dom">React DOM (Main Thread)</option>
          </select>
        </div>
      </div>

      {/* Performance HUD */}
      <div className="timeline-performance-hud">
        <h3 className="timeline-benchmark-section-title">Performance Monitor</h3>

        <div className="hud-grid">
          <div className="hud-card">
            <span className="hud-label">FPS</span>
            <span
              className={`hud-value ${fps >= 55 ? 'value-good' : fps >= 30 ? 'value-warning' : 'value-bad'}`}
            >
              {fps}
            </span>
          </div>
          <div className="hud-card">
            <span className="hud-label">Tracks</span>
            <span className="hud-value value-neutral">{config.numTracks}</span>
          </div>
          <div className="hud-card">
            <span className="hud-label">Total Clips</span>
            <span className="hud-value value-neutral">{totalClips}</span>
          </div>
        </div>

        {/* Benchmark controls */}
        <div className="benchmark-action-area">
          <button
            type="button"
            className={`benchmark-btn ${isBenchmarking ? 'is-running' : ''}`}
            onClick={runScrubBenchmark}
            disabled={isBenchmarking}
          >
            {isBenchmarking ? 'Running...' : 'Run Scrub FPS'}
          </button>
          <button
            type="button"
            className={`benchmark-btn ${isBenchmarking ? 'is-running' : ''}`}
            onClick={runZoomBenchmark}
            disabled={isBenchmarking}
          >
            {isBenchmarking ? 'Running...' : 'Run Zoom FPS'}
          </button>
        </div>

        {/* Benchmark Results */}
        {benchmarkResult && (
          <div className="benchmark-results-card">
            <div className="results-header">
              <span className="results-title">
                {benchmarkResult.type === 'zoom' ? 'Zoom FPS Results' : 'Scrub FPS Results'}
              </span>
              <span className={`results-grade grade-${benchmarkResult.grade.charAt(0)}`}>
                {benchmarkResult.grade}
              </span>
            </div>
            <div className="results-metrics">
              <div className="metric-row">
                <span>Average FPS:</span>
                <strong>{benchmarkResult.avgFps}</strong>
              </div>
              <div className="metric-row">
                <span>Minimum FPS:</span>
                <strong>{benchmarkResult.minFps}</strong>
              </div>
              <div className="metric-row">
                <span>P95 Frame:</span>
                <strong>{benchmarkResult.p95FrameMs}ms</strong>
              </div>
              <div className="metric-row">
                <span>Total Frames:</span>
                <strong>{benchmarkResult.frameCount}</strong>
              </div>
              {benchmarkResult.type === 'zoom' && (
                <>
                  <div className="metric-row">
                    <span>setZoom Avg:</span>
                    <strong>{benchmarkResult.engineAvgMs}ms</strong>
                  </div>
                  <div className="metric-row">
                    <span>setZoom Max:</span>
                    <strong>{benchmarkResult.engineMaxMs}ms</strong>
                  </div>
                  <div className="metric-row">
                    <span>Engine Events:</span>
                    <strong>
                      r{benchmarkResult.renderEvents} / s{benchmarkResult.settledEvents} / z
                      {benchmarkResult.zoomEvents} / x{benchmarkResult.scrollEvents}
                    </strong>
                  </div>
                </>
              )}
              {displayOptions.rendererType === 'canvas' ? (
                <>
                  <div className="metric-row">
                    <span>Worker Draws:</span>
                    <strong>{benchmarkResult.workerDraws}</strong>
                  </div>
                  <div className="metric-row">
                    <span>Worker Avg:</span>
                    <strong>{benchmarkResult.workerAvgMs}ms</strong>
                  </div>
                  <div className="metric-row">
                    <span>Worker Max:</span>
                    <strong>{benchmarkResult.workerMaxMs}ms</strong>
                  </div>
                </>
              ) : (
                <div className="metric-row">
                  <span>Worker Stats:</span>
                  <strong>N/A (DOM Mode)</strong>
                </div>
              )}
            </div>
            <p className="benchmark-note">
              {benchmarkResult.type === 'zoom'
                ? 'Zoom exercises full render, settle, scrollbar, DOM row, worker clone, ruler, clip, and text drawing paths.'
                : 'Scrub isolates playhead movement against the current canvas and interaction layer density.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
