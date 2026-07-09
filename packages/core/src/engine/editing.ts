import type {
  Clip,
  TimelineClipGroup,
  TimelineClipGroupPlacement,
  TimelineClipMoveResult,
  TimelineCreateClipGroupOptions,
  TimelineDeleteClipsEditCommand,
  TimelineDeleteRangeEditCommand,
  TimelineEditAffectedRange,
  TimelineEditCommand,
  TimelineEditCommitResult,
  TimelineEditImpact,
  TimelineEditImpacts,
  TimelineEditPolicyContext,
  TimelineEditPreview,
  TimelineEditRejectionReason,
  TimelineEditValidationResult,
  TimelineInsertClipGroupEditCommand,
  TimelineInsertClipGroupOptions,
  TimelineInsertEditCommand,
  TimelineLiftRangeEditCommand,
  TimelineMoveEditCommand,
  TimelineOverwriteClipGroupEditCommand,
  TimelineOverwriteEditCommand,
  TimelinePlaceClipCommand,
  TimelineRippleTrimEditCommand,
  TimelineRollTrimEditCommand,
  TimelineSlideEditCommand,
  TimelineSplitEditCommand,
  TimelineSlipEditCommand,
  TimelineSnapFeedback,
  TimelineSnapResult,
  TimelineTrimEditCommand,
  Track,
} from '#core/types';
import type { ClipCreatedEvent, ClipRemovedEvent, ClipSplitEvent } from '#core/events';
import {
  assertValidRationalTime,
  addRational,
  compareRational,
  fromSeconds,
  maxRational,
  minRational,
  subRational,
  toSeconds,
} from '@techsquidtv/canvas-timeline-utils';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import {
  assertValidClipTiming,
  cloneRationalTime,
  createClipGroupSnapshots,
  createClipSnapshot,
  createTrackSnapshots,
} from '#core/snapshot';
import { filterClipKeyframesToClipRange, shiftClipKeyframes } from '#core/engine/clip-keyframes';
import { createEditCommandFingerprint } from '#core/engine/edit-fingerprint';
import {
  createTimelineEditImpactsSnapshot,
  defaultTimelineEditValidationResult,
  emptyTimelineSnapFeedback,
} from '#core/engine/feedback';
import type {
  TimelineClipLookup,
  TimelineCreatedClipEvent,
  TimelineRejectedClipGroupPlacements,
  TimelineRemovedClipEvent,
  TimelineResolvedClipGroupPlacement,
  TimelineResolvedClipGroupPlacements,
  TimelineResolvedEdit,
} from '#core/engine/types';
import { TimelineEngineBase } from '#core/engine/base';

const minimumTimelineEditDurationSeconds = 0.01;

export abstract class TimelineEngineEditing extends TimelineEngineBase {
  abstract getClip(clipId: string): TimelineClipLookup | undefined;
  abstract resolveSnap(time: RationalTime, publishFeedback?: boolean): TimelineSnapResult | null;
  abstract invalidateContent(): void;
  abstract snapshot(): void;
  abstract selectClips(clipIds: readonly string[]): void;
  protected abstract publishSnapFeedback(feedback: TimelineSnapFeedback): void;

  validateEdit(command: TimelineEditCommand): TimelineEditValidationResult {
    return this.validateEditCommand(command);
  }

  /**
   * Resolves and publishes a non-mutating preview for an edit command.
   *
   * @param command - Command to preview.
   * @returns Shared preview result for renderer and headless UI consumers.
   */
  previewEdit(command: TimelineEditCommand): TimelineEditPreview {
    const resolved = this.resolveTimelineEdit(command);
    this.editResolution = resolved;
    this.publishEditPreview(resolved.preview);
    return resolved.preview;
  }

  /**
   * Resolves, validates, and commits an edit command as one history entry.
   *
   * @param command - Command to commit.
   * @returns Commit result containing the resolved preview.
   */
  commitEdit(command: TimelineEditCommand): TimelineEditCommitResult {
    const commandFingerprint = createEditCommandFingerprint(command);
    const resolved =
      this.editResolution?.commandFingerprint === commandFingerprint
        ? this.editResolution
        : this.resolveTimelineEdit(command);
    if (!resolved.preview.valid) {
      const rejectedResult: TimelineEditCommitResult = {
        command,
        preview: resolved.preview,
        committed: false,
      };
      this.publishEditPreview(resolved.preview);
      return rejectedResult;
    }

    this.state.tracks = resolved.tracks;
    if (resolved.clipGroups !== undefined) {
      this.state.clipGroups = resolved.clipGroups;
    }
    this.normalizeClipGroups();
    for (const track of this.state.tracks) {
      this.sortTrackClips(track);
    }

    this.invalidateContent();
    this.snapshot();
    this.emitEditCommitEvents(resolved);
    const result: TimelineEditCommitResult = {
      command,
      preview: resolved.preview,
      committed: true,
    };
    this.editPreview = null;
    this.editImpacts = null;
    this.editResolution = null;
    this.publishSnapFeedback(emptyTimelineSnapFeedback);
    this.emit('edit:preview', null);
    this.emit('edit:impacts', null);
    this.emit('edit:commit', result);
    this.emit('state:settled');
    this.emit('render');
    return result;
  }

  /**
   * Clears the active command-layer edit preview and snap guides.
   */
  cancelEdit() {
    this.editPreview = null;
    this.editImpacts = null;
    this.editResolution = null;
    this.publishSnapFeedback(emptyTimelineSnapFeedback);
    this.emit('edit:preview', null);
    this.emit('edit:impacts', null);
    this.emit('state:preview');
    this.emit('render');
  }

  private publishEditPreview(preview: TimelineEditPreview) {
    this.editPreview = preview;
    this.editImpacts = this.createEditImpactsFromPreview(preview);
    if (preview.snap !== null) {
      this.publishSnapFeedback(preview.snap.feedback);
    } else {
      this.publishSnapFeedback(emptyTimelineSnapFeedback);
    }
    this.emit('edit:preview', preview);
    this.emit('edit:impacts', this.editImpacts);
    this.emit('state:preview');
    this.emit('render');
  }

  private createEditImpactsFromPreview(preview: TimelineEditPreview): TimelineEditImpacts | null {
    if (preview.impacts.length === 0) {
      return null;
    }

    const sourceClipId = this.getEditCommandSourceClipId(preview.command);
    const sourceTrackId = this.getEditCommandSourceTrackId(preview.command, sourceClipId);
    return createTimelineEditImpactsSnapshot({
      operation: preview.command.type,
      sourceClipId: sourceClipId ?? null,
      sourceTrackId,
      impacts: preview.impacts,
    });
  }

  private getEditCommandSourceClipId(command: TimelineEditCommand): string | undefined {
    switch (command.type) {
      case 'move':
      case 'trim':
      case 'ripple-trim':
      case 'slip':
      case 'slide':
        return command.clipId;
      case 'split':
        return command.clipIds[0];
      case 'delete-clips':
        return command.clipIds[0];
      case 'roll-trim':
        return command.leftClipId;
      case 'insert':
      case 'overwrite':
        return command.clip.id;
      case 'insert-clip-group':
      case 'overwrite-clip-group':
        return command.placements[0]?.clip.id;
      case 'delete-range':
      case 'lift-range':
        return undefined;
    }
  }

  private getEditCommandSourceTrackId(
    command: TimelineEditCommand,
    sourceClipId: string | undefined
  ): string | null {
    switch (command.type) {
      case 'insert':
      case 'overwrite':
        return command.targetTrackId;
      case 'insert-clip-group':
      case 'overwrite-clip-group':
        return command.placements[0]?.targetTrackId ?? null;
      case 'delete-range':
      case 'lift-range':
        return null;
      case 'move':
      case 'trim':
      case 'ripple-trim':
      case 'slip':
      case 'slide':
      case 'split':
      case 'delete-clips':
      case 'roll-trim':
        return sourceClipId !== undefined ? (this.getClip(sourceClipId)?.track.id ?? null) : null;
    }
  }

  private emitEditCommitEvents(resolved: TimelineResolvedEdit) {
    for (const removed of resolved.removedClipEvents) {
      this.emit('clip:removed', {
        clip: removed.clip,
        reason: removed.reason,
      } satisfies ClipRemovedEvent);
    }

    for (const created of resolved.createdClipEvents) {
      if (created.reason === 'split') {
        continue;
      }
      const event: ClipCreatedEvent = {
        clip: created.clip,
        reason: created.reason,
      };
      if (created.originClipId !== undefined) {
        event.originClipId = created.originClipId;
      }
      this.emit('clip:created', event);
    }

    const { command } = resolved.preview;
    const { preview } = resolved;
    if (resolved.moveResult !== undefined) {
      this.emit('clip:move', { ...resolved.moveResult, phase: 'commit' });
    }

    if (command.type === 'trim' || command.type === 'ripple-trim' || command.type === 'roll-trim') {
      for (const clip of preview.changedClips) {
        this.emit('clip:resize', { clip });
      }
    }
    if (command.type === 'slip') {
      for (const clip of preview.changedClips) {
        this.emit('clip:slip', { clip });
      }
    }
    if (command.type === 'split') {
      for (const created of resolved.createdClipEvents) {
        if (created.originClipId === undefined) {
          continue;
        }
        const left = preview.changedClips.find((clip) => clip.id === created.originClipId);
        if (left !== undefined) {
          this.emit('clip:split', {
            originalId: created.originClipId,
            left,
            right: created.clip,
          } satisfies ClipSplitEvent);
        }
      }
    }
  }

