import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import type { TimelineEditPreview } from '@techsquidtv/canvas-timeline-core';
import type { CanvasRendererStats } from '@techsquidtv/canvas-timeline-renderer';
import { compareRational, fromSeconds, round, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import type { TimelineMetricOperation } from '#www/lib/metrics-common';

export type BenchmarkType = 'scrub' | 'zoom' | 'drag' | 'commit';

export const benchmarkTitles: Record<BenchmarkType, string> = {
  scrub: 'Scrub FPS',
  zoom: 'Zoom FPS',
  drag: 'Drag Preview',
  commit: 'Commit/Undo',
};

interface BenchmarkMetric {
  label: string;
  value: number | string;
}

interface InteractionSamples {
  operation: TimelineMetricOperation;
  values: number[];
}

export type BenchmarkResult =
  | { type: BenchmarkType; status: 'unavailable'; note: string }
  | {
      type: BenchmarkType;
      status: 'complete';
      grade: string | null;
      note: string;
      metrics: BenchmarkMetric[];
      frameTimes: number[];
      interactions: InteractionSamples[];
      workerStats: CanvasRendererStats[];
    };

interface BenchmarkOptions {
  engine: TimelineEngine;
  type: BenchmarkType;
  collectWorkerStats: boolean;
  getWorkerStats: () => CanvasRendererStats[];
  onMeasurementStart: () => void;
  onMeasurementEnd: () => void;
  onResult: (result: BenchmarkResult) => void;
}

const percentile = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0;
};

function timingMetrics(label: string, values: number[]): BenchmarkMetric[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  return [
    {
      label: `${label} Avg`,
      value: `${round(values.length > 0 ? total / values.length : 0, 2)}ms`,
    },
    { label: `${label} P95`, value: `${round(percentile(values), 2)}ms` },
    { label: `${label} Max`, value: `${round(values.length > 0 ? Math.max(...values) : 0, 2)}ms` },
  ];
}

function gradeForFrames(avgFps: number, minFps: number) {
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
}

/** Uses separate history with two retained documents, including at maximum data density. */
export function createCommitBenchmarkEngine(engine: TimelineEngine) {
  const state = engine.getState();
  return new TimelineEngine({
    tracks: state.tracks,
    markers: state.markers,
    clipGroups: state.clipGroups,
    duration: state.duration,
    zoomScale: state.zoomScale,
    keyframeProperties: engine.listKeyframeProperties(),
    history: { maxEntries: 2, maxBytes: Number.MAX_SAFE_INTEGER },
  });
}

