import type {
  MediaMetricEvent,
  TimelineMetricContext,
  TimelineMetricOperation,
  WorkerRenderMetric,
} from '#www/lib/metrics-common';

export interface DemoMetrics {
  onTimelineFpsSample?: (context: TimelineMetricContext, fps: number) => void;
  onTimelineFrameTimes?: (
    context: TimelineMetricContext,
    frameTimes: readonly number[],
    operation: TimelineMetricOperation
  ) => void;
  onTimelineInteractionLatencies?: (
    context: TimelineMetricContext,
    operation: TimelineMetricOperation,
    latencies: readonly number[]
  ) => void;
  onTimelineWorkerRenderStats?: (
    context: TimelineMetricContext,
    renderStats: readonly WorkerRenderMetric[]
  ) => void;
  onMediaLoadFailed?: (event: MediaMetricEvent) => void;
  onMediaDecodeTime?: (event: MediaMetricEvent, durationMs: number) => void;
}
