import { apiSymbolHref, getApiSymbol } from '@/lib/api-reference';
import {
  timelineHookMetadata,
  type TimelineHookGroupId,
  type TimelineHookReactivity,
} from '@techsquidtv/canvas-timeline-react/docs-metadata';

type ReactRegistryKind = 'component' | 'primitive' | 'hook';
export type ReactRegistryDemoVariant =
  | 'timeline-surface'
  | 'track'
  | 'clip'
  | 'playhead'
  | 'range-selection'
  | 'range-scrollbar'
  | 'timecode-field-basic'
  | 'timecode-field-formatting'
  | 'timecode-input-basic'
  | 'timecode-input-formatting'
  | 'viewport-scrollbar'
  | 'vertical-scrollbar'
  | 'timeline-state'
  | 'editing-hooks'
  | 'playback-controls'
  | 'accessible-controls';

interface ReactRegistryDemo {
  variant: ReactRegistryDemoVariant;
  title: string;
  description: string;
  href?: string;
}

export interface ReactRegistryApi {
  name: string;
  description: string;
  apiSlug?: string;
  apiHref?: string;
  category?: string;
  reactivity?: TimelineHookReactivity;
}

interface ReactRegistryExample {
  title: string;
  description: string;
  demo: ReactRegistryDemo;
  usageCode?: string;
}

interface ReactRegistryProp {
  name: string;
  type: string;
  description: string;
}

export interface ReactRegistryItem {
  slug: string;
  kind: ReactRegistryKind;
  name: string;
  title: string;
  description: string;
  importPath: string;
  packageName?: string;
  installPackages?: string;
  sourceTitle?: string;
  usageCode: string;
  demo: ReactRegistryDemo;
  examples?: ReactRegistryExample[];
  apis: ReactRegistryApi[];
  props?: ReactRegistryProp[];
  notes?: string[];
}

export interface ReactRegistryGroup {
  id: string;
  title: string;
  description: string;
  kind: ReactRegistryKind;
  items: ReactRegistryItem[];
}

export interface ReactRegistryPageSection {
  id: string;
  label: string;
}

export const reactRegistryPackageName = '@techsquidtv/canvas-timeline-react';
const componentImportPath = '@techsquidtv/canvas-timeline-react';
const hookImportPath = '@techsquidtv/canvas-timeline-react/hooks';
const rangeScrollbarImportPath = '@techsquidtv/canvas-timeline-react/range-scrollbar';
const timecodeFieldImportPath = '@techsquidtv/canvas-timeline-react/timecode-field';
const timecodeInputImportPath = '@techsquidtv/canvas-timeline-react/timecode-input';

export function getReactRegistryPackageName(item?: ReactRegistryItem) {
  return item?.packageName ?? reactRegistryPackageName;
}

export function getReactRegistryInstallPackages(item?: ReactRegistryItem) {
  return item?.installPackages ?? getReactRegistryPackageName(item);
}

export function getReactRegistryStyleImport(
  item: ReactRegistryItem | undefined,
  stylesheet: 'base.css' | 'styles.css'
) {
  return `import '${getReactRegistryPackageName(item)}/${stylesheet}';`;
}

export function getReactRegistryApiHref(api: ReactRegistryApi) {
  if (!api.apiSlug) {
    return api.apiHref;
  }

  const symbol = getApiSymbol('react', api.apiSlug);

  if (!symbol) {
    throw new Error(`Unknown React API slug "${api.apiSlug}" for ${api.name}`);
  }

  return apiSymbolHref('react', symbol.slug);
}

export function getReactRegistryItem(slug: string) {
  return reactRegistryItems.find((item) => item.slug === slug);
}

export function getReactRegistryPageSections(item: ReactRegistryItem): ReactRegistryPageSection[] {
  return [
    { id: 'installation', label: 'Installation' },
    { id: 'usage', label: 'Usage' },
    ...(item.examples && item.examples.length > 0 ? [{ id: 'examples', label: 'Examples' }] : []),
    ...(item.notes && item.notes.length > 0 ? [{ id: 'notes', label: 'Notes' }] : []),
    { id: 'api-reference', label: 'API Reference' },
  ];
}

const componentNotes = [
  'Render these components inside a `TimelineProvider` so they can read the shared `TimelineEngine`.',
  'Import `@techsquidtv/canvas-timeline-react/styles.css` when your app defines shadcn-compatible semantic tokens, or `base.css` when supplying your own theme.',
  'CSS styles interaction layers; renderer theme styles canvas-painted timeline visuals.',
  'Use the theming guide when CSS tokens should drive canvas-painted colors.',
];

const rangeScrollbarNotes = [
  '`RangeScrollbar` is controlled-only: keep the visible range in React state and update it from `onValueChange`.',
  'The generic primitive uses caller-provided numeric units and has no TimelineEngine dependency.',
  'Import `@techsquidtv/canvas-timeline-react/styles.css` when your app defines shadcn-compatible semantic tokens, or `base.css` when supplying your own theme.',
];

const timecodeInputNotes = [
  'Choose `TimecodeInput` for form-like controls where the editable text box is always visible.',
  'Supports typing unit suffixes like "60s" (seconds), "500ms" (milliseconds), "2m" (minutes), or "24f" (frames, requiring frameRate).',
  'You own the surrounding label, submit/apply action, error message, and conversion from parsed seconds into RationalTime.',
  'Pass `invalid` when parsing fails so your own field wrapper can show an error message or disable an Apply action.',
  'Parsing preserves entered decimal precision by default; pass rounding: "centisecond" only for legacy or display-like workflows.',
  'Frame text such as `HH:MM:SS:FF` requires a `frameRate` in both format and parse options.',
  'Convert parsed seconds with `fromSeconds(parsed, sequenceRate)` so `RationalTime` performs final tick rounding at your app boundary.',
  'Choose `TimecodeField` instead when the value should read like compact editor chrome until the user activates it.',
];

