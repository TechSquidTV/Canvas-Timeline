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
} from './types';

/** Reason a committed engine command created a new clip. */
export type ClipCreatedReason =
  | 'paste'
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
  clip: Clip;
}

/**
 * Live clip slip event payload.
 */
export interface ClipSlipEvent {
  clip: Clip;
}

/**
 * Clip selection change event payload.
 */
export interface ClipSelectEvent {
  clipId: string | null;
  clip: Clip | null;
}

/** Keyframe add/update event payload. */
export interface ClipKeyframeChangeEvent {
  clipId: string;
  keyframe: TimelineKeyframe;
}

/** Keyframe removal event payload. */
export interface ClipKeyframeRemoveEvent {
  clipId: string;
  keyframe: TimelineKeyframe;
}

/** Keyframe selection change event payload. */
export interface ClipKeyframeSelectEvent {
  clipId: string | null;
  keyframeId: string | null;
  keyframe: TimelineKeyframe | null;
}

/**
 * Event payload emitted when the playhead enters, updates within, or leaves a clip.
 */
export interface ClipPlayheadEvent {
  clipId: string;
  time: RationalTime;
}

/**
 * Undo/redo history state change event payload.
 */
export interface HistoryChangeEvent {
  index: number;
  length: number;
}

/**
 * Selection in/out point boundary change event payload.
 */
export interface InOutChangeEvent {
  state: TimelineState;
}

/**
 * Marker change event payload (add, remove, update).
 */
export interface MarkerChangeEvent {
  marker: Marker;
}

/**
 * Track change event payload (add, remove).
 */
export interface TrackChangeEvent {
  track: Track;
}

/**
 * Track mute change event payload.
 */
export interface TrackMuteEvent {
  trackId: string;
  muted: boolean;
}

/**
 * Track visibility change event payload.
 */
export interface TrackVisibilityEvent {
  trackId: string;
  visible: boolean;
}

/**
 * Track lock change event payload.
 */
export interface TrackLockEvent {
  trackId: string;
  locked: boolean;
}

/**
 * Track selection change event payload.
 */
export interface TrackSelectEvent {
  trackId: string | null;
}

/**
 * Track resize event payload.
 */
export interface TrackResizeEvent {
  trackId: string;
  height: number;
}

/**
 * Central event mapping definition for all engine events.
 */
export interface EngineEventMap {
  // Structural lifecycle
  'state:settled': void;
  'state:preview': void;
  render: void;

  /** Emits active live edit impacts during interactions, or null when impacts clear. */
  'edit:impacts': TimelineEditImpacts | null;
  /** Emits shared edit command previews during live or explicit preview flows. */
  'edit:preview': TimelineEditPreview | null;
  /** Emits after a command-layer edit successfully commits. */
  'edit:commit': TimelineEditCommitResult;
  /** Emits transient cross-track drop feedback during body drag interactions. */
  'clip:drop-feedback': TimelineClipDropFeedback;

  // Clip lifecycle (committed)
  'clip:created': ClipCreatedEvent;
  'clip:removed': ClipRemovedEvent;
  'clip:split': ClipSplitEvent;

  // Clip interaction (live, per frame)
  'clip:move': ClipMoveEvent;
  'clip:resize': ClipResizeEvent;
  'clip:slip': ClipSlipEvent;
  'clip:select': ClipSelectEvent;
  'keyframe:add': ClipKeyframeChangeEvent;
  'keyframe:update': ClipKeyframeChangeEvent;
  'keyframe:remove': ClipKeyframeRemoveEvent;
  'keyframe:select': ClipKeyframeSelectEvent;

  // Clip playhead crossings
  'clip:enter': ClipPlayheadEvent;
  'clip:update': ClipPlayheadEvent;
  'clip:leave': ClipPlayheadEvent;

  // Playback
  'playback:state': boolean;
  'playback:rate': number;
  'playhead:scrub': RationalTime;

  // State
  'state:inOut': InOutChangeEvent;
  'content:change': number;
  'history:change': HistoryChangeEvent;
  'clipboard:change': void;
  'viewport:resize': { viewportWidth: number | undefined; viewportHeight: number | undefined };
  'snap:change': TimelineSnapFeedback;

  // Markers
  'marker:add': MarkerChangeEvent;
  'marker:remove': MarkerChangeEvent;
  'marker:update': MarkerChangeEvent;

  // Tracks
  'track:add': TrackChangeEvent;
  'track:remove': TrackChangeEvent;
  'track:mute': TrackMuteEvent;
  'track:visibility': TrackVisibilityEvent;
  'track:lock': TrackLockEvent;
  'track:select': TrackSelectEvent;
  'track:resize': TrackResizeEvent;

  // Navigation
  'zoom:change': number;
  'scroll:change': { scrollLeft: number; scrollTop: number };
}
