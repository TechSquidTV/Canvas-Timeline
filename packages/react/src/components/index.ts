import { Root } from './surface/Root';
import { TrackList } from './surface/TrackList';
import { TrackItem as Track } from './surface/TrackItem';
import { TrackHeaderList, TrackHeader, TrackHeaderResizeHandle } from './tracks/TrackHeader';
import { ClipInteractionLayer } from './interactions/ClipInteractionLayer';
import { KeyframeInteractionLayer } from './interactions/KeyframeInteractionLayer';
import { KeyframeTangentInteractionLayer } from './interactions/KeyframeTangentInteractionLayer';
import { PlayheadArea } from './playhead/PlayheadArea';
import { PlayheadGrabber } from './playhead/PlayheadGrabber';
import { KeyboardScope } from './controls/KeyboardScope';
import {
  ViewportScrollbarRoot as ViewportScrollbar,
  ViewportScrollbarThumb,
  ViewportScrollbarHandle,
} from './scrollbars/ViewportScrollbar';
import {
  VerticalScrollbarRoot as VerticalScrollbar,
  VerticalScrollbarThumb,
  VerticalScrollbarHandle,
} from './scrollbars/VerticalScrollbar';
import { RangeSelector } from './controls/RangeSelector';

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
} from './interactions/ClipInteractionLayer';
export type {
  KeyframeDeleteDetails,
  KeyframeDoubleClickDetails,
  KeyframeInteractionLayerProps,
} from './interactions/KeyframeInteractionLayer';
export type {
  KeyframeTangentHandleDoubleClickDetails,
  KeyframeTangentInteractionLayerProps,
} from './interactions/KeyframeTangentInteractionLayer';
export type { KeyboardScopeProps } from './controls/KeyboardScope';
export type { PlayheadAreaProps } from './playhead/PlayheadArea';
export type { PlayheadGrabberProps } from './playhead/PlayheadGrabber';
export type { TimeGrabberChildren, TimeGrabberRenderProps } from './playhead/TimeGrabber';
export type {
  TrackHeaderChildren,
  TrackHeaderListProps,
  TrackHeaderProps,
  TrackHeaderResizeHandleProps,
} from './tracks/TrackHeader';
export type { TrackItemProps } from './surface/TrackItem';
export type {
  ViewportScrollbarHandleProps,
  ViewportScrollbarRootProps,
  ViewportScrollbarThumbProps,
} from './scrollbars/ViewportScrollbar';
export type {
  VerticalScrollbarHandleProps,
  VerticalScrollbarRootProps,
  VerticalScrollbarThumbProps,
} from './scrollbars/VerticalScrollbar';
export type {
  InOutBoundary,
  RangeSelectorGrabberChildren,
  RangeSelectorGrabberRenderProps,
  RangeSelectorProps,
  RangeSelectorRootProps,
} from './controls/RangeSelector';
