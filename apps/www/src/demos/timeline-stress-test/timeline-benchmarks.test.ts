import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { opacityKeyframeProperty } from '#www/demos/demo-keyframe-properties';
import { generateStressTestData } from '#www/demos/timeline-stress-test/timeline-demo-data';
import {
  createCommitBenchmarkEngine,
  runTimelineBenchmark,
  type BenchmarkResult,
  type BenchmarkType,
} from '#www/demos/timeline-stress-test/timeline-benchmarks';
import { timelineMetricAttributes } from '#www/lib/metrics-common';

function createEngine(clips = 8, keyframes = 4, maxBytes = 16 * 1024 * 1024) {
  return new TimelineEngine({
    ...generateStressTestData(2, clips, 120, keyframes),
    duration: fromSeconds(120),
    keyframeProperties: [opacityKeyframeProperty],
    history: { maxBytes },
  });
}

function startBenchmark(engine: TimelineEngine, type: BenchmarkType) {
  const onResult = vi.fn<(result: BenchmarkResult) => void>();
  const onMeasurementStart = vi.fn();
  const onMeasurementEnd = vi.fn();
  const cancel = runTimelineBenchmark({
    engine,
    type,
    collectWorkerStats: false,
    getWorkerStats: () => [],
    onMeasurementStart,
    onMeasurementEnd,
    onResult,
  });
  return { cancel, onResult, onMeasurementStart, onMeasurementEnd };
}

