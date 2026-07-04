type MetricAttributeValue = string | number | boolean;
export type MetricAttributes = Record<string, MetricAttributeValue>;

type RendererType = 'canvas' | 'dom';
export type TimelineMetricOperation = 'scrub' | 'zoom' | 'pan' | 'drag' | 'trim';

export interface NormalizedRouteMetric {
  route: string;
  section: string;
}

export interface TimelineMetricContext {
  demoId: string;
  renderer: RendererType;
  trackCount: number;
  clipCount: number;
}

export interface WorkerRenderMetric {
  reason: string;
  durationMs: number;
}

export interface MediaMetricEvent {
  demoId: string;
  adapter: 'html-media' | 'mediabunny';
  mediaType: 'video' | 'audio' | 'video_audio';
}

export function normalizeMetricRoute(pathname: string): NormalizedRouteMetric {
  const segments = pathname.split('/').filter(Boolean);
  const [section] = segments;

  if (!section) {
    return { route: '/', section: 'home' };
  }

  if (section === 'packages') {
    if (segments[1] === 'react' && segments[2] === 'registry') {
      return {
        route: segments.length > 3 ? '/packages/react/registry/:slug' : '/packages/react/registry',
        section: 'registry',
      };
    }

    if (segments[2] === 'api') {
      return {
        route: segments.length > 3 ? '/packages/:package/api/:symbol' : '/packages/:package/api',
        section: 'packages-api',
      };
    }

    return {
      route: segments.length > 1 ? '/packages/:package' : '/packages',
      section: 'packages',
    };
  }

  if (section === 'docs') {
    return {
      route: segments.length > 1 ? '/docs/:slug' : '/docs',
      section: 'docs',
    };
  }

  if (section === 'demos') {
    return {
      route: segments.length > 1 ? '/demos/:slug' : '/demos',
      section: 'demos',
    };
  }

  if (section === 'blog') {
    return {
      route: segments.length > 1 ? '/blog/:slug' : '/blog',
      section: 'blog',
    };
  }

  return {
    route: `/${section}`,
    section,
  };
}

function bucketCount(value: number): string {
  if (value <= 0) {
    return '0';
  }
  if (value <= 10) {
    return '1-10';
  }
  if (value <= 50) {
    return '11-50';
  }
  if (value <= 100) {
    return '51-100';
  }
  if (value <= 500) {
    return '101-500';
  }
  if (value <= 1000) {
    return '501-1000';
  }
  return '1001+';
}

export function sampleMetricValues(values: readonly number[], maxSamples = 60): number[] {
  if (values.length <= maxSamples) {
    return [...values];
  }

  const step = values.length / maxSamples;
  return Array.from({ length: maxSamples }, (_, index) => values[Math.floor(index * step)] ?? 0);
}

export function sampleMetricItems<T>(values: readonly T[], maxSamples = 60): T[] {
  if (values.length <= maxSamples) {
    return [...values];
  }

  const step = values.length / maxSamples;
  return Array.from({ length: maxSamples }, (_, index) => values[Math.floor(index * step)]).filter(
    (value): value is T => value !== undefined
  );
}

export function timelineMetricAttributes(context: TimelineMetricContext): MetricAttributes {
  return {
    demo_id: context.demoId,
    renderer: context.renderer,
    track_count_bucket: bucketCount(context.trackCount),
    clip_count_bucket: bucketCount(context.clipCount),
  };
}
