import type {
  RationalTime,
  TimecodeFormatOptions,
  TimecodeFrameRate,
} from '@techsquidtv/canvas-timeline-utils';

/**
 * A value that may be available immediately or after asynchronous media lookup.
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Clock responsible for advancing playback.
 *
 * Internal playback uses the engine's requestAnimationFrame loop. External
 * playback lets a media player or audio clock drive playhead updates.
 */
export type PlaybackClockSource = 'internal' | 'external';

/**
 * Options for starting timeline playback.
 */
export interface PlaybackOptions {
  /** Optional timeline time at which playback should stop when auto-ending. */
  toTime?: RationalTime;
  /** Whether playback should pause at `toTime` or at the content end. */
  autoEnd?: boolean;
  /** Clock source that advances the playhead during playback. */
  clock?: PlaybackClockSource;
  /** Whether playback should loop within the In/Out point range or overall duration. */
  loop?: boolean;
  /** Whether playback should respect the In/Out point boundaries (e.g. stop or loop at outPoint). */
  respectInOut?: boolean;
}

/**
 * Source-media interval covered by a timeline clip.
 */
export interface ClipSourceRange {
  /** Source asset identifier matching clip.sourceId. */
  sourceId: string;
  /** Inclusive source timestamp where the clip begins. */
  start: RationalTime;
  /** Exclusive source timestamp where the clip ends. */
  end: RationalTime;
  /** Duration of the source interval represented by the clip. */
  duration: RationalTime;
}

/**
 * Filters for selecting active clips at a timeline time.
 */
export interface ActiveClipQuery<TrackKind = string> {
  /** Timeline time to inspect. Defaults to the current playhead. */
  time?: RationalTime;
  /** App-defined track kind to match, such as "visual", "audio", or "subtitle". */
  trackKind?: TrackKind;
  /** Source asset id to match. */
  sourceId?: string;
  /** Optional app predicate for custom selection logic. */
  predicate?: (activeClip: ActiveClip<TrackKind>) => boolean;
}

/**
 * Filters for one named active layer.
 *
 * A layer selector describes the kind of active clips an app wants to drive,
 * such as visual previews, audio playback, subtitles, effects, or a particular source
 * asset. Selectors are matched against the active clips returned for a single
 * timeline time.
 */
export type ActiveLayerSelector<TrackKind = string> = Omit<ActiveClipQuery<TrackKind>, 'time'>;

/**
 * Options for selecting active timeline layers at a timeline time.
 *
 * Use this when integrations need named layers such as `visuals`, `audio`,
 * `subtitles`, or `effects` instead of one flat active-clip list. The same
 * active clip can match more than one layer.
 */
export interface ActiveLayerOptions<LayerName extends string = string, TrackKind = string> {
  /** Timeline time to inspect. Defaults to the current playhead. */
  time?: RationalTime;
  /** Named layer selectors, such as `{ visuals, audio, subtitles, effects }`. */
  layers: Record<LayerName, ActiveLayerSelector<TrackKind>>;
}

/**
 * Active timeline layer lookup result.
 *
 * Results include every active clip matched by the requested selectors plus
 * convenience `primary` entries for apps that only need the first match in each
 * layer. Each `ActiveClip` includes mapped source time and source range data for
 * preview and playback synchronization.
 */
export interface ActiveLayerResult<LayerName extends string = string, TrackKind = string> {
  /** Timeline time used for the lookup. */
  time: RationalTime;
  /** Unique clips matched by at least one requested layer, in stable track order. */
  all: ActiveClip<TrackKind>[];
  /** Matched active clips grouped by containing track id. */
  byTrack: Map<string, ActiveClip<TrackKind>[]>;
  /** Active clips for each named layer, preserving stable track order. */
  layers: Record<LayerName, ActiveClip<TrackKind>[]>;
  /** First active clip in each layer, as a convenience selection only. */
  primary: Partial<Record<LayerName, ActiveClip<TrackKind>>>;
  /** Whether any requested layer matched active clips. */
  hasActiveClips: boolean;
  /** Earliest timeline start among clips that match any requested layer. */
  firstContentTime?: RationalTime;
}

/** Region of a timeline clip hit by pointer interaction. */
export type ClipHitRegion = 'body' | 'start-edge' | 'end-edge';

/** Canvas-aligned geometry settings for clip hit testing and affordance placement. */
export interface TimelineInteractionGeometry {
  /** Height of the top ruler region in pixels. */
  rulerHeight?: number;
  /** Default expanded track height in pixels. */
  trackHeight?: number;
  /** Collapsed track height in pixels. */
  collapsedTrackHeight?: number;
  /** Mouse/pen edge hit threshold in pixels. */
  edgeThreshold?: number;
  /** Touch edge hit threshold in pixels. */
  touchEdgeThreshold?: number;
}

/** Options for building all clip viewport geometry. */
export type TimelineClipGeometryOptions = TimelineInteractionGeometry;

/** Options for building viewport-intersecting clip geometry. */
export interface VisibleTimelineClipOptions extends TimelineInteractionGeometry {
  /** Viewport width in CSS pixels. Defaults to the engine viewport width. */
  viewportWidth?: number;
  /** Optional viewport height in CSS pixels for vertical filtering. */
  viewportHeight?: number;
  /** Extra pixels around the viewport included in visibility tests. */
  overscanPixels?: number;
}

/** Viewport-space pointer query for timeline clip hit testing. */
export interface ClipHitTestInput extends TimelineInteractionGeometry {
  /** X coordinate relative to the timeline viewport. */
  x: number;
  /** Y coordinate relative to the timeline viewport, including the ruler area. */
  y: number;
  /** Pointer type, used to widen touch edge hit targets. */
  pointerType?: string;
}

