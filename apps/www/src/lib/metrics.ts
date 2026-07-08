import * as Sentry from '@sentry/astro';
import {
  normalizeMetricRoute,
  sampleMetricItems,
  sampleMetricValues,
  timelineMetricAttributes,
  type MediaMetricEvent,
  type MetricAttributes,
  type TimelineMetricContext,
  type TimelineMetricOperation,
  type WorkerRenderMetric,
} from '#www/lib/metrics-common';

const millisecondUnit = 'millisecond';

function count(name: string, attributes: MetricAttributes) {
  Sentry.metrics.count(name, 1, { attributes });
}

function gauge(name: string, value: number, attributes: MetricAttributes) {
  Sentry.metrics.gauge(name, value, { attributes });
}

function distribution(
  name: string,
  value: number,
  attributes: MetricAttributes,
  unit = millisecondUnit
) {
  Sentry.metrics.distribution(name, value, { attributes, unit });
}

export function recordPageView(pathname: string) {
  const { route, section } = normalizeMetricRoute(pathname);

  count('docs.page_view', { route, section });
}

export function recordDemoOpened(demoId: string, category: string) {
  count('demo.opened', {
    demo_id: demoId,
    category,
  });
}

export function recordDemoHydrationFailed(demoId: string, category: string) {
  count('demo.hydration_failed', {
    demo_id: demoId,
    category,
  });
}

export function recordTimelineFps(context: TimelineMetricContext, fps: number) {
  gauge('timeline.fps', fps, timelineMetricAttributes(context));
}

export function recordTimelineFrameTimes(
  context: TimelineMetricContext,
  frameTimes: readonly number[],
  operation: TimelineMetricOperation
) {
  const attributes = {
    ...timelineMetricAttributes(context),
    operation,
  };

  for (const frameTime of sampleMetricValues(frameTimes)) {
    distribution('timeline.frame_time', frameTime, attributes);
  }
}

export function recordTimelineInteractionLatencies(
  context: TimelineMetricContext,
  operation: TimelineMetricOperation,
  latencies: readonly number[]
) {
  const attributes = {
    ...timelineMetricAttributes(context),
    operation,
  };

  for (const latency of sampleMetricValues(latencies)) {
    distribution('timeline.interaction_latency', latency, attributes);
  }
}

export function recordTimelineWorkerRenderTimes(
  context: TimelineMetricContext,
  renderStats: readonly WorkerRenderMetric[]
) {
  const baseAttributes = timelineMetricAttributes(context);

  for (const stats of sampleMetricItems(renderStats)) {
    distribution('timeline.worker_render_time', stats.durationMs, {
      ...baseAttributes,
      render_reason: stats.reason,
    });
  }
}

export function recordMediaLoadFailed(event: MediaMetricEvent) {
  count('media.load_failed', {
    demo_id: event.demoId,
    adapter: event.adapter,
    media_type: event.mediaType,
  });
}

export function recordMediaDecodeTime(event: MediaMetricEvent, durationMs: number) {
  distribution('media.decode_time', durationMs, {
    demo_id: event.demoId,
    adapter: event.adapter,
    media_type: event.mediaType,
  });
}
