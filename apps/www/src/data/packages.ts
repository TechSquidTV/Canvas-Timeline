import { packageResourceLinks } from '#www/data/site';
import type { SearchOptions } from '#www/lib/search';

interface PackageExample {
  title: string;
  code: string;
  lang?: string;
}

interface PackageUsage {
  title: string;
  body: string;
  steps: string[];
}

interface PackageLink {
  title: string;
  href: string;
  description?: string;
}

interface PackageLinkGroup {
  title: string;
  links: PackageLink[];
}

export interface PackageDoc {
  slug: string;
  name: string;
  shortName: string;
  purpose: string;
  description: string;
  installCommand: string;
  overview: string[];
  useCasesTitle?: string;
  useCases?: string[];
  usage: PackageUsage;
  example: PackageExample;
  linkGroups: PackageLinkGroup[];
  search?: SearchOptions;
}

function packageLinks(slug: Parameters<typeof packageResourceLinks>[0]): PackageLinkGroup {
  return {
    title: 'Package links',
    links: packageResourceLinks(slug).map((link) => ({
      title: link.label,
      href: link.href,
    })),
  };
}

export const packageDocs: PackageDoc[] = [
  {
    slug: 'timeline',
    name: '@techsquidtv/canvas-timeline',
    shortName: 'Main package',
    purpose: 'React timeline editing toolkit.',
    description:
      'Start here when you want the common Canvas Timeline experience without choosing lower-level package boundaries up front.',
    search: {
      keywords: ['timeline editor', 'React timeline', 'quickstart'],
      priority: 'high',
    },
    installCommand: 'pnpm add @techsquidtv/canvas-timeline',
    overview: [
      'The main package is the easiest way to start a Canvas Timeline editor. It re-exports the core engine, React bindings, renderer, and time utilities from one dependency so early app code can stay focused on the editor experience.',
      'As your project grows, you can keep using this package or switch individual imports to the focused packages below. The runtime pieces are the same; the split package paths are there when you want sharper ownership boundaries.',
    ],
    useCasesTitle: 'Start here when',
    useCases: [
      'You are building a React timeline editor and want the common engine, UI bindings, renderer, and utilities together.',
      'You want one install path while you are still proving out the editor shape.',
      'You expect to use the default React interaction chrome and canvas renderer.',
    ],
    usage: {
      title: 'Start with the assembled editor surface',
      body: 'Create a `TimelineEngine`, provide it with `TimelineProvider`, render the canvas with `CanvasRenderer`, and layer the React interaction components above it. Import `styles.css` when you want the packaged structural CSS plus the default token-driven chrome.',
      steps: [
        'Create the engine with your initial tracks, clips, markers, and duration.',
        'Wrap the editor UI in `TimelineProvider`.',
        'Render `Timeline.Root`, `CanvasRenderer`, and the timeline interaction components your product needs.',
        'Import `@techsquidtv/canvas-timeline/styles.css` once in the app entry or demo source.',
      ],
    },
    example: {
      title: 'Minimal editor setup',
      lang: 'tsx',
      code: `import {
  CanvasRenderer,
  Timeline,
  TimelineEngine,
  TimelineProvider,
  fromSeconds,
} from '@techsquidtv/canvas-timeline';
import '@techsquidtv/canvas-timeline/styles.css';

const engine = new TimelineEngine({
  duration: fromSeconds(30),
  tracks: [],
});

export function Editor() {
  return (
    <TimelineProvider engine={engine}>
      <Timeline.Root>
        <CanvasRenderer />
        <Timeline.PlayheadArea />
        <Timeline.PlayheadGrabber />
        <Timeline.ClipInteractionLayer />
      </Timeline.Root>
    </TimelineProvider>
  );
}`,
    },
    linkGroups: [
      {
        title: 'Keep reading',
        links: [
          { title: 'Getting started', href: '/docs/getting-started' },
          { title: 'Packages overview', href: '/docs/packages-overview' },
        ],
      },
      packageLinks('timeline'),
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
    overview: [
      'The core package is the timeline model and editor brain without a view layer. It owns tracks, clips, markers, selections, edits, playback state, snapping, history, and active-content queries.',
      'Use it directly when React is not the right boundary, or when you want tests and non-visual logic to run without pulling in DOM components.',
    ],
    useCasesTitle: 'Reach for core when',
    useCases: [
      'You are building a timeline in another UI framework or platform.',
      'You want isolated tests for edits, snapping, history, or playback behavior.',
      'You need to keep timeline state serializable and separate from app-owned media metadata.',
    ],
    usage: {
      title: 'Own the model, bring your own UI',
      body: 'Instantiate `TimelineEngine` with plain timeline data, then call engine commands from your UI or service layer. Keep media URLs, files, waveforms, and transcripts in application storage keyed by stable ids such as `clip.sourceId`.',
      steps: [
        'Represent all times as `RationalTime` values, usually created with helpers from `@techsquidtv/canvas-timeline-utils`.',
        'Use stable ids for tracks and clips; do not derive ids from array positions.',
        'Use engine commands to preview, commit, cancel, undo, and redo edits.',
        'Subscribe to engine events when your UI needs to react to state changes.',
      ],
    },
    example: {
      title: 'Preview and commit an edit',
      lang: 'ts',
      code: `import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';

const engine = new TimelineEngine({ tracks: [] });

const preview = engine.previewEdit({
  type: 'move',
  clipId: 'clip-intro',
  startTime: fromSeconds(4),
});

if (preview.valid) {
  engine.commitEdit(preview.command);
}`,
    },
    linkGroups: [
      {
        title: 'Keep reading',
        links: [
          { title: 'System architecture', href: '/docs/architecture' },
          { title: 'Tracks and clips', href: '/docs/tracks-and-clips' },
        ],
      },
      packageLinks('core'),
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
    overview: [
      'The React package connects a `TimelineEngine` to React components and hooks. It provides the provider, timeline namespace components, interaction layers, scrollbars, range controls, and focused hooks that product UI can compose.',
      'It does not force a particular renderer. Pair it with the canvas renderer for the default high-performance surface, or use the hooks and interaction primitives with custom rendering.',
    ],
    useCasesTitle: 'Use React bindings for',
    useCases: [
      'You already have a `TimelineEngine` and want React components to observe and control it.',
      'You need package-owned interaction chrome such as playhead grabbers, clip handles, range controls, or scrollbars.',
      'You want headless hooks for editing, selection, keyframes, playback, viewport, and track state.',
    ],
    usage: {
      title: 'Bind the engine to React',
      body: 'Wrap your editor in `TimelineProvider`, render `Timeline.Root`, then add the package components that match your surface. Keep dense clip and ruler rendering on canvas; use React for low-count controls and active affordances.',
      steps: [
        'Create or receive a `TimelineEngine` instance outside the leaf interaction components.',
        'Wrap the editor with `TimelineProvider`.',
        'Use `Timeline` components for playhead, range, track, scrollbar, and clip interaction chrome.',
        'Use hooks when your product toolbar, inspector, or shortcuts need direct state and commands.',
      ],
    },
    example: {
      title: 'React interaction layer',
      lang: 'tsx',
      code: `import type { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import {
  Timeline,
  TimelineProvider,
  useTimeline,
} from '@techsquidtv/canvas-timeline-react';
import '@techsquidtv/canvas-timeline-react/styles.css';

function Tracks() {
  const { state } = useTimeline();

  return (
    <Timeline.TrackList>
      {state.tracks.map((track) => (
        <Timeline.Track key={track.id} trackId={track.id} />
      ))}
    </Timeline.TrackList>
  );
}

export function TimelineChrome({ engine }: { engine: TimelineEngine }) {
  return (
    <TimelineProvider engine={engine}>
      <Timeline.Root>
        <Timeline.PlayheadArea />
        <Timeline.PlayheadGrabber />
        <Tracks />
        <Timeline.ClipInteractionLayer />
        <Timeline.RangeSelector />
      </Timeline.Root>
    </TimelineProvider>
  );
}`,
    },
    linkGroups: [
      {
        title: 'Keep reading',
        links: [
          { title: 'React editor hooks', href: '/docs/react-hooks' },
          { title: 'React registry', href: '/packages/react/registry' },
          { title: 'Demos overview', href: '/docs/demos-overview' },
        ],
      },
      packageLinks('react'),
    ],
  },
  {
    slug: 'html-media-adapter',
    name: '@techsquidtv/canvas-timeline-html-media-adapter',
    shortName: 'HTML Media Adapter',
    purpose: 'HTMLMediaElement adapter for timeline media playback.',
    description:
      'Use the HTML media adapter when one native video or audio element should follow Canvas Timeline playback.',
    installCommand: 'pnpm add @techsquidtv/canvas-timeline-html-media-adapter',
    overview: [
      'The HTML media adapter maps timeline clips to one mounted `HTMLMediaElement`. It seeks the element to the active clip source time, lets the native media clock drive playback, and keeps object URLs out of timeline state.',
      'This is the right adapter for straightforward previews. If you need decoded frames on a canvas, custom Mediabunny inputs, or timeline-clocked audio playback outside a native media element, use the Mediabunny adapter instead.',
    ],
    useCasesTitle: 'Choose this adapter for',
    useCases: [
      'Your preview is a single native `<video>` or `<audio>` element.',
      'Browser-native media loading, controls, and embedded audio are enough for the editor preview.',
      'You want URL, `Blob`, or `File` sources keyed by `clip.sourceId` without managing object URLs yourself.',
    ],
    usage: {
      title: 'Connect one media element to timeline playback',
      body: 'Use `useHTMLTimelineMedia` for the normal React path. It creates the adapter, wires it to timeline playback, and returns transport helpers for play, pause, and rate controls.',
      steps: [
        'Give each media clip a stable `sourceId`.',
        'Create a `sources` array of `{ sourceId, input }` descriptors, one per logical source.',
        'Resolve originals or proxies in your media library, then pass equivalent load `fallbacks` only when needed.',
        'Attach a ref to one `<video>` or `<audio>` element.',
        'Pass the ref, sources, and layer selector to `useHTMLTimelineMedia` inside a `TimelineProvider`.',
      ],
    },
    example: {
      title: 'Native video preview',
      lang: 'tsx',
      code: `import { useRef } from 'react';
import { useHTMLTimelineMedia } from '@techsquidtv/canvas-timeline-html-media-adapter';

const sources = [
  {
    sourceId: 'clip-source-main',
    input: '/media/preview.mp4',
  },
] as const;
const layers = {
  visuals: { trackKind: 'visual', sourceId: 'clip-source-main' },
} as const;

export function NativePreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const media = useHTMLTimelineMedia({
    ref: videoRef,
    sources,
    layers,
  });

  return <video ref={videoRef} playsInline onClick={() => void media.play()} />;
}`,
    },
    linkGroups: [
      {
        title: 'See it running',
        links: [
          {
            title: 'HTML Media Adapter Sync demo',
            href: '/demos/html-media-sync',
            description:
              'A source-backed demo of one native video element following timeline playback.',
          },
          { title: 'System architecture', href: '/docs/architecture' },
        ],
      },
      packageLinks('html-media-adapter'),
    ],
  },
  {
    slug: 'mediabunny-adapter',
    name: '@techsquidtv/canvas-timeline-mediabunny-adapter',
    shortName: 'Mediabunny Adapter',
    purpose: 'Optional Mediabunny adapter for timeline media playback and frame access.',
    description:
      'Use the Mediabunny adapter when your editor needs decoded canvas frames, local media inputs, or a timeline-aware media monitor instead of one native media element.',
    installCommand: 'pnpm add @techsquidtv/canvas-timeline-mediabunny-adapter mediabunny',
    overview: [
      'The Mediabunny adapter is for timeline preview monitors that need decoded media, not just a mounted `<video>` tag. It uses Mediabunny to open sources and decode frames and audio buffers, paints video frames to a canvas, queues decoded audio through Web Audio against the timeline clock, and exposes frame and duration state for monitor UI.',
      'In React, start with `useMediabunnyTimelineMedia`. It creates the adapter and connects it to timeline playback. Drop down to `useMediabunnyAdapter` or `createMediabunnyAdapter` only when you are building custom sync, sharing an adapter between controls, or owning lifecycle outside React.',
    ],
    usage: {
      title: 'Decode media without putting media in timeline state',
      body: 'Timeline clips keep lightweight `sourceId` values. Your app keeps the actual files, URLs, or Mediabunny inputs outside the timeline and passes matching source descriptors to the adapter.',
      steps: [
        'Give each media clip a stable `sourceId`.',
        'Create a `sources` array where each logical source has a matching `sourceId` and app-resolved `input`.',
        'Resolve originals or proxies in app state and use `fallbacks` only for equivalent transport failover.',
        'Attach a canvas ref for decoded video frames.',
        'Pass the canvas ref, sources, and visual/audio layer selectors to `useMediabunnyTimelineMedia` inside a `TimelineProvider`.',
        'Use the returned transport helpers for playback and the returned duration/frame state for preview UI.',
      ],
    },
    example: {
      title: 'Decoded canvas preview',
      lang: 'tsx',
      code: `import { useRef } from 'react';
import { useMediabunnyTimelineMedia } from '@techsquidtv/canvas-timeline-mediabunny-adapter/react';

const sourceId = 'clip-source-main';
const sources = [{
  sourceId,
  input: '/media/preview.mp4',
}] as const;
const layers = {
  visuals: { trackKind: 'visual', sourceId },
  audio: { trackKind: 'audio', sourceId },
} as const;

export function DecodedPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const media = useMediabunnyTimelineMedia({
    canvasRef,
    sources,
    layers,
  });

  return <canvas ref={canvasRef} width={1280} height={720} onClick={() => void media.play()} />;
}`,
    },
    linkGroups: [
      {
        title: 'See it running',
        links: [
          {
            title: 'Mediabunny Adapter Sync demo',
            href: '/demos/media-preview-sync',
            description:
              'A source-backed demo of decoded canvas frames, timeline-clocked audio, and transport controls.',
          },
          { title: 'Mediabunny docs', href: 'https://mediabunny.dev/' },
          { title: 'System architecture', href: '/docs/architecture' },
        ],
      },
      packageLinks('mediabunny-adapter'),
    ],
  },
  {
    slug: 'renderer',
    name: '@techsquidtv/canvas-timeline-renderer',
    shortName: 'Renderer',
    purpose: 'Canvas rendering and worker-backed drawing primitives.',
    description:
      'Use the renderer when you want the default canvas-backed timeline visuals with shared theme helpers.',
    installCommand: 'pnpm add @techsquidtv/canvas-timeline-renderer',
    overview: [
      'The renderer draws the dense parts of a timeline: clips, track lanes, ruler ticks, markers, snap lines, and feedback overlays. It keeps those visuals on canvas so zooming, scrolling, and playback do not create hundreds of DOM nodes.',
      'Pair it with the React package for the default split: canvas for dense visuals, React and CSS for low-count interaction chrome.',
    ],
    useCasesTitle: 'Use the renderer when',
    useCases: [
      'You want the default Canvas Timeline drawing pipeline.',
      'You need worker-backed rendering for dense clip and ruler surfaces.',
      'You want renderer theme helpers that resolve CSS and shadcn-style tokens into canvas colors.',
    ],
    usage: {
      title: 'Render dense timeline visuals on canvas',
      body: 'Place `CanvasRenderer` inside `Timeline.Root` while a `TimelineProvider` is active. Let the renderer own repeated visual drawing and keep product controls, inspectors, and interaction affordances in React.',
      steps: [
        'Create a `TimelineEngine` with tracks, clips, markers, and viewport state.',
        'Render `CanvasRenderer` inside the timeline root.',
        'Import package styles from the React or main package so DOM chrome has structural CSS.',
        'Customize renderer theme options only when app-level tokens are not enough.',
      ],
    },
    example: {
      title: 'Canvas renderer inside a timeline',
      lang: 'tsx',
      code: `import type { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { Timeline, TimelineProvider } from '@techsquidtv/canvas-timeline-react';
import { CanvasRenderer } from '@techsquidtv/canvas-timeline-renderer';

export function TimelineCanvas({ engine }: { engine: TimelineEngine }) {
  return (
    <TimelineProvider engine={engine}>
      <Timeline.Root>
        <CanvasRenderer />
        <Timeline.PlayheadGrabber />
        <Timeline.ClipInteractionLayer />
      </Timeline.Root>
    </TimelineProvider>
  );
}`,
    },
    linkGroups: [
      {
        title: 'Keep reading',
        links: [
          { title: 'Renderer customization', href: '/docs/renderer-customization' },
          { title: 'System architecture', href: '/docs/architecture' },
          { title: 'Demos', href: '/demos' },
        ],
      },
      packageLinks('renderer'),
    ],
  },
  {
    slug: 'utils',
    name: '@techsquidtv/canvas-timeline-utils',
    shortName: 'Utils',
    purpose: 'Rational time and shared math helpers.',
    description:
      'Use the utility package when you need stable time conversions or math helpers without importing editor layers.',
    installCommand: 'pnpm add @techsquidtv/canvas-timeline-utils',
    overview: [
      'The utility package contains rational-time helpers and small shared math functions. It is intentionally light so apps, tests, server export code, and package internals can agree on timeline time math without importing React or the engine.',
      'Use these helpers at the edges of your app when converting from seconds, frame counts, timecode strings, or UI input into the rational time values expected by Canvas Timeline.',
    ],
    useCasesTitle: 'Use the utilities for',
    useCases: [
      'You need exact `RationalTime` values instead of floating-point seconds.',
      'You are formatting or parsing timeline time outside the React components.',
      'You want shared clamp, rounding, and arithmetic helpers without editor dependencies.',
    ],
    usage: {
      title: 'Convert at the app boundary',
      body: 'Keep timeline state in rational time. Convert from seconds or timecode when data enters the timeline, then convert back only for display, media APIs, or export code that requires decimal seconds.',
      steps: [
        'Use `fromSeconds` when creating timeline state from ordinary media durations or UI values.',
        'Use `toSeconds` when passing playhead or clip times to browser media APIs.',
        'Use formatting helpers for readouts and editable timecode fields.',
      ],
    },
    example: {
      title: 'Rational time helpers',
      lang: 'ts',
      code: `import {
  addRational,
  formatTime,
  fromSeconds,
  toSeconds,
} from '@techsquidtv/canvas-timeline-utils';

const start = fromSeconds(12);
const duration = fromSeconds(3.5);
const end = addRational(start, duration);

console.log(formatTime(end));
console.log(toSeconds(end));`,
    },
    linkGroups: [
      {
        title: 'Keep reading',
        links: [
          { title: 'Rational time', href: '/docs/rational-time' },
          { title: 'Getting started', href: '/docs/getting-started' },
        ],
      },
      packageLinks('utils'),
    ],
  },
];
