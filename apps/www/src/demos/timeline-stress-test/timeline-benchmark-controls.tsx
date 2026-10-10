import { useTimeline } from '@techsquidtv/canvas-timeline-react';
import type { CanvasRendererStats } from '@techsquidtv/canvas-timeline-renderer';
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
import type { DemoMetrics } from '#www/demos/demo-instrumentation';
import type { TimelineMetricContext } from '#www/lib/metrics-common';
import type { BenchmarkConfig } from '#www/demos/timeline-stress-test/timeline-demo-data';
import {
  benchmarkTitles,
  runTimelineBenchmark,
  type BenchmarkResult,
  type BenchmarkType,
} from '#www/demos/timeline-stress-test/timeline-benchmarks';

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
  const { engine } = useTimeline();

  // Local draft state for controls so slider dragging is smooth
  const [draftTracks, setDraftTracks] = useState(config.numTracks);
  const [draftClips, setDraftClips] = useState(config.clipsPerTrack);
  const [draftDuration, setDraftDuration] = useState(config.durationSeconds);
  const [draftKeyframes, setDraftKeyframes] = useState(config.keyframesPerClip);

  // FPS tracking
  const [fps, setFps] = useState(60);
  const fpsRef = useRef<{ frames: number; lastTime: number }>({ frames: 0, lastTime: 0 });

  // Benchmark scrubbing state
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const lastFpsMetricAtRef = useRef(0);

  const createMetricContext = useCallback(
    (): TimelineMetricContext => ({
      demoId: 'stress-test',
      renderer: displayOptions.rendererType,
      trackCount: config.numTracks,
      clipCount: totalClips,
      keyframeCount: totalClips * config.keyframesPerClip,
    }),
    [config.numTracks, config.keyframesPerClip, displayOptions.rendererType, totalClips]
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

  const runBenchmark = (type: BenchmarkType) => {
    if (cleanupRef.current !== null) {
      return;
    }
    setIsBenchmarking(true);
    setBenchmarkResult(null);
    renderStatsRef.current = [];
    const context: TimelineMetricContext = {
      ...createMetricContext(),
      benchmarkScope: type === 'commit' ? 'engine' : 'interactive',
    };
    cleanupRef.current = runTimelineBenchmark({
      engine,
      type,
      collectWorkerStats: displayOptions.rendererType === 'canvas',
      getWorkerStats: () => renderStatsRef.current,
      onMeasurementStart: () => {
        renderStatsRef.current = [];
        onCollectRenderStatsChange(
          displayOptions.rendererType === 'canvas' && (type === 'scrub' || type === 'zoom')
        );
      },
      onMeasurementEnd: () => onCollectRenderStatsChange(false),
      onResult: (result) => {
        cleanupRef.current = null;
        setIsBenchmarking(false);
        setBenchmarkResult(result);
        if (result.status !== 'complete') {
          return;
        }
        if (result.frameTimes.length > 0 && (type === 'scrub' || type === 'zoom')) {
          metrics?.onTimelineFrameTimes?.(context, result.frameTimes, type);
        }
        for (const sample of result.interactions) {
          metrics?.onTimelineInteractionLatencies?.(context, sample.operation, sample.values);
        }
        if (result.workerStats.length > 0) {
          metrics?.onTimelineWorkerRenderStats?.(
            context,
            result.workerStats.map((entry) => ({
              reason: entry.reason,
              durationMs: entry.drawDurationMs,
            }))
          );
        }
      },
    });
  };

  const handleApply = (e: FormEvent) => {
    e.preventDefault();
    cleanupRef.current?.();
    cleanupRef.current = null;
    setIsBenchmarking(false);
    setBenchmarkResult(null);
    onApplyConfig({
      numTracks: draftTracks,
      clipsPerTrack: draftClips,
      durationSeconds: draftDuration,
      keyframesPerClip: draftKeyframes,
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

        <div className="timeline-benchmark-control-group">
          <label htmlFor="input-keyframes">
            <span>Keyframes per Clip (data):</span>
            <span className="value-badge">{draftKeyframes}</span>
          </label>
          <input
            id="input-keyframes"
            type="range"
            min="0"
            max="16"
            value={draftKeyframes}
            onChange={(e) => setDraftKeyframes(parseInt(e.target.value, 10))}
            className="timeline-control-slider"
          />
        </div>

        <button type="submit" className="timeline-benchmark-submit-btn">
          Apply & Regenerate
        </button>
      </form>
      <p className="benchmark-note">
        Keyframe density adds edit, serialization, and history work. Keyframe curves are hidden in
        both renderers.
      </p>

      <div className="timeline-benchmark-diagnostics">
        <h3 className="timeline-benchmark-section-title">Diagnostics</h3>
        <div className="timeline-benchmark-control-group timeline-benchmark-control-group-spaced">
          <label htmlFor="select-renderer" className="timeline-benchmark-renderer-label">
            Renderer:
          </label>
          <select
            id="select-renderer"
            className="timeline-control-select"
            disabled={isBenchmarking}
            value={displayOptions.rendererType}
            onChange={(event) => {
              setBenchmarkResult(null);
              onDisplayOptionsChange((current) => ({
                ...current,
                rendererType: event.target.value as 'canvas' | 'dom',
              }));
            }}
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
          {(['scrub', 'zoom', 'drag', 'commit'] as const).map((type) => (
            <button
              key={type}
              type="button"
              className={`benchmark-btn ${isBenchmarking ? 'is-running' : ''}`}
              onClick={() => runBenchmark(type)}
              disabled={isBenchmarking}
            >
              {isBenchmarking ? 'Running...' : `Run ${benchmarkTitles[type]}`}
            </button>
          ))}
        </div>

        {/* Benchmark Results */}
        {benchmarkResult && (
          <div className="benchmark-results-card" role="status">
            <div className="results-header">
              <span className="results-title">{benchmarkTitles[benchmarkResult.type]} Results</span>
              {benchmarkResult.status === 'complete' && benchmarkResult.grade !== null && (
                <span className={`results-grade grade-${benchmarkResult.grade.charAt(0)}`}>
                  {benchmarkResult.grade}
                </span>
              )}
            </div>
            {benchmarkResult.status === 'complete' && (
              <div className="results-metrics">
                {benchmarkResult.metrics.map((metric) => (
                  <div className="metric-row" key={metric.label}>
                    <span>{metric.label}:</span>
                    <strong>{metric.value}</strong>
                  </div>
                ))}
              </div>
            )}
            <p className="benchmark-note">{benchmarkResult.note}</p>
          </div>
        )}
      </div>
    </div>
  );
}