const timecodeFieldNotes = [
  'Choose `TimecodeField` for playhead clocks, clip boundaries, trim controls, and other dense editor chrome where an always-visible input adds visual noise.',
  '`TimecodeField` renders as a compact value first, then swaps to `TimecodeInput` only while the user is making a typed correction.',
  'Root owns draft text, invalid state, Enter/Escape handling, blur commit/cancel, focus restore, and width reservation.',
  '`onCommit` receives both seconds and `RationalTime` details so frame-perfect consumers can store `details.time` directly.',
  'Frame-rate and drop-frame parsing are inferred from `formatOptions`; pass `parseOptions` only when draft parsing should differ from display formatting.',
  'Choose `TimecodeInput` instead when the text box should stay visible and your own form should own apply/cancel/error behavior.',
];

const timelineSurfaceDemo: ReactRegistryDemo = {
  variant: 'timeline-surface',
  title: 'Timeline surface preview',
  description: 'A compact surface with track rows, clips, a ruler, and playhead affordances.',
  href: '/demos/basic-editor-surface',
};

const trackDemo: ReactRegistryDemo = {
  variant: 'track',
  title: 'Track preview',
  description: 'A focused row layout showing track lanes and nested clip content.',
  href: '/demos/basic-editor-surface',
};

const clipDemo: ReactRegistryDemo = {
  variant: 'clip',
  title: 'Clip preview',
  description: 'A single clip affordance with label, duration, and trim edges.',
  href: '/demos/basic-editor-surface',
};

const playheadDemo: ReactRegistryDemo = {
  variant: 'playhead',
  title: 'Playhead preview',
  description: 'A scrub lane with the playhead line and grabber separated from editor chrome.',
  href: '/demos/timeline-editor-controls',
};

const rangeSelectionDemo: ReactRegistryDemo = {
  variant: 'range-selection',
  title: 'Range selection preview',
  description:
    'In and out handles framing a timeline range on the same surface as a draggable playhead.',
  href: '/demos/timeline-editor-controls',
};

const rangeScrollbarDemo: ReactRegistryDemo = {
  variant: 'range-scrollbar',
  title: 'Range scrollbar preview',
  description: 'A generic controlled range window with draggable thumb and resize handles.',
};

const timecodeInputDemo: ReactRegistryDemo = {
  variant: 'timecode-input-basic',
  title: 'Basic timecode input',
  description: 'An always-visible controlled text box for typing and validating timecode text.',
};

const timecodeInputFormattingDemo: ReactRegistryDemo = {
  variant: 'timecode-input-formatting',
  title: 'Formatting',
  description: 'Type a timeline position, then choose the format used to rewrite the input text.',
};

const timecodeFieldDemo: ReactRegistryDemo = {
  variant: 'timecode-field-basic',
  title: 'Basic timecode field',
  description: 'A compact read-first value that temporarily opens a TimecodeInput for edits.',
};

const timecodeFieldFormattingDemo: ReactRegistryDemo = {
  variant: 'timecode-field-formatting',
  title: 'Formatting',
  description:
    'Switch the compact field between seconds, clock, frame, and drop-frame output formats.',
};

const viewportScrollbarDemo: ReactRegistryDemo = {
  variant: 'viewport-scrollbar',
  title: 'Viewport scrollbar preview',
  description: 'Timeline-aware range controls wired to scrollLeft and zoomScale.',
  href: '/demos/basic-editor-surface',
};

const verticalScrollbarDemo: ReactRegistryDemo = {
  variant: 'vertical-scrollbar',
  title: 'Vertical scrollbar preview',
  description: 'Track-stack scroll controls wired to scrollTop.',
  href: '/demos/timeline-editor-controls',
};

const timelineStateDemo: ReactRegistryDemo = {
  variant: 'timeline-state',
  title: 'State readout preview',
  description: 'A small status view for tracks, active clips, selected media, and engine state.',
};

const editingHooksDemo: ReactRegistryDemo = {
  variant: 'editing-hooks',
  title: 'Editing action preview',
  description: 'A focused action strip for selection, clipboard, history, and marker hooks.',
  href: '/demos/timeline-editor-controls',
};

const playbackControlsDemo: ReactRegistryDemo = {
  variant: 'playback-controls',
  title: 'Playback controls preview',
  description: 'Transport, range, snapping, and viewport controls driven by focused editor hooks.',
  href: '/demos/timeline-editor-controls',
};

const accessibleControlsDemo: ReactRegistryDemo = {
  variant: 'accessible-controls',
  title: 'Accessible controls preview',
  description: 'Base UI-compatible control props and formatted ARIA values for editor chrome.',
  href: '/demos/timeline-editor-controls',
};

interface HookRegistryGroupConfig {
  slug: TimelineHookGroupId;
  name: string;
  title: string;
  description: string;
  demo: ReactRegistryDemo;
  sourceTitle: string;
  usageCode: string;
  installPackages?: string;
  notes?: string[];
}

