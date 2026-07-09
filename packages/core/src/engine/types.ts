import type {
  Clip,
  TimelineClipGroup,
  TimelineClipMoveResult,
  TimelineEditPreview,
  TimelineEditValidationResult,
  TimelineSnapResult,
  Track,
} from '#core/types';
import type { ClipCreatedReason, ClipRemovedReason } from '#core/events';

export interface TimelineClipLookup {
  track: Track;
  clip: Clip;
  trackIndex: number;
  clipIndex: number;
}

export interface TimelineResolvedEdit {
  preview: TimelineEditPreview;
  tracks: Track[];
  clipGroups?: TimelineClipGroup[];
  commandFingerprint: string;
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
