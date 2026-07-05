import type { ComponentType } from 'react';
import type { LiveDemoId } from './demos';

type LiveDemoLoader = () => Promise<ComponentType>;

export const liveDemoLoaders: Record<LiveDemoId, LiveDemoLoader> = {
  basic: () =>
    import('../demos/basic-editor-surface/BasicTimeline').then((module) => module.BasicTimeline),
  'media-sync': () =>
    import('../demos/media-preview-sync/MediaTimelineSync').then(
      (module) => module.MediaTimelineSync
    ),
  'html-media-sync': () =>
    import('../demos/html-media-sync/HTMLMediaTimelineSync').then(
      (module) => module.HTMLMediaTimelineSync
    ),
  'editor-controls': () =>
    import('../demos/timeline-editor-controls/TimelineEditorControls').then(
      (module) => module.TimelineEditorControls
    ),
  'clip-grouping-import': () =>
    import('../demos/clip-grouping-import/ClipGroupingImportTimeline').then(
      (module) => module.ClipGroupingImportTimeline
    ),
  'keyframe-opacity': () =>
    import('../demos/keyframe-opacity/KeyframeOpacityTimeline').then(
      (module) => module.KeyframeOpacityTimeline
    ),
  'stress-test': () =>
    import('../demos/timeline-stress-test/TimelineStressTest').then(
      (module) => module.TimelineStressTest
    ),
  'react-dom-timeline': () =>
    import('../demos/react-dom-timeline/ReactDOMTimeline').then(
      (module) => module.ReactDOMTimeline
    ),
  'custom-playhead': () =>
    import('../demos/custom-playhead/CustomPlayheadTimeline').then(
      (module) => module.CustomPlayheadTimeline
    ),
};