  private resolveTimelineEdit(command: TimelineEditCommand): TimelineResolvedEdit {
    const validation = this.validateEditCommand(command);
    if (!validation.valid) {
      return this.createRejectedResolvedEdit(
        command,
        createTrackSnapshots(this.state.tracks),
        validation
      );
    }

    switch (command.type) {
      case 'move':
        return this.resolveMoveEdit(command);
      case 'trim':
        return this.resolveTrimEdit(command, false);
      case 'ripple-trim':
        return this.resolveTrimEdit(command, true);
      case 'roll-trim':
        return this.resolveRollTrimEdit(command);
      case 'slip':
        return this.resolveSlipEdit(command);
      case 'slide':
        return this.resolveSlideEdit(command);
      case 'split':
        return this.resolveSplitEdit(command);
      case 'delete-clips':
        return this.resolveDeleteClipsEdit(command);
      case 'insert':
        return this.resolveInsertEdit(command);
      case 'insert-clip-group':
        return this.resolveInsertClipGroupEdit(command);
      case 'overwrite':
        return this.resolveOverwriteEdit(command);
      case 'overwrite-clip-group':
        return this.resolveOverwriteClipGroupEdit(command);
      case 'delete-range':
        return this.resolveRangeRemovalEdit(command, command.ripple !== false);
      case 'lift-range':
        return this.resolveRangeRemovalEdit(command, false);
    }
  }

  private createRejectedEditPreview(
    command: TimelineEditCommand,
    validation: TimelineEditValidationResult
  ): TimelineEditPreview {
    return {
      command,
      valid: false,
      reason: validation.reason,
      message: validation.message,
      snap: null,
      changedClips: [],
      createdClips: [],
      removedClips: [],
      affectedRanges: [],
      impacts: [],
    };
  }

  private createResolvedEditPreview(
    command: TimelineEditCommand,
    partial: Omit<TimelineEditPreview, 'command' | 'valid' | 'reason'>
  ): TimelineEditPreview {
    return {
      command,
      valid: true,
      reason: null,
      ...partial,
    };
  }

  private createRejectedResolvedEdit(
    command: TimelineEditCommand,
    tracks: Track[],
    validation: TimelineEditValidationResult
  ): TimelineResolvedEdit {
    return this.createResolvedEdit(
      command,
      tracks,
      this.createRejectedEditPreview(command, validation)
    );
  }

  private createResolvedEdit(
    command: TimelineEditCommand,
    tracks: Track[],
    preview: TimelineEditPreview,
    options: {
      clipGroups?: TimelineClipGroup[];
      moveResult?: TimelineClipMoveResult;
      createdClipEvents?: TimelineCreatedClipEvent[];
      removedClipEvents?: TimelineRemovedClipEvent[];
    } = {}
  ): TimelineResolvedEdit {
    return {
      tracks,
      preview,
      ...(options.clipGroups !== undefined ? { clipGroups: options.clipGroups } : {}),
      commandFingerprint: createEditCommandFingerprint(command),
      ...(options.moveResult !== undefined ? { moveResult: options.moveResult } : {}),
      createdClipEvents: options.createdClipEvents ?? [],
      removedClipEvents: options.removedClipEvents ?? [],
    };
  }

  private validateEditCommand(command: TimelineEditCommand): TimelineEditValidationResult {
    const builtIn = this.validateBuiltInEditCommand(command);
    if (!builtIn.valid) {
      return builtIn;
    }

    const context = this.createPolicyContext(command);
    const placementContexts = this.createPlacementPolicyContexts(command);
    const policyResults: (TimelineEditValidationResult | undefined)[] = [
      this.editPolicy?.validateCommand?.(context),
    ];

    if (
      command.type === 'move' ||
      command.type === 'insert' ||
      command.type === 'insert-clip-group' ||
      command.type === 'overwrite' ||
      command.type === 'overwrite-clip-group'
    ) {
      for (const placementContext of placementContexts) {
        policyResults.push(
          this.editPolicy?.canPlaceClip?.(
            placementContext as TimelineEditPolicyContext<
              | TimelineMoveEditCommand
              | TimelineInsertEditCommand
              | TimelineInsertClipGroupEditCommand
              | TimelineOverwriteEditCommand
              | TimelineOverwriteClipGroupEditCommand
            >
          )
        );
      }
    }
    if (command.type === 'trim' || command.type === 'ripple-trim' || command.type === 'roll-trim') {
      policyResults.push(
        this.editPolicy?.canTrimClip?.(
          context as TimelineEditPolicyContext<
            TimelineTrimEditCommand | TimelineRippleTrimEditCommand | TimelineRollTrimEditCommand
          >
        )
      );
    }
    if (
      command.type === 'ripple-trim' ||
      (command.type === 'delete-range' && command.ripple !== false)
    ) {
      policyResults.push(
        this.editPolicy?.canRippleTrack?.(
          context as TimelineEditPolicyContext<
            TimelineRippleTrimEditCommand | TimelineDeleteRangeEditCommand
          >
        )
      );
    }
    if (
      command.type === 'insert' ||
      command.type === 'insert-clip-group' ||
      command.type === 'overwrite' ||
      command.type === 'overwrite-clip-group' ||
      command.type === 'delete-range' ||
      command.type === 'lift-range'
    ) {
      for (const placementContext of placementContexts) {
        policyResults.push(
          this.editPolicy?.canEditRange?.(
            placementContext as TimelineEditPolicyContext<
              | TimelineInsertEditCommand
              | TimelineInsertClipGroupEditCommand
              | TimelineOverwriteEditCommand
              | TimelineOverwriteClipGroupEditCommand
              | TimelineDeleteRangeEditCommand
              | TimelineLiftRangeEditCommand
            >
          )
        );
      }
    }

    return policyResults.find((result) => result !== undefined && !result.valid) ?? builtIn;
  }

  private validateBuiltInEditCommand(command: TimelineEditCommand): TimelineEditValidationResult {
    const timing = this.validateEditCommandTiming(command);
    if (!timing.valid) {
      return timing;
    }

    switch (command.type) {
      case 'move':
        return this.validateMoveEditCommand(command);
      case 'trim':
      case 'ripple-trim':
        return this.validateTrimEditCommand(command);
      case 'roll-trim':
        return this.validateRollTrimEditCommand(command);
      case 'slip':
        return this.validateClipEditCommand(command.clipId, 'resizable');
      case 'slide':
        return this.validateClipEditCommand(command.clipId, 'movable');
      case 'split':
        return this.validateSplitEditCommand(command);
      case 'delete-clips':
        return this.validateDeleteClipsEditCommand(command);
      case 'insert':
      case 'overwrite':
        return this.validatePlaceClipCommand(command);
      case 'insert-clip-group':
      case 'overwrite-clip-group':
        return this.validatePlaceClipGroupCommand(command);
      case 'delete-range':
      case 'lift-range':
        return this.validateRangeEditCommand(command);
    }
  }

  private validateEditCommandTiming(command: TimelineEditCommand): TimelineEditValidationResult {
    try {
      switch (command.type) {
        case 'move':
          assertValidRationalTime(command.startTime, 'command.startTime');
          break;
        case 'trim':
        case 'ripple-trim':
          assertValidRationalTime(command.newTime, 'command.newTime');
          break;
        case 'roll-trim':
          assertValidRationalTime(command.boundaryTime, 'command.boundaryTime');
          break;
        case 'slip':
        case 'slide':
          assertValidRationalTime(command.deltaTime, 'command.deltaTime');
          break;
        case 'split':
          assertValidRationalTime(command.time, 'command.time');
          break;
        case 'delete-clips':
          break;
        case 'insert':
        case 'overwrite':
          assertValidRationalTime(command.startTime, 'command.startTime');
          assertValidClipTiming(command.clip, 'command.clip');
          break;
        case 'insert-clip-group':
        case 'overwrite-clip-group':
          for (const [index, placement] of command.placements.entries()) {
            assertValidRationalTime(placement.startTime, `command.placements[${index}].startTime`);
            assertValidClipTiming(placement.clip, `command.placements[${index}].clip`);
          }
          break;
        case 'delete-range':
        case 'lift-range':
          assertValidRationalTime(command.startTime, 'command.startTime');
          assertValidRationalTime(command.endTime, 'command.endTime');
          break;
      }
    } catch (error) {
      return this.rejectEdit(
        'invalid-range',
        error instanceof Error ? error.message : String(error)
      );
    }

    return defaultTimelineEditValidationResult;
  }

