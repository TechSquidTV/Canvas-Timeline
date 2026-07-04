import { packageResourceLinks } from './site';

interface PackageExport {
  path: string;
  description: string;
}

interface PackageImportExample {
  label: string;
  code: string;
}

interface PackageLink {
  title: string;
  href: string;
  description?: string;
}

interface PackageSourceLink {
  label: string;
  href: string;
}

interface PackageDescriptionLink {
  label: string;
  href: string;
}

interface PackageIntegrationGuide {
  mentalModel: string;
  steps: string[];
  example: PackageImportExample;
  demoNotes: string[];
}

export interface PackageDoc {
  slug: string;
  name: string;
  shortName: string;
  purpose: string;
  description: string;
  descriptionLinks?: PackageDescriptionLink[];
  installCommand: string;
  sourceLinks: PackageSourceLink[];
  whenToUse: string[];
  commonImports: PackageImportExample[];
  usageNotes: string[];
  integrationGuide?: PackageIntegrationGuide;
  exports: PackageExport[];
  relatedGuides: PackageLink[];
  nextSteps: PackageLink[];
}

export const packageDocs: PackageDoc[] = [
  {
    slug: 'timeline',
    name: '@techsquidtv/canvas-timeline',
    shortName: 'Main package',
    purpose: 'Batteries-included React timeline editing path.',
    description:
      'Start here when you want the common Canvas Timeline experience without choosing lower-level package boundaries up front.',
    installCommand: 'pnpm add @techsquidtv/canvas-timeline',
    sourceLinks: packageResourceLinks('timeline'),
    whenToUse: [
      'You are building a standard React timeline editor and want an integrated, batteries-included starter experience.',
      'You prefer importing the core engine, state managers, DOM interaction controls, and canvas renderers from a single wrapper package.',
      'You want one import path before splitting your integration across focused package entrypoints.',
    ],
    commonImports: [
      {
        label: 'Common editor path',
        code: `import {
  CanvasRenderer,
  Timeline,
  TimelineEngine,
  TimelineProvider,
  fromSeconds,
} from '@techsquidtv/canvas-timeline';`,
      },
      {
        label: 'Shadcn-compatible styles',
        code: `import '@techsquidtv/canvas-timeline/styles.css';`,
      },
      {
        label: 'Headless styling path',
        code: `import '@techsquidtv/canvas-timeline/base.css';`,
      },
      {
        label: 'Focused subpath imports',
        code: `import { TimelineEngine } from '@techsquidtv/canvas-timeline/core';
import { TimelineProvider } from '@techsquidtv/canvas-timeline/react';
import { CanvasRenderer } from '@techsquidtv/canvas-timeline/renderer';`,
      },
    ],
    usageNotes: [
      'Provides a single batteries-included entry point containing core, React, renderer, and utils APIs, simplifying initial installation and setup.',
      'Supports subpath imports (e.g., `@techsquidtv/canvas-timeline/core`) to allow incremental refinement toward focused package boundaries without modifying dependencies.',
      'Use `styles.css` when your app defines shadcn-compatible semantic tokens; it themes the reusable timeline surface, interaction chrome, scrollbars, and optional shell/control utilities while product chrome remains application CSS.',
    ],
    exports: [
      { path: '.', description: 'Common public APIs from core, React, renderer, and utils.' },
      { path: './core', description: 'Core state and editing engine re-exports.' },
      { path: './react', description: 'React provider, hooks, and components re-exports.' },
      {
        path: './html-media',
        description: 'Native single-element HTML media/audio timeline media adapter re-export.',
      },
      { path: './renderer', description: 'Canvas renderer and theme re-exports.' },
      { path: './utils', description: 'Rational time and shared math re-exports.' },
      {
        path: './base.css',
        description: 'Structural interaction geometry without default visuals.',
      },
      {
        path: './theme.css',
        description: 'Shadcn-token-driven visual theme for interaction chrome and timeline tokens.',
      },
      {
        path: './styles.css',
        description: 'Structural styles plus shadcn-compatible interaction chrome.',
      },
    ],
    relatedGuides: [
      { title: 'Getting started', href: '/docs/getting-started' },
      { title: 'Packages overview', href: '/docs/packages-overview' },
    ],
    nextSteps: [
      {
        title: 'Generated API reference',
        href: '/packages/timeline/api',
        description: 'Review exported symbols and re-exported package surfaces.',
      },
    ],
  },
  {
    slug: 'core',
    name: '@techsquidtv/canvas-timeline-core',
    shortName: 'Core',
    purpose: 'UI-agnostic state, editing, snapping, playback, and markers.',
    description:
      'Use the core package when your integration needs the timeline model and editing operations without React or canvas rendering concerns.',
    installCommand: 'pnpm add @techsquidtv/canvas-timeline-core',
    sourceLinks: packageResourceLinks('core'),
    whenToUse: [
      'You are building a timeline in a non-React environment (e.g., Vue, Svelte, or native platforms) and need to own rendering yourself.',
      'You want a clean, framework-agnostic engine to manage track models, edit history, snapping, and clipboard operations.',
      'You need to write fast, isolated unit tests around timeline business logic without loading browser DOM elements or UI chrome.',
    ],
    commonImports: [
      {
        label: 'Engine and state types',
        code: `import {
  TimelineEngine,
  type TimelineEditCommand,
  type TimelineState,
  type Track,
} from '@techsquidtv/canvas-timeline-core';`,
      },
      {
        label: 'Typed edit commands',
        code: `import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';

const preview = engine.previewEdit({
  type: 'move',
  clipId: 'clip-intro',
  startTime: fromSeconds(4),
});

if (preview.valid) {
  engine.commitEdit(preview.command);
}`,
      },
      {
        label: 'Snapping helpers',
        code: `import { SnapIndex } from '@techsquidtv/canvas-timeline-core/snapping';`,
      },
    ],
    usageNotes: [
      'Manages the serializable `TimelineState` source of truth, encapsulating tracks, clips, playback cursor, markers, and range selection.',
      'Encapsulates typed edit commands (`validateEdit`, `previewEdit`, `commitEdit`, and `cancelEdit`), playback loops, history stacks (undo/redo), and typed snapping logic in a UI-agnostic environment.',
      'Ideal for headless testing or custom platform integrations (such as Node.js or alternative rendering engines) due to zero DOM or UI dependencies.',
    ],
    exports: [
      { path: '.', description: 'Types, engine, and snapping utilities.' },
      { path: './engine', description: 'TimelineEngine entrypoint.' },
      { path: './types', description: 'Track, Clip, Marker, and TimelineState types.' },
      { path: './snapping', description: 'SnapIndex helpers for snapping and lookups.' },
    ],
    relatedGuides: [
      { title: 'System architecture', href: '/docs/architecture' },
      { title: 'API reference', href: '/packages/core/api' },
    ],
    nextSteps: [
      {
        title: 'Generated API reference',
        href: '/packages/core/api',
        description: 'Inspect TimelineEngine, TimelineState, and core utility symbols.',
      },
      {
        title: 'System architecture',
        href: '/docs/architecture',
        description: 'Use this guide for the model-level language shared across packages.',
      },
    ],
  },
  {
    slug: 'react',
    name: '@techsquidtv/canvas-timeline-react',
    shortName: 'React',
    purpose: 'React provider, hooks, context, and interaction components.',
    description:
      'Use the React package when you want to bind a TimelineEngine to React controls while keeping rendering choices flexible.',
    installCommand: 'pnpm add @techsquidtv/canvas-timeline-react',
    sourceLinks: packageResourceLinks('react'),
    whenToUse: [
      'You already have a `TimelineEngine` instance and want to bind its state reactively to React components and controls.',
      'You want built-in hooks to track playback cursor position, selected clips, viewport state, undo/redo stacks, and clipboard actions.',
      'You need pointer-captured, CSS-styleable interaction layers like selection boxes, drag-and-trim handles, playhead scrubbers, and customized scrollbars.',
    ],
    commonImports: [
      {
        label: 'Provider and hooks',
        code: `import {
  Timeline,
  TimelineProvider,
  useTimeline,
} from '@techsquidtv/canvas-timeline-react';`,
      },
      {
        label: 'Shadcn-compatible styles',
        code: `import '@techsquidtv/canvas-timeline-react/styles.css';`,
      },
      {
        label: 'Headless styling path',
        code: `import '@techsquidtv/canvas-timeline-react/base.css';`,
      },
      {
        label: 'Hook-only entrypoint',
        code: `import {
  useClipEditPreview,
  useTimelineClips,
  useTimelineEditCommands,
  useTimelineEditImpacts,
  useTimelineEditMode,
  useTimelineEditPreview,
  useTimelineRangeSelection,
} from '@techsquidtv/canvas-timeline-react/hooks';`,
      },
    ],
    usageNotes: [
      'Binds `TimelineEngine` state and controls to React contexts and hooks (`useTimeline`) for reactive UI updates and property synchronization.',
      'Provides headless edit-command hooks so product gestures can validate, preview, commit, and cancel typed edits through `TimelineEngine`.',
      'Styles low-frequency interaction chrome (e.g., scrollbars, drag handles, active overlays) using CSS, keeping DOM nodes minimal and high-frequency rendering off the main thread.',
      'Leverages `Timeline.ClipInteractionLayer` with pointer capture and hit testing to handle complex gestures (selection, drag, trim) without spawning per-clip DOM trees.',
      'Provides building blocks like `Timeline.PlayheadArea` and `Timeline.PlayheadGrabber` to facilitate dragging behavior and layout composition.',
      'Provides an accessible Base UI-backed range selector (`Timeline.RangeSelector`) for loop and selection bounds.',
      'Use the native HTML media adapter package for one `HTMLMediaElement`; embedded video audio is supported by the element, while separate visual/audio track sync needs a custom multi-element adapter.',
    ],
    exports: [
      { path: '.', description: 'Provider, context, hooks, and Timeline component namespace.' },
      { path: './hooks', description: 'Hook-only entrypoint.' },
      { path: './components', description: 'Component-only entrypoint.' },
      {
        path: './base.css',
        description: 'Structural interaction geometry without default visuals.',
      },
      {
        path: './theme.css',
        description: 'Shadcn-token-driven visual theme for interaction chrome and timeline tokens.',
      },
      {
        path: './styles.css',
        description: 'Structural styles plus shadcn-compatible interaction chrome.',
      },
    ],
    relatedGuides: [
      { title: 'Getting started', href: '/docs/getting-started' },
      { title: 'HTML Media Adapter Sync', href: '/demos/html-media-sync' },
      { title: 'Demos overview', href: '/docs/demos-overview' },
    ],
    nextSteps: [
      {
        title: 'HTML Media Adapter Sync',
        href: '/demos/html-media-sync',
        description: 'See the native HTML media adapter driving timeline playback.',
      },
      {
        title: 'React registry',
        href: '/packages/react/registry',
        description: 'Browse focused docs for component patterns and hook groups.',
      },
      {
        title: 'Generated API reference',
        href: '/packages/react/api',
        description: 'Review provider, hook, and component exports.',
      },
      {
        title: 'Demos overview',
        href: '/docs/demos-overview',
        description: 'Browse React-focused docs demos and their source-backed examples.',
      },
    ],
  },
  {
    slug: 'html-media-adapter',
    name: '@techsquidtv/canvas-timeline-html-media-adapter',
    shortName: 'HTML Media Adapter',
    purpose: 'HTMLMediaElement adapter for timeline media playback.',
    description:
      'Use the HTML media adapter when you want a simple HTML media or audio element to drive or follow Canvas Timeline playback.',
    installCommand: 'pnpm add @techsquidtv/canvas-timeline-html-media-adapter',
    sourceLinks: packageResourceLinks('html-media-adapter'),
    whenToUse: [
      'You are building a standard video or audio preview player using a native HTML5 `<video>` or `<audio>` element.',
      'You want simple playback synchronization without the weight of decoding frameworks or canvas-drawn video sinks.',
    ],
    commonImports: [
      {
        label: 'High-level React sync hook',
        code: `import { useHTMLTimelineMedia } from '@techsquidtv/canvas-timeline-html-media-adapter';`,
      },
      {
        label: 'Low-level React adapter hook',
        code: `import { useHTMLMediaAdapter } from '@techsquidtv/canvas-timeline-html-media-adapter';`,
      },
      {
        label: 'Imperative adapter factory',
        code: `import { createHTMLMediaAdapter } from '@techsquidtv/canvas-timeline-html-media-adapter';`,
      },
    ],
    usageNotes: [
      'Use this adapter for simple native single-element sync; embedded video audio is handled by the same HTMLMediaElement.',
      'The adapter maps `clip.sourceId` to one configured media source and keeps Blob/File object URLs out of timeline state.',
      'Use `useHTMLTimelineMedia` for the common React path; use `useHTMLMediaAdapter`, `createHTMLMediaAdapter`, and `useTimelineMediaSync` when you need custom clocks or nonstandard sync behavior.',
      'For decoded frame access, canvas preview rendering, or separate visual/audio source scheduling, use the Mediabunny adapter instead.',
    ],
    integrationGuide: {
      mentalModel:
        'Canvas Timeline owns tracks, clips, source time mapping, playback intent, and the active playhead. The HTML media adapter owns one mounted HTMLMediaElement, loads the active clip source into that element, seeks it to the clip source time, and reports the element clock back to timeline playback.',
      steps: [
        'Give each media clip a stable `sourceId`; this is the join key between timeline state and your media sources.',
        'Create a `sources` record where each key is a `sourceId` and each value is a URL, Blob, or File.',
        'Attach a React ref to one `<video>` or `<audio>` element.',
        'Pass `ref`, `sources`, and your active layer selector to `useHTMLTimelineMedia` inside a `TimelineProvider`.',
        'Use the returned transport helpers for play, pause, and playback-rate UI.',
      ],
      example: {
        label: 'Minimal React sync',
        code: `import { useRef } from 'react';
import { useHTMLTimelineMedia } from '@techsquidtv/canvas-timeline-html-media-adapter';

const sources = { 'clip-source-main': '/media/preview.mp4' };
const previewLayers = {
  visuals: { trackKind: 'visual', sourceId: 'clip-source-main' },
} as const;

// Render inside <TimelineProvider engine={engine}>.
export function NativePreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const media = useHTMLTimelineMedia({
    ref: videoRef,
    sources,
    layers: previewLayers,
  });

  return <video ref={videoRef} playsInline onClick={() => void media.play()} />;
}`,
      },
      demoNotes: [
        'The HTML Media Adapter Sync demo uses `useHTMLTimelineMedia` with `videoRef` as the single preview surface controlled by the adapter.',
        '`sampleSourceId` appears in both the clip data and the `sources` record, showing how `clip.sourceId` selects the media URL.',
        'The visual layer selector tells the high-level hook which active timeline clip should drive the native element.',
        'The rate buttons and readouts come from timeline transport state plus native element events, not from duplicated media state in the timeline.',
      ],
    },
    exports: [
      { path: '.', description: 'React adapter hooks, imperative adapter factory, and types.' },
    ],
    relatedGuides: [
      { title: 'HTML Media Adapter Sync demo', href: '/demos/html-media-sync' },
      { title: 'System architecture', href: '/docs/architecture' },
    ],
    nextSteps: [
      {
        title: 'HTML Media Adapter Sync demo',
        href: '/demos/html-media-sync',
        description: 'See the HTML media adapter driving timeline playback.',
      },
      {
        title: 'Generated API reference',
        href: '/packages/html-media-adapter/api',
        description: 'Review hook, function, and adapter exports.',
      },
    ],
  },
  {
    slug: 'mediabunny-adapter',
    name: '@techsquidtv/canvas-timeline-mediabunny-adapter',
    shortName: 'Mediabunny Adapter',
    purpose: 'Optional Mediabunny adapter for timeline media playback and frame access.',
    description:
      'Use the Mediabunny adapter when timeline clips need to drive decoded video frames, local media files, and Web Audio scheduling through Mediabunny.',
    descriptionLinks: [{ label: 'Mediabunny', href: 'https://mediabunny.dev/' }],
    installCommand: 'pnpm add @techsquidtv/canvas-timeline-mediabunny-adapter mediabunny',
    sourceLinks: [
      ...packageResourceLinks('mediabunny-adapter'),
      { label: 'Mediabunny docs', href: 'https://mediabunny.dev/' },
    ],
    whenToUse: [
      'You already use Mediabunny and want Canvas Timeline clips to drive decoded video frames and audio playback.',
      'You need local `Blob` or `File` sources mapped by `clip.sourceId` without putting media objects in timeline state.',
      'You want lower-level frame access for custom canvas composition while keeping timeline playback synchronized.',
    ],
    commonImports: [
      {
        label: 'High-level React sync hook',
        code: `import { useMediabunnyTimelineMedia } from '@techsquidtv/canvas-timeline-mediabunny-adapter/react';`,
      },
      {
        label: 'Low-level React adapter hook',
        code: `import { useMediabunnyAdapter } from '@techsquidtv/canvas-timeline-mediabunny-adapter/react';`,
      },
      {
        label: 'Imperative adapter',
        code: `import {
  createMediabunnyAdapter,
} from '@techsquidtv/canvas-timeline-mediabunny-adapter';`,
      },
    ],
    usageNotes: [
      '`mediabunny` is a peer dependency; the high-level hook lazy-loads it in the browser by default, while low-level APIs can still receive an explicit module or loader for dependency control.',
      'The adapter maps `clip.sourceId` to Mediabunny sources and keeps heavy media objects outside serialized timeline state.',
      'Use `useMediabunnyTimelineMedia` for the common React path; use `useMediabunnyAdapter`, `createMediabunnyAdapter`, and `useTimelineMediaSync` when you need custom clock or layer synchronization.',
      'For ordinary single-element playback, prefer the native HTML media adapter from `@techsquidtv/canvas-timeline-html-media-adapter`.',
    ],
    integrationGuide: {
      mentalModel:
        'Canvas Timeline still owns the timeline state, active clips, source offsets, and playback intent. The Mediabunny adapter owns decoded media inputs, frame sinks, optional audio scheduling, and the media clock needed to render the active visual/audio clips in sync.',
      steps: [
        'Give timeline media clips stable `sourceId` values and keep media files, blobs, or Mediabunny inputs in application state.',
        'Build a `sources` array where each item has an `id` matching a clip `sourceId` plus `url`, `blob`, `input`, or `createInput`.',
        'Attach a `canvasRef` when decoded video frames should be painted to a preview canvas.',
        'Pass `canvasRef`, `sources`, and your visual/audio layer selectors to `useMediabunnyTimelineMedia` inside a `TimelineProvider`.',
        'Pass a custom `mediabunny` module or loader only when you need explicit dependency control; otherwise the hook uses a browser lazy import.',
      ],
      example: {
        label: 'Minimal React sync',
        code: `import { useRef } from 'react';
import { useMediabunnyTimelineMedia } from '@techsquidtv/canvas-timeline-mediabunny-adapter/react';

const sources = [{ id: 'clip-source-main', url: '/media/preview.mp4' }];
const previewLayers = {
  visuals: { trackKind: 'visual', sourceId: 'clip-source-main' },
  audio: { trackKind: 'audio', sourceId: 'clip-source-main' },
} as const;

// Render inside <TimelineProvider engine={engine}>.
export function DecodedPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const media = useMediabunnyTimelineMedia({
    canvasRef,
    sources,
    layers: previewLayers,
  });

  return <canvas ref={canvasRef} width={1280} height={720} onClick={() => void media.play()} />;
}`,
      },
      demoNotes: [
        'The Mediabunny Adapter Sync demo uses `useMediabunnyTimelineMedia` so the visible code matches the recommended setup path.',
        '`sampleSourceId` appears in the visual/audio clips and in the Mediabunny source descriptors, showing the same `clip.sourceId` join key.',
        'The `canvasRef` preview receives decoded frames while the high-level hook returns the transport controls, status, duration, and last-frame readouts.',
        'The status panel reads `durationBySourceId` and `lastFrameTime`, which are useful for preview UI but do not need to be copied into timeline state.',
      ],
    },
    exports: [
      { path: '.', description: 'Imperative Mediabunny timeline adapter and types.' },
      { path: './react', description: 'React hook for creating and disposing the adapter.' },
    ],
    relatedGuides: [
      { title: 'Mediabunny Adapter Sync demo', href: '/demos/media-preview-sync' },
      { title: 'System architecture', href: '/docs/architecture' },
    ],
    nextSteps: [
      {
        title: 'Mediabunny Adapter Sync demo',
        href: '/demos/media-preview-sync',
        description: 'See Mediabunny driving timeline media playback.',
      },
    ],
  },
  {
    slug: 'renderer',
    name: '@techsquidtv/canvas-timeline-renderer',
    shortName: 'Renderer',
    purpose: 'Canvas rendering and worker-backed drawing primitives.',
    description:
      'Use the renderer when you want the default canvas-backed timeline visuals with the shared theme helpers.',
    installCommand: 'pnpm add @techsquidtv/canvas-timeline-renderer',
    sourceLinks: packageResourceLinks('renderer'),
    whenToUse: [
      'You need to render hundreds of clips, track lines, ticks, or markers without incurring the layout thrashing and DOM overhead of standard HTML nodes.',
      'You want to use React and CSS for low-count interaction surfaces (scrollbars, drag handles, active overlays) while delegating high-frequency drawings to an offscreen thread.',
      'You require pre-defined color presets, helper functions for generating stable clip colors, or automatic resolution of CSS/shadcn variables into canvas paint settings.',
    ],
    commonImports: [
      {
        label: 'Renderer and theme',
        code: `import {
  CanvasRenderer,
  createTimelineRendererTheme,
  defaultTimelineRendererTheme,
  getPresetColor,
} from '@techsquidtv/canvas-timeline-renderer';`,
      },
      {
        label: 'Theme-only entrypoint',
        code: `import {
  createTimelineRendererTheme,
  defaultTimelineRendererTheme,
  resolveTimelineRendererThemeFromElement,
} from '@techsquidtv/canvas-timeline-renderer/theme';`,
      },
    ],
    usageNotes: [
      'Worker-Backed Offscreen Rendering: `CanvasRenderer` automatically instantiates a Web Worker and uses `transferControlToOffscreen()` to render drawing frames off the main thread, maintaining a fluid 60 FPS.',
      'High-DPI Sizing: Uses `ResizeObserver` to monitor viewport layout changes and scales the canvas bitmap width and height by `window.devicePixelRatio` for sharp rendering on high-density displays.',
      'CSS Variable Synchronization: Resolves documented `--timeline-*` variables first, then shadcn semantic tokens such as `--background`, `--accent`, `--foreground`, `--primary`, and `--ring`, to apply application themes into canvas drawing contexts.',
      'Optimized Theme Resolution: Queries computed styles on mount or when the `themeKey` changes, avoiding expensive layout thrashing/DOM queries during live scroll, zoom, or scrub operations.',
      'Custom Theme Settings: Supports extensive canvas visual customization through the `theme` prop (covering clip backgrounds, ruler fonts, grid lines, and feedback guides).',
      'Optional Overlays: Allows hiding standard canvas overlays (`showInOutPoints`, `showSnapLines`, `showClipDropFeedback`) or opting into renderer-only In/Out endpoint strokes (`showInOutBoundaryLines`) when custom React/DOM layers are not used.',
    ],
    exports: [
      { path: '.', description: 'CanvasRenderer and theme exports.' },
      {
        path: './theme',
        description: 'Default renderer theme, color presets, and preset color helper.',
      },
    ],
    relatedGuides: [
      { title: 'System architecture', href: '/docs/architecture' },
      { title: 'Demos', href: '/demos' },
    ],
    nextSteps: [
      {
        title: 'Generated API reference',
        href: '/packages/renderer/api',
        description: 'Inspect CanvasRenderer and renderer theme symbols.',
      },
    ],
  },
  {
    slug: 'utils',
    name: '@techsquidtv/canvas-timeline-utils',
    shortName: 'Utils',
    purpose: 'Rational time and shared math helpers.',
    description:
      'Use the utility package when you need stable time conversions or math helpers without importing the editor layers.',
    installCommand: 'pnpm add @techsquidtv/canvas-timeline-utils',
    sourceLinks: packageResourceLinks('utils'),
    whenToUse: [
      'You need to perform time operations (addition, subtraction, scaling) using exact `RationalTime` fractions rather than float seconds.',
      'You require extremely lightweight time conversions, formatting (e.g., timecodes), or rounding helpers without importing any UI/editor dependencies.',
      'You want to share identical time-parsing logic across both your core application state (like server exports or video playback APIs) and your timeline components.',
    ],
    commonImports: [
      {
        label: 'Time helpers',
        code: `import {
  formatTime,
  fromSeconds,
  toSeconds,
} from '@techsquidtv/canvas-timeline-utils';`,
      },
      {
        label: 'Time-only entrypoint',
        code: `import { fromSeconds } from '@techsquidtv/canvas-timeline-utils/time';`,
      },
    ],
    usageNotes: [
      'Implements pure `RationalTime` arithmetic and conversion functions to eliminate decimal precision drifting and ensure frame-perfect math.',
      'Lightweight and decoupled, suitable for usage in backend services, export routines, or external metadata stores that require time semantic compatibility.',
      'Provides core utilities like `fromSeconds`, `toSeconds`, and `formatTime` alongside shared math functions such as clamping and rounding.',
    ],
    exports: [
      { path: '.', description: 'Time and math helper exports.' },
      { path: './time', description: 'RationalTime conversions and formatting.' },
      { path: './math', description: 'Shared clamp and rounding helpers.' },
    ],
    relatedGuides: [
      { title: 'Getting started', href: '/docs/getting-started' },
      { title: 'API reference', href: '/packages/utils/api' },
    ],
    nextSteps: [
      {
        title: 'Generated API reference',
        href: '/packages/utils/api',
        description: 'Inspect fromSeconds, toSeconds, formatTime, and shared math helpers.',
      },
      {
        title: 'Getting started',
        href: '/docs/getting-started',
        description: 'See the utilities in the context of the main editor path.',
      },
    ],
  },
];