/** Viewport-space rectangle for a clip and its containing track. */
export interface ClipViewportRect {
  clipId: string;
  trackId: string;
  trackIndex: number;
  clipIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Viewport-space rectangle for a timeline track row. */
export interface TimelineTrackRect {
  /** Track represented by this row. */
  trackId: string;
  /** Zero-based track index in timeline order. */
  trackIndex: number;
  /** Left edge in viewport CSS pixels. */
  x: number;
  /** Top edge in viewport CSS pixels, including the ruler offset. */
  y: number;
  /** Row width in viewport CSS pixels. */
  width: number;
  /** Row height in viewport CSS pixels. */
  height: number;
}

/** Options for building track viewport geometry. */
export interface TimelineTrackGeometryOptions extends TimelineInteractionGeometry {
  /** Viewport width in CSS pixels. Defaults to the engine viewport width. */
  viewportWidth?: number;
}

/** Viewport-space pointer query for timeline track hit testing. */
export interface TrackHitTestInput extends TimelineTrackGeometryOptions {
  /** X coordinate relative to the timeline viewport. */
  x?: number;
  /** Y coordinate relative to the timeline viewport, including the ruler area. */
  y: number;
}

/** Hit-test result for a timeline track row. */
export interface TimelineTrackHitTestResult<TrackKind = string> {
  /** Track under the queried point. */
  track: Track<TrackKind>;
  /** Zero-based track index in timeline order. */
  trackIndex: number;
  /** Viewport-space track row bounds. */
  rect: TimelineTrackRect;
}

/** Hit-test result for a clip pointer target. */
export interface ClipHitTestResult {
  track: Track;
  clip: Clip;
  trackIndex: number;
  clipIndex: number;
  region: ClipHitRegion;
  rect: ClipViewportRect;
  canMove: boolean;
  canTrim: boolean;
}

/** First-party clip property that can be animated with timeline keyframes. */
export type TimelineKeyframeProperty = 'opacity';

/** Segment interpolation mode used from one keyframe to the next. */
export type TimelineKeyframeInterpolation = 'linear' | 'hold' | 'bezier';

/** Cubic Bezier easing control points used by Bezier keyframe interpolation. */
export interface TimelineCubicBezier {
  /** First control point time coordinate, clamped to 0..1. */
  x1: number;
  /** First control point value coordinate, clamped to 0..1. */
  y1: number;
  /** Second control point time coordinate, clamped to 0..1. */
  x2: number;
  /** Second control point value coordinate, clamped to 0..1. */
  y2: number;
}

/**
 * One clip-scoped property keyframe positioned at an absolute timeline time.
 */
export interface TimelineKeyframe {
  /** Stable keyframe id. */
  id: string;
  /** Clip property animated by this keyframe. */
  property: TimelineKeyframeProperty;
  /** Absolute timeline time for this keyframe. */
  time: RationalTime;
  /** Numeric property value. Opacity keyframes are clamped to 0..1. */
  value: number;
  /** Interpolation from this keyframe to the next. Defaults to linear. */
  interpolation?: TimelineKeyframeInterpolation;
  /** Cubic Bezier easing for the outgoing segment when `interpolation` is `bezier`. */
  easing?: TimelineCubicBezier;
  /** Whether this keyframe is currently selected in editor UI. */
  selected?: boolean;
}

/** Viewport-space rectangle for one keyframe affordance. */
export interface TimelineKeyframeViewportRect {
  clipId: string;
  trackId: string;
  keyframeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Viewport-space point used by keyframe curve segments and handles. */
export interface TimelineKeyframeCurvePoint {
  /** X coordinate in viewport CSS pixels. */
  x: number;
  /** Y coordinate in viewport CSS pixels. */
  y: number;
}

/** Bezier control handle edited by a curve interaction. */
export type TimelineKeyframeCurveHandleKind = 'outgoing' | 'incoming';

/** Viewport-space rectangle for one keyframe curve handle affordance. */
export interface TimelineKeyframeCurveHandleViewportRect {
  clipId: string;
  trackId: string;
  segmentId: string;
  keyframeId: string;
  anchorKeyframeId: string;
  handle: TimelineKeyframeCurveHandleKind;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Options for keyframe geometry and hit-testing. */
export interface TimelineKeyframeGeometryOptions extends TimelineInteractionGeometry {
  /** Only include keyframes for this property. Defaults to all supported properties. */
  property?: TimelineKeyframeProperty;
  /** Only include keyframes belonging to selected clips. */
  selectedClipOnly?: boolean;
  /** Viewport width in CSS pixels. Defaults to the engine viewport width. */
  viewportWidth?: number;
  /** Optional viewport height in CSS pixels for vertical filtering. */
  viewportHeight?: number;
  /** Extra pixels around the viewport included in visibility tests. */
  overscanPixels?: number;
  /** Keyframe affordance square size in CSS pixels. */
  keyframeSize?: number;
  /** Vertical padding used when mapping keyframe values into a clip row. */
  keyframeValuePadding?: number;
}

/** Options for keyframe curve segment and handle geometry. */
export interface TimelineKeyframeCurveGeometryOptions extends TimelineKeyframeGeometryOptions {
  /** Only include curve segments touching a selected keyframe. Defaults to false. */
  selectedKeyframeOnly?: boolean;
  /** Bezier control handle affordance square size in CSS pixels. */
  curveHandleSize?: number;
}

/** Viewport-space pointer query for timeline keyframe hit testing. */
export interface TimelineKeyframeHitTestInput extends TimelineKeyframeGeometryOptions {
  /** X coordinate relative to the timeline viewport. */
  x: number;
  /** Y coordinate relative to the timeline viewport, including the ruler area. */
  y: number;
  /** Pointer type, used to widen touch hit targets. */
  pointerType?: string;
}

/** Keyframe entry with viewport geometry and edit/display state. */
export interface TimelineKeyframeRect<TrackKind = string> extends TimelineClipEntry<TrackKind> {
  /** Raw keyframe represented by this entry. */
  keyframe: TimelineKeyframe;
  /** Zero-based keyframe index inside the containing clip. */
  keyframeIndex: number;
  /** Keyframe bounds in viewport CSS pixels. */
  rect: TimelineKeyframeViewportRect;
  /** Whether the keyframe can be edited by headless controls. */
  canEdit: boolean;
}

/** Bezier curve handle entry with viewport geometry and edit state. */
export interface TimelineKeyframeCurveHandle<
  TrackKind = string,
> extends TimelineClipEntry<TrackKind> {
  /** Stable segment id for the adjacent keyframe pair. */
  segmentId: string;
  /** Which Bezier easing coordinate this handle edits. */
  handle: TimelineKeyframeCurveHandleKind;
  /** Outgoing keyframe whose easing data is edited by this handle. */
  keyframe: TimelineKeyframe;
  /** Zero-based index of `keyframe` inside the containing clip. */
  keyframeIndex: number;
  /** Segment endpoint this control handle is visually anchored to. */
  anchorKeyframe: TimelineKeyframe;
  /** Zero-based index of `anchorKeyframe` inside the containing clip. */
  anchorKeyframeIndex: number;
  /** Opposite segment endpoint. */
  pairedKeyframe: TimelineKeyframe;
  /** Bezier easing values represented by the segment. */
  easing: TimelineCubicBezier;
  /** Anchor point in viewport CSS pixels. */
  anchorPoint: TimelineKeyframeCurvePoint;
  /** Handle center point in viewport CSS pixels. */
  point: TimelineKeyframeCurvePoint;
  /** Handle bounds in viewport CSS pixels. */
  rect: TimelineKeyframeCurveHandleViewportRect;
  /** Whether the handle can be edited by headless controls. */
  canEdit: boolean;
}

/** Keyframe curve segment entry with viewport geometry and optional Bezier handles. */
export interface TimelineKeyframeCurveSegment<
  TrackKind = string,
> extends TimelineClipEntry<TrackKind> {
  /** Stable segment id for the adjacent keyframe pair. */
  segmentId: string;
  /** Property animated by the segment. */
  property: TimelineKeyframeProperty;
  /** Left keyframe in the segment. */
  startKeyframe: TimelineKeyframe;
  /** Right keyframe in the segment. */
  endKeyframe: TimelineKeyframe;
  /** Zero-based start keyframe index inside the containing clip. */
  startKeyframeIndex: number;
  /** Zero-based end keyframe index inside the containing clip. */
  endKeyframeIndex: number;
  /** Interpolation mode used from `startKeyframe` to `endKeyframe`. */
  interpolation: TimelineKeyframeInterpolation;
  /** Bezier easing used by Bezier segments. */
  easing?: TimelineCubicBezier;
  /** Start keyframe point in viewport CSS pixels. */
  startPoint: TimelineKeyframeCurvePoint;
  /** End keyframe point in viewport CSS pixels. */
  endPoint: TimelineKeyframeCurvePoint;
  /** First Bezier control point, present only for Bezier segments. */
  controlPoint1?: TimelineKeyframeCurvePoint;
  /** Second Bezier control point, present only for Bezier segments. */
  controlPoint2?: TimelineKeyframeCurvePoint;
  /** Bezier handles for editable Bezier segments. */
  handles: TimelineKeyframeCurveHandle<TrackKind>[];
  /** Whether the segment can be edited by headless controls. */
  canEdit: boolean;
}

/** Viewport-intersecting keyframe entry. */
export type VisibleTimelineKeyframe<TrackKind = string> = TimelineKeyframeRect<TrackKind>;

/** Hit-test result for a timeline keyframe pointer target. */
export type TimelineKeyframeHitTestResult<TrackKind = string> = TimelineKeyframeRect<TrackKind>;

/** Viewport-intersecting keyframe curve segment. */
export type VisibleTimelineKeyframeCurveSegment<TrackKind = string> =
  TimelineKeyframeCurveSegment<TrackKind>;

/** Viewport-space pointer query for keyframe curve handle hit testing. */
export interface TimelineKeyframeCurveHitTestInput extends TimelineKeyframeCurveGeometryOptions {
  /** X coordinate relative to the timeline viewport. */
  x: number;
  /** Y coordinate relative to the timeline viewport, including the ruler area. */
  y: number;
  /** Pointer type, used to widen touch hit targets. */
  pointerType?: string;
}

/** Hit-test result for a keyframe curve handle pointer target. */
export type TimelineKeyframeCurveHandleHitTestResult<TrackKind = string> =
  TimelineKeyframeCurveHandle<TrackKind>;

/** Input for creating or upserting a clip keyframe. */
export interface TimelineSetClipKeyframeOptions {
  /** Clip that owns the keyframe. */
  clipId: string;
  /** Property animated by the keyframe. */
  property: TimelineKeyframeProperty;
  /** Absolute timeline time for the keyframe. */
  time: RationalTime;
  /** Numeric keyframe value. */
  value: number;
  /** Optional interpolation mode from this keyframe to the next. */
  interpolation?: TimelineKeyframeInterpolation;
  /** Optional Cubic Bezier easing for Bezier interpolation. */
  easing?: TimelineCubicBezier;
}

/** Input for updating one existing clip keyframe. */
export interface TimelineUpdateClipKeyframeOptions {
  /** Clip that owns the keyframe. */
  clipId: string;
  /** Keyframe to update. */
  keyframeId: string;
  /** New absolute timeline time. */
  time?: RationalTime;
  /** New numeric keyframe value. */
  value?: number;
  /** New interpolation mode. */
  interpolation?: TimelineKeyframeInterpolation;
  /** New Cubic Bezier easing for Bezier interpolation. */
  easing?: TimelineCubicBezier;
}

/** Options for committing or previewing keyframe mutations. */
export interface TimelineKeyframeMutationOptions {
  /** Whether to snapshot history and emit settled state immediately. Defaults to true. */
  commit?: boolean;
}

/** Built-in and application-defined magnetic snap target categories. */
export type TimelineSnapTargetKind =
  | 'origin'
  | 'playhead'
  | 'clip-start'
  | 'clip-end'
  | 'marker'
  | 'in-point'
  | 'out-point'
  | 'grid'
  | 'custom';

/** Persistent snap settings for one clip. */
export interface ClipSnapOptions {
  /** Whether the clip start boundary is a snap target. Defaults to true. */
  start?: boolean;
  /** Whether the clip end boundary is a snap target. Defaults to true. */
  end?: boolean;
  /** Optional tie-break priority when multiple targets are equally close. */
  priority?: number;
}

/** Persistent snap settings for one marker. */
export interface MarkerSnapOptions {
  /** Optional tie-break priority when multiple targets are equally close. */
  priority?: number;
}

/** Persistent snap settings for one track and its clips. */
export interface TrackSnapOptions {
  /** Whether contained clips are snap targets. Defaults to true. */
  clips?: boolean;
  /** Whether contained clip start boundaries are snap targets. Defaults to true. */
  clipStart?: boolean;
  /** Whether contained clip end boundaries are snap targets. Defaults to true. */
  clipEnd?: boolean;
}

/** One timeline time that can attract an edited boundary. */
export interface TimelineSnapTarget {
  /** Stable target id within the current prepared snap index. */
  id: string;
  /** Target category. */
  kind: TimelineSnapTargetKind;
  /** Timeline time where the target sits. */
  time: RationalTime;
  /** App/model object that owns the target, when any. */
  ownerId?: string;
  /** Track containing the target, when any. */
  trackId?: string;
  /** Optional tie-break priority when multiple targets are equally close. */
  priority?: number;
  /** Optional human-readable target label for UI status. */
  label?: string;
  /** Lightweight application metadata for custom targets. */
  metadata?: Record<string, unknown>;
}

/** Transient snap feedback consumed by canvas rendering and focused hooks. */
export interface TimelineSnapFeedback {
  /** Timeline seconds where snap guide lines should be drawn. */
  lines: number[];
  /** Currently active snap target, or null when no target is active. */
  target: TimelineSnapTarget | null;
}

/** Reason a clip cannot currently be dropped on a track. */
export type TimelineClipDropFailureReason =
  | 'not-found'
  | 'locked'
  | 'invalid-track'
  | 'incompatible-track-kind'
  | 'unsupported';

/** Transient feedback for a live cross-track clip drag. */
export interface TimelineClipDropFeedback {
  /** Clip being dragged, or null when no body drag is active. */
  activeClipId: string | null;
  /** Track that contained the dragged clip at drag start. */
  sourceTrackId: string | null;
  /** Track currently under the pointer, including invalid targets. */
  hoveredTrackId: string | null;
  /** Last valid track that is actively receiving the preview. */
  activeTargetTrackId: string | null;
  /** Whether the hovered track is a valid destination for the active clip. */
  valid: boolean;
  /** Machine-readable reason for an invalid hovered track. */
  reason: TimelineClipDropFailureReason | null;
  /** How far the pointer has penetrated into the hovered track, from 0 to 1. */
  penetrationRatio: number;
}

/** Result of resolving a candidate time against the prepared snap index. */
export interface TimelineSnapResult {
  /** Snapped timeline time. */
  snappedTime: RationalTime;
  /** Target that won snap resolution. */
  target: TimelineSnapTarget;
  /** Signed delta from candidate time to snapped time in seconds. */
  deltaSeconds: number;
  /** Feedback to publish for canvas guides and UI status. */
  feedback: TimelineSnapFeedback;
}

/**
 * Represents a bookmark or annotation pin on the timeline's top time ruler.
 */
export interface Marker {
  /** Unique identifier for the marker. */
  id: string;
  /** The position of the marker on the timeline. */
  time: RationalTime;
  /** Short visible name displayed next to the marker pin. */
  label?: string;
  /** HEX or RGBA background color for the marker pin. */
  color?: string;
  /** Detailed description or note associated with the marker. */
  description?: string;
  /** Whether this marker participates in snapping, or marker-specific snap settings. */
  snap?: false | MarkerSnapOptions;
}

/**
 * A horizontal timeline lane containing clips and editing state.
 *
 * Tracks are app-owned rows in the timeline model. The engine uses each track's
 * stable id for editing operations, reads the ordered clip list for rendering and
 * hit testing, and honors view/editing flags such as visible, collapsed, locked, and muted.
 *
 * @template TrackKind - The app-defined track kind, commonly "visual", "audio", or "subtitle".
 */
export interface Track<TrackKind = string> {
  /**
   * Stable app-provided identifier used by engine operations.
   *
   * Track ids must be unique within a timeline state. Keep the value stable
   * across renders, serialization, undo history, and drag operations.
   */
  id: string;
  /** App-defined lane category for routing behavior or display treatment. */
  kind: TrackKind;
  /**
   * Clips contained by this track in timeline order.
   *
   * Keep clips ordered by `timelineStart` for predictable rendering, hit testing,
   * and snapping. Overlaps are allowed when your editor model supports them.
   */
  clips: Clip[];
  /** Whether the track itself is selected in the UI. */
  selected: boolean;
  /**
   * Prevents clip edits on this track when true.
   *
   * Locked tracks are read-only for editing controls, but still provide snap
   * reference targets unless `track.snap` disables them.
   */
  locked: boolean;
  /**
   * Marks this track as muted.
   *
   * Muted tracks affect playback/routing semantics and can be rendered with
   * dimmed treatment by UI layers; muting does not disable snap references.
   */
  muted: boolean;
  /**
   * Marks this track as visible in output/active-layer lookup.
   *
   * Invisible tracks remain editable rows in timeline layouts, but their clips
   * are excluded from playback, preview, and active media synchronization.
   */
  visible: boolean;
  /**
   * Display height in pixels when expanded.
   *
   * Interaction components use this to size the row; when omitted, UI layers
   * typically fall back to 48px.
   */
  height?: number;
  /**
   * Collapses the track row into a compact layout when true.
   *
   * The default React track item renders collapsed rows at 24px high and expanded
   * rows at `height` or its default.
   */
  collapsed?: boolean;
  /** User-friendly name of the track. */
  name?: string;
  /** Whether the track is targeted for insert/overwrite/paste operations (e.g. V1, V2). */
  targeted?: boolean;
  /** Optional group identifier for visually grouping tracks. */
  groupId?: string;
  /** Whether this track's clips participate in snapping, or track-specific snap settings. */
  snap?: false | TrackSnapOptions;
}

/** Expanded row height update for a timeline track. */
export interface TimelineTrackHeightUpdate {
  /** Track id to resize. */
  trackId: string;
  /** Expanded row height in pixels. */
  height: number;
}

/** Options for batching row-height updates with related viewport state. */
export interface TimelineTrackHeightBatchOptions {
  /** Optional vertical scroll offset to apply after height updates and before clamping. */
  scrollTop?: number;
}

/**
 * Transient edit-preview state attached to clips while an interaction is active.
 *
 * This state is not intended to be persisted with project data. UI layers can
 * use it to render live editing affordances such as overwrite cut indicators.
 */
export interface ClipEditPreview {
  /** Editing operation currently affecting the clip. */
  operation: 'overwrite';
  /** The clip start is being cut or revealed by the active edit preview. */
  cutStart?: boolean;
  /** The clip end is being cut or revealed by the active edit preview. */
  cutEnd?: boolean;
}

/** Editing operation that can produce live edit impacts. */
export type TimelineEditOperation =
  | 'move'
  | 'trim'
  | 'ripple-trim'
  | 'roll-trim'
  | 'slip'
  | 'slide'
  | 'split'
  | 'insert'
  | 'insert-clip-group'
  | 'overwrite'
  | 'overwrite-clip-group'
  | 'delete-range'
  | 'lift-range';

/** Current tool or intent family selected by product editor chrome. */
export type TimelineEditMode = 'select' | TimelineEditOperation | 'range';

/** Consequence of an active edit for an affected clip. */
export type TimelineEditImpactEffect = 'trim-start' | 'trim-end' | 'split' | 'remove';

/**
 * Describes how an active timeline edit affects one clip.
 *
 * This state is transient and is intended for headless UI affordances during
 * live editing interactions. It is not part of the persisted project model.
 */
export interface TimelineEditImpact {
  /** Clip affected by the active edit. */
  clipId: string;
  /** Track containing the affected clip. */
  trackId: string;
  /** Original clip before the active edit consequence was applied. */
  originalClip: Clip;
  /** Resulting clip segment or segments after the active edit consequence. */
  resultClips: Clip[];
  /** Type of edit consequence for the affected clip. */
  effect: TimelineEditImpactEffect;
  /** Timeline time where the affected span begins. */
  affectedStartTime: RationalTime;
  /** Timeline time where the affected span ends. */
  affectedEndTime: RationalTime;
  /** Whether the clip start is cut by the active edit. */
  cutStart?: boolean;
  /** Whether the clip end is cut by the active edit. */
  cutEnd?: boolean;
}

/**
 * Active live edit impacts for the current interaction.
 *
 * The model is operation-based so editing modes share the same headless React
 * surface.
 */
export interface TimelineEditImpacts {
  /** Editing operation producing the impacts. */
  operation: TimelineEditOperation;
  /** Clip currently driving the edit. */
  sourceClipId: string;
  /** Track containing the source clip. */
  sourceTrackId: string;
  /** Consequences for clips affected by the active edit. */
  impacts: TimelineEditImpact[];
}

/** Machine-readable reason an edit command cannot be resolved or committed. */
export type TimelineEditRejectionReason =
  | 'not-found'
  | 'locked'
  | 'disabled'
  | 'invalid-track'
  | 'incompatible-track-kind'
  | 'invalid-range'
  | 'invalid-duration'
  | 'duplicate-id'
  | 'source-bounds'
  | 'policy-rejected'
  | 'unsupported';

/** Range of timeline content affected by an edit command. */
export interface TimelineEditAffectedRange {
  /** Track affected by the range, when the edit is track-scoped. */
  trackId?: string;
  /** Inclusive range start. */
  startTime: RationalTime;
  /** Exclusive range end. */
  endTime: RationalTime;
}

/** Result returned by command validation and policy callbacks. */
export interface TimelineEditValidationResult {
  /** Whether the edit is allowed. */
  valid: boolean;
  /** Machine-readable rejection reason when invalid. */
  reason: TimelineEditRejectionReason | null;
  /** Optional human-readable note for app UI. */
  message?: string;
}

/** Clip placement command shared by insert and overwrite edits. */
export interface TimelinePlaceClipCommand {
  /** Clip to place on the timeline. Its timeline range is recalculated from startTime. */
  clip: Clip;
  /** Destination track id. */
  targetTrackId: string;
  /** Desired timeline start for the placed clip. */
  startTime: RationalTime;
  /** Whether to resolve magnetic snapping for the placed clip. Defaults to true. */
  snap?: boolean;
}

/** One deterministic clip placement used when inserting an already-associated clip group. */
export interface TimelineClipGroupPlacement {
  /** Clip to place on the timeline. Its timeline range is recalculated from startTime. */
  clip: Clip;
  /** Destination track id. */
  targetTrackId: string;
  /** Timeline start for the placed clip. */
  startTime: RationalTime;
}

/** Serializable group of timeline clips edited as a linked unit. */
export interface TimelineClipGroup {
  /** Stable group identifier. */
  id: string;
  /** Ordered clip ids that belong to this group. */
  clipIds: string[];
  /** Optional visible group label for app chrome. */
  label?: string;
}

/** Options for creating a clip group from existing clips. */
export interface TimelineCreateClipGroupOptions {
  /** Optional stable group id. A random id is generated when omitted. */
  id?: string;
  /** Existing clip ids to group. */
  clipIds: readonly string[];
  /** Optional visible group label for app chrome. */
  label?: string;
}

/** Options for inserting multiple clips and grouping them in one history entry. */
export interface TimelineInsertClipGroupOptions {
  /** Optional stable group id. A random id is generated when omitted. */
  groupId?: string;
  /** Optional visible group label for app chrome. */
  label?: string;
  /** Clip placements to insert atomically. */
  placements: readonly TimelineClipGroupPlacement[];
}

/** Command that moves an existing clip. */
export interface TimelineMoveEditCommand extends TimelineClipMoveOptions {
  type: 'move';
}

/** Command that trims one existing clip boundary. */
export interface TimelineTrimEditCommand {
  type: 'trim';
  clipId: string;
  edge: 'start' | 'end';
  newTime: RationalTime;
  snap?: boolean;
}

/** Command that trims one boundary and ripples later clips on the same track. */
export interface TimelineRippleTrimEditCommand extends Omit<TimelineTrimEditCommand, 'type'> {
  type: 'ripple-trim';
}

/** Command that rolls the shared boundary between two adjacent clips. */
export interface TimelineRollTrimEditCommand {
  type: 'roll-trim';
  leftClipId: string;
  rightClipId: string;
  boundaryTime: RationalTime;
  snap?: boolean;
}

/** Command that shifts an existing clip's source start without moving timeline bounds. */
export interface TimelineSlipEditCommand {
  type: 'slip';
  clipId: string;
  deltaTime: RationalTime;
}

/** Command that moves an existing clip by a relative timeline offset. */
export interface TimelineSlideEditCommand {
  type: 'slide';
  clipId: string;
  deltaTime: RationalTime;
  snap?: boolean;
}

/** Command that splits selected clips at one timeline time. */
export interface TimelineSplitEditCommand {
  type: 'split';
  time: RationalTime;
  clipIds: readonly string[];
}

/** Command that inserts a new clip and pushes later clips forward. */
export interface TimelineInsertEditCommand extends TimelinePlaceClipCommand {
  type: 'insert';
}

/** Command that inserts grouped clips and pushes later clips forward per target track. */
export interface TimelineInsertClipGroupEditCommand extends TimelineInsertClipGroupOptions {
  type: 'insert-clip-group';
  /** Whether to snap the first placement and apply that shared delta to the group. Defaults to true. */
  snap?: boolean;
}

/** Command that places a new clip and removes or trims overlaps on the target track. */
export interface TimelineOverwriteEditCommand extends TimelinePlaceClipCommand {
  type: 'overwrite';
}

/** Command that places grouped clips and overwrites overlaps per target track. */
export interface TimelineOverwriteClipGroupEditCommand extends TimelineInsertClipGroupOptions {
  type: 'overwrite-clip-group';
  /** Whether to snap the first placement and apply that shared delta to the group. Defaults to true. */
  snap?: boolean;
}

/** Command that removes a timeline range and ripples later clips closed by default. */
export interface TimelineDeleteRangeEditCommand {
  type: 'delete-range';
  startTime: RationalTime;
  endTime: RationalTime;
  trackIds?: readonly string[];
  ripple?: boolean;
}

/** Command that removes a timeline range while leaving the gap in place. */
export interface TimelineLiftRangeEditCommand {
  type: 'lift-range';
  startTime: RationalTime;
  endTime: RationalTime;
  trackIds?: readonly string[];
}

/** First-class edit command accepted by TimelineEngine edit APIs. */
export type TimelineEditCommand =
  | TimelineMoveEditCommand
  | TimelineTrimEditCommand
  | TimelineRippleTrimEditCommand
  | TimelineRollTrimEditCommand
  | TimelineSlipEditCommand
  | TimelineSlideEditCommand
  | TimelineSplitEditCommand
  | TimelineInsertEditCommand
  | TimelineInsertClipGroupEditCommand
  | TimelineOverwriteEditCommand
  | TimelineOverwriteClipGroupEditCommand
  | TimelineDeleteRangeEditCommand
  | TimelineLiftRangeEditCommand;

/** Context passed to product-defined edit policy callbacks. */
export interface TimelineEditPolicyContext<
  Command extends TimelineEditCommand = TimelineEditCommand,
> {
  /** Command being validated. */
  command: Command;
  /** Current engine-owned timeline state. */
  state: TimelineState;
  /** Clip directly addressed by the command, when one exists. */
  clip?: Clip;
  /** Track directly addressed by the command, when one exists. */
  track?: Track;
  /** Destination track for placement or move commands, when one exists. */
  targetTrack?: Track;
  /** Timeline range affected by the command, when known before resolution. */
  range?: TimelineEditAffectedRange;
}

/** App-defined behavioral policy for timeline edit commands. */
export interface TimelineEditPolicy {
  /** Final command-level policy gate. */
  validateCommand?: (
    context: TimelineEditPolicyContext
  ) => TimelineEditValidationResult | undefined;
  /** Placement rule for move, insert, and overwrite commands. */
  canPlaceClip?: (
    context: TimelineEditPolicyContext<
      | TimelineMoveEditCommand
      | TimelineInsertEditCommand
      | TimelineInsertClipGroupEditCommand
      | TimelineOverwriteEditCommand
      | TimelineOverwriteClipGroupEditCommand
    >
  ) => TimelineEditValidationResult | undefined;
  /** Trim rule for trim, ripple-trim, and roll-trim commands. */
  canTrimClip?: (
    context: TimelineEditPolicyContext<
      TimelineTrimEditCommand | TimelineRippleTrimEditCommand | TimelineRollTrimEditCommand
    >
  ) => TimelineEditValidationResult | undefined;
  /** Ripple rule for ripple trims and range deletes that close gaps. */
  canRippleTrack?: (
    context: TimelineEditPolicyContext<
      TimelineRippleTrimEditCommand | TimelineDeleteRangeEditCommand
    >
  ) => TimelineEditValidationResult | undefined;
  /** Range rule for insert, overwrite, delete-range, and lift-range commands. */
  canEditRange?: (
    context: TimelineEditPolicyContext<
      | TimelineInsertEditCommand
      | TimelineInsertClipGroupEditCommand
      | TimelineOverwriteEditCommand
      | TimelineOverwriteClipGroupEditCommand
      | TimelineDeleteRangeEditCommand
      | TimelineLiftRangeEditCommand
    >
  ) => TimelineEditValidationResult | undefined;
}

/** Shared preview result produced for every edit command. */
export interface TimelineEditPreview {
  /** Command that produced this preview. */
  command: TimelineEditCommand;
  /** Whether the command can be committed. */
  valid: boolean;
  /** Machine-readable rejection reason when invalid. */
  reason: TimelineEditRejectionReason | null;
  /** Optional human-readable note for app UI. */
  message?: string;
  /** Snap result used while resolving the command, if any. */
  snap: TimelineSnapResult | null;
  /** Existing clips after the edit changes them. */
  changedClips: Clip[];
  /** New clips created by the edit. */
  createdClips: Clip[];
  /** Existing clips removed by the edit. */
  removedClips: Clip[];
  /** Timeline ranges affected by the edit. */
  affectedRanges: TimelineEditAffectedRange[];
  /** Clip-level consequences available to renderer and headless UI affordances. */
  impacts: TimelineEditImpact[];
  /** Lightweight app/UI metadata for custom edit guides. */
  guideMetadata?: Record<string, unknown>;
}

/** Result returned after committing an edit command. */
export interface TimelineEditCommitResult {
  /** Command that was committed. */
  command: TimelineEditCommand;
  /** Preview data used for the commit. */
  preview: TimelineEditPreview;
  /** Whether the command committed. */
  committed: boolean;
}

/**
 * Represents an individual media clip node positioned at a specific timeline interval.
 */
export interface Clip {
  /** Unique identifier for the clip. */
  id: string;
  /** Identifier linking this clip to its source asset (e.g., source video asset ID). */
  sourceId: string;
  /** Start time of the clip on the global timeline. */
  timelineStart: RationalTime;
  /** End time of the clip on the global timeline. */
  timelineEnd: RationalTime;
  /** Offset into the source file from which playback begins. */
  sourceStart: RationalTime;
  /** Whether this clip is currently selected by the user. */
  selected: boolean;
  /** Custom styling color override (HEX color) for rendering the clip bar. */
  color?: string;
  /** Visual transparency or volume level of this clip, from 0.0 to 1.0. */
  opacity?: number;
  /** Optional customized text label rendered inside the clip. */
  label?: string;