const hookRegistryGroupConfigs: readonly HookRegistryGroupConfig[] = [
  {
    slug: 'timeline-state',
    name: 'Timeline State',
    title: 'Timeline State',
    description: 'Hooks for reading the TimelineEngine, state snapshot, and active layers.',
    demo: timelineStateDemo,
    sourceTitle: 'TimelineSummary.tsx',
    usageCode: `import {
  useTimeline,
  useTimelineState,
} from '@techsquidtv/canvas-timeline-react/hooks';

export function TimelineSummary() {
  const { engine } = useTimeline();
  const state = useTimelineState();

  return <span>{state.tracks.length} tracks</span>;
}`,
    notes: ['Call these hooks inside components wrapped by TimelineProvider.'],
  },
  {
    slug: 'editing-hooks',
    name: 'Editing Hooks',
    title: 'Editing Hooks',
    description:
      'Hooks for edit modes, typed commands, previews, range edits, selection, clipboard, and history.',
    demo: editingHooksDemo,
    sourceTitle: 'EditActions.tsx',
    usageCode: `import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import {
  useTimelineClips,
  useTimelineClipboard,
  useTimelineEditCommands,
  useTimelineEditImpacts,
  useTimelineEditMode,
  useTimelineEditPreview,
  useTimelineHistory,
  useTimelineRangeSelection,
} from '@techsquidtv/canvas-timeline-react/hooks';

export function EditActions() {
  const { selectedClip } = useTimelineClips();
  const { copySelection } = useTimelineClipboard();
  const editMode = useTimelineEditMode();
  const editCommands = useTimelineEditCommands();
  const editPreview = useTimelineEditPreview();
  const editImpacts = useTimelineEditImpacts();
  const rangeSelection = useTimelineRangeSelection();
  const { canUndo, undo } = useTimelineHistory();

  return (
    <>
      {editPreview.previewing && <span>{editImpacts.impacts.length} clips affected</span>}
      <button onClick={() => editMode.setMode('trim')}>Trim</button>
      <button disabled={!selectedClip} onClick={copySelection}>Copy</button>
      <button
        disabled={!selectedClip}
        onClick={() =>
          selectedClip &&
          editCommands.moveClip({
            clipId: selectedClip.id,
            startTime: fromSeconds(4),
          })
        }
      >
        Move
      </button>
      <button disabled={!rangeSelection.hasRange} onClick={() => rangeSelection.liftRange()}>
        Lift
      </button>
      <button disabled={!canUndo} onClick={undo}>Undo</button>
    </>
  );
}`,
    notes: [
      '`useActiveMarkers` is a live playhead hook; compose it only in marker readouts or navigation that should update while scrubbing.',
      '`useTimelineEditCommands` calls TimelineEngine command APIs for validation, preview, commit, and cancel flows.',
      '`useTimelineEditPreview` is the shared command preview hook for validity and command state.',
      '`useTimelineEditImpacts` is the affected-clip consequence hook; compose it in UI that needs preview or drag-time edit consequences, not broad toolbar state.',
      '`useTimelineClipDropFeedback` is a live interaction hook; compose it in focused drag affordances instead of broad editor chrome.',
    ],
  },
  {
    slug: 'playback-controls',
    name: 'Playback Controls',
    title: 'Playback Controls',
    description:
      'Hooks for transport state, snapping, media synchronization, and clip playback effects.',
    demo: playbackControlsDemo,
    sourceTitle: 'Transport.tsx',
    usageCode: `import {
  useTimelinePlayback,
  useTimelineSnapping,
  useTimelineViewport,
} from '@techsquidtv/canvas-timeline-react/hooks';

export function Transport() {
  const playback = useTimelinePlayback();
  const snapping = useTimelineSnapping();
  const viewport = useTimelineViewport();

  return (
    <>
      <button onClick={playback.togglePlayback}>
        {playback.playing ? 'Pause' : 'Play'}
      </button>
      <button onClick={() => snapping.setEnabled(!snapping.enabled)}>
        {snapping.enabled ? 'Snapping on' : 'Snapping off'}
      </button>
      <button onClick={() => viewport.setZoomScale(viewport.zoomScale - 50)}>Zoom out</button>
      <button onClick={() => viewport.setZoomScale(viewport.zoomScale + 50)}>Zoom in</button>
    </>
  );
}`,
  },
  {
    slug: 'accessible-controls',
    name: 'Accessible Controls',
    title: 'Accessible Controls',
    description:
      'Hook-first control adapters for Base UI sliders, viewport scrollbars, and constant-DOM clip navigation.',
    demo: accessibleControlsDemo,
    sourceTitle: 'AccessibleTimelineControls.tsx',
    installPackages: `${reactRegistryPackageName} @base-ui/react`,
    usageCode: `import { Slider } from '@base-ui/react/slider';
import {
  useTimelineClipNavigation,
  useTimelinePlayheadControl,
} from '@techsquidtv/canvas-timeline-react/hooks';

export function AccessibleTimelineControls() {
  const playhead = useTimelinePlayheadControl();
  const clips = useTimelineClipNavigation();

  return (
    <>
      <Slider.Root {...playhead.rootProps}>
        <Slider.Control>
          <Slider.Track>
            <Slider.Indicator />
            <Slider.Thumb {...playhead.thumbProps} />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
      <div {...clips.focusTargetProps}>{clips.activeClip?.name}</div>
    </>
  );
}`,
    notes: [
      'These hooks are scoped to focused elements or returned commands; they do not install global keyboard listeners.',
      'Use domain hooks such as useTimelinePlayback and useTimelineViewport for toolbar actions; use these adapters when composing semantic controls from Base UI or the range scrollbar primitive.',
      'useTimelineClipNavigation keeps clips canvas-rendered and exposes one active item instead of one DOM node per clip.',
    ],
  },
] as const;

const reactHookRegistryApis = timelineHookMetadata.map((hook) => ({
  name: hook.name,
  description: hook.description,
  apiSlug: slugifyApiSymbolName(hook.name),
  category: hook.category,
  reactivity: hook.reactivity,
}));

const reactHookMetadataByName = new Map(timelineHookMetadata.map((hook) => [hook.name, hook]));

