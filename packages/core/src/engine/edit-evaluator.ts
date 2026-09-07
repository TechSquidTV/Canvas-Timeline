import { findClipInTracks } from '#core/engine/clip-lookup';
import { filterClipKeyframesToClipRange, shiftClipKeyframes } from '#core/engine/clip-keyframes';
import { defaultTimelineEditValidationResult } from '#core/engine/feedback';
import type {
  TimelineCreatedClipEvent,
  TimelineRejectedClipGroupPlacements,
  TimelineRemovedClipEvent,
  TimelineResolvedClipGroupPlacement,
  TimelineResolvedClipGroupPlacements,
  TimelineResolvedEdit,
} from '#core/engine/types';
import {
  assertValidClipTiming,
  cloneRationalTime,
  createClipGroupSnapshots,
  createClipSnapshot,
  createTrackSnapshots,
} from '#core/snapshot';
import type {
  Clip,
  TimelineClipGroup,
  TimelineClipGroupPlacement,
  TimelineClipMoveResult,
  TimelineDeleteClipsEditCommand,
  TimelineDeleteRangeEditCommand,
  TimelineEditAffectedRange,
  TimelineEditCommand,
  TimelineEditImpact,
  TimelineEditPolicy,
  TimelineEditPolicyContext,
  TimelineEditPreview,
  TimelineEditRejectionReason,
  TimelineEditValidationResult,
  TimelineInsertClipGroupEditCommand,
  TimelineInsertEditCommand,
  TimelineLiftRangeEditCommand,
  TimelineMoveEditCommand,
  TimelineOverwriteClipGroupEditCommand,
  TimelineOverwriteEditCommand,
  TimelinePlaceClipCommand,
  TimelineRippleTrimEditCommand,
  TimelineRollTrimEditCommand,
  TimelineSlideEditCommand,
  TimelineSlipEditCommand,
  TimelineSnapResult,
  TimelineSplitEditCommand,
  TimelineState,
  TimelineTrimEditCommand,
  Track,
} from '#core/types';
import {
  addRational,
  assertValidRationalTime,
  compareRational,
  fromSeconds,
  maxRational,
  minRational,
  subRational,
  toSeconds,
} from '@techsquidtv/canvas-timeline-utils';
import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
const minimumTimelineEditDurationSeconds = 0.01;

export interface EditContext {
  allocateId: (key: string) => string;
  state: TimelineState;
  editPolicy: TimelineEditPolicy | undefined;
  resolveSnap: (time: RationalTime, publishFeedback?: boolean) => TimelineSnapResult | null;
}

export function resolveInteractiveEdit(
  context: EditContext,
  command: TimelineEditCommand
): TimelineResolvedEdit {
  const resolved = resolveTimelineEdit(context, command);
  if (
    !resolved.preview.valid ||
    (command.type !== 'move' && command.type !== 'trim') ||
    !command.overwrite
  ) {
    return resolved;
  }
  const winners =
    command.type === 'move' ? getLinkedClipIds(context, command.clipId) : [command.clipId];
  for (const id of winners) {
    const found = findClipInTracks(resolved.tracks, id);
    if (!found) {
      continue;
    }
    const result = resolveTrackOverwrite(context, found.track, found.clip);
    resolved.preview.changedClips.push(...result.changedClips);
    resolved.preview.createdClips.push(...result.createdClips);
    resolved.preview.removedClips.push(...result.removedClips);
    resolved.preview.impacts.push(...result.impacts);
    resolved.createdClipEvents.push(...result.createdClipEvents);
    resolved.removedClipEvents.push(
      ...result.removedClips.map((clip) => ({ clip, reason: 'overwrite' as const }))
    );
  }
  return resolved;
}

function resolveTimelineEdit(
  context: EditContext,
  command: TimelineEditCommand
): TimelineResolvedEdit {
  const validation = validateEditCommand(context, command);
  if (!validation.valid) {
    return createRejectedResolvedEdit(
      context,
      command,
      createTrackSnapshots(context.state.tracks),
      validation
    );
  }

  switch (command.type) {
    case 'move':
      return resolveMoveEdit(context, command);
    case 'trim':
      return resolveTrimEdit(context, command, false);
    case 'ripple-trim':
      return resolveTrimEdit(context, command, true);
    case 'roll-trim':
      return resolveRollTrimEdit(context, command);
    case 'slip':
      return resolveSlipEdit(context, command);
    case 'slide':
      return resolveSlideEdit(context, command);
    case 'split':
      return resolveSplitEdit(context, command);
    case 'delete-clips':
      return resolveDeleteClipsEdit(context, command);
    case 'insert':
      return resolveInsertEdit(context, command);
    case 'insert-clip-group':
      return resolveInsertClipGroupEdit(context, command);
    case 'overwrite':
      return resolveOverwriteEdit(context, command);
    case 'overwrite-clip-group':
      return resolveOverwriteClipGroupEdit(context, command);
    case 'delete-range':
      return resolveRangeRemovalEdit(context, command, command.ripple !== false);
    case 'lift-range':
      return resolveRangeRemovalEdit(context, command, false);
  }
}

