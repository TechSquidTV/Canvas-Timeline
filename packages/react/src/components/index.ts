import { Root } from '#react/components/surface/Root';
import { TrackList } from '#react/components/surface/TrackList';
import { TrackItem as Track } from '#react/components/surface/TrackItem';
import {
  TrackHeaderList,
  TrackHeader,
  TrackHeaderResizeHandle,
} from '#react/components/tracks/TrackHeader';
import { ClipInteractionLayer } from '#react/components/interactions/ClipInteractionLayer';
import { KeyframeInteractionLayer } from '#react/components/interactions/KeyframeInteractionLayer';
import { KeyframeTangentInteractionLayer } from '#react/components/interactions/KeyframeTangentInteractionLayer';
import { PlayheadArea } from '#react/components/playhead/PlayheadArea';
import { PlayheadGrabber } from '#react/components/playhead/PlayheadGrabber';
import { KeyboardScope } from '#react/components/controls/KeyboardScope';
import {
  ViewportScrollbarRoot as ViewportScrollbar,
  ViewportScrollbarThumb,
  ViewportScrollbarHandle,
} from '#react/components/scrollbars/ViewportScrollbar';
import {
  VerticalScrollbarRoot as VerticalScrollbar,
  VerticalScrollbarThumb,
  VerticalScrollbarHandle,
} from '#react/components/scrollbars/VerticalScrollbar';
import { RangeSelector } from '#react/components/controls/RangeSelector';

/**
 * Namespace of timeline UI components for composing an editor surface.
 */
export const Timeline = {
  /** Root provider-aware container for the timeline interaction surface. */
  Root,
  /** Scrollable list container for timeline track rows. */
  TrackList,
  /** Track row component bound to a track id. */
  Track,
  /** Static left-column list for timeline track headers. */
  TrackHeaderList,
  /** DOM track header row bound to a track id. */
  TrackHeader,
  /** Pointer-captured handle for resizing a track header row. */
  TrackHeaderResizeHandle,
  /** Delegated clip hit-test and edit interaction layer. */
  ClipInteractionLayer,
  /** Delegated keyframe hit-test and edit interaction layer. */
  KeyframeInteractionLayer,
  /** Delegated Bezier keyframe tangent handle interaction layer. */
  KeyframeTangentInteractionLayer,
  /** Transparent scrub area for moving the playhead and adding markers. */
  PlayheadArea,
  /** Draggable playhead handle. */
  PlayheadGrabber,
  /** Focus-scoped keyboard shortcut container for timeline editor surfaces. */
  KeyboardScope,
  /** Scrollbar root wired to the timeline viewport range. */
  ViewportScrollbar,
  /** Draggable scrollbar thumb representing the visible timeline window. */
  ViewportScrollbarThumb,
  /** Resize handle for adjusting one side of the visible timeline window. */
  ViewportScrollbarHandle,
  /** Vertical scrollbar root wired to the timeline track viewport. */
  VerticalScrollbar,
  /** Draggable scrollbar thumb representing the visible track rows. */
  VerticalScrollbarThumb,
  /** Range handle for custom vertical scrollbar compositions. */
  VerticalScrollbarHandle,
  /** Headless range selection slider for timeline In/Out bounds. */
  RangeSelector,
};

export {
  Root,
  TrackList,
  Track,
  TrackHeaderList,
  TrackHeader,
  TrackHeaderResizeHandle,
  ClipInteractionLayer,
  KeyframeInteractionLayer,
  KeyframeTangentInteractionLayer,
  PlayheadArea,
  PlayheadGrabber,
  KeyboardScope,
  ViewportScrollbar,
  ViewportScrollbarThumb,
  ViewportScrollbarHandle,
  VerticalScrollbar,
  VerticalScrollbarThumb,
  VerticalScrollbarHandle,
  RangeSelector,
};

export type {
  ClipDoubleClickDetails,
  ClipInteractionLayerProps,
} from '#react/components/interactions/ClipInteractionLayer';
export type {
  KeyframeDeleteDetails,
  KeyframeDoubleClickDetails,
  KeyframeInteractionLayerProps,
} from '#react/components/interactions/KeyframeInteractionLayer';
export type {
  KeyframeTangentHandleDoubleClickDetails,
  KeyframeTangentInteractionLayerProps,
} from '#react/components/interactions/KeyframeTangentInteractionLayer';
export type { KeyboardScopeProps } from '#react/components/controls/KeyboardScope';
export type { PlayheadAreaProps } from '#react/components/playhead/PlayheadArea';
export type { PlayheadGrabberProps } from '#react/components/playhead/PlayheadGrabber';
export type {
  TimeGrabberChildren,
  TimeGrabberRenderProps,
} from '#react/components/playhead/TimeGrabber';
export type {
  TrackHeaderChildren,
  TrackHeaderListProps,
  TrackHeaderProps,
  TrackHeaderResizeHandleProps,
} from '#react/components/tracks/TrackHeader';
export type { TrackItemProps } from '#react/components/surface/TrackItem';
export type {
  ViewportScrollbarHandleProps,
  ViewportScrollbarRootProps,
  ViewportScrollbarThumbProps,
} from '#react/components/scrollbars/ViewportScrollbar';
export type {
  VerticalScrollbarHandleProps,
  VerticalScrollbarRootProps,
  VerticalScrollbarThumbProps,
} from '#react/components/scrollbars/VerticalScrollbar';
export type {
  InOutBoundary,
  RangeSelectorGrabberChildren,
  RangeSelectorGrabberRenderProps,
  RangeSelectorProps,
  RangeSelectorRootProps,
} from '#react/components/controls/RangeSelector';