  /** Whether this clip can be dragged left/right across the timeline track. */
  movable?: boolean;
  /** Whether the boundaries of this clip can be trimmed or extended. */
  resizable?: boolean;
  /** Whether the clip is disabled (suppressed from rendering and playback). */
  disabled?: boolean;
  /** Minimum allowable timelineStart timestamp for locking clip positions. */
  minStart?: RationalTime;
  /** Maximum allowable timelineEnd timestamp for locking clip positions. */
  maxEnd?: RationalTime;
  /** Transient live-edit preview state for UI affordances. */
  editPreview?: ClipEditPreview;
  /** Whether this clip participates in snapping, or clip-specific snap settings. */
  snap?: false | ClipSnapOptions;
  /** Clip-scoped property keyframes positioned at absolute timeline times. */
  keyframes?: TimelineKeyframe[];
  /** Arbitrary custom application metadata attached to this clip. */
  metadata?: Record<string, unknown>;
}

/**
 * Flattened clip metadata shared by core geometry APIs, React hooks, and custom renderers.
 *
 * @template TrackKind - App-defined track kind.
 */
export interface TimelineClipEntry<TrackKind = string> {
  /** Raw timeline clip represented by this entry. */
  clip: Clip;
  /** Track containing the clip. */
  track: Track<TrackKind>;
  /** Zero-based track index in timeline order. */
  trackIndex: number;
  /** Zero-based clip index inside the containing track. */
  clipIndex: number;
}

/**
 * Clip entry with viewport geometry and editing/display state.
 *
 * @template TrackKind - App-defined track kind.
 */
export interface TimelineClipRect<TrackKind = string> extends TimelineClipEntry<TrackKind> {
  /** Clip bounds in viewport CSS pixels. */
  rect: ClipViewportRect;
  /** Source-media range covered by the full clip. */
  sourceRange: ClipSourceRange;
  /** Whether the clip body can be moved by edit controls. */
  canMove: boolean;
  /** Whether the clip edges can be trimmed by edit controls. */
  canTrim: boolean;
  /** Whether the containing track is muted. */
  muted: boolean;
  /** Whether the containing track participates in active layer and media lookup. */
  visible: boolean;
  /** Whether the containing track is locked. */
  locked: boolean;
  /** Whether the clip is disabled. */
  disabled: boolean;
}

/** Options for moving a clip in time and optionally into another track. */
export interface TimelineClipMoveOptions {
  /** Clip to move. */
  clipId: string;
  /** Desired new timeline start. */
  startTime: RationalTime;
  /** Optional destination track. Omit for same-track movement. */
  targetTrackId?: string;
  /** Whether to resolve horizontal magnetic snapping. Defaults to true. */
  snap?: boolean;
  /** Allows movement across different track kinds when true. Defaults to false. */
  allowCrossKindTrackMove?: boolean;
}

/** Result metadata for a committed or previewed clip move. */
export interface TimelineClipMoveResult {
  /** Moved clip id. */
  clipId: string;
  /** Moved clip after the operation. */
  clip: Clip;
  /** Track that contained the clip before the move. */
  sourceTrackId: string;
  /** Track containing the clip after the move. */
  destinationTrackId: string;
  /** Source track index before the move. */
  sourceTrackIndex: number;
  /** Destination track index after the move. */
  destinationTrackIndex: number;
  /** Source clip index before the move. */
  sourceClipIndex: number;
  /** Destination clip index after sorting. */
  destinationClipIndex: number;
  /** Clip start before the move. */
  previousStartTime: RationalTime;
  /** Clip end before the move. */
  previousEndTime: RationalTime;
  /** Clip start after the move. */
  startTime: RationalTime;
  /** Clip end after the move. */
  endTime: RationalTime;
  /** All clips changed by the move, including linked group members. */
  changedClips: Clip[];
}

/**
 * Viewport-intersecting clip entry with clipped timeline and source-media ranges.
 *
 * @template TrackKind - App-defined track kind.
 */
export interface VisibleTimelineClip<TrackKind = string> extends TimelineClipRect<TrackKind> {
  /** Portion of the clip inside the requested viewport plus overscan. */
  visibleRect: ClipViewportRect;
  /** Timeline time at the left edge of the visible clip span. */
  visibleTimelineStartTime: RationalTime;
  /** Timeline time at the right edge of the visible clip span. */
  visibleTimelineEndTime: RationalTime;
  /** Source-media time at the left edge of the visible clip span. */
  visibleSourceStartTime: RationalTime;
  /** Source-media time at the right edge of the visible clip span. */
  visibleSourceEndTime: RationalTime;
}

/** Ruler tick visual weight. */
export type TimelineRulerTickKind = 'major' | 'minor';

/** Label style used by timeline ruler ticks. */
export type TimelineRulerLabelFormat = 'time' | 'frame-number';

/** One viewport-space ruler tick for canvas, DOM, or custom rendering. */
export interface TimelineRulerTick {
  /** Whether this tick is a primary labeled tick or a smaller subdivision. */
  kind: TimelineRulerTickKind;
  /** Tick x-position relative to the current viewport in CSS pixels. */
  x: number;
  /** Timeline time represented by the tick. */
  time: RationalTime;
  /** Timeline seconds represented by the tick for display-only UI. */
  seconds: number;
  /** Frame number represented by the tick when a frame rate is configured. */
  frame?: number;
  /** Optional formatted label for major ticks. */
  label?: string;
}

/** Options for building shared headless timeline ruler ticks. */
export interface TimelineRulerTickOptions {
  /** Current horizontal timeline scroll offset in pixels. */
  scrollLeft: number;
  /** Current zoom scale in pixels per second. */
  zoomScale: number;
  /** Timeline viewport width in CSS pixels. */
  viewportWidth: number;
  /** Optional explicit timeline duration used to clamp ticks. */
  duration?: RationalTime;
  /** Optional frame rate used for frame-aware tick generation and labels. */
  frameRate?: TimecodeFrameRate;
  /** Numbered tick label style. Defaults to time labels. */
  labelFormat?: TimelineRulerLabelFormat;
  /** Timecode formatting options for time labels when a frame rate is configured. */
  timecodeFormatOptions?: TimecodeFormatOptions;
  /** Whether major ticks should include formatted labels. Defaults to true. */
  includeLabels?: boolean;
}

/**
 * Clip that is active at a timeline time, including its mapped source time.
 */
export interface ActiveClip<TrackKind = string> {
  /** Track containing the active clip. */
  track: Track<TrackKind>;
  /** Clip active under the playhead or inspected timeline time. */
  clip: Clip;
  /** Timeline time used for the lookup. */
  timelineTime: RationalTime;
  /** Source-media time corresponding to `timelineTime`. */
  sourceTime: RationalTime;
  /** Source-media range covered by the active clip. */
  sourceRange: ClipSourceRange;
  /** Stable media sync signature for detecting timing-affecting clip changes. */
  syncKey: string;
}

/**
 * Source-frame lookup strategy for media integrations.
 */
export type SourceFrameResolveMode = 'floor' | 'ceil' | 'nearest';

/**
 * Exact source-frame timestamp returned by a media integration.
 */
export interface SourceFrame {
  /** Source asset identifier matching clip.sourceId. */
  sourceId: string;
  /** Zero-based frame index within the source, when known by the resolver. */
  index: number;
  /** Inclusive source timestamp where the frame begins. */
  start: RationalTime;
  /** Exclusive source timestamp where the frame ends, when known. */
  end?: RationalTime;
}

/**
 * App or media-player supplied exact source-frame resolver.
 */
export interface SourceFrameResolver {
  /**
   * Finds the frame at or nearest to a source timestamp.
   *
   * @param sourceId - Source asset id matching timeline clip `sourceId` values.
   * @param sourceTime - Source-media time to resolve.
   * @param mode - Frame selection strategy when `sourceTime` falls between frames.
   */
  getFrameAt(
    sourceId: string,
    sourceTime: RationalTime,
    mode?: SourceFrameResolveMode
  ): MaybePromise<SourceFrame | null>;
}

/**
 * Represents the complete, serialized state model of the high performance timeline.
 */
export interface TimelineState {
  /** Active set of tracks. */
  tracks: Track[];
  /** Clip groups edited as linked units. */
  clipGroups: TimelineClipGroup[];
  /** Monotonic counter incremented when track or clip edits can change active layer lookup at a fixed playhead. */
  contentRevision: number;
  /** The current playhead position. */
  playheadTime: RationalTime;
  /** Zoom scale representing pixels per second. */
  zoomScale: number;
  /** Horizontal scroll offset in pixels. */
  scrollLeft: number;
  /** Vertical scroll offset in pixels. */
  scrollTop: number;
  /** Whether magnetic snapping is globally enabled. */
  snapEnabled: boolean;
  /** Magnetic snap radius in screen pixels. */
  snapThresholdPixels: number;
  /** Transient snap guide feedback for the active interaction. */
  snapFeedback: TimelineSnapFeedback;
  /** Transient cross-track clip drop feedback for the active body drag interaction. */
  clipDropFeedback: TimelineClipDropFeedback;
  /** Optional current selection region In-Point boundary. */
  inPoint?: RationalTime;
  /** Optional current selection region Out-Point boundary. */
  outPoint?: RationalTime;
  /** List of markers positioned on the timeline. */
  markers?: Marker[];

  /** Current playback state of the timeline. */
  playing?: boolean;
  /** Playback speed multiplier (1.0 = normal speed). */
  playbackRate?: number;
  /** Width of the visible timeline area in pixels (for frustum culling/virtualization). */
  viewportWidth?: number;
  /** Height of the visible timeline area in pixels (for frustum culling/virtualization). */
  viewportHeight?: number;
  /** Explicit duration of the timeline. If set, this overrides the dynamic duration calculated from clips. */
  duration?: RationalTime;
}
