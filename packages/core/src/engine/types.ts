import type { ClipCreatedReason, ClipRemovedReason } from '#core/events';
import type {
  Clip,
  TimelineClipGroup,
  TimelineClipEntry,
  TimelineClipMoveResult,
  TimelineEditPreview,
  TimelineEditValidationResult,
  TimelineSnapResult,
  Track,
} from '#core/types';
export interface TimelineClipLookup extends TimelineClipEntry {
  track: Track;
  clip: Clip;
}

export interface TimelineResolvedEdit {
  preview: TimelineEditPreview;
  tracks: Track[];
  clipGroups?: TimelineClipGroup[];
  moveResult?: TimelineClipMoveResult;
  createdClipEvents: TimelineCreatedClipEvent[];
  removedClipEvents: TimelineRemovedClipEvent[];
}

export interface TimelineCreatedClipEvent {
  clip: Clip;
  reason: ClipCreatedReason;
  originClipId?: string;
}

export interface TimelineRemovedClipEvent {
  clip: Clip;
  reason: ClipRemovedReason;
}

export interface TimelineResolvedClipGroupPlacement {
  clip: Clip;
  track: Track;
}

export interface TimelineResolvedClipGroupPlacements {
  placements: TimelineResolvedClipGroupPlacement[];
  firstSnap: TimelineSnapResult | null;
}

export interface TimelineRejectedClipGroupPlacements {
  validation: TimelineEditValidationResult;
}