function fakeFrames(frameMs = 16) {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), frameMs)
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  fakeFrames();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('timeline benchmarks', () => {
  it('initializes generated keyframes with registered properties and stable in-clip times', () => {
    const engine = createEngine(50, 16);
    for (const track of engine.tracks) {
      for (const clip of track.clips) {
        expect(clip.keyframes).toHaveLength(16);
        for (const keyframe of clip.keyframes ?? []) {
          expect(engine.hasKeyframeProperty(keyframe.property)).toBe(true);
          expect(toSeconds(keyframe.time)).toBeGreaterThan(toSeconds(clip.timelineStart));
          expect(toSeconds(keyframe.time)).toBeLessThan(toSeconds(clip.timelineEnd));
        }
      }
    }
  });

  it('keeps commit/undo available independently of the displayed history budget', () => {
    const engine = createEngine(8, 16, 1);
    const before = engine.getState().tracks;
    const isolated = createCommitBenchmarkEngine(engine);
    const clip = isolated.tracks[0].clips[0];
    expect(
      isolated.commitEdit({ type: 'move', clipId: clip.id, snap: false, startTime: fromSeconds(1) })
        .committed
    ).toBe(true);
    expect(isolated.canUndo).toBe(true);
    isolated.undo();
    expect(isolated.tracks).toEqual(before);
    expect(engine.tracks).toBe(before);
    expect(engine.canUndo).toBe(false);
  });

  it('measures successful commit/undo pairs while preserving document, undo, and redo history', () => {
    const engine = createEngine();
    engine.commitEdit({ type: 'move', clipId: 'clip-0-0', snap: false, startTime: fromSeconds(1) });
    engine.undo();
    const before = engine.getState().tracks;
    const run = startBenchmark(engine, 'commit');
    vi.advanceTimersByTime(1000);
    const result = run.onResult.mock.calls[0]?.[0];
    expect(result?.status).toBe('complete');
    if (result?.status !== 'complete') {
      throw new Error('Expected completed benchmark');
    }
    expect(result.interactions.map((sample) => [sample.operation, sample.values.length])).toEqual([
      ['commit', 40],
      ['undo', 40],
    ]);
    expect(result.workerStats).toEqual([]);
    expect(engine.tracks).toBe(before);
    expect(engine.canRedo).toBe(true);
    engine.redo();
    expect(engine.geometry.getClip('clip-0-0')?.clip.timelineStart).toEqual(fromSeconds(1));
  });

  it('separates actual accepted/rejected previews and cancels the transient edit', () => {
    const engine = createEngine();
    const before = engine.tracks;
    const run = startBenchmark(engine, 'drag');
    vi.advanceTimersByTime(5000);
    const result = run.onResult.mock.calls[0]?.[0];
    if (result?.status !== 'complete') {
      throw new Error('Expected completed benchmark');
    }
    expect(result.interactions.map((sample) => [sample.operation, sample.values.length])).toEqual([
      ['drag', 120],
      ['drag-rejected', 120],
    ]);
    expect(engine.tracks).toBe(before);
    expect(engine.getRenderState().tracks).toEqual(before);
    expect(engine.canUndo).toBe(false);
  });

  it.each(['scrub', 'zoom', 'drag', 'commit'] as const)(
    'cancels %s without later completion or leftover preview/viewport changes',
    (type) => {
      const engine = createEngine();
      engine.updatePlayhead(fromSeconds(9));
      engine.setScrollLeft(12);
      const before = engine.getState();
      const run = startBenchmark(engine, type);
      vi.advanceTimersByTime(type === 'commit' ? 160 : 1000);
      run.cancel();
      run.cancel();
      vi.advanceTimersByTime(10000);
      expect(run.onResult).not.toHaveBeenCalled();
      expect(run.onMeasurementEnd).toHaveBeenCalledTimes(1);
      expect(engine.getRenderState().tracks).toEqual(before.tracks);
      expect(engine.zoomScale).toBe(before.zoomScale);
      expect(engine.scrollLeft).toBe(before.scrollLeft);
      expect(engine.playheadTime).toEqual(before.playheadTime);
    }
  );

  it('measures four full seconds after warmup even at two frames per second', () => {
    fakeFrames(500);
    const run = startBenchmark(createEngine(), 'scrub');
    vi.advanceTimersByTime(15000);
    expect(run.onMeasurementStart).not.toHaveBeenCalled();
    expect(run.onResult).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    const result = run.onResult.mock.calls[0]?.[0];
    if (result?.status !== 'complete') {
      throw new Error('Expected completed benchmark');
    }
    expect(result.frameTimes).toHaveLength(8);
    expect(result.frameTimes.reduce((sum, value) => sum + value, 0)).toBe(4000);
    expect(result.interactions[0].values).toHaveLength(9);
  });

  it('collects worker samples after warmup and freezes results before restoring zoom', () => {
    const engine = createEngine();
    const onResult = vi.fn<(result: BenchmarkResult) => void>();
    let collecting = false;
    const workerStats: Array<{
      reason: 'state';
      startedAt: number;
      completedAt: number;
      drawDurationMs: number;
    }> = [];
    engine.on('zoom:change', () => {
      if (collecting) {
        workerStats.push({
          reason: 'state',
          startedAt: performance.now(),
          completedAt: performance.now() + 2,
          drawDurationMs: 2,
        });
      }
    });
    runTimelineBenchmark({
      engine,
      type: 'zoom',
      collectWorkerStats: true,
      getWorkerStats: () => workerStats,
      onMeasurementStart: () => {
        collecting = true;
      },
      onMeasurementEnd: () => {
        collecting = false;
      },
      onResult,
    });
    vi.advanceTimersByTime(480);
    expect(workerStats).toHaveLength(0);
    vi.advanceTimersByTime(5000);
    const result = onResult.mock.calls[0]?.[0];
    if (result?.status !== 'complete') {
      throw new Error('Expected completed benchmark');
    }
    expect(result.workerStats.length).toBeGreaterThan(0);
    expect(result.workerStats.every((sample) => sample.startedAt >= 496)).toBe(true);
    expect(result.workerStats).toEqual(workerStats);
  });

  it.each(['drag', 'commit'] as const)(
    'reports unavailable %s rather than recording empty successful results',
    (type) => {
      const run = startBenchmark(createEngine(0, 0), type);
      vi.advanceTimersByTime(1000);
      expect(run.onResult.mock.calls[0]?.[0]).toEqual({
        type,
        status: 'unavailable',
        note: 'No clips available. Add clips and regenerate the timeline.',
      });
    }
  );

  it('includes density and engine scope in benchmark telemetry', () => {
    expect(
      timelineMetricAttributes({
        demoId: 'stress-test',
        renderer: 'canvas',
        trackCount: 2,
        clipCount: 16,
        keyframeCount: 256,
        benchmarkScope: 'engine',
      })
    ).toMatchObject({ keyframe_count_bucket: '101-500', benchmark_scope: 'engine' });
  });
});