function slugifyApiSymbolName(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function createHookRegistryItems(): ReactRegistryItem[] {
  return hookRegistryGroupConfigs.map((group) => ({
    slug: group.slug,
    kind: 'hook',
    name: group.name,
    title: group.title,
    description: group.description,
    importPath: hookImportPath,
    installPackages: group.installPackages,
    demo: group.demo,
    sourceTitle: group.sourceTitle,
    usageCode: group.usageCode,
    apis: reactHookRegistryApis.filter(
      (api) => reactHookMetadataByName.get(api.name)?.group === group.slug
    ),
    notes: group.notes,
  }));
}

const hookRegistryItems = createHookRegistryItems();

export const reactRegistryItems: ReactRegistryItem[] = [
  {
    slug: 'timeline-surface',
    kind: 'component',
    name: 'Timeline Surface',
    title: 'Timeline Surface',
    description:
      'The root interaction shell for panning, zooming, selecting, and arranging tracks.',
    importPath: componentImportPath,
    demo: timelineSurfaceDemo,
    sourceTitle: 'EditorSurface.tsx',
    usageCode: `import { Timeline } from '@techsquidtv/canvas-timeline-react';

export function EditorSurface() {
  return (
    <Timeline.Root className="h-96">
      <Timeline.TrackList>
        <Timeline.Track trackId="video-1" />
      </Timeline.TrackList>
    </Timeline.Root>
  );
}`,
    apis: [
      {
        name: 'Timeline.Root',
        description: 'Provider-aware interaction surface root for pan, zoom, and selection.',
      },
      {
        name: 'Timeline.TrackList',
        description: 'Scrollable container for timeline track rows.',
      },
      {
        name: 'Timeline.KeyboardScope',
        description: 'Focus-scoped wrapper for opt-in timeline keyboard shortcuts.',
        apiSlug: 'keyboard-scope-props',
      },
    ],
    notes: componentNotes,
  },
  {
    slug: 'track',
    kind: 'component',
    name: 'Track',
    title: 'Track',
    description: 'Timeline rows and optional DOM headers that size themselves from track state.',
    importPath: componentImportPath,
    demo: trackDemo,
    sourceTitle: 'VideoTrack.tsx',
    usageCode: `import { Timeline } from '@techsquidtv/canvas-timeline-react';

export function VideoTrack() {
  return (
    <div className="grid grid-cols-[12rem_minmax(0,1fr)]">
      <Timeline.TrackHeaderList>
        <Timeline.TrackHeader trackId="video-1" />
      </Timeline.TrackHeaderList>
      <Timeline.Track trackId="video-1" />
    </div>
  );
}`,
    apis: [
      {
        name: 'Timeline.Track',
        description: 'Track row element bound to a track id and synchronized row height.',
        apiSlug: 'track-item-props',
      },
      {
        name: 'Timeline.TrackHeaderList',
        description: 'Static left-column container for DOM track headers.',
        apiSlug: 'track-header-list-props',
      },
      {
        name: 'Timeline.TrackHeader',
        description: 'DOM track header row bound to one track id and synchronized row height.',
        apiSlug: 'track-header-props',
      },
      {
        name: 'Timeline.TrackHeaderResizeHandle',
        description: 'Pointer-captured handle for resizing a track from its header row.',
        apiSlug: 'track-header-resize-handle-props',
      },
    ],
    props: [
      {
        name: 'trackId',
        type: 'string',
        description: 'Id of the track row or header that should bind to timeline state.',
      },
    ],
    notes: componentNotes,
  },
  {
    slug: 'clip',
    kind: 'component',
    name: 'ClipInteractionLayer',
    title: 'Clip Interaction Layer',
    description: 'A delegated clip hit-test and edit layer for canvas-rendered timeline clips.',
    importPath: componentImportPath,
    demo: clipDemo,
    sourceTitle: 'ClipInteractions.tsx',
    usageCode: `import { Timeline } from '@techsquidtv/canvas-timeline-react';

export function ClipInteractions() {
  return (
    <Timeline.Root className="h-96">
      <Timeline.TrackList>
        <Timeline.Track trackId="video-1" />
      </Timeline.TrackList>
      <Timeline.ClipInteractionLayer />
    </Timeline.Root>
  );
}`,
    apis: [
      {
        name: 'Timeline.ClipInteractionLayer',
        description:
          'Constant-DOM layer for selecting, dragging, and trimming canvas-rendered clips.',
        apiSlug: 'clip-interaction-layer-props',
      },
    ],
    props: [
      {
        name: 'rulerHeight',
        type: 'number',
        description: 'Canvas ruler height used to align hit testing and overlay placement.',
      },
      {
        name: 'trackHeight',
        type: 'number',
        description: 'Default expanded track height used for hit testing.',
      },
      {
        name: 'edgeThreshold',
        type: 'number',
        description: 'Mouse and pen trim-edge hit threshold in pixels.',
      },
    ],
    notes: [
      ...componentNotes,
      'Timeline.ClipInteractionLayer does not paint clip bodies. Clip fill, label, and selected border are canvas-rendered for performance.',
      'The layer renders one active affordance instead of one DOM subtree per clip.',
      'Active drag and trim gestures rely on Pointer Events pointer capture, with lostpointercapture cleanup instead of window-level fallback listeners.',
      'Per-clip color comes from clip.color data before renderer theme fallback colors.',
    ],
  },
  {
    slug: 'playhead',
    kind: 'component',
    name: 'Playhead',
    title: 'Playhead',
    description: 'Scrub and marker interactions for moving through timeline time.',
    importPath: componentImportPath,
    demo: playheadDemo,
    sourceTitle: 'PlayheadLayer.tsx',
    usageCode: `import { Timeline } from '@techsquidtv/canvas-timeline-react';

export function PlayheadLayer() {
  return (
    <>
      <Timeline.PlayheadArea className="absolute inset-0" />
      <Timeline.PlayheadGrabber />
    </>
  );
}`,
    apis: [
      {
        name: 'Timeline.PlayheadArea',
        description: 'Transparent scrub area for moving the playhead and marker actions.',
        apiSlug: 'playhead-area-props',
      },
      {
        name: 'Timeline.PlayheadGrabber',
        description: 'Draggable playhead handle with double-click marker behavior.',
        apiSlug: 'playhead-grabber-props',
      },
    ],
    props: [
      {
        name: 'onDoubleClick',
        type: '(time, engine, event) => void',
        description: 'Optional handler for double-click or double-tap marker behavior.',
      },
    ],
    notes: componentNotes,
  },
  {
    slug: 'range-selection',
    kind: 'component',
    name: 'Range Selection',
    title: 'Range Selection',
    description:
      'Accessible, full-height timeline range selector built on @base-ui/react for loop, export, or selection boundaries.',
    importPath: componentImportPath,
    demo: rangeSelectionDemo,
    sourceTitle: 'RangeHandles.tsx',
    usageCode: `import { Timeline } from '@techsquidtv/canvas-timeline-react';

export function RangeHandles() {
  return <Timeline.RangeSelector />;
}`,
    apis: [
      {
        name: 'Timeline.RangeSelector',
        description:
          'Full-height timeline overlay for dragging In/Out boundaries with Base UI slider semantics.',
      },
      {
        name: 'Timeline.RangeSelector.Root',
        description: 'Provider-aware Base UI root for custom dual-thumb range controls.',
      },
      {
        name: 'Timeline.RangeSelector.Control',
        description: 'Wrapper around Slider.Control interaction zone.',
      },
      {
        name: 'Timeline.RangeSelector.Track',
        description: 'Wrapper around Slider.Track track boundary.',
      },
      {
        name: 'Timeline.RangeSelector.Indicator',
        description: 'Wrapper around Slider.Indicator representing active loop area.',
      },
      {
        name: 'Timeline.RangeSelector.Thumb',
        description: 'Interactive thumb for In or Out points (specifying index).',
      },
    ],
    props: [
      {
        name: 'inPointChildren',
        type: 'ReactNode | (props) => ReactNode',
        description:
          'Optional custom content for the In-point grabber, rendered inside the Base UI thumb.',
      },
      {
        name: 'outPointChildren',
        type: 'ReactNode | (props) => ReactNode',
        description:
          'Optional custom content for the Out-point grabber, rendered inside the Base UI thumb.',
      },
      {
        name: 'snap',
        type: 'boolean',
        description: 'Whether pointer-driven boundary edits should snap to timeline targets.',
      },
    ],
    notes: [
      ...componentNotes,
      'Requires react-dom alongside React because the headless slider interaction layer is provided by Base UI.',
      'The default component keeps only the two thumbs pointer-active so clips, blank lanes, and playhead interactions can pass through.',
    ],
  },
  {
    slug: 'range-scrollbar',
    kind: 'primitive',
    name: 'Range Scrollbar',
    title: 'Range Scrollbar',
    description: 'A generic controlled range-window scrollbar primitive with an optional hook API.',
    importPath: rangeScrollbarImportPath,
    demo: rangeScrollbarDemo,
    sourceTitle: 'ClipRangeScrollbar.tsx',
    usageCode: `import { useState } from 'react';
import { RangeScrollbar } from '@techsquidtv/canvas-timeline-react/range-scrollbar';

export function ClipRangeScrollbar() {
  const [value, setValue] = useState({ start: 10, end: 45 });

  return (
    <RangeScrollbar.Root
      min={0}
      max={100}
      value={value}
      minSpan={5}
      onValueChange={setValue}
    >
      <RangeScrollbar.Thumb>
        <RangeScrollbar.Handle side="start" />
        <RangeScrollbar.Handle side="end" />
      </RangeScrollbar.Thumb>
    </RangeScrollbar.Root>
  );
}`,
    apis: [
      {
        name: 'RangeScrollbar.Root',
        description: 'Controlled generic range scrollbar root.',
        apiSlug: 'range-scrollbar-root-props',
      },
      {
        name: 'RangeScrollbar.Thumb',
        description: 'Draggable thumb representing the visible range window.',
        apiSlug: 'range-scrollbar-thumb-props',
      },
      {
        name: 'RangeScrollbar.Handle',
        description: 'Resize handle for the start or end of the visible range.',
        apiSlug: 'range-scrollbar-handle-props',
      },
      {
        name: 'useRangeScrollbar',
        description:
          'Primitive hook for custom range scrollbar geometry and range updates from the range-scrollbar entrypoint.',
        apiSlug: 'use-range-scrollbar',
      },
    ],
    props: [
      {
        name: 'min',
        type: 'number',
        description: 'Lower bound of the full scrollable domain.',
      },
      {
        name: 'max',
        type: 'number',
        description: 'Upper bound of the full scrollable domain.',
      },
      {
        name: 'value',
        type: '{ start: number; end: number }',
        description: 'Controlled visible range in caller-defined domain units.',
      },
      {
        name: 'minSpan',
        type: 'number',
        description: 'Smallest allowed span between value.start and value.end.',
      },
      {
        name: 'onValueChange',
        type: '(value, details) => void',
        description: 'Callback used to store the next controlled range.',
      },
      {
        name: 'getAriaValueText',
        type: '(value, details) => string',
        description: 'Optional formatter for thumb and handle aria-valuetext output.',
      },
      {
        name: 'disabled',
        type: 'boolean',
        description: 'Disables pointer and keyboard interactions while keeping parts rendered.',
      },
      {
        name: 'side',
        type: "'start' | 'end'",
        description: 'Resize handle side for RangeScrollbar.Handle.',
      },
    ],
    notes: [
      ...rangeScrollbarNotes,
      '`useRangeScrollbar` is a primitive hook imported from @techsquidtv/canvas-timeline-react/range-scrollbar, not from the timeline hooks subpath.',
    ],
  },
  {
    slug: 'timecode-input',
    kind: 'primitive',
    name: 'TimecodeInput',
    title: 'Timecode Input',
    description:
      'An always-editable text input for timecode forms: users type seconds, m:ss, h:mm:ss, or frame text while your UI owns validation, labels, and apply behavior.',
    importPath: timecodeInputImportPath,
    demo: timecodeInputDemo,
    sourceTitle: 'ClipStartTimecode.tsx',
    usageCode: `import { useState } from 'react';
import {
  TimecodeInput,
  parseTimecodeInput,
} from '@techsquidtv/canvas-timeline-react/timecode-input';

export function ClipStartTimecode() {
  const [text, setText] = useState('90.5');
  const invalid = parseTimecodeInput(text) === null;

  return (
    <TimecodeInput
      aria-label="Clip start"
      value={text}
      invalid={invalid}
      onValueChange={setText}
    />
  );
}`,
    examples: [
      {
        title: 'Formatting',
        description:
          'Keep the text box visible, parse its draft value, then rewrite that text when the selected display format changes.',
        demo: timecodeInputFormattingDemo,
        usageCode: `import { type FormEvent, useState } from 'react';
import { fromSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';
import {
  TimecodeInput,
  type TimecodeInputFormatOptions,
  type TimecodeInputParseOptions,
  formatTimecodeInput,
  parseTimecodeInput,
} from '@techsquidtv/canvas-timeline-react/timecode-input';

const formatOptions = [
  { value: 'seconds', label: 'Seconds', formatOptions: { format: 'seconds' } },
  { value: 'minutes', label: 'Minutes', formatOptions: { format: 'minutes' } },
  {
    value: 'frames-24',
    label: '24 fps',
    formatOptions: { format: 'frames', frameRate: 24 },
    parseOptions: { frameRate: 24 },
  },
] satisfies Array<{
  value: string;
  label: string;
  formatOptions: TimecodeInputFormatOptions;
  parseOptions?: TimecodeInputParseOptions;
}>;
const initialSeconds = 90.5;
const sequenceRate = 24000;

export function ClipStartTimecode({
  onApply,
}: {
  onApply: (time: RationalTime) => void;
}) {
  const [formatValue, setFormatValue] = useState('seconds');
  const [text, setText] = useState(() =>
    formatTimecodeInput(initialSeconds, { format: 'seconds' })
  );
  const selectedFormat =
    formatOptions.find((option) => option.value === formatValue) ?? formatOptions[0];
  const parsedSeconds = parseTimecodeInput(text, selectedFormat.parseOptions);

  function handleFormatChange(nextFormatValue: string) {
    const nextFormat = formatOptions.find((option) => option.value === nextFormatValue);
    const nextSeconds = parseTimecodeInput(text, selectedFormat.parseOptions);

    if (!nextFormat) {
      return;
    }

    setFormatValue(nextFormat.value);

    if (nextSeconds !== null) {
      setText(formatTimecodeInput(nextSeconds, nextFormat.formatOptions));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (parsedSeconds === null) {
      return;
    }

    onApply(fromSeconds(parsedSeconds, sequenceRate));
    setText(formatTimecodeInput(parsedSeconds, selectedFormat.formatOptions));
  }

  return (
    <form onSubmit={handleSubmit}>
      <TimecodeInput
        aria-label="Clip start"
        value={text}
        invalid={parsedSeconds === null}
        onValueChange={setText}
      />
      <select
        aria-label="Timecode format"
        value={formatValue}
        onChange={(event) => handleFormatChange(event.currentTarget.value)}
      >
        {formatOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {parsedSeconds === null
              ? option.label
              : \`\${option.label} (\${formatTimecodeInput(parsedSeconds, {
                  ...option.formatOptions,
                })})\`}
          </option>
        ))}
      </select>
      <button disabled={parsedSeconds === null} type="submit">
        Apply
      </button>
    </form>
  );
}`,
      },
    ],
    apis: [
      {
        name: 'TimecodeInput',
        description: 'Renders the always-visible text input surface for timeline-position text.',
        apiSlug: 'timecode-input',
      },
      {
        name: 'TimecodeInputProps',
        description:
          'Base UI Input props plus invalid styling for form wrappers that own validation feedback.',
        apiSlug: 'timecode-input-props',
      },
      {
        name: 'formatTimecodeInput',
        description:
          'Formats seconds as decimal clock text, total seconds/minutes, or frame-rate timecode.',
        apiSlug: 'format-timecode-input',
      },
      {
        name: 'parseTimecodeInput',
        description:
          'Converts decimal or frame timecode text into precise seconds, or null when invalid.',
        apiSlug: 'parse-timecode-input',
      },
      {
        name: 'TimecodeFrameRate',
        description: 'Number or rational frame rate accepted by frame-based timecode helpers.',
        apiSlug: 'timecode-frame-rate',
      },
      {
        name: 'TimecodeInputFormat',
        description: 'Allowed output formats for formatting timecode input text.',
        apiSlug: 'timecode-input-format',
      },
      {
        name: 'TimecodeInputFormatOptions',
        description: 'Options object accepted by formatTimecodeInput.',
        apiSlug: 'timecode-input-format-options',
      },
      {
        name: 'TimecodeInputParseRounding',
        description: 'Optional rounding policy for parsed timecode input text.',
        apiSlug: 'timecode-input-parse-rounding',
      },
      {
        name: 'TimecodeInputParseOptions',
        description: 'Options object accepted by parseTimecodeInput.',
        apiSlug: 'timecode-input-parse-options',
      },
    ],
    props: [
      {
        name: 'invalid',
        type: 'boolean',
        description: 'Marks the input invalid when parseTimecodeInput returns null.',
      },
      {
        name: 'value',
        type: 'string',
        description: 'Current input text, such as "90", "1:30.25", or "00:01:30:12".',
      },
      {
        name: 'onValueChange',
        type: '(value, details) => void',
        description:
          'Receives text as the user types so you can parse it or store it in form state.',
      },
      {
        name: 'className',
        type: 'string',
        description: 'Adds design-system classes while preserving the timecode-input slot class.',
      },
    ],
    notes: timecodeInputNotes,
  },
  {
    slug: 'timecode-field',
    kind: 'primitive',
    name: 'TimecodeField',
    title: 'Timecode Field',
    description:
      'A read-first inline timecode control for dense editor chrome: it displays a stable value, opens TimecodeInput only while editing, and commits seconds plus RationalTime details.',
    importPath: timecodeFieldImportPath,
    demo: timecodeFieldDemo,
    sourceTitle: 'ClipStartField.tsx',
    usageCode: `import { useState } from 'react';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimecodeField } from '@techsquidtv/canvas-timeline-react/timecode-field';

export function ClipStartField() {
  const [time, setTime] = useState(() => fromSeconds(90.5, 24000));

  return (
    <TimecodeField.Root
      ariaLabel="Clip start"
      value={time}
      formatOptions={{ format: 'seconds' }}
      timebase={time.r}
      onCommit={(_seconds, details) => setTime(details.time)}
    >
      <TimecodeField.Trigger />
      <TimecodeField.Input />
    </TimecodeField.Root>
  );
}`,
    examples: [
      {
        title: 'Formatting',
        description:
          'Switch the compact display format while preserving the committed RationalTime value.',
        demo: timecodeFieldFormattingDemo,
        usageCode: `import { useState } from 'react';
import { type RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { TimecodeField } from '@techsquidtv/canvas-timeline-react/timecode-field';
import { type TimecodeInputFormatOptions } from '@techsquidtv/canvas-timeline-react/timecode-input';

const formatOptions = [
  { value: 'seconds', label: 'Seconds', formatOptions: { format: 'seconds' } },
  { value: 'minutes', label: 'Minutes', formatOptions: { format: 'minutes' } },
  { value: 'hours', label: 'Hours', formatOptions: { format: 'hours' } },
  {
    value: 'frames-24',
    label: '24 fps',
    formatOptions: { format: 'frames', frameRate: 24 },
  },
  {
    value: 'drop-frame-2997',
    label: '29.97 DF',
    formatOptions: {
      format: 'drop-frame',
      frameRate: { numerator: 30000, denominator: 1001 },
      dropFrame: true,
    },
  },
] satisfies Array<{
  value: string;
  label: string;
  formatOptions: TimecodeInputFormatOptions;
}>;

const sequenceRate = 24000;

export function ClipStartField({
  value,
  onCommit,
}: {
  value: RationalTime;
  onCommit: (time: RationalTime) => void;
}) {
  const [formatValue, setFormatValue] = useState('seconds');
  const selectedFormat =
    formatOptions.find((option) => option.value === formatValue) ?? formatOptions[0];

  return (
    <div>
      <TimecodeField.Root
        ariaLabel="Clip start"
        value={value}
        formatOptions={selectedFormat.formatOptions}
        timebase={sequenceRate}
        onCommit={(_seconds, details) => onCommit(details.time)}
      >
        <TimecodeField.Trigger />
        <TimecodeField.Input />
      </TimecodeField.Root>
      <select
        aria-label="Timecode field format"
        value={formatValue}
        onChange={(event) => setFormatValue(event.currentTarget.value)}
      >
        {formatOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}`,
      },
    ],
    apis: [
      {
        name: 'TimecodeField',
        description:
          'Compound primitive for compact display-to-input timecode editing in dense editor chrome.',
        apiSlug: 'timecode-field',
      },
      {
        name: 'TimecodeFieldRootProps',
        description:
          'Value, parser, formatter, editing, and commit props for the inline editing root.',
        apiSlug: 'timecode-field-root-props',
      },
      {
        name: 'TimecodeFieldTriggerProps',
        description: 'Button props for the compact displayed timecode value.',
        apiSlug: 'timecode-field-trigger-props',
      },
      {
        name: 'TimecodeFieldInputProps',
        description: 'TimecodeInput props for the temporary editor shown only while editing.',
        apiSlug: 'timecode-field-input-props',
      },
      {
        name: 'TimecodeFieldCommitDetails',
        description: 'Commit metadata including seconds, RationalTime, text, and reason.',
        apiSlug: 'timecode-field-commit-details',
      },
      {
        name: 'TimecodeFieldCommitReason',
        description: 'Reason the field committed the draft text.',
        apiSlug: 'timecode-field-commit-reason',
      },
      {
        name: 'TimecodeInputFormatOptions',
        description: 'Formatting options used by TimecodeField.Root formatOptions.',
        apiSlug: 'timecode-input-format-options',
      },
      {
        name: 'TimecodeInputParseOptions',
        description: 'Optional parsing overrides used by TimecodeField.Root parseOptions.',
        apiSlug: 'timecode-input-parse-options',
      },
    ],
    props: [
      {
        name: 'ariaLabel',
        type: 'string',
        description: 'Human-readable control name used for the trigger and input labels.',
      },
      {
        name: 'value',
        type: 'number | RationalTime',
        description: 'Current timecode value shown by the trigger and used to seed the draft.',
      },
      {
        name: 'formatOptions',
        type: 'TimecodeInputFormatOptions',
        description: 'Formats the trigger text and the draft value when editing starts.',
      },
      {
        name: 'timebase',
        type: 'number',
        description:
          'Tick rate used for details.time in onCommit. Defaults to the value rate, or 60000 for seconds.',
      },
      {
        name: 'onCommit',
        type: '(seconds, details) => void | Promise<void>',
        description:
          'Called after valid Enter or blur commits with parsed seconds and RationalTime details.',
      },
      {
        name: 'parseOptions',
        type: 'TimecodeInputParseOptions',
        description:
          'Optional parser overrides when draft validation should differ from formatOptions.',
      },
      {
        name: 'editing',
        type: 'boolean',
        description: 'Optional controlled editing state.',
      },
    ],
    notes: timecodeFieldNotes,
  },
  {
    slug: 'viewport-scrollbar',
    kind: 'component',
    name: 'Viewport Scrollbar',
    title: 'Viewport Scrollbar',
    description: 'A timeline adapter that maps range scrollbar changes to pan and zoom state.',
    importPath: componentImportPath,
    demo: viewportScrollbarDemo,
    sourceTitle: 'TimelineViewportScrollbar.tsx',
    usageCode: `import { useMemo } from 'react';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { Timeline, TimelineProvider } from '@techsquidtv/canvas-timeline-react';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';

export function TimelineViewportScrollbar() {
  const engine = useMemo(
    () =>
      new TimelineEngine({
        duration: fromSeconds(30),
        tracks: [],
        zoomScale: 80,
      }),
    []
  );

  return (
    <TimelineProvider engine={engine}>
      <Timeline.Root className="h-80" />

      <Timeline.ViewportScrollbar>
        <Timeline.ViewportScrollbarThumb>
          <Timeline.ViewportScrollbarHandle side="start" />
          <Timeline.ViewportScrollbarHandle side="end" />
        </Timeline.ViewportScrollbarThumb>
      </Timeline.ViewportScrollbar>
    </TimelineProvider>
  );
}`,
    examples: [
      {
        title: 'Generic Range',
        description:
          'Use RangeScrollbar directly when your control is not bound to a TimelineEngine.',
        demo: rangeScrollbarDemo,
      },
    ],
    apis: [
      {
        name: 'Timeline.ViewportScrollbar',
        description: 'Timeline-aware root that adapts the generic range scrollbar.',
        apiSlug: 'viewport-scrollbar-root-props',
      },
      {
        name: 'Timeline.ViewportScrollbarThumb',
        description: 'Draggable thumb representing the visible timeline window.',
        apiSlug: 'viewport-scrollbar-thumb-props',
      },
      {
        name: 'Timeline.ViewportScrollbarHandle',
        description: 'Resize handle for adjusting one side of the visible timeline window.',
        apiSlug: 'viewport-scrollbar-handle-props',
      },
      {
        name: 'useTimelineViewportScrollbar',
        description: 'Hook that derives range scrollbar props from timeline viewport state.',
        apiSlug: 'use-timeline-viewport-scrollbar',
      },
    ],
    props: [
      {
        name: 'side',
        type: "'start' | 'end'",
        description: 'Resize handle side for Timeline.ViewportScrollbarHandle.',
      },
      {
        name: 'minSpan',
        type: 'number',
        description: 'Smallest visible timeline duration in seconds.',
      },
    ],
    notes: [
      ...componentNotes,
      'The viewport scrollbar reads viewportWidth, scrollLeft, and zoomScale from the shared TimelineEngine.',
      'Dragging the thumb pans with engine.setScrollLeft(); dragging either handle changes zoom with engine.setZoomScale() and then repositions scrollLeft.',
      'Mount Timeline.Root in the same TimelineProvider so the engine knows the measured viewport width used for handle zoom math.',
      'Use Timeline.VerticalScrollbar for track-stack scrolling; ViewportScrollbar is the horizontal time viewport and zoom control.',
    ],
  },
  {
    slug: 'vertical-scrollbar',
    kind: 'component',
    name: 'Vertical Scrollbar',
    title: 'Vertical Scrollbar',
    description:
      'A timeline adapter that maps range scrollbar changes to vertical track scrolling.',
    importPath: componentImportPath,
    demo: verticalScrollbarDemo,
    sourceTitle: 'TimelineVerticalScrollbar.tsx',
    usageCode: `import { useMemo } from 'react';
import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { Timeline, TimelineProvider } from '@techsquidtv/canvas-timeline-react';

const tracks = Array.from({ length: 8 }, (_, index) => ({
  id: \`track-\${index + 1}\`,
  kind: 'visual',
  clips: [],
  selected: false,
  locked: false,
  muted: false,
  visible: true,
}));

export function TimelineVerticalScrollbar() {
  const engine = useMemo(() => new TimelineEngine({ tracks }), []);

  return (
    <TimelineProvider engine={engine}>
      <div className="grid h-80 grid-cols-[minmax(0,1fr)_auto]">
        <Timeline.Root>
          <Timeline.TrackList>
            {tracks.map((track) => (
              <Timeline.Track key={track.id} trackId={track.id} />
            ))}
          </Timeline.TrackList>
        </Timeline.Root>

        <Timeline.VerticalScrollbar>
          <Timeline.VerticalScrollbarThumb>
            <Timeline.VerticalScrollbarHandle side="start" />
            <Timeline.VerticalScrollbarHandle side="end" />
          </Timeline.VerticalScrollbarThumb>
        </Timeline.VerticalScrollbar>
      </div>
    </TimelineProvider>
  );
}`,
    apis: [
      {
        name: 'Timeline.VerticalScrollbar',
        description: 'Timeline-aware root that adapts the generic range scrollbar to scrollTop.',
        apiSlug: 'vertical-scrollbar-root-props',
      },
      {
        name: 'Timeline.VerticalScrollbarThumb',
        description: 'Draggable thumb representing the visible track stack.',
        apiSlug: 'vertical-scrollbar-thumb-props',
      },
      {
        name: 'Timeline.VerticalScrollbarHandle',
        description: 'Range handle for custom vertical range compositions.',
        apiSlug: 'vertical-scrollbar-handle-props',
      },
      {
        name: 'useTimelineVerticalScrollbar',
        description:
          'Hook that derives range scrollbar props from vertical timeline viewport state.',
        apiSlug: 'use-timeline-vertical-scrollbar',
      },
      {
        name: 'useTimelineVerticalRangeControl',
        description: 'Adds formatted ARIA values to the vertical scrollbar adapter.',
        apiSlug: 'use-timeline-vertical-range-control',
      },
      {
        name: 'useTimelineScrollTop',
        description: 'Subscribes directly to live vertical scroll offset changes.',
        apiSlug: 'use-timeline-scroll-top',
      },
    ],
    notes: [
      ...componentNotes,
      'The vertical scrollbar reads viewportHeight, maxScrollTop, and scrollTop from the shared TimelineEngine.',
      'Dragging the thumb pans with engine.setScrollTop(); dragging either handle scales expanded track heights for vertical zoom.',
      'Mount Timeline.Root in the same TimelineProvider so the engine knows the measured viewport height used for vertical scroll bounds.',
      'Use Timeline.ViewportScrollbar for horizontal time panning and time zoom; use VerticalScrollbar for track-stack panning and row-height zoom.',
    ],
  },
  ...hookRegistryItems,
];

export const reactRegistryGroups: ReactRegistryGroup[] = [
  {
    id: 'component-patterns',
    title: 'Component patterns',
    description: 'Composable UI patterns built from one or more Timeline namespace components.',
    kind: 'component',
    items: reactRegistryItems.filter((item) => item.kind === 'component'),
  },
  {
    id: 'primitives',
    title: 'Primitives',
    description: 'Headless, controlled building blocks for composing timeline-adjacent UI.',
    kind: 'primitive',
    items: reactRegistryItems.filter((item) => item.kind === 'primitive'),
  },
  {
    id: 'hook-groups',
    title: 'Hook groups',
    description: 'Task-oriented hook groups for state, editing, playback, and controls.',
    kind: 'hook',
    items: reactRegistryItems.filter((item) => item.kind === 'hook'),
  },
];
