import type { LiveDemoId } from '#www/data/demos';
import basicTimelineSource from '#www/demos/basic-editor-surface/BasicTimeline?raw';
import basicDataSource from '#www/demos/basic-editor-surface/timeline-demo-data?raw';
import mediaSyncTimelineSource from '#www/demos/media-preview-sync/MediaTimelineSync?raw';
import mediaSyncDataSource from '#www/demos/media-preview-sync/timeline-demo-data?raw';
import htmlMediaSyncTimelineSource from '#www/demos/html-media-sync/HTMLMediaTimelineSync?raw';
import htmlMediaSyncDataSource from '#www/demos/html-media-sync/timeline-demo-data?raw';
import editorControlsTimelineSource from '#www/demos/timeline-editor-controls/TimelineEditorControls?raw';
import editorControlsDataSource from '#www/demos/timeline-editor-controls/timeline-demo-data?raw';
import editorControlsUtilitiesSource from '#www/demos/timeline-editor-controls/timeline-controls?raw';
import editorControlsLocalStylesSource from '#www/demos/timeline-editor-controls/timeline-editor.css?raw';
import clipGroupingTimelineSource from '#www/demos/clip-grouping-import/ClipGroupingImportTimeline?raw';
import clipGroupingDataSource from '#www/demos/clip-grouping-import/timeline-demo-data?raw';
import clipGroupingLocalStylesSource from '#www/demos/clip-grouping-import/timeline-editor.css?raw';
import externalClipDropTimelineSource from '#www/demos/external-clip-drop/ExternalClipDropTimeline?raw';
import externalClipDropDataSource from '#www/demos/external-clip-drop/timeline-demo-data?raw';
import externalClipDropLocalStylesSource from '#www/demos/external-clip-drop/timeline-editor.css?raw';
import keyframeOpacityTimelineSource from '#www/demos/keyframe-opacity/KeyframeOpacityTimeline?raw';
import keyframeOpacityDataSource from '#www/demos/keyframe-opacity/timeline-demo-data?raw';
import keyframeOpacityUtilsSource from '#www/demos/keyframe-opacity/keyframe-opacity-utils?raw';
import keyframeOpacityLocalStylesSource from '#www/demos/keyframe-opacity/timeline-editor.css?raw';
import sharedTimelineEditorStylesSource from '#www/demos/shared-timeline-editor.css?raw';
import stressTestTimelineSource from '#www/demos/timeline-stress-test/TimelineStressTest?raw';
import stressTestDataSource from '#www/demos/timeline-stress-test/timeline-demo-data?raw';
import stressTestControlsSource from '#www/demos/timeline-stress-test/timeline-benchmark-controls?raw';
import reactDomTimelineTimelineSource from '#www/demos/react-dom-timeline/ReactDOMTimeline?raw';
import reactDomTimelineDataSource from '#www/demos/react-dom-timeline/timeline-demo-data?raw';
import reactDomTimelineControlsSource from '#www/demos/react-dom-timeline/timeline-controls?raw';
import reactDomTimelineComponentsSource from '#www/demos/react-dom-timeline/DOMTimelineComponents?raw';
import customPlayheadTimelineSource from '#www/demos/custom-playhead/CustomPlayheadTimeline?raw';
import customPlayheadDataSource from '#www/demos/custom-playhead/timeline-demo-data?raw';
import demoClipColorsSource from '#www/demos/demo-clip-colors?raw';
import demoInstrumentationSource from '#www/demos/demo-instrumentation?raw';
import { toCopyableDemoSource } from '#www/data/demo-snippets';

interface DemoCodeTab {
  id: string;
  label: string;
  code: string;
  lang: string;
}

interface DemoCodeExample {
  tsx: string;
  data: string;
  css?: string;
  extraTabs?: DemoCodeTab[];
  sourceFiles: {
    component: string;
    data: string;
    styles?: string;
    utilities?: string | string[];
  };
}

const demoClipColorsTab: DemoCodeTab = {
  id: 'clip-colors',
  label: 'Clip colors',
  code: toCopyableDemoSource(demoClipColorsSource),
  lang: 'ts',
};

const demoInstrumentationTab: DemoCodeTab = {
  id: 'instrumentation',
  label: 'Instrumentation',
  code: toCopyableDemoSource(demoInstrumentationSource),
  lang: 'ts',
};

const sharedTimelineEditorImportPattern = /^@import '..\/shared-timeline-editor\.css';\n\n?/;