export function validateEditCommand(
  context: EditContext,
  command: TimelineEditCommand
): TimelineEditValidationResult {
  const builtIn = validateBuiltInEditCommand(context, command);
  if (!builtIn.valid) {
    return builtIn;
  }

  const policyContext = createPolicyContext(context, command);
  const placementContexts = createPlacementPolicyContexts(context, command);
  const policyResults: (TimelineEditValidationResult | undefined)[] = [
    context.editPolicy?.validateCommand?.(policyContext),
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
        context.editPolicy?.canPlaceClip?.(
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
      context.editPolicy?.canTrimClip?.(
        policyContext as TimelineEditPolicyContext<
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
      context.editPolicy?.canRippleTrack?.(
        policyContext as TimelineEditPolicyContext<
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
        context.editPolicy?.canEditRange?.(
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

function validateBuiltInEditCommand(
  context: EditContext,
  command: TimelineEditCommand
): TimelineEditValidationResult {
  const timing = validateEditCommandTiming(context, command);
  if (!timing.valid) {
    return timing;
  }

  switch (command.type) {
    case 'move':
      return validateMoveEditCommand(context, command);
    case 'trim':
    case 'ripple-trim':
      return validateTrimEditCommand(context, command);
    case 'roll-trim':
      return validateRollTrimEditCommand(context, command);
    case 'slip':
      return validateClipEditCommand(context, command.clipId, 'resizable');
    case 'slide':
      return validateClipEditCommand(context, command.clipId, 'movable');
    case 'split':
      return validateSplitEditCommand(context, command);
    case 'delete-clips':
      return validateDeleteClipsEditCommand(context, command);
    case 'insert':
    case 'overwrite':
      return validatePlaceClipCommand(context, command);
    case 'insert-clip-group':
    case 'overwrite-clip-group':
      return validatePlaceClipGroupCommand(context, command);
    case 'delete-range':
    case 'lift-range':
      return validateRangeEditCommand(context, command);
  }
}

function validateEditCommandTiming(
  context: EditContext,
  command: TimelineEditCommand
): TimelineEditValidationResult {
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
    return rejectEdit(
      context,
      'invalid-range',
      error instanceof Error ? error.message : String(error)
    );
  }

  return defaultTimelineEditValidationResult;
}

function rejectEdit(
  context: EditContext,
  reason: TimelineEditRejectionReason,
  message?: string
): TimelineEditValidationResult {
  return message === undefined ? { valid: false, reason } : { valid: false, reason, message };
}

function validateMoveEditCommand(
  context: EditContext,
  command: TimelineMoveEditCommand
): TimelineEditValidationResult {
  const found = findClipInTracks(context.state.tracks, command.clipId);
  if (!found) {
    return rejectEdit(context, 'not-found');
  }
  if (found.track.locked || found.clip.movable === false) {
    return rejectEdit(context, 'locked');
  }

  const targetTrackId = command.targetTrackId ?? found.track.id;
  const targetTrack = context.state.tracks.find((track) => track.id === targetTrackId);
  if (!targetTrack) {
    return rejectEdit(context, 'invalid-track');
  }
  if (targetTrack.locked) {
    return rejectEdit(context, 'locked');
  }
  if (targetTrack.kind !== found.track.kind && command.allowCrossKindTrackMove !== true) {
    return rejectEdit(context, 'incompatible-track-kind');
  }
  const linkedClipIds = getLinkedClipIds(context, command.clipId);
  if (linkedClipIds.length > 1 && targetTrack.id !== found.track.id) {
    return rejectEdit(context, 'unsupported');
  }
  for (const linkedClipId of linkedClipIds) {
    const linked = findClipInTracks(context.state.tracks, linkedClipId);
    if (!linked) {
      return rejectEdit(context, 'not-found');
    }
    if (linked.track.locked || linked.clip.movable === false) {
      return rejectEdit(context, 'locked');
    }
  }
  return defaultTimelineEditValidationResult;
}

export function getLinkedClipIds(context: EditContext, clipId: string): string[] {
  return getClipGroupForClip(context, clipId)?.clipIds ?? [clipId];
}

export function getClipGroupForClip(
  context: EditContext,
  clipId: string
): TimelineClipGroup | undefined {
  return context.state.clipGroups.find((group) => group.clipIds.includes(clipId));
}

function validateTrimEditCommand(
  context: EditContext,
  command: TimelineTrimEditCommand | TimelineRippleTrimEditCommand
): TimelineEditValidationResult {
  const clipValidation = validateClipEditCommand(context, command.clipId, 'resizable');
  if (!clipValidation.valid) {
    return clipValidation;
  }

  const found = findClipInTracks(context.state.tracks, command.clipId);
  if (!found) {
    return rejectEdit(context, 'not-found');
  }
  const minDuration = fromSeconds(minimumTimelineEditDurationSeconds, command.newTime.r);
  const duration =
    command.edge === 'start'
      ? subRational(found.clip.timelineEnd, command.newTime)
      : subRational(command.newTime, found.clip.timelineStart);
  if (compareRational(duration, minDuration) < 0) {
    return rejectEdit(context, 'invalid-duration');
  }
  return defaultTimelineEditValidationResult;
}

function validateClipEditCommand(
  context: EditContext,
  clipId: string,
  capability: 'movable' | 'resizable'
): TimelineEditValidationResult {
  const found = findClipInTracks(context.state.tracks, clipId);
  if (!found) {
    return rejectEdit(context, 'not-found');
  }
  if (found.track.locked) {
    return rejectEdit(context, 'locked');
  }
  if (capability === 'movable' && found.clip.movable === false) {
    return rejectEdit(context, 'locked');
  }
  if (capability === 'resizable' && found.clip.resizable === false) {
    return rejectEdit(context, 'locked');
  }
  return defaultTimelineEditValidationResult;
}

function validateRollTrimEditCommand(
  context: EditContext,
  command: TimelineRollTrimEditCommand
): TimelineEditValidationResult {
  const left = findClipInTracks(context.state.tracks, command.leftClipId);
  const right = findClipInTracks(context.state.tracks, command.rightClipId);
  if (!left || !right) {
    return rejectEdit(context, 'not-found');
  }
  if (left.track.id !== right.track.id) {
    return rejectEdit(context, 'invalid-range');
  }
  if (left.track.locked || left.clip.resizable === false || right.clip.resizable === false) {
    return rejectEdit(context, 'locked');
  }
  const snap = command.snap === false ? null : context.resolveSnap(command.boundaryTime, false);
  return validateResolvedRollTrimBoundary(
    context,
    command,
    snap?.snappedTime ?? command.boundaryTime
  );
}

function validateResolvedRollTrimBoundary(
  context: EditContext,
  command: TimelineRollTrimEditCommand,
  boundaryTime: RationalTime
): TimelineEditValidationResult {
  const left = findClipInTracks(context.state.tracks, command.leftClipId);
  const right = findClipInTracks(context.state.tracks, command.rightClipId);
  if (!left || !right) {
    return rejectEdit(context, 'not-found');
  }
  const minDuration = fromSeconds(minimumTimelineEditDurationSeconds, boundaryTime.r);
  if (
    compareRational(boundaryTime, addRational(left.clip.timelineStart, minDuration)) < 0 ||
    compareRational(boundaryTime, subRational(right.clip.timelineEnd, minDuration)) > 0
  ) {
    return rejectEdit(context, 'invalid-duration');
  }
  return defaultTimelineEditValidationResult;
}

function validateSplitEditCommand(
  context: EditContext,
  command: TimelineSplitEditCommand
): TimelineEditValidationResult {
  if (command.clipIds.length === 0) {
    return rejectEdit(context, 'not-found');
  }
  const requestedClipIds = getLinkedCommandClipIds(context, command.clipIds);
  let hasOverlappingClip = false;
  for (const clipId of requestedClipIds) {
    const found = findClipInTracks(context.state.tracks, clipId);
    if (!found) {
      return rejectEdit(context, 'not-found');
    }
    const overlaps =
      compareRational(command.time, found.clip.timelineStart) > 0 &&
      compareRational(command.time, found.clip.timelineEnd) < 0;
    if (!overlaps) {
      continue;
    }
    if (found.track.locked || found.clip.resizable === false) {
      return rejectEdit(context, 'locked');
    }
    hasOverlappingClip ||= overlaps;
  }
  return hasOverlappingClip
    ? defaultTimelineEditValidationResult
    : rejectEdit(context, 'invalid-range');
}

function getLinkedCommandClipIds(context: EditContext, clipIds: readonly string[]) {
  const linkedClipIds = new Set<string>();
  for (const clipId of clipIds) {
    for (const linkedClipId of getLinkedClipIds(context, clipId)) {
      linkedClipIds.add(linkedClipId);
    }
  }
  return [...linkedClipIds];
}

function validateDeleteClipsEditCommand(
  context: EditContext,
  command: TimelineDeleteClipsEditCommand
): TimelineEditValidationResult {
  if (command.clipIds.length === 0) {
    return rejectEdit(context, 'not-found');
  }
  const requestedClipIds = getLinkedCommandClipIds(context, command.clipIds);
  for (const clipId of requestedClipIds) {
    const found = findClipInTracks(context.state.tracks, clipId);
    if (!found) {
      return rejectEdit(context, 'not-found');
    }
    if (found.track.locked) {
      return rejectEdit(context, 'locked');
    }
  }
  return defaultTimelineEditValidationResult;
}

function validatePlaceClipCommand(
  context: EditContext,
  command: TimelineInsertEditCommand | TimelineOverwriteEditCommand
): TimelineEditValidationResult {
  if (findClipInTracks(context.state.tracks, command.clip.id)) {
    return rejectEdit(context, 'duplicate-id');
  }
  const targetTrack = context.state.tracks.find((track) => track.id === command.targetTrackId);
  if (!targetTrack) {
    return rejectEdit(context, 'invalid-track');
  }
  if (targetTrack.locked) {
    return rejectEdit(context, 'locked');
  }
  const duration = subRational(command.clip.timelineEnd, command.clip.timelineStart);
  if (compareRational(duration, fromSeconds(minimumTimelineEditDurationSeconds, duration.r)) < 0) {
    return rejectEdit(context, 'invalid-duration');
  }
  return defaultTimelineEditValidationResult;
}

function validatePlaceClipGroupCommand(
  context: EditContext,
  command: TimelineInsertClipGroupEditCommand | TimelineOverwriteClipGroupEditCommand
): TimelineEditValidationResult {
  if (command.placements.length < 2) {
    return rejectEdit(context, 'invalid-range');
  }
  if (command.groupId !== undefined && getClipGroup(context, command.groupId) !== undefined) {
    return rejectEdit(context, 'duplicate-id');
  }

  const clipIds = new Set<string>();
  const placedByTrack = new Map<string, Clip[]>();
  const snap = resolveClipGroupPlacementSnap(context, command);
  for (const placement of command.placements) {
    if (
      clipIds.has(placement.clip.id) ||
      findClipInTracks(context.state.tracks, placement.clip.id)
    ) {
      return rejectEdit(context, 'duplicate-id');
    }
    clipIds.add(placement.clip.id);

    const targetTrack = context.state.tracks.find((track) => track.id === placement.targetTrackId);
    if (!targetTrack) {
      return rejectEdit(context, 'invalid-track');
    }
    if (targetTrack.locked) {
      return rejectEdit(context, 'locked');
    }

    const duration = subRational(placement.clip.timelineEnd, placement.clip.timelineStart);
    if (
      compareRational(duration, fromSeconds(minimumTimelineEditDurationSeconds, duration.r)) < 0
    ) {
      return rejectEdit(context, 'invalid-duration');
    }

    const placedClip = createPlacedClipFromGroupPlacement(context, placement, snap.deltaTime);
    const placedClips = placedByTrack.get(placement.targetTrackId) ?? [];
    if (
      placedClips.some(
        (clip) =>
          compareRational(placedClip.timelineStart, clip.timelineEnd) < 0 &&
          compareRational(placedClip.timelineEnd, clip.timelineStart) > 0
      )
    ) {
      return rejectEdit(context, 'invalid-range');
    }
    placedClips.push(placedClip);
    placedByTrack.set(placement.targetTrackId, placedClips);
  }

  return defaultTimelineEditValidationResult;
}

export function getClipGroup(context: EditContext, groupId: string): TimelineClipGroup | undefined {
  return context.state.clipGroups.find((group) => group.id === groupId);
}

function resolveClipGroupPlacementSnap(
  context: EditContext,
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
  const snap = resolveClipBoundarySnap(context, primaryPlacement.startTime, duration);
  if (snap === null) {
    return { deltaTime: null, result: null };
  }

  return {
    deltaTime: subRational(snap.startTime, primaryPlacement.startTime),
    result: snap.result,
  };
}

function resolveClipBoundarySnap(
  context: EditContext,
  startTime: RationalTime,
  duration: RationalTime
) {
  const snapStart = context.resolveSnap(startTime, false);
  const candidateEnd = addRational(startTime, duration);
  const snapEnd = context.resolveSnap(candidateEnd, false);
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

function createPlacedClipFromGroupPlacement(
  context: EditContext,
  placement: TimelineClipGroupPlacement,
  snapDeltaTime: RationalTime | null
): Clip {
  return resolveGroupPlacement(context, placement, snapDeltaTime).clip;
}

function resolveGroupPlacement(
  context: EditContext,
  placement: TimelineClipGroupPlacement,
  snapDeltaTime: RationalTime | null
): { clip: Clip } {
  const duration = subRational(placement.clip.timelineEnd, placement.clip.timelineStart);
  const startTime =
    snapDeltaTime === null ? placement.startTime : addRational(placement.startTime, snapDeltaTime);
  const placedClip = createClipSnapshot(placement.clip, {
    timelineStart: startTime,
    timelineEnd: addRational(startTime, duration),
  });
  shiftClipKeyframes(placedClip, subRational(startTime, placement.clip.timelineStart));
  return { clip: placedClip };
}

function validateRangeEditCommand(
  context: EditContext,
  command: TimelineDeleteRangeEditCommand | TimelineLiftRangeEditCommand
): TimelineEditValidationResult {
  if (compareRational(command.endTime, command.startTime) <= 0) {
    return rejectEdit(context, 'invalid-range');
  }
  const trackIds = command.trackIds ?? context.state.tracks.map((track) => track.id);
  for (const trackId of trackIds) {
    const track = context.state.tracks.find((candidate) => candidate.id === trackId);
    if (!track) {
      return rejectEdit(context, 'invalid-track');
    }
    if (track.locked) {
      return rejectEdit(context, 'locked');
    }
  }
  return defaultTimelineEditValidationResult;
}

function createPolicyContext(
  context: EditContext,
  command: TimelineEditCommand
): TimelineEditPolicyContext {
  const sourceClipId = getEditCommandSourceClipId(context, command);
  const found =
    sourceClipId !== undefined ? findClipInTracks(context.state.tracks, sourceClipId) : undefined;
  const targetTrackId =
    command.type === 'move'
      ? (command.targetTrackId ?? found?.track.id)
      : command.type === 'insert' || command.type === 'overwrite'
        ? command.targetTrackId
        : undefined;
  const targetTrack =
    targetTrackId !== undefined
      ? context.state.tracks.find((track) => track.id === targetTrackId)
      : undefined;

  return {
    command,
    state: context.state,
    clip: found?.clip,
    track: found?.track,
    targetTrack,
    range: getCommandPolicyRange(context, command, targetTrackId),
  };
}

export function getEditCommandSourceClipId(
  context: EditContext,
  command: TimelineEditCommand
): string | undefined {
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

function getCommandPolicyRange(
  context: EditContext,
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

function createPlacementPolicyContexts(
  context: EditContext,
  command: TimelineEditCommand
): TimelineEditPolicyContext[] {
  if (command.type === 'insert-clip-group' || command.type === 'overwrite-clip-group') {
    const snap = resolveClipGroupPlacementSnap(context, command);
    return command.placements.map((placement) => {
      const targetTrack = context.state.tracks.find(
        (track) => track.id === placement.targetTrackId
      );
      return {
        command,
        state: context.state,
        clip: placement.clip,
        targetTrack,
        range: getGroupPlacementPolicyRange(context, placement, snap.deltaTime),
      };
    });
  }

  return [createPolicyContext(context, command)];
}

function getGroupPlacementPolicyRange(
  context: EditContext,
  placement: TimelineClipGroupPlacement,
  snapDeltaTime: RationalTime | null
): TimelineEditAffectedRange {
  const placedClip = createPlacedClipFromGroupPlacement(context, placement, snapDeltaTime);
  return {
    trackId: placement.targetTrackId,
    startTime: placedClip.timelineStart,
    endTime: placedClip.timelineEnd,
  };
}

function createRejectedResolvedEdit(
  context: EditContext,
  command: TimelineEditCommand,
  tracks: Track[],
  validation: TimelineEditValidationResult
): TimelineResolvedEdit {
  return createResolvedEdit(
    context,
    command,
    tracks,
    createRejectedEditPreview(context, command, validation)
  );
}

function createResolvedEdit(
  context: EditContext,
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
    ...(options.moveResult !== undefined ? { moveResult: options.moveResult } : {}),
    createdClipEvents: options.createdClipEvents ?? [],
    removedClipEvents: options.removedClipEvents ?? [],
  };
}

function createRejectedEditPreview(
  context: EditContext,
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

function resolveMoveEdit(
  context: EditContext,
  command: TimelineMoveEditCommand
): TimelineResolvedEdit {
  const tracks = createTrackSnapshots(context.state.tracks);
  const found = findClipInTracks(tracks, command.clipId);
  if (!found) {
    return createRejectedResolvedEdit(context, command, tracks, rejectEdit(context, 'not-found'));
  }

  const targetTrackId = command.targetTrackId ?? found.track.id;
  const targetTrack = tracks.find((track) => track.id === targetTrackId);
  if (!targetTrack) {
    return createRejectedResolvedEdit(
      context,
      command,
      tracks,
      rejectEdit(context, 'invalid-track')
    );
  }

  const previousStartTime = cloneRationalTime(found.clip.timelineStart);
  const previousEndTime = cloneRationalTime(found.clip.timelineEnd);
  const duration = subRational(found.clip.timelineEnd, found.clip.timelineStart);
  const snap =
    command.snap === false ? null : resolveClipBoundarySnap(context, command.startTime, duration);
  let startTime = snap?.startTime ?? command.startTime;
  if (found.clip.minStart !== undefined) {
    startTime = maxRational(startTime, found.clip.minStart);
  }
  let endTime = addRational(startTime, duration);
  if (found.clip.maxEnd !== undefined && compareRational(endTime, found.clip.maxEnd) > 0) {
    endTime = found.clip.maxEnd;
    startTime = subRational(endTime, duration);
  }

  const linkedClipIds = getLinkedClipIds(context, command.clipId);
  if (linkedClipIds.length > 1 && targetTrack.id !== found.track.id) {
    return createRejectedResolvedEdit(context, command, tracks, rejectEdit(context, 'unsupported'));
  }

  const deltaTime = subRational(startTime, previousStartTime);
  const changedClips: Clip[] = [];
  for (const linkedClipId of linkedClipIds) {
    const linked = findClipInTracks(tracks, linkedClipId);
    if (!linked) {
      return createRejectedResolvedEdit(context, command, tracks, rejectEdit(context, 'not-found'));
    }
    const nextStart = addRational(linked.clip.timelineStart, deltaTime);
    const nextEnd = addRational(linked.clip.timelineEnd, deltaTime);
    if (
      (linked.clip.minStart !== undefined &&
        compareRational(nextStart, linked.clip.minStart) < 0) ||
      (linked.clip.maxEnd !== undefined && compareRational(nextEnd, linked.clip.maxEnd) > 0)
    ) {
      return createRejectedResolvedEdit(
        context,
        command,
        tracks,
        rejectEdit(context, 'source-bounds')
      );
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
    track.clips.sort((a, b) => compareRational(a.timelineStart, b.timelineStart));
  }
  const moved = findClipInTracks(tracks, command.clipId);
  if (!moved) {
    return createRejectedResolvedEdit(context, command, tracks, rejectEdit(context, 'not-found'));
  }

  const preview = createResolvedEditPreview(context, command, {
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

  return createResolvedEdit(context, command, tracks, preview, { moveResult });
}

function createResolvedEditPreview(
  context: EditContext,
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

function resolveTrimEdit(
  context: EditContext,
  command: TimelineTrimEditCommand | TimelineRippleTrimEditCommand,
  ripple: boolean
): TimelineResolvedEdit {
  const tracks = createTrackSnapshots(context.state.tracks);
  const found = findClipInTracks(tracks, command.clipId);
  if (!found) {
    return createRejectedResolvedEdit(context, command, tracks, rejectEdit(context, 'not-found'));
  }

  const originalClip = createClipSnapshot(found.clip);
  const snap = command.snap === false ? null : context.resolveSnap(command.newTime, false);
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
    found.clip.sourceStart = addRational(found.clip.sourceStart, subRational(startTime, oldStart));
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
  filterClipKeyframesToClipRange(found.clip);
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
    found.track.clips.sort((a, b) => compareRational(a.timelineStart, b.timelineStart));
  }

  return createResolvedEdit(
    context,
    command,
    tracks,
    createResolvedEditPreview(context, command, {
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

function resolveRollTrimEdit(
  context: EditContext,
  command: TimelineRollTrimEditCommand
): TimelineResolvedEdit {
  const tracks = createTrackSnapshots(context.state.tracks);
  const left = findClipInTracks(tracks, command.leftClipId);
  const right = findClipInTracks(tracks, command.rightClipId);
  if (!left || !right || left.track.id !== right.track.id) {
    return createRejectedResolvedEdit(
      context,
      command,
      tracks,
      rejectEdit(context, 'invalid-range')
    );
  }

  const snap = command.snap === false ? null : context.resolveSnap(command.boundaryTime, false);
  const boundaryTime = snap?.snappedTime ?? command.boundaryTime;
  const boundaryValidation = validateResolvedRollTrimBoundary(context, command, boundaryTime);
  if (!boundaryValidation.valid) {
    return createRejectedResolvedEdit(context, command, tracks, boundaryValidation);
  }
  const originalLeft = createClipSnapshot(left.clip);
  const originalRight = createClipSnapshot(right.clip);
  left.clip.timelineEnd = boundaryTime;
  right.clip.sourceStart = addRational(
    right.clip.sourceStart,
    subRational(boundaryTime, right.clip.timelineStart)
  );
  right.clip.timelineStart = boundaryTime;
  left.track.clips.sort((a, b) => compareRational(a.timelineStart, b.timelineStart));

  return createResolvedEdit(
    context,
    command,
    tracks,
    createResolvedEditPreview(context, command, {
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

function resolveSlipEdit(
  context: EditContext,
  command: TimelineSlipEditCommand
): TimelineResolvedEdit {
  const tracks = createTrackSnapshots(context.state.tracks);
  const found = findClipInTracks(tracks, command.clipId);
  if (!found) {
    return createRejectedResolvedEdit(context, command, tracks, rejectEdit(context, 'not-found'));
  }

  const originalClip = createClipSnapshot(found.clip);
  found.clip.sourceStart = maxRational(
    addRational(found.clip.sourceStart, command.deltaTime),
    fromSeconds(0, command.deltaTime.r)
  );

  return createResolvedEdit(
    context,
    command,
    tracks,
    createResolvedEditPreview(context, command, {
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

function resolveSlideEdit(
  context: EditContext,
  command: TimelineSlideEditCommand
): TimelineResolvedEdit {
  const found = findClipInTracks(context.state.tracks, command.clipId);
  if (!found) {
    return createRejectedResolvedEdit(
      context,
      command,
      createTrackSnapshots(context.state.tracks),
      rejectEdit(context, 'not-found')
    );
  }
  const resolved = resolveMoveEdit(context, {
    type: 'move',
    clipId: command.clipId,
    startTime: addRational(found.clip.timelineStart, command.deltaTime),
    snap: command.snap,
  });
  return createResolvedEdit(
    context,
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

function resolveSplitEdit(
  context: EditContext,
  command: TimelineSplitEditCommand
): TimelineResolvedEdit {
  const tracks = createTrackSnapshots(context.state.tracks);
  const requestedClipIds = new Set(getLinkedCommandClipIds(context, command.clipIds));

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
        id: context.allocateId(`split:${clip.id}`),
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
    track.clips.sort((a, b) => compareRational(a.timelineStart, b.timelineStart));
  }

  if (splitRightClipIds.size === 0) {
    return createRejectedResolvedEdit(
      context,
      command,
      tracks,
      rejectEdit(context, 'invalid-range')
    );
  }

  const nextClipGroups = repartitionClipGroupsAfterSplit(
    context,
    tracks,
    command.time,
    splitRightClipIds
  );

  return createResolvedEdit(
    context,
    command,
    tracks,
    createResolvedEditPreview(context, command, {
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

function repartitionClipGroupsAfterSplit(
  context: EditContext,
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
  for (const group of context.state.clipGroups) {
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
        id: context.allocateId(`split-group:${group.id}`),
        clipIds: rightClipIds,
        ...(group.label !== undefined ? { label: group.label } : {}),
      });
    }
  }

  return createClipGroupSnapshots(nextGroups);
}

function resolveDeleteClipsEdit(
  context: EditContext,
  command: TimelineDeleteClipsEditCommand
): TimelineResolvedEdit {
  const tracks = createTrackSnapshots(context.state.tracks);
  const requestedClipIds = new Set(getLinkedCommandClipIds(context, command.clipIds));
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
      removedClipEvents.push({ clip: originalClip, reason: command.reason ?? 'delete' });
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
    return createRejectedResolvedEdit(context, command, tracks, rejectEdit(context, 'not-found'));
  }

  return createResolvedEdit(
    context,
    command,
    tracks,
    createResolvedEditPreview(context, command, {
      snap: null,
      changedClips: [],
      createdClips: [],
      removedClips,
      affectedRanges,
      impacts,
    }),
    {
      clipGroups: normalizeClipGroupsForTracks(context, context.state.clipGroups, tracks),
      removedClipEvents,
    }
  );
}

export function normalizeClipGroupsForTracks(
  context: EditContext,
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

function resolveInsertEdit(
  context: EditContext,
  command: TimelineInsertEditCommand
): TimelineResolvedEdit {
  const tracks = createTrackSnapshots(context.state.tracks);
  const targetTrack = tracks.find((track) => track.id === command.targetTrackId);
  if (!targetTrack) {
    return createRejectedResolvedEdit(
      context,
      command,
      tracks,
      rejectEdit(context, 'invalid-track')
    );
  }

  const placedClip = createPlacedClip(context, command);
  const duration = subRational(placedClip.timelineEnd, placedClip.timelineStart);
  for (const clip of targetTrack.clips) {
    if (compareRational(clip.timelineStart, placedClip.timelineStart) >= 0) {
      clip.timelineStart = addRational(clip.timelineStart, duration);
      clip.timelineEnd = addRational(clip.timelineEnd, duration);
      shiftClipKeyframes(clip, duration);
    }
  }
  targetTrack.clips.push(placedClip);
  targetTrack.clips.sort((a, b) => compareRational(a.timelineStart, b.timelineStart));

  const placedClipEvent = {
    clip: createClipSnapshot(placedClip),
    reason: 'insert',
  } satisfies TimelineCreatedClipEvent;

  return createResolvedEdit(
    context,
    command,
    tracks,
    createResolvedEditPreview(context, command, {
      snap: command.snap === false ? null : context.resolveSnap(command.startTime, false),
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

function createPlacedClip(context: EditContext, command: TimelinePlaceClipCommand): Clip {
  const duration = subRational(command.clip.timelineEnd, command.clip.timelineStart);
  const snap =
    command.snap === false ? null : resolveClipBoundarySnap(context, command.startTime, duration);
  const startTime = snap?.startTime ?? command.startTime;
  const placedClip = createClipSnapshot(command.clip, {
    timelineStart: startTime,
    timelineEnd: addRational(startTime, duration),
  });
  shiftClipKeyframes(placedClip, subRational(startTime, command.clip.timelineStart));
  return placedClip;
}

function resolveInsertClipGroupEdit(
  context: EditContext,
  command: TimelineInsertClipGroupEditCommand
): TimelineResolvedEdit {
  const tracks = createTrackSnapshots(context.state.tracks);
  const resolvedPlacements = resolveClipGroupPlacements(context, command, tracks);
  if ('validation' in resolvedPlacements) {
    return createRejectedResolvedEdit(context, command, tracks, resolvedPlacements.validation);
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
    placement.track.clips.sort((a, b) => compareRational(a.timelineStart, b.timelineStart));
  }

  return createResolvedEdit(
    context,
    command,
    tracks,
    createResolvedEditPreview(context, command, {
      snap: resolvedPlacements.firstSnap,
      changedClips,
      createdClips,
      removedClips: [],
      affectedRanges,
      impacts: [],
    }),
    {
      clipGroups: createClipGroupsAfterGroupedPlacement(context, command),
      createdClipEvents: createdClips.map((clip) => ({
        clip,
        reason: 'insert',
      })),
    }
  );
}

function resolveClipGroupPlacements(
  context: EditContext,
  command: TimelineInsertClipGroupEditCommand | TimelineOverwriteClipGroupEditCommand,
  tracks: Track[]
): TimelineResolvedClipGroupPlacements | TimelineRejectedClipGroupPlacements {
  const placements: TimelineResolvedClipGroupPlacement[] = [];
  const snap = resolveClipGroupPlacementSnap(context, command);

  for (const placement of command.placements) {
    const track = tracks.find((candidate) => candidate.id === placement.targetTrackId);
    if (track === undefined) {
      return { validation: rejectEdit(context, 'invalid-track') };
    }
    const resolvedPlacement = resolveGroupPlacement(context, placement, snap.deltaTime);
    placements.push({
      clip: resolvedPlacement.clip,
      track,
    });
  }

  return { placements, firstSnap: snap.result };
}

function createClipGroupsAfterGroupedPlacement(
  context: EditContext,
  command: TimelineInsertClipGroupEditCommand | TimelineOverwriteClipGroupEditCommand
): TimelineClipGroup[] {
  return createClipGroupSnapshots([
    ...context.state.clipGroups,
    {
      id:
        command.groupId ??
        context.allocateId(
          `group:${command.placements.map((placement) => placement.clip.id).join(':')}`
        ),
      clipIds: command.placements.map((placement) => placement.clip.id),
      ...(command.label !== undefined ? { label: command.label } : {}),
    },
  ]);
}

function resolveOverwriteEdit(
  context: EditContext,
  command: TimelineOverwriteEditCommand
): TimelineResolvedEdit {
  const tracks = createTrackSnapshots(context.state.tracks);
  const targetTrack = tracks.find((track) => track.id === command.targetTrackId);
  if (!targetTrack) {
    return createRejectedResolvedEdit(
      context,
      command,
      tracks,
      rejectEdit(context, 'invalid-track')
    );
  }

  const placedClip = createPlacedClip(context, command);
  targetTrack.clips.push(placedClip);
  const overwriteResult = resolveTrackOverwrite(context, targetTrack, placedClip);

  const placedClipEvent = {
    clip: createClipSnapshot(placedClip),
    reason: command.originClipId ? 'paste' : 'overwrite',
    originClipId: command.originClipId,
  } satisfies TimelineCreatedClipEvent;

  return createResolvedEdit(
    context,
    command,
    tracks,
    createResolvedEditPreview(context, command, {
      snap: command.snap === false ? null : context.resolveSnap(command.startTime, false),
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

function resolveTrackOverwrite(context: EditContext, track: Track, winner: Clip) {
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
        id: context.allocateId(`overwrite:${winner.id}:${clip.id}`),
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
  track.clips.sort((a, b) => compareRational(a.timelineStart, b.timelineStart));
  return { changedClips, createdClips, createdClipEvents, removedClips, impacts };
}

function resolveOverwriteClipGroupEdit(
  context: EditContext,
  command: TimelineOverwriteClipGroupEditCommand
): TimelineResolvedEdit {
  const tracks = createTrackSnapshots(context.state.tracks);
  const resolvedPlacements = resolveClipGroupPlacements(context, command, tracks);
  if ('validation' in resolvedPlacements) {
    return createRejectedResolvedEdit(context, command, tracks, resolvedPlacements.validation);
  }

  const changedClips: Clip[] = [];
  const placedClips = resolvedPlacements.placements.map((placement) =>
    createClipSnapshot(placement.clip)
  );
  const createdClips: Clip[] = [...placedClips];
  const removedClips: Clip[] = [];
  const impacts: TimelineEditImpact[] = [];
  const createdClipEvents: TimelineCreatedClipEvent[] = placedClips.map((clip, index) => ({
    clip,
    reason: command.placements[index].originClipId ? 'paste' : 'overwrite',
    originClipId: command.placements[index].originClipId,
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
    const overwriteResult = resolveTrackOverwrite(context, placement.track, placement.clip);
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

  return createResolvedEdit(
    context,
    command,
    tracks,
    createResolvedEditPreview(context, command, {
      snap: resolvedPlacements.firstSnap,
      changedClips,
      createdClips,
      removedClips,
      affectedRanges,
      impacts,
    }),
    {
      clipGroups: createClipGroupsAfterGroupedPlacement(context, command),
      createdClipEvents,
      removedClipEvents,
    }
  );
}

function resolveRangeRemovalEdit(
  context: EditContext,
  command: TimelineDeleteRangeEditCommand | TimelineLiftRangeEditCommand,
  ripple: boolean
): TimelineResolvedEdit {
  const tracks = createTrackSnapshots(context.state.tracks);
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
          id: context.allocateId(`range:${clip.id}`),
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
    track.clips.sort((a, b) => compareRational(a.timelineStart, b.timelineStart));
  }

  return createResolvedEdit(
    context,
    command,
    tracks,
    createResolvedEditPreview(context, command, {
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
