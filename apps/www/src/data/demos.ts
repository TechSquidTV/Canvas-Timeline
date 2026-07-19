import type { SearchOptions } from '#www/lib/search';

type DemoStatus =
  | 'Minimal'
  | 'Media sync'
  | 'Controls'
  | 'Keyframes'
  | 'Performance'
  | 'DOM renderer'
  | 'Custom design'
  | 'Full editor';

export type LiveDemoId =
  | 'basic'
  | 'media-sync'
  | 'html-media-sync'
  | 'editor-controls'
  | 'clip-grouping-import'
  | 'external-clip-drop'
  | 'keyframe-opacity'
  | 'stress-test'
  | 'react-dom-timeline'
  | 'custom-playhead';

interface DemoReference {
  label: string;
  url: string;
}

export interface DemoDoc {
  slug: string;
  title: string;
  description: string;
  status: DemoStatus;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  featured?: boolean;
  packageFocus: string[];
  sourcePath: string;
  externalUrl?: string;
  liveDemoId?: LiveDemoId;
  references?: DemoReference[];
  search?: SearchOptions;
}

export const demoDocs: DemoDoc[] = [
  {
    slug: 'basic-editor-surface',
    title: 'Basic Timeline',
    description:
      'A minimal timeline with draggable clips, a visible playhead, canvas rendering, and enough state to explain the editor model.',
    search: {
      keywords: ['starter example', 'basic editor', 'draggable clips'],
      priority: 'high',
    },
    status: 'Minimal',
    difficulty: 'Beginner',
    packageFocus: [
      '@techsquidtv/canvas-timeline-core',
      '@techsquidtv/canvas-timeline-react',
      '@techsquidtv/canvas-timeline-renderer',
    ],
    sourcePath: 'apps/www/src/demos/basic-editor-surface/BasicTimeline.tsx',
    liveDemoId: 'basic',
  },
  {
    slug: 'media-preview-sync',
    title: 'Mediabunny Adapter Sync',
    description:
      'A frame-aware preview surface where Mediabunny owns the playback clock and Canvas Timeline maps playhead time to source media time.',
    status: 'Media sync',
    difficulty: 'Intermediate',
    packageFocus: [
      '@techsquidtv/canvas-timeline-core',
      '@techsquidtv/canvas-timeline-react',
      '@techsquidtv/canvas-timeline-renderer',
      '@techsquidtv/canvas-timeline-mediabunny-adapter',
      '@techsquidtv/canvas-timeline-utils',
      'mediabunny',
    ],
    sourcePath: 'apps/www/src/demos/media-preview-sync/MediaTimelineSync.tsx',
    liveDemoId: 'media-sync',
    references: [
      {
        label: 'Mediabunny adapter integration guide',
        url: '/packages/mediabunny-adapter',
      },
      {
        label: 'Mediabunny adapter API reference',
        url: '/packages/mediabunny-adapter/api',
      },
      {
        label: 'Mediabunny media-player example',
        url: 'https://github.com/Vanilagy/mediabunny/blob/main/examples/media-player/media-player.ts',
      },
    ],
  },
  {
    slug: 'html-media-sync',
    title: 'HTML Media Adapter Sync',
    description:
      'A native HTML media preview where Canvas Timeline drives one HTMLMediaElement, including embedded video audio, through the React media adapter.',
    status: 'Media sync',
    difficulty: 'Intermediate',
    packageFocus: [
      '@techsquidtv/canvas-timeline-core',
      '@techsquidtv/canvas-timeline-html-media-adapter',
      '@techsquidtv/canvas-timeline-react',
      '@techsquidtv/canvas-timeline-renderer',
      '@techsquidtv/canvas-timeline-utils',
    ],
    sourcePath: 'apps/www/src/demos/html-media-sync/HTMLMediaTimelineSync.tsx',
    liveDemoId: 'html-media-sync',
    references: [
      {
        label: 'HTML media adapter integration guide',
        url: '/packages/html-media-adapter',
      },
      {
        label: 'HTML media adapter API reference',
        url: '/packages/html-media-adapter/api',
      },
    ],
  },
  {
    slug: 'timeline-editor-controls',
    title: 'Timeline Editor Controls',
    description:
      'A timeline with a complete playback control bar, demonstrating play/pause transport controls, editable playhead timecode, loop range boundaries (in/out markers), snapping toggle, and zooming/panning sliders.',
    status: 'Controls',
    difficulty: 'Beginner',
    packageFocus: [
      '@techsquidtv/canvas-timeline-core',
      '@techsquidtv/canvas-timeline-react',
      '@techsquidtv/canvas-timeline-renderer',
    ],
    sourcePath: 'apps/www/src/demos/timeline-editor-controls/TimelineEditorControls.tsx',
    liveDemoId: 'editor-controls',
  },
  {
    slug: 'clip-grouping-import',
    title: 'Clip Grouping',
    description:
      'A two-track timeline with one video clip and one audio clip that can be selected, grouped, moved together, and ungrouped.',
    status: 'Controls',
    difficulty: 'Intermediate',
    packageFocus: [
      '@techsquidtv/canvas-timeline-core',
      '@techsquidtv/canvas-timeline-react',
      '@techsquidtv/canvas-timeline-renderer',
      '@techsquidtv/canvas-timeline-utils',
    ],
    sourcePath: 'apps/www/src/demos/clip-grouping-import/ClipGroupingImportTimeline.tsx',
    liveDemoId: 'clip-grouping-import',
  },
  {
    slug: 'external-clip-drop',
    title: 'Drag Media Onto Timeline',
    description:
      'Drop app-owned media assets onto a two-track timeline, including linked video and audio placements that land as one grouped edit.',
    status: 'Controls',
    difficulty: 'Intermediate',
    packageFocus: [
      '@techsquidtv/canvas-timeline-core',
      '@techsquidtv/canvas-timeline-react',
      '@techsquidtv/canvas-timeline-renderer',
      '@techsquidtv/canvas-timeline-utils',
    ],
    sourcePath: 'apps/www/src/demos/external-clip-drop/ExternalClipDropTimeline.tsx',
    liveDemoId: 'external-clip-drop',
  },
  {
    slug: 'keyframe-opacity',
    title: 'Opacity Keyframes',
    description:
      'A video opacity automation demo with engine-level clip keyframes, draggable DOM handles, canvas keyframe rendering, and live HTML media preview evaluation.',
    status: 'Keyframes',
    difficulty: 'Intermediate',
    packageFocus: [
      '@techsquidtv/canvas-timeline-core',
      '@techsquidtv/canvas-timeline-react',
      '@techsquidtv/canvas-timeline-renderer',
      '@techsquidtv/canvas-timeline-html-media-adapter',
      '@techsquidtv/canvas-timeline-utils',
    ],
    sourcePath: 'apps/www/src/demos/keyframe-opacity/KeyframeOpacityTimeline.tsx',
    liveDemoId: 'keyframe-opacity',
  },
  {
    slug: 'timeline-stress-test',
    title: 'Timeline Stress Test & Benchmark',
    description:
      'A high-density stress test and performance benchmark demo, enabling configurable tracks, clips, and timeline durations with a real-time FPS monitor, automated scrubbing test, and React DOM reconciliation overhead toggle.',
    status: 'Performance',
    difficulty: 'Intermediate',
    packageFocus: [
      '@techsquidtv/canvas-timeline-core',
      '@techsquidtv/canvas-timeline-react',
      '@techsquidtv/canvas-timeline-renderer',
      '@techsquidtv/canvas-timeline-utils',
    ],
    sourcePath: 'apps/www/src/demos/timeline-stress-test/TimelineStressTest.tsx',
    liveDemoId: 'stress-test',
  },
  {
    slug: 'react-dom-timeline',
    title: 'React DOM Timeline',
    description:
      'A timeline editor utilizing pure React and DOM elements to render tracks, clips, and a switchable seconds, timecode, or frame-number ruler while retaining all state, control, and interaction layers.',
    status: 'DOM renderer',
    difficulty: 'Beginner',
    packageFocus: ['@techsquidtv/canvas-timeline-core', '@techsquidtv/canvas-timeline-react'],
    sourcePath: 'apps/www/src/demos/react-dom-timeline/ReactDOMTimeline.tsx',
    liveDemoId: 'react-dom-timeline',
  },
  {
    slug: 'custom-playhead',
    title: 'Custom playhead',
    description:
      'Demonstrates a fully customized DOM playhead with a real-time timecode readout, glowing line, and custom hover/dragging states using render props.',
    status: 'Custom design',
    difficulty: 'Intermediate',
    packageFocus: [
      '@techsquidtv/canvas-timeline-core',
      '@techsquidtv/canvas-timeline-react',
      '@techsquidtv/canvas-timeline-renderer',
    ],
    sourcePath: 'apps/www/src/demos/custom-playhead/CustomPlayheadTimeline.tsx',
    liveDemoId: 'custom-playhead',
  },
  {
    slug: 'full-editor-demo',
    title: 'Full Editor Demo',
    description:
      'A full SPA/PWA editor test bed with OPFS media import, grouped timeline drops, Mediabunny playback, project autosave, and MP4 export.',
    status: 'Full editor',
    difficulty: 'Advanced',
    featured: true,
    packageFocus: [
      '@techsquidtv/canvas-timeline-core',
      '@techsquidtv/canvas-timeline-mediabunny-adapter',
      '@techsquidtv/canvas-timeline-react',
      '@techsquidtv/canvas-timeline-renderer',
      '@techsquidtv/canvas-timeline-utils',
      'mediabunny',
    ],
    sourcePath: 'apps/full-editor-demo/src/App.tsx',
    externalUrl: '/demos/full-editor-demo/',
    references: [
      {
        label: 'Full editor app source',
        url: 'https://github.com/techsquidtv/canvas-timeline/tree/main/apps/full-editor-demo',
      },
      {
        label: 'Mediabunny adapter guide',
        url: '/packages/mediabunny-adapter',
      },
      {
        label: 'External clip drop demo',
        url: '/demos/external-clip-drop',
      },
    ],
  },
];