function inlineSharedTimelineEditorStyles(localStylesSource: string): string {
  return [
    sharedTimelineEditorStylesSource.trimEnd(),
    localStylesSource.replace(sharedTimelineEditorImportPattern, '').trimStart(),
  ].join('\n\n');
}

const editorControlsStylesSource = inlineSharedTimelineEditorStyles(
  editorControlsLocalStylesSource
);
const keyframeOpacityStylesSource = inlineSharedTimelineEditorStyles(
  keyframeOpacityLocalStylesSource
);
const clipGroupingStylesSource = inlineSharedTimelineEditorStyles(clipGroupingLocalStylesSource);
const externalClipDropStylesSource = inlineSharedTimelineEditorStyles(
  externalClipDropLocalStylesSource
);

export const demoCodeExamples: Record<LiveDemoId, DemoCodeExample> = {
  basic: {
    tsx: toCopyableDemoSource(basicTimelineSource),
    data: toCopyableDemoSource(basicDataSource),
    extraTabs: [demoClipColorsTab],
    sourceFiles: {
      component: 'apps/www/src/demos/basic-editor-surface/BasicTimeline.tsx',
      data: 'apps/www/src/demos/basic-editor-surface/timeline-demo-data.ts',
      utilities: 'apps/www/src/demos/demo-clip-colors.ts',
    },
  },
  'media-sync': {
    tsx: toCopyableDemoSource(mediaSyncTimelineSource),
    data: toCopyableDemoSource(mediaSyncDataSource),
    extraTabs: [demoClipColorsTab, demoInstrumentationTab],
    sourceFiles: {
      component: 'apps/www/src/demos/media-preview-sync/MediaTimelineSync.tsx',
      data: 'apps/www/src/demos/media-preview-sync/timeline-demo-data.ts',
      utilities: [
        'apps/www/src/demos/demo-clip-colors.ts',
        'apps/www/src/demos/demo-instrumentation.ts',
      ],
    },
  },
  'html-media-sync': {
    tsx: toCopyableDemoSource(htmlMediaSyncTimelineSource),
    data: toCopyableDemoSource(htmlMediaSyncDataSource),
    extraTabs: [demoClipColorsTab, demoInstrumentationTab],
    sourceFiles: {
      component: 'apps/www/src/demos/html-media-sync/HTMLMediaTimelineSync.tsx',
      data: 'apps/www/src/demos/html-media-sync/timeline-demo-data.ts',
      utilities: [
        'apps/www/src/demos/demo-clip-colors.ts',
        'apps/www/src/demos/demo-instrumentation.ts',
      ],
    },
  },
  'editor-controls': {
    tsx: toCopyableDemoSource(editorControlsTimelineSource),
    css: editorControlsStylesSource,
    extraTabs: [
      demoClipColorsTab,
      {
        id: 'controls',
        label: 'Timeline controls',
        code: toCopyableDemoSource(editorControlsUtilitiesSource),
        lang: 'tsx',
      },
    ],
    data: toCopyableDemoSource(editorControlsDataSource),
    sourceFiles: {
      component: 'apps/www/src/demos/timeline-editor-controls/TimelineEditorControls.tsx',
      utilities: [
        'apps/www/src/demos/timeline-editor-controls/timeline-controls.tsx',
        'apps/www/src/demos/demo-clip-colors.ts',
        'apps/www/src/demos/shared-timeline-editor.css',
      ],
      data: 'apps/www/src/demos/timeline-editor-controls/timeline-demo-data.ts',
      styles: 'apps/www/src/demos/timeline-editor-controls/timeline-editor.css',
    },
  },
  'clip-grouping-import': {
    tsx: toCopyableDemoSource(clipGroupingTimelineSource),
    css: clipGroupingStylesSource,
    extraTabs: [demoClipColorsTab],
    data: toCopyableDemoSource(clipGroupingDataSource),
    sourceFiles: {
      component: 'apps/www/src/demos/clip-grouping-import/ClipGroupingImportTimeline.tsx',
      utilities: [
        'apps/www/src/demos/demo-clip-colors.ts',
        'apps/www/src/demos/shared-timeline-editor.css',
      ],
      data: 'apps/www/src/demos/clip-grouping-import/timeline-demo-data.ts',
      styles: 'apps/www/src/demos/clip-grouping-import/timeline-editor.css',
    },
  },
  'external-clip-drop': {
    tsx: toCopyableDemoSource(externalClipDropTimelineSource),
    css: externalClipDropStylesSource,
    extraTabs: [demoClipColorsTab],
    data: toCopyableDemoSource(externalClipDropDataSource),
    sourceFiles: {
      component: 'apps/www/src/demos/external-clip-drop/ExternalClipDropTimeline.tsx',
      utilities: [
        'apps/www/src/demos/demo-clip-colors.ts',
        'apps/www/src/demos/shared-timeline-editor.css',
      ],
      data: 'apps/www/src/demos/external-clip-drop/timeline-demo-data.ts',
      styles: 'apps/www/src/demos/external-clip-drop/timeline-editor.css',
    },
  },
  'keyframe-opacity': {
    tsx: toCopyableDemoSource(keyframeOpacityTimelineSource),
    css: keyframeOpacityStylesSource,
    extraTabs: [
      demoClipColorsTab,
      {
        id: 'keyframe-utils',
        label: 'Keyframe utilities',
        code: toCopyableDemoSource(keyframeOpacityUtilsSource),
        lang: 'ts',
      },
    ],
    data: toCopyableDemoSource(keyframeOpacityDataSource),
    sourceFiles: {
      component: 'apps/www/src/demos/keyframe-opacity/KeyframeOpacityTimeline.tsx',
      utilities: [
        'apps/www/src/demos/keyframe-opacity/keyframe-opacity-utils.ts',
        'apps/www/src/demos/demo-clip-colors.ts',
        'apps/www/src/demos/shared-timeline-editor.css',
      ],
      data: 'apps/www/src/demos/keyframe-opacity/timeline-demo-data.ts',
      styles: 'apps/www/src/demos/keyframe-opacity/timeline-editor.css',
    },
  },
  'stress-test': {
    tsx: toCopyableDemoSource(stressTestTimelineSource),
    extraTabs: [
      demoClipColorsTab,
      demoInstrumentationTab,
      {
        id: 'controls',
        label: 'Benchmark controls',
        code: toCopyableDemoSource(stressTestControlsSource),
        lang: 'tsx',
      },
      {
        id: 'dom-components',
        label: 'DOM components',
        code: toCopyableDemoSource(reactDomTimelineComponentsSource),
        lang: 'tsx',
      },
    ],
    data: toCopyableDemoSource(stressTestDataSource),
    sourceFiles: {
      component: 'apps/www/src/demos/timeline-stress-test/TimelineStressTest.tsx',
      utilities: [
        'apps/www/src/demos/timeline-stress-test/timeline-benchmark-controls.tsx',
        'apps/www/src/demos/react-dom-timeline/DOMTimelineComponents.tsx',
        'apps/www/src/demos/demo-clip-colors.ts',
        'apps/www/src/demos/demo-instrumentation.ts',
      ],
      data: 'apps/www/src/demos/timeline-stress-test/timeline-demo-data.ts',
    },
  },
  'react-dom-timeline': {
    tsx: toCopyableDemoSource(reactDomTimelineTimelineSource),
    extraTabs: [
      demoClipColorsTab,
      {
        id: 'controls',
        label: 'Timeline controls',
        code: toCopyableDemoSource(reactDomTimelineControlsSource),
        lang: 'tsx',
      },
      {
        id: 'dom-components',
        label: 'DOM components',
        code: toCopyableDemoSource(reactDomTimelineComponentsSource),
        lang: 'tsx',
      },
    ],
    data: toCopyableDemoSource(reactDomTimelineDataSource),
    sourceFiles: {
      component: 'apps/www/src/demos/react-dom-timeline/ReactDOMTimeline.tsx',
      utilities: [
        'apps/www/src/demos/react-dom-timeline/timeline-controls.tsx',
        'apps/www/src/demos/react-dom-timeline/DOMTimelineComponents.tsx',
        'apps/www/src/demos/demo-clip-colors.ts',
      ],
      data: 'apps/www/src/demos/react-dom-timeline/timeline-demo-data.ts',
    },
  },
  'custom-playhead': {
    tsx: toCopyableDemoSource(customPlayheadTimelineSource),
    data: toCopyableDemoSource(customPlayheadDataSource),
    extraTabs: [demoClipColorsTab],
    sourceFiles: {
      component: 'apps/www/src/demos/custom-playhead/CustomPlayheadTimeline.tsx',
      data: 'apps/www/src/demos/custom-playhead/timeline-demo-data.ts',
      utilities: 'apps/www/src/demos/demo-clip-colors.ts',
    },
  },
};
