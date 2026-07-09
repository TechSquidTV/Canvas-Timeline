import type {
  Clip,
  TimelineClipDropFeedback,
  TimelineEditImpact,
  TimelineEditImpacts,
  TimelineEditValidationResult,
  TimelineSnapFeedback,
} from '#core/types';
import { cloneRationalTime, createClipSnapshot } from '#core/snapshot';

export const emptyTimelineSnapFeedback: TimelineSnapFeedback = {
  lines: [],
  target: null,
};

export const emptyTimelineClipDropFeedback: TimelineClipDropFeedback = {
  activeClipId: null,
  sourceTrackId: null,
  hoveredTrackId: null,
  activeTargetTrackId: null,
  valid: false,
  reason: null,
  penetrationRatio: 0,
};

export const defaultTimelineEditValidationResult: TimelineEditValidationResult = {
  valid: true,
  reason: null,
};

export function createClipDropFeedbackSnapshot(
  feedback: TimelineClipDropFeedback
): TimelineClipDropFeedback {
  return {
    activeClipId: feedback.activeClipId,
    sourceTrackId: feedback.sourceTrackId,
    hoveredTrackId: feedback.hoveredTrackId,
    activeTargetTrackId: feedback.activeTargetTrackId,
    valid: feedback.valid,
    reason: feedback.reason,
    penetrationRatio: feedback.penetrationRatio,
  };
}

export function hasClipDropFeedback(feedback: TimelineClipDropFeedback) {
  return (
    feedback.activeClipId !== null ||
    feedback.sourceTrackId !== null ||
    feedback.hoveredTrackId !== null ||
    feedback.activeTargetTrackId !== null ||
    feedback.reason !== null ||
    feedback.penetrationRatio !== 0 ||
    feedback.valid
  );
}

export function isSameClipDropFeedback(
  left: TimelineClipDropFeedback,
  right: TimelineClipDropFeedback
) {
  return (
    left.activeClipId === right.activeClipId &&
    left.sourceTrackId === right.sourceTrackId &&
    left.hoveredTrackId === right.hoveredTrackId &&
    left.activeTargetTrackId === right.activeTargetTrackId &&
    left.valid === right.valid &&
    left.reason === right.reason &&
    left.penetrationRatio === right.penetrationRatio
  );
}

function cloneClipForEditImpacts(clip: Clip): Clip {
  const next = createClipSnapshot(clip, {
    timelineStart: cloneRationalTime(clip.timelineStart),
    timelineEnd: cloneRationalTime(clip.timelineEnd),
    sourceStart: cloneRationalTime(clip.sourceStart),
    minStart: clip.minStart ? cloneRationalTime(clip.minStart) : undefined,
    maxEnd: clip.maxEnd ? cloneRationalTime(clip.maxEnd) : undefined,
  });

  return Object.freeze(next) as Clip;
}

export function createTimelineEditImpactsSnapshot(
  editImpacts: TimelineEditImpacts | null
): TimelineEditImpacts | null {
  if (!editImpacts) {
    return null;
  }

  const impacts = editImpacts.impacts.map(
    (impact) =>
      Object.freeze({
        clipId: impact.clipId,
        trackId: impact.trackId,
        originalClip: cloneClipForEditImpacts(impact.originalClip),
        resultClips: Object.freeze(
          impact.resultClips.map((clip) => cloneClipForEditImpacts(clip))
        ) as Clip[],
        effect: impact.effect,
        affectedStartTime: cloneRationalTime(impact.affectedStartTime),
        affectedEndTime: cloneRationalTime(impact.affectedEndTime),
        ...(impact.cutStart !== undefined ? { cutStart: impact.cutStart } : {}),
        ...(impact.cutEnd !== undefined ? { cutEnd: impact.cutEnd } : {}),
      }) as TimelineEditImpact
  );

  return Object.freeze({
    operation: editImpacts.operation,
    sourceClipId: editImpacts.sourceClipId,
    sourceTrackId: editImpacts.sourceTrackId,
    impacts: Object.freeze(impacts) as TimelineEditImpact[],
  }) as TimelineEditImpacts;
}
