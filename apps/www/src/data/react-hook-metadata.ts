export type TimelineHookGroupId =
  | 'timeline-state'
  | 'editing-hooks'
  | 'playback-controls'
  | 'accessible-controls';

export type TimelineHookReactivity = 'snapshot' | 'live' | 'adapter' | 'imperative';

type TimelineHookCategory =
  | 'context'
  | 'state'
  | 'active-state'
  | 'viewport'
  | 'geometry'
  | 'events'
  | 'clip-editing'
  | 'keyframe-editing'
  | 'selection'
  | 'track-editing'
  | 'marker-editing'
  | 'clipboard'
  | 'history'
  | 'edit-preview'
  | 'drag-drop'
  | 'transport'
  | 'snapping'
  | 'media'
  | 'effects'
  | 'control-adapter'
  | 'navigation'
  | 'keyboard';

export interface TimelineHookMetadata {
  name: string;
  group: TimelineHookGroupId;
  category: TimelineHookCategory;
  reactivity: TimelineHookReactivity;
  description: string;
}

// Maintainer rule: every public hook exported from ./index must have exactly
// one metadata entry and one curated registry group. Internal helpers such as
// useTimelineGeometryRevision stay out of this catalog until they become public.
export const timelineHookMetadata = [
  {
    name: 'useTimeline',
    group: 'timeline-state',
    category: 'context',
    reactivity: 'snapshot',
    description: 'Reads the shared engine and synchronized timeline state from context.',
  },
  {
    name: 'useTimelineState',
    group: 'timeline-state',
    category: 'state',
    reactivity: 'snapshot',
    description: 'Reads the current reactive TimelineState snapshot.',
  },
  {
    name: 'useActiveClips',
    group: 'timeline-state',
    category: 'active-state',
    reactivity: 'live',
    description: 'Returns clips active at the current playhead time.',
  },
  {
    name: 'useActiveLayers',
    group: 'timeline-state',
    category: 'active-state',
    reactivity: 'live',
    description: 'Returns active layers grouped for preview and playback surfaces.',
  },
  {
    name: 'useTimelineViewport',
    group: 'timeline-state',
    category: 'viewport',
    reactivity: 'snapshot',
    description: 'Returns canonical viewport metrics and setters for custom chrome.',
  },
  {
    name: 'useTimelineEvent',
    group: 'timeline-state',
    category: 'events',
    reactivity: 'imperative',
    description: 'Subscribes to typed TimelineEngine events with a React-safe handler.',
  },
  {
    name: 'useTimelineClipRects',
    group: 'timeline-state',
    category: 'geometry',
    reactivity: 'snapshot',
    description:
      'Returns viewport-space clip rectangles for inspectors, minimaps, and custom renderers.',
  },
  {
    name: 'useTimelineKeyframes',
    group: 'timeline-state',
    category: 'keyframe-editing',
    reactivity: 'snapshot',
    description:
      'Reads clip keyframes, viewport geometry, evaluation helpers, and keyframe commands.',
  },
  {
    name: 'useTimelineKeyframeSegments',
    group: 'timeline-state',
    category: 'keyframe-editing',
    reactivity: 'snapshot',
    description: 'Reads keyframe segment geometry, Bezier tangent handles, and side commands.',
  },
  {
    name: 'useTimelineVisibleClips',
    group: 'timeline-state',
    category: 'geometry',
    reactivity: 'snapshot',
    description: 'Returns viewport-intersecting clips with clipped timeline and source ranges.',
  },
  {
    name: 'useTimelineRulerTicks',
    group: 'timeline-state',
    category: 'geometry',
    reactivity: 'snapshot',
    description: 'Returns shared ruler tick positions and labels for custom ruler surfaces.',
  },
  {
    name: 'useTimelineZoomScale',
    group: 'timeline-state',
    category: 'viewport',
    reactivity: 'live',
    description: 'Subscribes to the current zoom scale without pulling the full viewport object.',
  },
  {
    name: 'useTimelineScrollLeft',
    group: 'timeline-state',
    category: 'viewport',
    reactivity: 'live',
    description: 'Subscribes to the current horizontal scroll offset.',
  },
  {
    name: 'useTimelineScrollTop',
    group: 'timeline-state',
    category: 'viewport',
    reactivity: 'live',
    description: 'Subscribes directly to live vertical scroll offset changes.',
  },
  {
    name: 'useTimelineTimePosition',
    group: 'timeline-state',
    category: 'geometry',
    reactivity: 'adapter',
    description: 'Projects a timeline time into viewport x-position and formatted labels.',
  },
  {
    name: 'useTimelineClips',
    group: 'editing-hooks',
    category: 'clip-editing',
    reactivity: 'snapshot',
    description:
      'Reads timeline clips, selection metadata, lookup helpers, and presentation updates.',
  },
  {
    name: 'useTimelineClipGroups',
    group: 'editing-hooks',
    category: 'clip-editing',
    reactivity: 'snapshot',
    description: 'Reads clip groups and exposes group management commands.',
  },
  {
    name: 'useTimelineEditMode',
    group: 'editing-hooks',
    category: 'clip-editing',
    reactivity: 'adapter',
    description: 'Owns local edit-mode state for product toolbar chrome.',
  },
  {
    name: 'useTimelineEditCommands',
    group: 'editing-hooks',
    category: 'clip-editing',
    reactivity: 'imperative',
    description: 'Builds, previews, validates, commits, and cancels typed edit commands.',
  },
  {
    name: 'useTimelineSelection',
    group: 'editing-hooks',
    category: 'selection',
    reactivity: 'snapshot',
    description: 'Reads selected clip and track state with selection commands.',
  },
  {
    name: 'useTimelineRangeSelection',
    group: 'editing-hooks',
    category: 'selection',
    reactivity: 'snapshot',
    description: 'Adapts In/Out points to delete-range and lift-range edit commands.',
  },
  {
    name: 'useTimelineTracks',
    group: 'editing-hooks',
    category: 'track-editing',
    reactivity: 'snapshot',
    description: 'Reads track state and exposes track management commands.',
  },
  {
    name: 'useTimelineTrack',
    group: 'editing-hooks',
    category: 'track-editing',
    reactivity: 'adapter',
    description: 'Reads one track, canvas-aligned row geometry, and track commands.',
  },
  {
    name: 'useTimelineTrackHeader',
    group: 'editing-hooks',
    category: 'track-editing',
    reactivity: 'adapter',
    description: 'Returns DOM-ready track header props for one track row.',
  },
  {
    name: 'useTimelineTrackLockControl',
    group: 'editing-hooks',
    category: 'control-adapter',
    reactivity: 'adapter',
    description: 'Returns semantic button props for toggling one track lock.',
  },
  {
    name: 'useTimelineMarkers',
    group: 'editing-hooks',
    category: 'marker-editing',
    reactivity: 'snapshot',
    description: 'Reads markers and exposes marker editing commands.',
  },
  {
    name: 'useActiveMarkers',
    group: 'editing-hooks',
    category: 'marker-editing',
    reactivity: 'live',
    description: 'Subscribes to live active, nearest, previous, and next markers.',
  },
  {
    name: 'useTimelineClipboard',
    group: 'editing-hooks',
    category: 'clipboard',
    reactivity: 'snapshot',
    description: 'Provides copy, cut, and paste commands for timeline clips.',
  },
  {
    name: 'useTimelineHistory',
    group: 'editing-hooks',
    category: 'history',
    reactivity: 'snapshot',
    description: 'Exposes undo and redo availability with history commands.',
  },
  {
    name: 'useTimelineEditImpacts',
    group: 'editing-hooks',
    category: 'edit-preview',
    reactivity: 'live',
    description: 'Subscribes to affected-clip consequences from previews and live interactions.',
  },
  {
    name: 'useTimelineEditPreview',
    group: 'editing-hooks',
    category: 'edit-preview',
    reactivity: 'live',
    description: 'Subscribes to shared command-layer edit preview validity and command state.',
  },
  {
    name: 'useTimelineClipDrag',
    group: 'editing-hooks',
    category: 'drag-drop',
    reactivity: 'imperative',
    description: 'Provides headless clip body dragging, including cross-track drop resolution.',
  },
  {
    name: 'useTimelineExternalClipDrop',
    group: 'editing-hooks',
    category: 'drag-drop',
    reactivity: 'adapter',
    description:
      'Turns app-owned native drag payloads into single-clip or grouped media placement commands.',
  },
  {
    name: 'useTimelineKeyframeDrag',
    group: 'editing-hooks',
    category: 'keyframe-editing',
    reactivity: 'imperative',
    description: 'Provides headless keyframe handle dragging with live property preview updates.',
  },
  {
    name: 'useTimelineKeyframeTangentDrag',
    group: 'editing-hooks',
    category: 'keyframe-editing',
    reactivity: 'imperative',
    description: 'Provides headless Bezier tangent dragging with live side-handle preview updates.',
  },
  {
    name: 'useTimelineTrackDropTargets',
    group: 'editing-hooks',
    category: 'drag-drop',
    reactivity: 'snapshot',
    description: 'Exposes track row drop targets and default same-kind track compatibility.',
  },
  {
    name: 'useTimelineClipDropFeedback',
    group: 'editing-hooks',
    category: 'drag-drop',
    reactivity: 'live',
    description: 'Subscribes to live cross-track clip drop feedback for custom affordances.',
  },
  {
    name: 'useTimelinePlayback',
    group: 'playback-controls',
    category: 'transport',
    reactivity: 'snapshot',
    description: 'Reads playback state and exposes play, pause, rate, and toggle commands.',
  },
  {
    name: 'useTimelinePlayheadTime',
    group: 'playback-controls',
    category: 'transport',
    reactivity: 'live',
    description: 'Subscribes to the live playhead time for readouts and frame-sensitive buttons.',
  },
  {
    name: 'useTimelineSnapping',
    group: 'playback-controls',
    category: 'snapping',
    reactivity: 'snapshot',
    description: 'Reads snapping state and exposes threshold, feedback, and snap commands.',
  },
  {
    name: 'usePlaybackEffect',
    group: 'playback-controls',
    category: 'effects',
    reactivity: 'imperative',
    description: 'Runs effects as the playhead enters, updates, and leaves a clip.',
  },
  {
    name: 'useTimelineMediaSync',
    group: 'playback-controls',
    category: 'media',
    reactivity: 'live',
    description: 'Synchronizes external media adapters to active timeline layers.',
  },
  {
    name: 'useTimelineMediaPlayback',
    group: 'playback-controls',
    category: 'media',
    reactivity: 'snapshot',
    description: 'Controls media adapter playback state alongside the TimelineEngine.',
  },
  {
    name: 'useTimelinePlayheadControl',
    group: 'accessible-controls',
    category: 'control-adapter',
    reactivity: 'adapter',
    description: 'Returns Base UI-compatible playhead slider props and formatted value text.',
  },
  {
    name: 'useTimelineInOutRangeControl',
    group: 'accessible-controls',
    category: 'control-adapter',
    reactivity: 'adapter',
    description: 'Returns Base UI-compatible In/Out range props and thumb labels.',
  },
  {
    name: 'useTimelineViewportRangeControl',
    group: 'accessible-controls',
    category: 'control-adapter',
    reactivity: 'adapter',
    description: 'Adds formatted ARIA values to the lightweight viewport range scrollbar adapter.',
  },
  {
    name: 'useTimelineViewportScrollbar',
    group: 'accessible-controls',
    category: 'control-adapter',
    reactivity: 'adapter',
    description: 'Derives generic range scrollbar props from timeline viewport state.',
  },
  {
    name: 'useTimelineVerticalRangeControl',
    group: 'accessible-controls',
    category: 'control-adapter',
    reactivity: 'adapter',
    description: 'Adds formatted ARIA values to the vertical track-stack scrollbar adapter.',
  },
  {
    name: 'useTimelineVerticalScrollbar',
    group: 'accessible-controls',
    category: 'control-adapter',
    reactivity: 'adapter',
    description: 'Derives generic range scrollbar props from vertical track viewport state.',
  },
  {
    name: 'useTimelineZoomControl',
    group: 'accessible-controls',
    category: 'control-adapter',
    reactivity: 'adapter',
    description: 'Returns Base UI-compatible zoom slider props and formatted value text.',
  },
  {
    name: 'useTimelinePanControl',
    group: 'accessible-controls',
    category: 'control-adapter',
    reactivity: 'adapter',
    description: 'Returns Base UI-compatible horizontal pan slider props and value text.',
  },
  {
    name: 'useTimelineClipNavigation',
    group: 'accessible-controls',
    category: 'navigation',
    reactivity: 'adapter',
    description: 'Exposes one active canvas clip, navigation commands, and focus target props.',
  },
  {
    name: 'useTimelineKeyboard',
    group: 'accessible-controls',
    category: 'keyboard',
    reactivity: 'imperative',
    description: 'Returns focus-scoped shortcut props for opt-in timeline keyboard commands.',
  },
] as const satisfies readonly TimelineHookMetadata[];