  private validateMoveEditCommand(command: TimelineMoveEditCommand): TimelineEditValidationResult {
    const found = this.getClip(command.clipId);
    if (!found) {
      return this.rejectEdit('not-found');
    }
    if (found.track.locked || found.clip.movable === false) {
      return this.rejectEdit('locked');
    }

    const targetTrackId = command.targetTrackId ?? found.track.id;
    const targetTrack = this.state.tracks.find((track) => track.id === targetTrackId);
    if (!targetTrack) {
      return this.rejectEdit('invalid-track');
    }
    if (targetTrack.locked) {
      return this.rejectEdit('locked');
    }
    if (targetTrack.kind !== found.track.kind && command.allowCrossKindTrackMove !== true) {
      return this.rejectEdit('incompatible-track-kind');
    }
    const linkedClipIds = this.getLinkedClipIds(command.clipId);
    if (linkedClipIds.length > 1 && targetTrack.id !== found.track.id) {
      return this.rejectEdit('unsupported');
    }
    for (const linkedClipId of linkedClipIds) {
      const linked = this.getClip(linkedClipId);
      if (!linked) {
        return this.rejectEdit('not-found');
      }
      if (linked.track.locked || linked.clip.movable === false) {
        return this.rejectEdit('locked');
      }
    }
    return defaultTimelineEditValidationResult;
  }

  private validateTrimEditCommand(
    command: TimelineTrimEditCommand | TimelineRippleTrimEditCommand
  ): TimelineEditValidationResult {
    const clipValidation = this.validateClipEditCommand(command.clipId, 'resizable');
    if (!clipValidation.valid) {
      return clipValidation;
    }

    const found = this.getClip(command.clipId);
    if (!found) {
      return this.rejectEdit('not-found');
    }
    const minDuration = fromSeconds(minimumTimelineEditDurationSeconds, command.newTime.r);
    const duration =
      command.edge === 'start'
        ? subRational(found.clip.timelineEnd, command.newTime)
        : subRational(command.newTime, found.clip.timelineStart);
    if (compareRational(duration, minDuration) < 0) {
      return this.rejectEdit('invalid-duration');
    }
    return defaultTimelineEditValidationResult;
  }

  private validateRollTrimEditCommand(
    command: TimelineRollTrimEditCommand
  ): TimelineEditValidationResult {
    const left = this.getClip(command.leftClipId);
    const right = this.getClip(command.rightClipId);
    if (!left || !right) {
      return this.rejectEdit('not-found');
    }
    if (left.track.id !== right.track.id) {
      return this.rejectEdit('invalid-range');
    }
    if (left.track.locked || left.clip.resizable === false || right.clip.resizable === false) {
      return this.rejectEdit('locked');
    }
    const snap = command.snap === false ? null : this.resolveSnap(command.boundaryTime, false);
    return this.validateResolvedRollTrimBoundary(
      command,
      snap?.snappedTime ?? command.boundaryTime
    );
  }

  private validateResolvedRollTrimBoundary(
    command: TimelineRollTrimEditCommand,
    boundaryTime: RationalTime
  ): TimelineEditValidationResult {
    const left = this.getClip(command.leftClipId);
    const right = this.getClip(command.rightClipId);
    if (!left || !right) {
      return this.rejectEdit('not-found');
    }
    const minDuration = fromSeconds(minimumTimelineEditDurationSeconds, boundaryTime.r);
    if (
      compareRational(boundaryTime, addRational(left.clip.timelineStart, minDuration)) < 0 ||
      compareRational(boundaryTime, subRational(right.clip.timelineEnd, minDuration)) > 0
    ) {
      return this.rejectEdit('invalid-duration');
    }
    return defaultTimelineEditValidationResult;
  }

  private validateClipEditCommand(
    clipId: string,
    capability: 'movable' | 'resizable'
  ): TimelineEditValidationResult {
    const found = this.getClip(clipId);
    if (!found) {
      return this.rejectEdit('not-found');
    }
    if (found.track.locked) {
      return this.rejectEdit('locked');
    }
    if (capability === 'movable' && found.clip.movable === false) {
      return this.rejectEdit('locked');
    }
    if (capability === 'resizable' && found.clip.resizable === false) {
      return this.rejectEdit('locked');
    }
    return defaultTimelineEditValidationResult;
  }

  private validateSplitEditCommand(
    command: TimelineSplitEditCommand
  ): TimelineEditValidationResult {
    if (command.clipIds.length === 0) {
      return this.rejectEdit('not-found');
    }
    const requestedClipIds = this.getLinkedCommandClipIds(command.clipIds);
    let hasOverlappingClip = false;
    for (const clipId of requestedClipIds) {
      const found = this.getClip(clipId);
      if (!found) {
        return this.rejectEdit('not-found');
      }
      const overlaps =
        compareRational(command.time, found.clip.timelineStart) > 0 &&
        compareRational(command.time, found.clip.timelineEnd) < 0;
      if (!overlaps) {
        continue;
      }
      if (found.track.locked || found.clip.resizable === false) {
        return this.rejectEdit('locked');
      }
      hasOverlappingClip ||= overlaps;
    }
    return hasOverlappingClip
      ? defaultTimelineEditValidationResult
      : this.rejectEdit('invalid-range');
  }

  private validateDeleteClipsEditCommand(
    command: TimelineDeleteClipsEditCommand
  ): TimelineEditValidationResult {
    if (command.clipIds.length === 0) {
      return this.rejectEdit('not-found');
    }
    const requestedClipIds = this.getLinkedCommandClipIds(command.clipIds);
    for (const clipId of requestedClipIds) {
      const found = this.getClip(clipId);
      if (!found) {
        return this.rejectEdit('not-found');
      }
      if (found.track.locked) {
        return this.rejectEdit('locked');
      }
    }
    return defaultTimelineEditValidationResult;
  }

  private validatePlaceClipCommand(
    command: TimelineInsertEditCommand | TimelineOverwriteEditCommand
  ): TimelineEditValidationResult {
    if (this.getClip(command.clip.id)) {
      return this.rejectEdit('duplicate-id');
    }
    const targetTrack = this.state.tracks.find((track) => track.id === command.targetTrackId);
    if (!targetTrack) {
      return this.rejectEdit('invalid-track');
    }
    if (targetTrack.locked) {
      return this.rejectEdit('locked');
    }
    const duration = subRational(command.clip.timelineEnd, command.clip.timelineStart);
    if (
      compareRational(duration, fromSeconds(minimumTimelineEditDurationSeconds, duration.r)) < 0
    ) {
      return this.rejectEdit('invalid-duration');
    }
    return defaultTimelineEditValidationResult;
  }

  private validatePlaceClipGroupCommand(
    command: TimelineInsertClipGroupEditCommand | TimelineOverwriteClipGroupEditCommand
  ): TimelineEditValidationResult {
    if (command.placements.length < 2) {
      return this.rejectEdit('invalid-range');
    }
    if (command.groupId !== undefined && this.getClipGroup(command.groupId) !== undefined) {
      return this.rejectEdit('duplicate-id');
    }

    const clipIds = new Set<string>();
    const placedByTrack = new Map<string, Clip[]>();
    const snap = this.resolveClipGroupPlacementSnap(command);
    for (const placement of command.placements) {
      if (clipIds.has(placement.clip.id) || this.getClip(placement.clip.id)) {
        return this.rejectEdit('duplicate-id');
      }
      clipIds.add(placement.clip.id);

      const targetTrack = this.state.tracks.find((track) => track.id === placement.targetTrackId);
      if (!targetTrack) {
        return this.rejectEdit('invalid-track');
      }
      if (targetTrack.locked) {
        return this.rejectEdit('locked');
      }

      const duration = subRational(placement.clip.timelineEnd, placement.clip.timelineStart);
      if (
        compareRational(duration, fromSeconds(minimumTimelineEditDurationSeconds, duration.r)) < 0
      ) {
        return this.rejectEdit('invalid-duration');
      }

      const placedClip = this.createPlacedClipFromGroupPlacement(placement, snap.deltaTime);
      const placedClips = placedByTrack.get(placement.targetTrackId) ?? [];
      if (
        placedClips.some(
          (clip) =>
            compareRational(placedClip.timelineStart, clip.timelineEnd) < 0 &&
            compareRational(placedClip.timelineEnd, clip.timelineStart) > 0
        )
      ) {
        return this.rejectEdit('invalid-range');
      }
      placedClips.push(placedClip);
      placedByTrack.set(placement.targetTrackId, placedClips);
    }

    return defaultTimelineEditValidationResult;
  }

  private validateRangeEditCommand(
    command: TimelineDeleteRangeEditCommand | TimelineLiftRangeEditCommand
  ): TimelineEditValidationResult {
    if (compareRational(command.endTime, command.startTime) <= 0) {
      return this.rejectEdit('invalid-range');
    }
    const trackIds = command.trackIds ?? this.state.tracks.map((track) => track.id);
    for (const trackId of trackIds) {
      const track = this.state.tracks.find((candidate) => candidate.id === trackId);
      if (!track) {
        return this.rejectEdit('invalid-track');
      }
      if (track.locked) {
        return this.rejectEdit('locked');
      }
    }
    return defaultTimelineEditValidationResult;
  }

  private rejectEdit(
    reason: TimelineEditRejectionReason,
    message?: string
  ): TimelineEditValidationResult {
    return message === undefined ? { valid: false, reason } : { valid: false, reason, message };
  }

  private createPolicyContext(command: TimelineEditCommand): TimelineEditPolicyContext {
    const sourceClipId = this.getEditCommandSourceClipId(command);
    const found = sourceClipId !== undefined ? this.getClip(sourceClipId) : undefined;
    const targetTrackId =
      command.type === 'move'
        ? (command.targetTrackId ?? found?.track.id)
        : command.type === 'insert' || command.type === 'overwrite'
          ? command.targetTrackId
          : undefined;
    const targetTrack =
      targetTrackId !== undefined
        ? this.state.tracks.find((track) => track.id === targetTrackId)
        : undefined;

    return {
      command,
      state: this.state,
      clip: found?.clip,
      track: found?.track,
      targetTrack,
      range: this.getCommandPolicyRange(command, targetTrackId),
    };
  }

