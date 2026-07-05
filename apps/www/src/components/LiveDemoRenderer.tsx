import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  type ComponentType,
  type ErrorInfo,
  type LazyExoticComponent,
  type ReactNode,
} from 'react';
import { liveDemoLoaders } from '@/data/demo-components';
import type { LiveDemoId } from '@/data/demos';
import type { DemoMetrics } from '@/demos/demo-instrumentation';
import {
  recordDemoHydrationFailed,
  recordDemoOpened,
  recordMediaDecodeTime,
  recordMediaLoadFailed,
  recordTimelineFps,
  recordTimelineFrameTimes,
  recordTimelineInteractionLatencies,
  recordTimelineWorkerRenderTimes,
} from '@/lib/metrics';

interface LiveDemoRendererProps {
  liveDemoId: LiveDemoId;
  category: string;
}

interface DemoErrorBoundaryProps {
  children: ReactNode;
  onError: () => void;
}

class DemoErrorBoundary extends Component<DemoErrorBoundaryProps> {
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError();
  }

  render() {
    return this.props.children;
  }
}

function createLazyDemo(
  loadDemo: (typeof liveDemoLoaders)[LiveDemoId]
): LazyExoticComponent<ComponentType<{ metrics?: DemoMetrics }>> {
  return lazy(() =>
    loadDemo().then((component) => ({
      default: component as ComponentType<{ metrics?: DemoMetrics }>,
    }))
  );
}

const liveDemoComponents: Record<
  LiveDemoId,
  LazyExoticComponent<ComponentType<{ metrics?: DemoMetrics }>>
> = {
  basic: createLazyDemo(liveDemoLoaders.basic),
  'media-sync': createLazyDemo(liveDemoLoaders['media-sync']),
  'html-media-sync': createLazyDemo(liveDemoLoaders['html-media-sync']),
  'editor-controls': createLazyDemo(liveDemoLoaders['editor-controls']),
  'clip-grouping-import': createLazyDemo(liveDemoLoaders['clip-grouping-import']),
  'external-clip-drop': createLazyDemo(liveDemoLoaders['external-clip-drop']),
  'keyframe-opacity': createLazyDemo(liveDemoLoaders['keyframe-opacity']),
  'stress-test': createLazyDemo(liveDemoLoaders['stress-test']),
  'react-dom-timeline': createLazyDemo(liveDemoLoaders['react-dom-timeline']),
  'custom-playhead': createLazyDemo(liveDemoLoaders['custom-playhead']),
};

export default function LiveDemoRenderer({ liveDemoId, category }: LiveDemoRendererProps) {
  const DemoComponent = liveDemoComponents[liveDemoId];
  const metrics = useMemo<DemoMetrics>(
    () => ({
      onTimelineFpsSample: recordTimelineFps,
      onTimelineFrameTimes: recordTimelineFrameTimes,
      onTimelineInteractionLatencies: recordTimelineInteractionLatencies,
      onTimelineWorkerRenderStats: recordTimelineWorkerRenderTimes,
      onMediaLoadFailed: recordMediaLoadFailed,
      onMediaDecodeTime: recordMediaDecodeTime,
    }),
    []
  );

  useEffect(() => {
    recordDemoOpened(liveDemoId, category);
  }, [category, liveDemoId]);

  return (
    <div className="docs-timeline-theme dark">
      <DemoErrorBoundary onError={() => recordDemoHydrationFailed(liveDemoId, category)}>
        <Suspense fallback={null}>
          <DemoComponent metrics={metrics} />
        </Suspense>
      </DemoErrorBoundary>
    </div>
  );
}