/** Runs all workloads through one warmup, measurement, completion, and cancellation lifecycle. */
export function runTimelineBenchmark(options: BenchmarkOptions): () => void {
  const { engine, type } = options;
  const isFrameBenchmark = type === 'scrub' || type === 'zoom';
  const originalPlayhead = engine.playheadTime;
  const originalZoom = engine.zoomScale;
  const originalScroll = engine.scrollLeft;
  const frameTimes: number[] = [];
  const primaryTimes: number[] = [];
  const secondaryTimes: number[] = [];
  const eventCounts = { render: 0, settled: 0, zoom: 0, scroll: 0 };
  const unsubscribers: Array<() => void> = [];
  let measuring = false;
  let closed = false;
  let frameId = 0;
  let finishTimeout = 0;
  let measuredStartedAt: number | null = null;
  let lastFrameAt: number | null = null;
  let warmupStep = 0;
  let measuredStep = 0;
  let editEngine: TimelineEngine | null = null;
  const warmupSteps = type === 'commit' ? 5 : 30;
  const measuredSteps = type === 'commit' ? 40 : 240;

  const cleanup = () => {
    if (closed) {
      return;
    }
    closed = true;
    measuring = false;
    cancelAnimationFrame(frameId);
    window.clearTimeout(finishTimeout);
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    options.onMeasurementEnd();
    if (type === 'scrub') {
      engine.updatePlayhead(originalPlayhead);
    }
    if (type === 'zoom') {
      engine.setZoomScale(originalZoom);
      engine.setScrollLeft(originalScroll);
    }
    if (type === 'drag') {
      engine.cancelEdit();
    }
    editEngine = null;
  };

  const unavailable = (note: string) => {
    cleanup();
    options.onResult({ type, status: 'unavailable', note });
  };

  if (type === 'zoom') {
    const events = {
      render: 'render',
      settled: 'state:settled',
      zoom: 'zoom:change',
      scroll: 'scroll:change',
    } as const;
    for (const key of Object.keys(events) as Array<keyof typeof events>) {
      unsubscribers.push(
        engine.on(events[key], () => {
          if (measuring) {
            eventCounts[key]++;
          }
        })
      );
    }
  }

  const duration = toSeconds(engine.getState().duration ?? fromSeconds(120));
  const viewportWidth = engine.getState().viewportWidth ?? 1000;
  const minZoom = Math.max(
    duration > 0 ? viewportWidth / duration : originalZoom,
    originalZoom * 0.65
  );
  const maxZoom = Math.max(minZoom, originalZoom * 1.6);

  const recordPreview = (preview: TimelineEditPreview, elapsed: number) => {
    if (!measuring) {
      return;
    }
    (preview.valid ? primaryTimes : secondaryTimes).push(elapsed);
  };

  const performStep = (step: number) => {
    if (type === 'scrub' || type === 'zoom') {
      const startedAt = performance.now();
      if (type === 'scrub') {
        engine.updatePlayhead(fromSeconds(((step % 60) / 60) * Math.min(30, duration)));
      } else {
        const phase = (step / 60) * Math.PI * 2;
        engine.setZoomScale((minZoom + maxZoom) / 2 + (Math.sin(phase) * (maxZoom - minZoom)) / 2);
      }
      if (measuring) {
        primaryTimes.push(performance.now() - startedAt);
      }
      return;
    }
    const target =
      type === 'commit' ? (editEngine ??= createCommitBenchmarkEngine(engine)) : engine;
    const clip = target.tracks[0]?.clips[0];
    if (!clip) {
      throw new Error('No clips available. Add clips and regenerate the timeline.');
    }
    const originalStart = clip.timelineStart;
    const originalStartSec = toSeconds(originalStart);
    if (type === 'drag') {
      const startedAt = performance.now();
      const preview = target.previewEdit({
        type: 'move',
        clipId: step % 2 === 0 ? clip.id : 'benchmark-missing-clip',
        startTime: fromSeconds(
          Math.max(0, originalStartSec + Math.sin((step / measuredSteps) * Math.PI * 4) * 5)
        ),
      });
      recordPreview(preview, performance.now() - startedAt);
      return;
    }
    const commitStartedAt = performance.now();
    const result = target.commitEdit({
      type: 'move',
      clipId: clip.id,
      snap: false,
      startTime: fromSeconds(originalStartSec + 1 + (step % 2)),
    });
    const commitMs = performance.now() - commitStartedAt;
    if (!result.committed || !target.canUndo) {
      throw new Error('The edit did not create an undoable commit. No results recorded.');
    }
    const undoStartedAt = performance.now();
    target.undo();
    const undoMs = performance.now() - undoStartedAt;
    const restored = target.geometry.getClip(clip.id)?.clip;
    if (!restored || compareRational(restored.timelineStart, originalStart) !== 0) {
      throw new Error('Undo did not restore the clip. No results recorded.');
    }
    if (measuring) {
      primaryTimes.push(commitMs);
      secondaryTimes.push(undoMs);
    }
  };

  const finish = () => {
    if (closed) {
      return;
    }
    const workerStats =
      options.collectWorkerStats && isFrameBenchmark ? [...options.getWorkerStats()] : [];
    const metrics: BenchmarkMetric[] = [];
    let grade: string | null = null;
    const interactions: InteractionSamples[] = [];
    let note: string;
    if (isFrameBenchmark) {
      const totalMs = frameTimes.reduce((sum, value) => sum + value, 0);
      const avgFps = totalMs > 0 ? (frameTimes.length * 1000) / totalMs : 0;
      const minFps = frameTimes.length > 0 ? 1000 / Math.max(...frameTimes) : 0;
      grade = gradeForFrames(avgFps, minFps);
      metrics.push(
        { label: 'Average FPS', value: round(avgFps, 1) },
        { label: 'Minimum FPS', value: round(minFps, 1) },
        { label: 'P95 Frame', value: `${round(percentile(frameTimes), 1)}ms` },
        { label: 'Total Frames', value: frameTimes.length },
        ...timingMetrics(type === 'scrub' ? 'Playhead' : 'setZoom', primaryTimes)
      );
      if (type === 'zoom') {
        metrics.push({
          label: 'Engine Events',
          value: `r${eventCounts.render} / s${eventCounts.settled} / z${eventCounts.zoom} / x${eventCounts.scroll}`,
        });
      }
      if (options.collectWorkerStats) {
        metrics.push(
          { label: 'Worker Draws', value: workerStats.length },
          ...timingMetrics(
            'Worker',
            workerStats.map((stats) => stats.drawDurationMs)
          )
        );
      } else {
        metrics.push({ label: 'Worker Stats', value: 'N/A (DOM Mode)' });
      }
      interactions.push({ operation: type === 'zoom' ? 'zoom' : 'scrub', values: primaryTimes });
      note = `${type === 'zoom' ? 'Zoom exercises the displayed timeline and renderer.' : 'Scrub measures playhead movement against the displayed timeline.'} Timings exclude 30 warmup frames, followed by four measured seconds.`;
    } else if (type === 'drag') {
      metrics.push(
        { label: 'Accepted Previews', value: primaryTimes.length },
        ...timingMetrics('Accepted', primaryTimes),
        { label: 'Rejected Previews', value: secondaryTimes.length },
        ...timingMetrics('Rejected', secondaryTimes)
      );
      interactions.push(
        { operation: 'drag', values: primaryTimes },
        { operation: 'drag-rejected', values: secondaryTimes }
      );
      note =
        'Times previewEdit calls and live subscribers. Rejections use a missing clip ID. Pointer handling and paint latency are outside these timings.';
    } else {
      metrics.push(
        { label: 'Commit/Undo Pairs', value: primaryTimes.length },
        ...timingMetrics('Commit', primaryTimes),
        ...timingMetrics('Undo', secondaryTimes)
      );
      interactions.push(
        { operation: 'commit', values: primaryTimes },
        { operation: 'undo', values: secondaryTimes }
      );
      note =
        'Engine-only timings on an isolated copy, retaining two snapshots without a byte limit. Each undo is verified. The displayed document and its history are preserved.';
    }
    cleanup();
    options.onResult({
      type,
      status: 'complete',
      grade,
      note,
      metrics,
      frameTimes,
      interactions,
      workerStats,
    });
  };

  const tick = () => {
    if (closed) {
      return;
    }
    try {
      if (warmupStep < warmupSteps) {
        performStep(warmupStep++);
      } else {
        const now = performance.now();
        if (measuredStartedAt === null) {
          measuredStartedAt = now;
          options.onMeasurementStart();
          measuring = true;
        }
        if (lastFrameAt !== null && isFrameBenchmark) {
          frameTimes.push(now - lastFrameAt);
        }
        lastFrameAt = now;
        performStep(measuredStep++);
        if (isFrameBenchmark ? now - measuredStartedAt >= 4000 : measuredStep >= measuredSteps) {
          measuring = false;
          if (isFrameBenchmark && options.collectWorkerStats) {
            finishTimeout = window.setTimeout(finish, 100);
          } else {
            finish();
          }
          return;
        }
      }
      frameId = requestAnimationFrame(tick);
    } catch (error) {
      unavailable(
        error instanceof Error ? error.message : 'Benchmark failed. No results recorded.'
      );
    }
  };

  if (type !== 'commit') {
    engine.pause();
  }
  frameId = requestAnimationFrame(tick);
  return cleanup;
}