  private createPlacementPolicyContexts(command: TimelineEditCommand): TimelineEditPolicyContext[] {
    if (command.type === 'insert-clip-group' || command.type === 'overwrite-clip-group') {
      const snap = this.resolveClipGroupPlacementSnap(command);
      return command.placements.map((placement) => {
        const targetTrack = this.state.tracks.find((track) => track.id === placement.targetTrackId);
        return {
          command,
          state: this.state,
          clip: placement.clip,
          targetTrack,
          range: this.getGroupPlacementPolicyRange(placement, snap.deltaTime),
        };
      });
    }

    return [this.createPolicyContext(command)];
  }

  private getCommandPolicyRange(
    command: TimelineEditCommand,
    trackId: string | undefined
  ): TimelineEditAffectedRange | undefined {
    if (command.type === 'delete-range' || command.type === 'lift-range') {
      return { startTime: command.startTime, endTime: command.endTime };
    }
    if (command.type === 'insert' || command.type === 'overwrite') {
      const duration = subRational(command.clip.timelineEnd, command.clip.timelineStart);
      return {
        trackId,
        startTime: command.startTime,
        endTime: addRational(command.startTime, duration),
      };
    }
    return undefined;
  }

  private getGroupPlacementPolicyRange(
    placement: TimelineClipGroupPlacement,
    snapDeltaTime: RationalTime | null
  ): TimelineEditAffectedRange {
    const placedClip = this.createPlacedClipFromGroupPlacement(placement, snapDeltaTime);
    return {
      trackId: placement.targetTrackId,
      startTime: placedClip.timelineStart,
      endTime: placedClip.timelineEnd,
    };
  }

