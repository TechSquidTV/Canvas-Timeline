import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import type {
  Clip,
  TimelineClipDropFeedback,
  TimelineClipMoveResult,
  TimelineEditCommitResult,
  TimelineEditImpacts,
  TimelineEditPreview,
  TimelineSnapFeedback,
  TimelineState,
  Track,
  Marker,
  TimelineKeyframe,
} from '#core/types';

/** Reason a committed engine command created a new clip. */
export type ClipCreatedReason =
  | 'paste'
  | 'split'
  | 'insert'
  | 'overwrite'
  | 'overwrite-split'
  | 'range-split';

/** Reason a committed engine command removed a clip. */
export type ClipRemovedReason = 'delete' | 'cut' | 'overwrite' | 'delete-range' | 'lift-range';

/** Payload emitted by `clip:created` for committed clip creation. */
export interface ClipCreatedEvent {
  /** Newly created clip. */
  clip: Clip;
  /** Source clip ID from which this clip was created (useful for copying external metadata or tracking clip lineage). */
  originClipId?: string;
  /** Command that created the clip. */
  reason: ClipCreatedReason;
}

/** Payload emitted by `clip:removed` for committed clip removal. */
export interface ClipRemovedEvent {
  /** Removed clip. */
  clip: Clip;
  /** Command that removed the clip. */
  reason: ClipRemovedReason;
}

/** Payload emitted by `clip:split` for committed clip split. */
export interface ClipSplitEvent {
  /** Original clip ID before the split. The left clip retains this ID. */
  originalId: string;
  /** The left (earlier) half of the split - retains the original clip ID. */
  left: Clip;
  /** The right (later) half of the split - gets a new ID. */
  right: Clip;
}

/**
 * Live clip movement event payload.
 */
export interface ClipMoveEvent extends TimelineClipMoveResult {
  /** Whether this event describes live preview state or a settled committed move. */
  phase: 'preview' | 'commit';
}

/**
 * Live clip resizing event payload.
 */
export interface ClipResizeEvent {
  /** Clip after the resize preview or commit updated one boundary. */
  clip: Clip;
}

/**
 * Live clip slip event payload.
 */
export interface ClipSlipEvent {
  /** Clip after its source start moved while timeline bounds stayed fixed. */
  clip: Clip;
}

/**
 * Clip selection change event payload.
 */
export interface ClipSelectEvent {
  /** Primary selected clip id, or null after clearing selection. */
  clipId: string | null;
  /** Primary selected clip, or null after clearing selection. */
  clip: Clip | null;
  /** All selected clip ids in state order. */
  clipIds: string[];
  /** All selected clips in state order for inspector and action toolbar UI. */
  clips: Clip[];
}

/** Keyframe add/update event payload. */
export interface ClipKeyframeChangeEvent {
  /** Clip that owns the changed keyframe. */
  clipId: string;
  /** Added or updated keyframe snapshot. */
  keyframe: TimelineKeyframe;
}

/** Keyframe removal event payload. */
export interface ClipKeyframeRemoveEvent {
  /** Clip that owned the removed keyframe. */
  clipId: string;
  /** Removed keyframe snapshot before it left the clip. */
  keyframe: TimelineKeyframe;
}

/** Keyframe selection change event payload. */
export interface ClipKeyframeSelectEvent {
  /** Clip containing the selected keyframe, or null after clearing selection. */
  clipId: string | null;
  /** Selected keyframe id, or null after clearing selection. */
  keyframeId: string | null;
  /** Selected keyframe snapshot, or null after clearing selection. */
  keyframe: TimelineKeyframe | null;
}

/**
 * Event payload emitted when the playhead enters, updates within, or leaves a clip.
 */
export interface ClipPlayheadEvent {
  /** Clip crossed by the current playhead event. */
  clipId: string;
  /** Timeline time at which the crossing or in-clip update was evaluated. */
  time: RationalTime;
}

/**
 * Undo/redo history state change event payload.
 */
export interface HistoryChangeEvent {
  /** Current history cursor index after undo, redo, or snapshot creation. */
  index: number;
  /** Number of undoable history entries available in the stack. */
  length: number;
}

/**
 * Selection in/out point boundary change event payload.
 */
export interface InOutChangeEvent {
  /** Timeline state snapshot containing the new in/out point values. */
  state: TimelineState;
}

/**
 * Marker change event payload (add, remove, update).
 */
export interface MarkerChangeEvent {
  /** Marker snapshot added, removed, or updated by the command. */
  marker: Marker;
}

/**
 * Track change event payload (add, remove).
 */
export interface TrackChangeEvent {
  /** Track snapshot added to or removed from the timeline. */
  track: Track;
}

/**
 * Track mute change event payload.
 */
export interface TrackMuteEvent {
  /** Track whose mute state changed. */
  trackId: string;
  /** New mute state. */
  muted: boolean;
}

/**
 * Track visibility change event payload.
 */
