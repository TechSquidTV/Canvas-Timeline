import type { ComponentType } from 'react';
import type { LiveDemoId } from '#www/data/demos';

type LiveDemoLoader = () => Promise<ComponentType>;

export const liveDemoLoaders: Record<LiveDemoId, LiveDemoLoader> = {
  basic: () =>
    import('#www/demos/basic-editor-surface/BasicTimeline').then((module) => module.BasicTimeline),
  'media-sync': () =>
    import('#www/demos/media-preview-sync/MediaTimelineSync').then(
      (module) => module.MediaTimelineSync
    ),
  'html-media-sync': () =>
    import('#www/demos/html-media-sync/HTMLMediaTimelineSync').then(
      (module) => module.HTMLMediaTimelineSync
    ),
  'editor-controls': () =>
    import('#www/demos/timeline-editor-controls/TimelineEditorControls').then(
      (module) => module.TimelineEditorControls
    ),
  'clip-grouping-import': () =>
    import('#www/demos/clip-grouping-import/ClipGroupingImportTimeline').then(
      (module) => module.ClipGroupingImportTimeline
    ),
  'external-clip-drop': () =>
    import('#www/demos/external-clip-drop/ExternalClipDropTimeline').then(
      (module) => module.ExternalClipDropTimeline
    ),
  'keyframe-opacity': () =>
    import('#www/demos/keyframe-opacity/KeyframeOpacityTimeline').then(
      (module) => module.KeyframeOpacityTimeline
    ),
  'stress-test': () =>
    import('#www/demos/timeline-stress-test/TimelineStressTest').then(
      (module) => module.TimelineStressTest
    ),
  'react-dom-timeline': () =>
    import('#www/demos/react-dom-timeline/ReactDOMTimeline').then(
      (module) => module.ReactDOMTimeline
    ),
  'custom-playhead': () =>
    import('#www/demos/custom-playhead/CustomPlayheadTimeline').then(
      (module) => module.CustomPlayheadTimeline
    ),
};