  private resolveMoveEdit(command: TimelineMoveEditCommand): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const found = this.getClipInTracks(tracks, command.clipId);
    if (!found) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('not-found'));
    }

    const targetTrackId = command.targetTrackId ?? found.track.id;
    const targetTrack = tracks.find((track) => track.id === targetTrackId);
    if (!targetTrack) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('invalid-track'));
    }

    const previousStartTime = cloneRationalTime(found.clip.timelineStart);
    const previousEndTime = cloneRationalTime(found.clip.timelineEnd);
    const duration = subRational(found.clip.timelineEnd, found.clip.timelineStart);
    const snap =
      command.snap === false ? null : this.resolveClipBoundarySnap(command.startTime, duration);
    let startTime = snap?.startTime ?? command.startTime;
    if (found.clip.minStart !== undefined) {
      startTime = maxRational(startTime, found.clip.minStart);
    }
    let endTime = addRational(startTime, duration);
    if (found.clip.maxEnd !== undefined && compareRational(endTime, found.clip.maxEnd) > 0) {
      endTime = found.clip.maxEnd;
      startTime = subRational(endTime, duration);
    }

    const linkedClipIds = this.getLinkedClipIds(command.clipId);
    if (linkedClipIds.length > 1 && targetTrack.id !== found.track.id) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('unsupported'));
    }

    const deltaTime = subRational(startTime, previousStartTime);
    const changedClips: Clip[] = [];
    for (const linkedClipId of linkedClipIds) {
      const linked = this.getClipInTracks(tracks, linkedClipId);
      if (!linked) {
        return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('not-found'));
      }
      const nextStart = addRational(linked.clip.timelineStart, deltaTime);
      const nextEnd = addRational(linked.clip.timelineEnd, deltaTime);
      if (
        (linked.clip.minStart !== undefined &&
          compareRational(nextStart, linked.clip.minStart) < 0) ||
        (linked.clip.maxEnd !== undefined && compareRational(nextEnd, linked.clip.maxEnd) > 0)
      ) {
        return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('source-bounds'));
      }

      const movedClip = createClipSnapshot(linked.clip, {
        timelineStart: nextStart,
        timelineEnd: nextEnd,
      });
      shiftClipKeyframes(movedClip, deltaTime);
      if (linkedClipId === command.clipId && targetTrack.id !== linked.track.id) {
        linked.track.clips.splice(linked.clipIndex, 1);
        targetTrack.clips.push(movedClip);
      } else {
        linked.track.clips.splice(linked.clipIndex, 1, movedClip);
      }
      changedClips.push(createClipSnapshot(movedClip));
    }

    for (const track of tracks) {
      this.sortTrackClips(track);
    }
    const moved = this.getClipInTracks(tracks, command.clipId);
    if (!moved) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('not-found'));
    }

    const preview = this.createResolvedEditPreview(command, {
      snap: snap?.result ?? null,
      changedClips,
      createdClips: [],
      removedClips: [],
      affectedRanges: [
        {
          trackId: found.track.id,
          startTime: previousStartTime,
          endTime: previousEndTime,
        },
        { trackId: targetTrack.id, startTime, endTime },
      ],
      impacts: [],
    });
    const moveResult: TimelineClipMoveResult = {
      clipId: command.clipId,
      clip: moved.clip,
      sourceTrackId: found.track.id,
      destinationTrackId: moved.track.id,
      sourceTrackIndex: found.trackIndex,
      destinationTrackIndex: moved.trackIndex,
      sourceClipIndex: found.clipIndex,
      destinationClipIndex: moved.clipIndex,
      previousStartTime,
      previousEndTime,
      startTime: cloneRationalTime(moved.clip.timelineStart),
      endTime: cloneRationalTime(moved.clip.timelineEnd),
      changedClips,
    };

    return this.createResolvedEdit(command, tracks, preview, { moveResult });
  }

  private resolveTrimEdit(
    command: TimelineTrimEditCommand | TimelineRippleTrimEditCommand,
    ripple: boolean
  ): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const found = this.getClipInTracks(tracks, command.clipId);
    if (!found) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('not-found'));
    }

    const originalClip = createClipSnapshot(found.clip);
    const snap = command.snap === false ? null : this.resolveSnap(command.newTime, false);
    const targetTime = snap?.snappedTime ?? command.newTime;
    const minDuration = fromSeconds(minimumTimelineEditDurationSeconds, targetTime.r);
    const oldStart = found.clip.timelineStart;
    const oldEnd = found.clip.timelineEnd;

    if (command.edge === 'start') {
      const maxStart = subRational(found.clip.timelineEnd, minDuration);
      let startTime = minRational(maxRational(targetTime, fromSeconds(0, targetTime.r)), maxStart);
      if (found.clip.minStart !== undefined) {
        startTime = maxRational(startTime, found.clip.minStart);
      }
      found.clip.timelineStart = startTime;
      found.clip.sourceStart = addRational(
        found.clip.sourceStart,
        subRational(startTime, oldStart)
      );
    } else {
      let endTime = maxRational(targetTime, addRational(found.clip.timelineStart, minDuration));
      if (found.clip.maxEnd !== undefined) {
        endTime = minRational(endTime, found.clip.maxEnd);
      }
      found.clip.timelineEnd = endTime;
    }

    const delta =
      command.edge === 'start'
        ? subRational(found.clip.timelineStart, oldStart)
        : subRational(found.clip.timelineEnd, oldEnd);
    const changedClips = [createClipSnapshot(found.clip)];
    if (ripple && toSeconds(delta) !== 0) {
      for (const clip of found.track.clips) {
        if (clip.id === found.clip.id || compareRational(clip.timelineStart, oldEnd) < 0) {
          continue;
        }
        clip.timelineStart = addRational(clip.timelineStart, delta);
        clip.timelineEnd = addRational(clip.timelineEnd, delta);
        shiftClipKeyframes(clip, delta);
        changedClips.push(createClipSnapshot(clip));
      }
      this.sortTrackClips(found.track);
    }

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap,
        changedClips,
        createdClips: [],
        removedClips: [],
        affectedRanges: [{ trackId: found.track.id, startTime: oldStart, endTime: oldEnd }],
        impacts: [
          {
            clipId: found.clip.id,
            trackId: found.track.id,
            originalClip,
            resultClips: [createClipSnapshot(found.clip)],
            effect: command.edge === 'start' ? 'trim-start' : 'trim-end',
            affectedStartTime: minRational(oldStart, found.clip.timelineStart),
            affectedEndTime: maxRational(oldEnd, found.clip.timelineEnd),
            cutStart: command.edge === 'start',
            cutEnd: command.edge === 'end',
          },
        ],
      })
    );
  }

  private resolveRollTrimEdit(command: TimelineRollTrimEditCommand): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const left = this.getClipInTracks(tracks, command.leftClipId);
    const right = this.getClipInTracks(tracks, command.rightClipId);
    if (!left || !right || left.track.id !== right.track.id) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('invalid-range'));
    }

    const snap = command.snap === false ? null : this.resolveSnap(command.boundaryTime, false);
    const boundaryTime = snap?.snappedTime ?? command.boundaryTime;
    const boundaryValidation = this.validateResolvedRollTrimBoundary(command, boundaryTime);
    if (!boundaryValidation.valid) {
      return this.createRejectedResolvedEdit(command, tracks, boundaryValidation);
    }
    const originalLeft = createClipSnapshot(left.clip);
    const originalRight = createClipSnapshot(right.clip);
    left.clip.timelineEnd = boundaryTime;
    right.clip.sourceStart = addRational(
      right.clip.sourceStart,
      subRational(boundaryTime, right.clip.timelineStart)
    );
    right.clip.timelineStart = boundaryTime;
    this.sortTrackClips(left.track);

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap,
        changedClips: [createClipSnapshot(left.clip), createClipSnapshot(right.clip)],
        createdClips: [],
        removedClips: [],
        affectedRanges: [
          {
            trackId: left.track.id,
            startTime: originalLeft.timelineStart,
            endTime: originalRight.timelineEnd,
          },
        ],
        impacts: [
          {
            clipId: left.clip.id,
            trackId: left.track.id,
            originalClip: originalLeft,
            resultClips: [createClipSnapshot(left.clip)],
            effect: 'trim-end',
            affectedStartTime: minRational(originalLeft.timelineEnd, boundaryTime),
            affectedEndTime: maxRational(originalLeft.timelineEnd, boundaryTime),
            cutEnd: true,
          },
          {
            clipId: right.clip.id,
            trackId: right.track.id,
            originalClip: originalRight,
            resultClips: [createClipSnapshot(right.clip)],
            effect: 'trim-start',
            affectedStartTime: minRational(originalRight.timelineStart, boundaryTime),
            affectedEndTime: maxRational(originalRight.timelineStart, boundaryTime),
            cutStart: true,
          },
        ],
      })
    );
  }

  private resolveSlipEdit(command: TimelineSlipEditCommand): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const found = this.getClipInTracks(tracks, command.clipId);
    if (!found) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('not-found'));
    }

    const originalClip = createClipSnapshot(found.clip);
    found.clip.sourceStart = maxRational(
      addRational(found.clip.sourceStart, command.deltaTime),
      fromSeconds(0, command.deltaTime.r)
    );

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap: null,
        changedClips: [createClipSnapshot(found.clip)],
        createdClips: [],
        removedClips: [],
        affectedRanges: [
          {
            trackId: found.track.id,
            startTime: found.clip.timelineStart,
            endTime: found.clip.timelineEnd,
          },
        ],
        impacts: [
          {
            clipId: found.clip.id,
            trackId: found.track.id,
            originalClip,
            resultClips: [createClipSnapshot(found.clip)],
            effect: 'trim-start',
            affectedStartTime: found.clip.timelineStart,
            affectedEndTime: found.clip.timelineEnd,
          },
        ],
      })
    );
  }

  private resolveSlideEdit(command: TimelineSlideEditCommand): TimelineResolvedEdit {
    const found = this.getClip(command.clipId);
    if (!found) {
      return this.createRejectedResolvedEdit(
        command,
        createTrackSnapshots(this.state.tracks),
        this.rejectEdit('not-found')
      );
    }
    const resolved = this.resolveMoveEdit({
      type: 'move',
      clipId: command.clipId,
      startTime: addRational(found.clip.timelineStart, command.deltaTime),
      snap: command.snap,
    });
    return this.createResolvedEdit(
      command,
      resolved.tracks,
      {
        ...resolved.preview,
        command,
      },
      {
        moveResult: resolved.moveResult,
        createdClipEvents: resolved.createdClipEvents,
        removedClipEvents: resolved.removedClipEvents,
      }
    );
  }

  private resolveSplitEdit(command: TimelineSplitEditCommand): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const requestedClipIds = new Set(this.getLinkedCommandClipIds(command.clipIds));

    const changedClips: Clip[] = [];
    const createdClips: Clip[] = [];
    const createdClipEvents: TimelineCreatedClipEvent[] = [];
    const impacts: TimelineEditImpact[] = [];
    const splitRightClipIds = new Map<string, string>();

    for (const track of tracks) {
      const nextClips: Clip[] = [];
      for (const clip of track.clips) {
        const shouldSplit =
          requestedClipIds.has(clip.id) &&
          compareRational(command.time, clip.timelineStart) > 0 &&
          compareRational(command.time, clip.timelineEnd) < 0;
        if (!shouldSplit) {
          nextClips.push(clip);
          continue;
        }

        const originalClip = createClipSnapshot(clip);
        const leftClip = createClipSnapshot(clip, { timelineEnd: command.time });
        const rightClip = createClipSnapshot(clip, {
          id: crypto.randomUUID(),
          timelineStart: command.time,
          sourceStart: addRational(clip.sourceStart, subRational(command.time, clip.timelineStart)),
          selected: false,
        });
        filterClipKeyframesToClipRange(leftClip);
        filterClipKeyframesToClipRange(rightClip);
        nextClips.push(leftClip, rightClip);
        splitRightClipIds.set(clip.id, rightClip.id);
        changedClips.push(createClipSnapshot(leftClip), createClipSnapshot(rightClip));
        createdClips.push(createClipSnapshot(rightClip));
        createdClipEvents.push({
          clip: createClipSnapshot(rightClip),
          reason: 'split',
          originClipId: clip.id,
        });
        impacts.push({
          clipId: clip.id,
          trackId: track.id,
          originalClip,
          resultClips: [createClipSnapshot(leftClip), createClipSnapshot(rightClip)],
          effect: 'split',
          affectedStartTime: command.time,
          affectedEndTime: command.time,
          cutStart: true,
          cutEnd: true,
        });
      }
      track.clips = nextClips;
      this.sortTrackClips(track);
    }

    if (splitRightClipIds.size === 0) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('invalid-range'));
    }

    const nextClipGroups = this.repartitionClipGroupsAfterSplit(
      tracks,
      command.time,
      splitRightClipIds
    );

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap: null,
        changedClips,
        createdClips,
        removedClips: [],
        affectedRanges: [{ startTime: command.time, endTime: command.time }],
        impacts,
      }),
      { clipGroups: nextClipGroups, createdClipEvents }
    );
  }

  private resolveDeleteClipsEdit(command: TimelineDeleteClipsEditCommand): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const requestedClipIds = new Set(this.getLinkedCommandClipIds(command.clipIds));
    const removedClips: Clip[] = [];
    const removedClipEvents: TimelineRemovedClipEvent[] = [];
    const affectedRanges: TimelineEditAffectedRange[] = [];
    const impacts: TimelineEditImpact[] = [];

    for (const track of tracks) {
      const nextClips: Clip[] = [];
      for (const clip of track.clips) {
        if (!requestedClipIds.has(clip.id)) {
          nextClips.push(clip);
          continue;
        }

        const originalClip = createClipSnapshot(clip);
        removedClips.push(originalClip);
        removedClipEvents.push({ clip: originalClip, reason: 'delete' });
        affectedRanges.push({
          trackId: track.id,
          startTime: clip.timelineStart,
          endTime: clip.timelineEnd,
        });
        impacts.push({
          clipId: clip.id,
          trackId: track.id,
          originalClip,
          resultClips: [],
          effect: 'remove',
          affectedStartTime: clip.timelineStart,
          affectedEndTime: clip.timelineEnd,
          cutStart: true,
          cutEnd: true,
        });
      }
      track.clips = nextClips;
    }

    if (removedClips.length === 0) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('not-found'));
    }

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap: null,
        changedClips: [],
        createdClips: [],
        removedClips,
        affectedRanges,
        impacts,
      }),
      {
        clipGroups: this.normalizeClipGroupsForTracks(this.state.clipGroups, tracks),
        removedClipEvents,
      }
    );
  }

  private resolveInsertEdit(command: TimelineInsertEditCommand): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const targetTrack = tracks.find((track) => track.id === command.targetTrackId);
    if (!targetTrack) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('invalid-track'));
    }

    const placedClip = this.createPlacedClip(command);
    const duration = subRational(placedClip.timelineEnd, placedClip.timelineStart);
    for (const clip of targetTrack.clips) {
      if (compareRational(clip.timelineStart, placedClip.timelineStart) >= 0) {
        clip.timelineStart = addRational(clip.timelineStart, duration);
        clip.timelineEnd = addRational(clip.timelineEnd, duration);
        shiftClipKeyframes(clip, duration);
      }
    }
    targetTrack.clips.push(placedClip);
    this.sortTrackClips(targetTrack);

    const placedClipEvent = {
      clip: createClipSnapshot(placedClip),
      reason: 'insert',
    } satisfies TimelineCreatedClipEvent;

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap: command.snap === false ? null : this.resolveSnap(command.startTime, false),
        changedClips: targetTrack.clips
          .filter(
            (clip) =>
              clip.id !== placedClip.id &&
              compareRational(clip.timelineStart, placedClip.timelineEnd) >= 0
          )
          .map((clip) => createClipSnapshot(clip)),
        createdClips: [createClipSnapshot(placedClip)],
        removedClips: [],
        affectedRanges: [
          {
            trackId: targetTrack.id,
            startTime: placedClip.timelineStart,
            endTime: placedClip.timelineEnd,
          },
        ],
        impacts: [],
      }),
      { createdClipEvents: [placedClipEvent] }
    );
  }

  private resolveOverwriteEdit(command: TimelineOverwriteEditCommand): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const targetTrack = tracks.find((track) => track.id === command.targetTrackId);
    if (!targetTrack) {
      return this.createRejectedResolvedEdit(command, tracks, this.rejectEdit('invalid-track'));
    }

    const placedClip = this.createPlacedClip(command);
    targetTrack.clips.push(placedClip);
    const overwriteResult = this.resolveTrackOverwrite(targetTrack, placedClip);

    const placedClipEvent = {
      clip: createClipSnapshot(placedClip),
      reason: 'overwrite',
    } satisfies TimelineCreatedClipEvent;

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap: command.snap === false ? null : this.resolveSnap(command.startTime, false),
        changedClips: overwriteResult.changedClips,
        createdClips: [createClipSnapshot(placedClip), ...overwriteResult.createdClips],
        removedClips: overwriteResult.removedClips,
        affectedRanges: [
          {
            trackId: targetTrack.id,
            startTime: placedClip.timelineStart,
            endTime: placedClip.timelineEnd,
          },
        ],
        impacts: overwriteResult.impacts,
      }),
      {
        createdClipEvents: [placedClipEvent, ...overwriteResult.createdClipEvents],
        removedClipEvents: overwriteResult.removedClips.map((clip) => ({
          clip,
          reason: 'overwrite',
        })),
      }
    );
  }

  private resolveInsertClipGroupEdit(
    command: TimelineInsertClipGroupEditCommand
  ): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const resolvedPlacements = this.resolveClipGroupPlacements(command, tracks);
    if ('validation' in resolvedPlacements) {
      return this.createRejectedResolvedEdit(command, tracks, resolvedPlacements.validation);
    }

    const changedClips: Clip[] = [];
    const createdClips = resolvedPlacements.placements.map((placement) =>
      createClipSnapshot(placement.clip)
    );
    const affectedRanges = resolvedPlacements.placements.map((placement) => ({
      trackId: placement.track.id,
      startTime: placement.clip.timelineStart,
      endTime: placement.clip.timelineEnd,
    }));
    const placementsByTrack = new Map<
      string,
      { clip: Clip; duration: RationalTime; track: Track }[]
    >();

    for (const placement of resolvedPlacements.placements) {
      const duration = subRational(placement.clip.timelineEnd, placement.clip.timelineStart);
      const trackPlacements = placementsByTrack.get(placement.track.id) ?? [];
      trackPlacements.push({ clip: placement.clip, duration, track: placement.track });
      placementsByTrack.set(placement.track.id, trackPlacements);
    }

    for (const [, trackPlacements] of placementsByTrack) {
      const track = trackPlacements[0]?.track;
      if (track === undefined) {
        continue;
      }
      for (const clip of track.clips) {
        const originalStart = cloneRationalTime(clip.timelineStart);
        let delta = fromSeconds(0, originalStart.r);
        for (const placement of trackPlacements) {
          if (compareRational(originalStart, placement.clip.timelineStart) >= 0) {
            delta = addRational(delta, placement.duration);
          }
        }
        if (toSeconds(delta) === 0) {
          continue;
        }
        clip.timelineStart = addRational(clip.timelineStart, delta);
        clip.timelineEnd = addRational(clip.timelineEnd, delta);
        shiftClipKeyframes(clip, delta);
        changedClips.push(createClipSnapshot(clip));
      }
    }

    for (const placement of resolvedPlacements.placements) {
      placement.track.clips.push(placement.clip);
      this.sortTrackClips(placement.track);
    }

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap: resolvedPlacements.firstSnap,
        changedClips,
        createdClips,
        removedClips: [],
        affectedRanges,
        impacts: [],
      }),
      {
        clipGroups: this.createClipGroupsAfterGroupedPlacement(command),
        createdClipEvents: createdClips.map((clip) => ({
          clip,
          reason: 'insert',
        })),
      }
    );
  }

  private resolveOverwriteClipGroupEdit(
    command: TimelineOverwriteClipGroupEditCommand
  ): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const resolvedPlacements = this.resolveClipGroupPlacements(command, tracks);
    if ('validation' in resolvedPlacements) {
      return this.createRejectedResolvedEdit(command, tracks, resolvedPlacements.validation);
    }

    const changedClips: Clip[] = [];
    const placedClips = resolvedPlacements.placements.map((placement) =>
      createClipSnapshot(placement.clip)
    );
    const createdClips: Clip[] = [...placedClips];
    const removedClips: Clip[] = [];
    const impacts: TimelineEditImpact[] = [];
    const createdClipEvents: TimelineCreatedClipEvent[] = placedClips.map((clip) => ({
      clip,
      reason: 'overwrite',
    }));
    const removedClipEvents: TimelineRemovedClipEvent[] = [];
    const affectedRanges = resolvedPlacements.placements.map((placement) => ({
      trackId: placement.track.id,
      startTime: placement.clip.timelineStart,
      endTime: placement.clip.timelineEnd,
    }));

    for (const placement of resolvedPlacements.placements) {
      placement.track.clips.push(placement.clip);
    }

    for (const placement of resolvedPlacements.placements) {
      const overwriteResult = this.resolveTrackOverwrite(placement.track, placement.clip);
      changedClips.push(...overwriteResult.changedClips);
      createdClips.push(...overwriteResult.createdClips);
      removedClips.push(...overwriteResult.removedClips);
      impacts.push(...overwriteResult.impacts);
      createdClipEvents.push(...overwriteResult.createdClipEvents);
      removedClipEvents.push(
        ...overwriteResult.removedClips.map((clip) => ({
          clip,
          reason: 'overwrite' as const,
        }))
      );
    }

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap: resolvedPlacements.firstSnap,
        changedClips,
        createdClips,
        removedClips,
        affectedRanges,
        impacts,
      }),
      {
        clipGroups: this.createClipGroupsAfterGroupedPlacement(command),
        createdClipEvents,
        removedClipEvents,
      }
    );
  }

  private resolveClipGroupPlacements(
    command: TimelineInsertClipGroupEditCommand | TimelineOverwriteClipGroupEditCommand,
    tracks: Track[]
  ): TimelineResolvedClipGroupPlacements | TimelineRejectedClipGroupPlacements {
    const placements: TimelineResolvedClipGroupPlacement[] = [];
    const snap = this.resolveClipGroupPlacementSnap(command);

    for (const placement of command.placements) {
      const track = tracks.find((candidate) => candidate.id === placement.targetTrackId);
      if (track === undefined) {
        return { validation: this.rejectEdit('invalid-track') };
      }
      const resolvedPlacement = this.resolveGroupPlacement(placement, snap.deltaTime);
      placements.push({
        clip: resolvedPlacement.clip,
        track,
      });
    }

    return { placements, firstSnap: snap.result };
  }

  private createClipGroupsAfterGroupedPlacement(
    command: TimelineInsertClipGroupEditCommand | TimelineOverwriteClipGroupEditCommand
  ): TimelineClipGroup[] {
    return createClipGroupSnapshots([
      ...this.state.clipGroups,
      {
        id: command.groupId ?? crypto.randomUUID(),
        clipIds: command.placements.map((placement) => placement.clip.id),
        ...(command.label !== undefined ? { label: command.label } : {}),
      },
    ]);
  }

  private resolveRangeRemovalEdit(
    command: TimelineDeleteRangeEditCommand | TimelineLiftRangeEditCommand,
    ripple: boolean
  ): TimelineResolvedEdit {
    const tracks = createTrackSnapshots(this.state.tracks);
    const selectedTrackIds = new Set(command.trackIds ?? tracks.map((track) => track.id));
    const removedClips: Clip[] = [];
    const changedClips: Clip[] = [];
    const createdClips: Clip[] = [];
    const createdClipEvents: TimelineCreatedClipEvent[] = [];
    const removedClipEvents: TimelineRemovedClipEvent[] = [];
    const impacts: TimelineEditImpact[] = [];
    const duration = subRational(command.endTime, command.startTime);

    for (const track of tracks) {
      if (!selectedTrackIds.has(track.id)) {
        continue;
      }

      const nextClips: Clip[] = [];
      for (const clip of track.clips) {
        const overlaps =
          compareRational(command.startTime, clip.timelineEnd) < 0 &&
          compareRational(command.endTime, clip.timelineStart) > 0;
        if (!overlaps) {
          const shouldRipple = ripple && compareRational(clip.timelineStart, command.endTime) >= 0;
          if (shouldRipple) {
            clip.timelineStart = subRational(clip.timelineStart, duration);
            clip.timelineEnd = subRational(clip.timelineEnd, duration);
            shiftClipKeyframes(clip, subRational(fromSeconds(0, duration.r), duration));
            changedClips.push(createClipSnapshot(clip));
          }
          nextClips.push(clip);
          continue;
        }

        const originalClip = createClipSnapshot(clip);
        const resultClips: Clip[] = [];
        if (
          compareRational(command.startTime, clip.timelineStart) <= 0 &&
          compareRational(command.endTime, clip.timelineEnd) >= 0
        ) {
          removedClips.push(originalClip);
          removedClipEvents.push({
            clip: originalClip,
            reason: command.type === 'lift-range' ? 'lift-range' : 'delete-range',
          });
        } else if (
          compareRational(command.startTime, clip.timelineStart) > 0 &&
          compareRational(command.endTime, clip.timelineEnd) < 0
        ) {
          const leftClip = createClipSnapshot(clip, { timelineEnd: command.startTime });
          const rightClip = createClipSnapshot(clip, {
            id: crypto.randomUUID(),
            timelineStart: ripple ? command.startTime : command.endTime,
            timelineEnd: ripple ? subRational(clip.timelineEnd, duration) : clip.timelineEnd,
            sourceStart: addRational(
              clip.sourceStart,
              subRational(command.endTime, clip.timelineStart)
            ),
            selected: false,
          });
          if (ripple) {
            shiftClipKeyframes(rightClip, subRational(fromSeconds(0, duration.r), duration));
          }
          filterClipKeyframesToClipRange(leftClip);
          filterClipKeyframesToClipRange(rightClip);
          resultClips.push(leftClip, rightClip);
          createdClips.push(createClipSnapshot(rightClip));
          createdClipEvents.push({
            clip: createClipSnapshot(rightClip),
            reason: 'range-split',
            originClipId: clip.id,
          });
          changedClips.push(createClipSnapshot(leftClip), createClipSnapshot(rightClip));
        } else if (compareRational(command.startTime, clip.timelineStart) <= 0) {
          const nextStart = ripple ? command.startTime : command.endTime;
          const changedClip = createClipSnapshot(clip, {
            timelineStart: nextStart,
            timelineEnd: ripple ? subRational(clip.timelineEnd, duration) : clip.timelineEnd,
            sourceStart: addRational(
              clip.sourceStart,
              subRational(command.endTime, clip.timelineStart)
            ),
          });
          if (ripple) {
            shiftClipKeyframes(changedClip, subRational(fromSeconds(0, duration.r), duration));
          }
          filterClipKeyframesToClipRange(changedClip);
          resultClips.push(changedClip);
          changedClips.push(createClipSnapshot(changedClip));
        } else {
          const changedClip = createClipSnapshot(clip, { timelineEnd: command.startTime });
          filterClipKeyframesToClipRange(changedClip);
          resultClips.push(changedClip);
          changedClips.push(createClipSnapshot(changedClip));
        }

        nextClips.push(...resultClips);
        impacts.push({
          clipId: clip.id,
          trackId: track.id,
          originalClip,
          resultClips: resultClips.map((resultClip) => createClipSnapshot(resultClip)),
          effect:
            resultClips.length === 0
              ? 'remove'
              : resultClips.length > 1
                ? 'split'
                : compareRational(command.startTime, clip.timelineStart) <= 0
                  ? 'trim-start'
                  : 'trim-end',
          affectedStartTime: maxRational(command.startTime, clip.timelineStart),
          affectedEndTime: minRational(command.endTime, clip.timelineEnd),
          cutStart: compareRational(command.startTime, clip.timelineStart) <= 0,
          cutEnd: compareRational(command.endTime, clip.timelineEnd) >= 0,
        });
      }
      track.clips = nextClips;
      this.sortTrackClips(track);
    }

    return this.createResolvedEdit(
      command,
      tracks,
      this.createResolvedEditPreview(command, {
        snap: null,
        changedClips,
        createdClips,
        removedClips,
        affectedRanges: [{ startTime: command.startTime, endTime: command.endTime }],
        impacts,
      }),
      { createdClipEvents, removedClipEvents }
    );
  }

  private createValidatedClipGroup(
    options: TimelineCreateClipGroupOptions
  ): TimelineClipGroup | null {
    if (options.clipIds.length < 2) {
      return null;
    }
    const uniqueClipIds = new Set(options.clipIds);
    if (uniqueClipIds.size !== options.clipIds.length) {
      return null;
    }
    if (options.id !== undefined && this.getClipGroup(options.id) !== undefined) {
      return null;
    }

    for (const clipId of options.clipIds) {
      if (this.getClip(clipId) === undefined || this.getClipGroupForClip(clipId) !== undefined) {
        return null;
      }
    }

    return createClipGroupSnapshots([
      {
        id: options.id ?? crypto.randomUUID(),
        clipIds: [...options.clipIds],
        ...(options.label !== undefined ? { label: options.label } : {}),
      },
    ])[0];
  }

  protected normalizeClipGroupsForTracks(
    clipGroups: readonly TimelineClipGroup[],
    tracks: readonly Track[]
  ): TimelineClipGroup[] {
    const existingClipIds = new Set<string>();
    for (const track of tracks) {
      for (const clip of track.clips) {
        existingClipIds.add(clip.id);
      }
    }

    const claimedClipIds = new Set<string>();
    const nextGroups: TimelineClipGroup[] = [];
    for (const group of clipGroups) {
      const clipIds = group.clipIds.filter((clipId) => {
        if (!existingClipIds.has(clipId) || claimedClipIds.has(clipId)) {
          return false;
        }
        claimedClipIds.add(clipId);
        return true;
      });
      if (clipIds.length >= 2) {
        nextGroups.push({
          id: group.id,
          clipIds,
          ...(group.label !== undefined ? { label: group.label } : {}),
        });
      }
    }
    return nextGroups;
  }

  protected normalizeClipGroups() {
    this.state.clipGroups = this.normalizeClipGroupsForTracks(
      this.state.clipGroups,
      this.state.tracks
    );
  }

  protected getLinkedClipIds(clipId: string): string[] {
    return this.getClipGroupForClip(clipId)?.clipIds ?? [clipId];
  }

  protected getLinkedCommandClipIds(clipIds: readonly string[]) {
    const linkedClipIds = new Set<string>();
    for (const clipId of clipIds) {
      for (const linkedClipId of this.getLinkedClipIds(clipId)) {
        linkedClipIds.add(linkedClipId);
      }
    }
    return [...linkedClipIds];
  }

  protected getSelectedClipIds() {
    const clipIds: string[] = [];
    for (const track of this.state.tracks) {
      for (const clip of track.clips) {
        if (clip.selected) {
          clipIds.push(clip.id);
        }
      }
    }
    return clipIds;
  }

  private repartitionClipGroupsAfterSplit(
    tracks: Track[],
    splitTime: RationalTime,
    splitRightClipIds: ReadonlyMap<string, string>
  ): TimelineClipGroup[] {
    const clipById = new Map<string, Clip>();
    for (const track of tracks) {
      for (const clip of track.clips) {
        clipById.set(clip.id, clip);
      }
    }

    const nextGroups: TimelineClipGroup[] = [];
    for (const group of this.state.clipGroups) {
      const groupWasSplit = group.clipIds.some((clipId) => splitRightClipIds.has(clipId));
      if (!groupWasSplit) {
        nextGroups.push({
          id: group.id,
          clipIds: [...group.clipIds],
          ...(group.label !== undefined ? { label: group.label } : {}),
        });
        continue;
      }

      const leftClipIds: string[] = [];
      const rightClipIds: string[] = [];
      for (const clipId of group.clipIds) {
        const rightClipId = splitRightClipIds.get(clipId);
        if (rightClipId !== undefined) {
          leftClipIds.push(clipId);
          rightClipIds.push(rightClipId);
          continue;
        }

        const clip = clipById.get(clipId);
        if (clip === undefined) {
          continue;
        }
        if (compareRational(clip.timelineEnd, splitTime) <= 0) {
          leftClipIds.push(clip.id);
        } else if (compareRational(clip.timelineStart, splitTime) >= 0) {
          rightClipIds.push(clip.id);
        }
      }

      if (leftClipIds.length >= 2) {
        nextGroups.push({
          id: group.id,
          clipIds: leftClipIds,
          ...(group.label !== undefined ? { label: group.label } : {}),
        });
      }
      if (rightClipIds.length >= 2) {
        nextGroups.push({
          id: crypto.randomUUID(),
          clipIds: rightClipIds,
          ...(group.label !== undefined ? { label: group.label } : {}),
        });
      }
    }

    return createClipGroupSnapshots(nextGroups);
  }

  /**
   * Returns a clip group by id.
   *
   * @param groupId - Clip group id to inspect.
   * @returns The matching group, or undefined when missing.
   */
  getClipGroup(groupId: string): TimelineClipGroup | undefined {
    return this.state.clipGroups.find((group) => group.id === groupId);
  }

  /**
   * Returns the group containing a clip.
   *
   * @param clipId - Clip id to inspect.
   * @returns The containing group, or undefined when the clip is ungrouped.
   */
  getClipGroupForClip(clipId: string): TimelineClipGroup | undefined {
    return this.state.clipGroups.find((group) => group.clipIds.includes(clipId));
  }

  /**
   * Returns clips contained by a group in group order.
   *
   * @param groupId - Clip group id to inspect.
   * @returns Group clip entries, or an empty array when the group is missing.
   */
  getClipGroupClips(groupId: string) {
    const group = this.getClipGroup(groupId);
    if (group === undefined) {
      return [];
    }

    return group.clipIds.flatMap((clipId) => {
      const found = this.getClip(clipId);
      return found === undefined ? [] : [found];
    });
  }

  /**
   * Creates a clip group from existing clips.
   *
   * @param options - Existing clip ids and optional group metadata.
   * @returns The created group, or null when validation fails.
   */
  createClipGroup(options: TimelineCreateClipGroupOptions): TimelineClipGroup | null {
    const group = this.createValidatedClipGroup(options);
    if (group === null) {
      return null;
    }

    this.state.clipGroups.push(group);
    this.selectClips(group.clipIds);
    this.snapshot();
    this.emit('state:settled');
    this.emit('render');
    return group;
  }

  /**
   * Removes one clip group.
   *
   * @param groupId - Clip group id to remove.
   * @returns Whether a group was removed.
   */
  ungroupClipGroup(groupId: string) {
    const groupIndex = this.state.clipGroups.findIndex((group) => group.id === groupId);
    if (groupIndex === -1) {
      return false;
    }

    this.state.clipGroups.splice(groupIndex, 1);
    this.snapshot();
    this.emit('state:settled');
    this.emit('render');
    return true;
  }

  /**
   * Removes groups containing any of the supplied clips.
   *
   * @param clipIds - Clip ids whose groups should be removed.
   * @returns Whether any groups were removed.
   */
  ungroupClips(clipIds: readonly string[]) {
    const clipIdSet = new Set(clipIds);
    const previousLength = this.state.clipGroups.length;
    this.state.clipGroups = this.state.clipGroups.filter(
      (group) => !group.clipIds.some((clipId) => clipIdSet.has(clipId))
    );
    if (this.state.clipGroups.length === previousLength) {
      return false;
    }

    this.snapshot();
    this.emit('state:settled');
    this.emit('render');
    return true;
  }

  /**
   * Inserts multiple clips on chosen tracks and groups them in one history entry.
   *
   * This convenience API uses the same grouped insert command pipeline as
   * `commitEdit({ type: 'insert-clip-group', ... })`, including validation,
   * edit policy checks, snapping, ripple behavior, lifecycle events, and undo
   * history.
   *
   * @param options - Placements and optional group metadata.
   * @returns The created group, or null when validation fails.
   */
  insertClipGroup(options: TimelineInsertClipGroupOptions): TimelineClipGroup | null {
    const groupId = options.groupId ?? crypto.randomUUID();
    const result = this.commitEdit({
      type: 'insert-clip-group',
      ...options,
      groupId,
    });
    if (!result.committed) {
      return null;
    }

    const group = this.getClipGroup(groupId);
    if (group === undefined) {
      return null;
    }

    this.selectClips(group.clipIds);
    return group;
  }

  private createPlacedClip(command: TimelinePlaceClipCommand): Clip {
    const duration = subRational(command.clip.timelineEnd, command.clip.timelineStart);
    const snap =
      command.snap === false ? null : this.resolveClipBoundarySnap(command.startTime, duration);
    const startTime = snap?.startTime ?? command.startTime;
    const placedClip = createClipSnapshot(command.clip, {
      timelineStart: startTime,
      timelineEnd: addRational(startTime, duration),
    });
    shiftClipKeyframes(placedClip, subRational(startTime, command.clip.timelineStart));
    return placedClip;
  }

  private createPlacedClipFromGroupPlacement(
    placement: TimelineClipGroupPlacement,
    snapDeltaTime: RationalTime | null
  ): Clip {
    return this.resolveGroupPlacement(placement, snapDeltaTime).clip;
  }

  private resolveClipGroupPlacementSnap(
    command: TimelineInsertClipGroupEditCommand | TimelineOverwriteClipGroupEditCommand
  ): { deltaTime: RationalTime | null; result: TimelineSnapResult | null } {
    const primaryPlacement = command.placements[0];
    if (primaryPlacement === undefined || command.snap === false) {
      return { deltaTime: null, result: null };
    }

    const duration = subRational(
      primaryPlacement.clip.timelineEnd,
      primaryPlacement.clip.timelineStart
    );
    const snap = this.resolveClipBoundarySnap(primaryPlacement.startTime, duration);
    if (snap === null) {
      return { deltaTime: null, result: null };
    }

    return {
      deltaTime: subRational(snap.startTime, primaryPlacement.startTime),
      result: snap.result,
    };
  }

  private resolveGroupPlacement(
    placement: TimelineClipGroupPlacement,
    snapDeltaTime: RationalTime | null
  ): { clip: Clip } {
    const duration = subRational(placement.clip.timelineEnd, placement.clip.timelineStart);
    const startTime =
      snapDeltaTime === null
        ? placement.startTime
        : addRational(placement.startTime, snapDeltaTime);
    const placedClip = createClipSnapshot(placement.clip, {
      timelineStart: startTime,
      timelineEnd: addRational(startTime, duration),
    });
    shiftClipKeyframes(placedClip, subRational(startTime, placement.clip.timelineStart));
    return { clip: placedClip };
  }

  private resolveClipBoundarySnap(startTime: RationalTime, duration: RationalTime) {
    const snapStart = this.resolveSnap(startTime, false);
    const candidateEnd = addRational(startTime, duration);
    const snapEnd = this.resolveSnap(candidateEnd, false);
    if (snapStart !== null && snapEnd !== null) {
      return Math.abs(snapStart.deltaSeconds) <= Math.abs(snapEnd.deltaSeconds)
        ? { startTime: snapStart.snappedTime, result: snapStart }
        : { startTime: subRational(snapEnd.snappedTime, duration), result: snapEnd };
    }
    if (snapStart !== null) {
      return { startTime: snapStart.snappedTime, result: snapStart };
    }
    if (snapEnd !== null) {
      return { startTime: subRational(snapEnd.snappedTime, duration), result: snapEnd };
    }
    return null;
  }

  protected resolveTrackOverwrite(track: Track, winner: Clip) {
    const newClips: Clip[] = [];
    const changedClips: Clip[] = [];
    const createdClips: Clip[] = [];
    const createdClipEvents: TimelineCreatedClipEvent[] = [];
    const removedClips: Clip[] = [];
    const impacts: TimelineEditImpact[] = [];

    for (const clip of track.clips) {
      if (clip.id === winner.id) {
        newClips.push(clip);
        continue;
      }

      const overlap =
        compareRational(winner.timelineStart, clip.timelineEnd) < 0 &&
        compareRational(winner.timelineEnd, clip.timelineStart) > 0;
      if (!overlap) {
        newClips.push(clip);
        continue;
      }

      const originalClip = createClipSnapshot(clip);
      const resultClips: Clip[] = [];
      if (
        compareRational(winner.timelineStart, clip.timelineStart) <= 0 &&
        compareRational(winner.timelineEnd, clip.timelineEnd) >= 0
      ) {
        removedClips.push(originalClip);
      } else if (
        compareRational(winner.timelineStart, clip.timelineStart) > 0 &&
        compareRational(winner.timelineEnd, clip.timelineEnd) < 0
      ) {
        const leftClip = createClipSnapshot(clip, { timelineEnd: winner.timelineStart });
        const rightClip = createClipSnapshot(clip, {
          id: crypto.randomUUID(),
          timelineStart: winner.timelineEnd,
          sourceStart: addRational(
            clip.sourceStart,
            subRational(winner.timelineEnd, clip.timelineStart)
          ),
        });
        filterClipKeyframesToClipRange(leftClip);
        filterClipKeyframesToClipRange(rightClip);
        resultClips.push(leftClip, rightClip);
        createdClips.push(createClipSnapshot(rightClip));
        createdClipEvents.push({
          clip: createClipSnapshot(rightClip),
          reason: 'overwrite-split',
          originClipId: clip.id,
        });
      } else if (compareRational(winner.timelineStart, clip.timelineStart) <= 0) {
        const changedClip = createClipSnapshot(clip, {
          timelineStart: winner.timelineEnd,
          sourceStart: addRational(
            clip.sourceStart,
            subRational(winner.timelineEnd, clip.timelineStart)
          ),
        });
        filterClipKeyframesToClipRange(changedClip);
        resultClips.push(changedClip);
      } else {
        const changedClip = createClipSnapshot(clip, { timelineEnd: winner.timelineStart });
        filterClipKeyframesToClipRange(changedClip);
        resultClips.push(changedClip);
      }

      newClips.push(...resultClips);
      changedClips.push(...resultClips.map((resultClip) => createClipSnapshot(resultClip)));
      impacts.push({
        clipId: clip.id,
        trackId: track.id,
        originalClip,
        resultClips: resultClips.map((resultClip) => createClipSnapshot(resultClip)),
        effect:
          resultClips.length === 0
            ? 'remove'
            : resultClips.length > 1
              ? 'split'
              : compareRational(winner.timelineStart, clip.timelineStart) <= 0
                ? 'trim-start'
                : 'trim-end',
        affectedStartTime: maxRational(winner.timelineStart, clip.timelineStart),
        affectedEndTime: minRational(winner.timelineEnd, clip.timelineEnd),
        cutStart: compareRational(winner.timelineStart, clip.timelineStart) <= 0,
        cutEnd: compareRational(winner.timelineEnd, clip.timelineEnd) >= 0,
      });
    }

    track.clips = newClips;
    this.sortTrackClips(track);
    return { changedClips, createdClips, createdClipEvents, removedClips, impacts };
  }

  private getClipInTracks(
    tracks: Track[],
    clipId: string
  ): { track: Track; clip: Clip; trackIndex: number; clipIndex: number } | undefined {
    for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
      const track = tracks[trackIndex];
      for (let clipIndex = 0; clipIndex < track.clips.length; clipIndex++) {
        const clip = track.clips[clipIndex];
        if (clip.id === clipId) {
          return { track, clip, trackIndex, clipIndex };
        }
      }
    }
    return undefined;
  }

  // --- Playback ---

  /**
   * Starts playhead playback.
   *
   * @param options - Optional playback clock and range behavior.
   */
}