export interface TrackVisibilityEvent {
  /** Track whose visibility state changed. */
  trackId: string;
  /** New visibility state. */
  visible: boolean;
}

/**
 * Track lock change event payload.
 */
export interface TrackLockEvent {
  /** Track whose lock state changed. */
  trackId: string;
  /** New lock state. */
  locked: boolean;
}

/**
 * Track selection change event payload.
 */
export interface TrackSelectEvent {
  /** Selected track id, or null after clearing track selection. */
  trackId: string | null;
}

/**
 * Track resize event payload.
 */
export interface TrackResizeEvent {
  /** Track whose row height changed. */
  trackId: string;
  /** New row height in CSS pixels. */
  height: number;
}

/**
 * Central event mapping definition for all engine events.
 */
export interface EngineEventMap {
  /** Emits after committed state is stable and undo/redo history may have advanced. */
  'state:settled': void;
  /** Emits while transient preview state is available but not committed. */
  'state:preview': void;
  /** Requests visual renderers to redraw timeline content. */
  render: void;

  /** Emits active live edit impacts during interactions, or null when impacts clear. */
  'edit:impacts': TimelineEditImpacts | null;
  /** Emits shared edit command previews during live or explicit preview flows. */
  'edit:preview': TimelineEditPreview | null;
  /** Emits after a command-layer edit successfully commits. */
  'edit:commit': TimelineEditCommitResult;
  /** Emits transient cross-track drop feedback during body drag interactions. */
  'clip:drop-feedback': TimelineClipDropFeedback;

  /** Emits after a committed command creates a clip. */
  'clip:created': ClipCreatedEvent;
  /** Emits after a committed command removes a clip. */
  'clip:removed': ClipRemovedEvent;
  /** Emits after a committed split replaces one clip with left and right clips. */
  'clip:split': ClipSplitEvent;

  /** Emits during and after clip body movement. */
  'clip:move': ClipMoveEvent;
  /** Emits during and after clip trim resize changes. */
  'clip:resize': ClipResizeEvent;
  /** Emits during and after source slip changes. */
  'clip:slip': ClipSlipEvent;
  /** Emits when the selected clip set changes. */
  'clip:select': ClipSelectEvent;
  /** Emits when a clip keyframe is created. */
  'keyframe:add': ClipKeyframeChangeEvent;
  /** Emits when a clip keyframe changes time, value, interpolation, or easing. */
  'keyframe:update': ClipKeyframeChangeEvent;
  /** Emits when a clip keyframe is removed. */
  'keyframe:remove': ClipKeyframeRemoveEvent;
  /** Emits when keyframe selection changes. */
  'keyframe:select': ClipKeyframeSelectEvent;

  /** Emits when the playhead first enters an enabled clip interval. */
  'clip:enter': ClipPlayheadEvent;
  /** Emits while the playhead remains inside an enabled clip interval. */
  'clip:update': ClipPlayheadEvent;
  /** Emits when the playhead leaves an enabled clip interval. */
  'clip:leave': ClipPlayheadEvent;

  /** Emits when playback starts or stops. */
  'playback:state': boolean;
  /** Emits when playback rate changes. */
  'playback:rate': number;
  /** Emits when scrubbing or playback moves the playhead. */
  'playhead:scrub': RationalTime;

  /** Emits when in/out points change. */
  'state:inOut': InOutChangeEvent;
  /** Emits after content edits increment the render/content revision number. */
  'content:change': number;
  /** Emits after undo, redo, or snapshot creation changes history position. */
  'history:change': HistoryChangeEvent;
  /** Emits when clipboard contents change after copy, cut, paste, or clear. */
  'clipboard:change': void;
  /** Emits when the measured viewport size changes. */
  'viewport:resize': { viewportWidth: number | undefined; viewportHeight: number | undefined };
  /** Emits when snapping feedback changes during pointer interactions. */
  'snap:change': TimelineSnapFeedback;

  /** Emits when a marker is added. */
  'marker:add': MarkerChangeEvent;
  /** Emits when a marker is removed. */
  'marker:remove': MarkerChangeEvent;
  /** Emits when marker time, label, or metadata changes. */
  'marker:update': MarkerChangeEvent;

  /** Emits when a track is added. */
  'track:add': TrackChangeEvent;
  /** Emits when a track is removed. */
  'track:remove': TrackChangeEvent;
  /** Emits when a track mute flag changes. */
  'track:mute': TrackMuteEvent;
  /** Emits when a track visibility flag changes. */
  'track:visibility': TrackVisibilityEvent;
  /** Emits when a track lock flag changes. */
  'track:lock': TrackLockEvent;
  /** Emits when selected track id changes. */
  'track:select': TrackSelectEvent;
  /** Emits when an explicit track row height changes. */
  'track:resize': TrackResizeEvent;

  /** Emits when horizontal zoom scale changes. */
  'zoom:change': number;
  /** Emits when scroll offsets change. */
  'scroll:change': { scrollLeft: number; scrollTop: number };
}
