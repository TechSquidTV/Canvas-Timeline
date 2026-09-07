import { findClipInTracks } from '#core/engine/clip-lookup';
import { insertCurveKeyframe } from '#core/engine/keyframe-curves';
import type { KeyframePropertyRegistry } from '#core/engine/keyframe-property-registry';
import { normalizeTimelineKeyframeSideInterpolation } from '#core/keyframes';
import { cloneTimelineKeyframe, createClipSnapshot, sortTimelineKeyframes } from '#core/snapshot';
import type {
  Clip,
  TimelineEditValidationResult,
  TimelineKeyframe,
  TimelineKeyframeEditCommand,
  TimelineKeyframeSide,
  TimelineKeyframeSidePatch,
  Track,
} from '#core/types';
import {
  assertValidRationalTime,
  compareRational,
  maxRational,
  minRational,
  subRational,
  toSeconds,
} from '@techsquidtv/canvas-timeline-utils';

export interface KeyframeChange {
  type: 'keyframe:add' | 'keyframe:update' | 'keyframe:remove';
  clipId: string;
  keyframe: TimelineKeyframe;
}

export interface PreparedKeyframeEdit {
  tracks: Track[];
  changedClips: Clip[];
  changes: KeyframeChange[];
  validation: TimelineEditValidationResult;
}

/** Resolves the complete batch before publishing any state or event. */
export function prepareKeyframeEdit(
  tracks: readonly Track[],
  command: TimelineKeyframeEditCommand,
  registry: KeyframePropertyRegistry,
  allocateId: (key: string) => string
): PreparedKeyframeEdit {
  const editedClipIds = new Set(command.edits.map((edit) => edit.clipId));
  const next = tracks.map((track) =>
    track.clips.some((clip) => editedClipIds.has(clip.id))
      ? {
          ...track,
          clips: track.clips.map((clip) =>
            editedClipIds.has(clip.id) ? createClipSnapshot(clip) : clip
          ),
        }
      : track
  );
  const changed = new Set<string>();
  const reject = (
    reason: TimelineEditValidationResult['reason'],
    message?: string
  ): PreparedKeyframeEdit => ({
    tracks: next,
    changedClips: [],
    changes: [],
    validation: { valid: false, reason, message },
  });
  if (command.edits.length === 0) {
    return reject('invalid-range', 'No keyframes to edit.');
  }
  try {
    for (const [index, edit] of command.edits.entries()) {
      const found = findClipInTracks(next, edit.clipId);
      if (!found) {
        return reject('not-found');
      }
      if (found.track.locked) {
        return reject('locked');
      }
      const clip = found.clip;
      changed.add(clip.id);
      if (edit.type === 'set') {
        assertValidRationalTime(edit.time);
        const value = registry.clampValue(edit.property, edit.value);
        if (value === null) {
          return reject('not-found', 'Unregistered keyframe property.');
        }
        const existing = clip.keyframes?.find(
          (key) => key.property === edit.property && compareRational(key.time, edit.time) === 0
        );
        if (edit.id && existing && existing.id !== edit.id) {
          return reject('invalid-range', 'A keyframe already exists at that time.');
        }
        if (
          edit.id &&
          (compareRational(edit.time, clip.timelineStart) < 0 ||
            compareRational(edit.time, clip.timelineEnd) > 0)
        ) {
          return reject('invalid-range', 'Pasted keyframes must fit inside the destination clip.');
        }
        const time = minRational(maxRational(edit.time, clip.timelineStart), clip.timelineEnd);
        const key = insertCurveKeyframe(
          clip,
          edit.property,
          time,
          registry,
          () => edit.id ?? allocateId(`keyframe:${index}`)
        );
        key.value = value;
        if (edit.selected !== undefined) {
          key.selected = edit.selected;
        }
        if (edit.tangentMode !== undefined) {
          key.tangentMode = edit.tangentMode;
        }
        if (edit.incoming !== undefined) {
          key.incoming = normalizeTimelineKeyframeSideInterpolation(edit.incoming, {
            x: 0.58,
            y: 0,
          });
        }
        if (edit.outgoing !== undefined) {
          key.outgoing = normalizeTimelineKeyframeSideInterpolation(edit.outgoing, {
            x: 0.42,
            y: 0,
          });
        }
        continue;
      }
      const key = clip.keyframes?.find((candidate) => candidate.id === edit.keyframeId);
      if (!key) {
        return reject('not-found');
      }
      if (edit.type === 'remove') {
        clip.keyframes = clip.keyframes?.filter((candidate) => candidate !== key);
      } else if (edit.type === 'update') {
        if (edit.time !== undefined) {
          assertValidRationalTime(edit.time);
          if (
            compareRational(edit.time, clip.timelineStart) < 0 ||
            compareRational(edit.time, clip.timelineEnd) > 0
          ) {
            return reject('invalid-range', 'Keyframes must remain inside their clip.');
          }
          key.time = { ...edit.time };
        }
        if (edit.value !== undefined) {
          const value = registry.clampValue(key.property, edit.value);
          if (value === null) {
            return reject('not-found');
          }
          const delta =
            (registry.normalizeValue(key.property, value) ?? 0) -
            (registry.normalizeValue(key.property, key.value) ?? 0);
          key.value = value;
          for (const side of ['incoming', 'outgoing'] as const) {
            const handle = key[side]?.handle;
            if (handle) {
              handle.y = Math.max(0, Math.min(1, handle.y + delta));
            }
          }
        }
        if (edit.incoming !== undefined) {
          key.incoming = normalizeTimelineKeyframeSideInterpolation(edit.incoming, {
            x: 0.58,
            y: 0,
          });
        }
        if (edit.outgoing !== undefined) {
          key.outgoing = normalizeTimelineKeyframeSideInterpolation(edit.outgoing, {
            x: 0.42,
            y: 0,
          });
        }
        if (edit.tangentMode !== undefined) {
          key.tangentMode = edit.tangentMode;
        }
      } else {
        for (const side of ['incoming', 'outgoing'] as const) {
          const patch = edit[side];
          if (patch) {
            patchSide(clip, key, side, patch, registry);
          }
        }
      }
    }
    const changedClips: Clip[] = [];
    const changes: KeyframeChange[] = [];
    for (const id of changed) {
      const clip = findClipInTracks(next, id)?.clip;
      const before = findClipInTracks(tracks, id)?.clip;
      if (!clip || !before) {
        continue;
      }
      const keys = clip.keyframes ?? [];
      sortTimelineKeyframes(keys);
      const ids = new Set<string>();
      for (const [index, key] of keys.entries()) {
        if (ids.has(key.id)) {
          return reject('duplicate-id');
        }
        ids.add(key.id);
        const previous = keys[index - 1];
        if (
          previous &&
          previous.property === key.property &&
          compareRational(previous.time, key.time) === 0
        ) {
          return reject('invalid-range', 'A keyframe already exists at that time.');
        }
      }
      changedClips.push(clip);
      const beforeById = new Map((before.keyframes ?? []).map((key) => [key.id, key]));
      for (const key of clip.keyframes ?? []) {
        const original = beforeById.get(key.id);
        if (JSON.stringify(original) !== JSON.stringify(key)) {
          changes.push({
            type: original ? 'keyframe:update' : 'keyframe:add',
            clipId: id,
            keyframe: cloneTimelineKeyframe(key),
          });
        }
      }
      for (const key of before.keyframes ?? []) {
        if (!ids.has(key.id)) {
          changes.push({
            type: 'keyframe:remove',
            clipId: id,
            keyframe: cloneTimelineKeyframe(key),
          });
        }
      }
    }
    return { tracks: next, changedClips, changes, validation: { valid: true, reason: null } };
  } catch (error) {
    return reject(
      'invalid-range',
      error instanceof Error ? error.message : 'Invalid keyframe input.'
    );
  }
}

function patchSide(
  clip: Clip,
  key: TimelineKeyframe,
  side: TimelineKeyframeSide,
  patch: TimelineKeyframeSidePatch,
  registry: KeyframePropertyRegistry
) {
  const current = key[side];
  key[side] = normalizeTimelineKeyframeSideInterpolation(
    {
      interpolation: patch.interpolation ?? current?.interpolation ?? 'linear',
      handle: patch.handle === null ? undefined : (patch.handle ?? current?.handle),
    },
    {
      x: side === 'incoming' ? 0.58 : 0.42,
      y: registry.normalizeValue(key.property, key.value) ?? 0,
    }
  );
  const handle = key[side]?.handle;
  if (key.tangentMode !== 'linked' || !handle) {
    return;
  }
  const keys = (clip.keyframes ?? []).filter((candidate) => candidate.property === key.property);
  sortTimelineKeyframes(keys);
  const index = keys.indexOf(key);
  const left = keys[index - 1];
  const right = keys[index + 1];
  if (!left || !right) {
    return;
  }
  const other = side === 'incoming' ? 'outgoing' : 'incoming';
  const otherX = key[other]?.handle?.x ?? (other === 'incoming' ? 0.58 : 0.42);
  const previousSpan = toSeconds(subRational(key.time, left.time));
  const nextSpan = toSeconds(subRational(right.time, key.time));
  const changedDistance = side === 'outgoing' ? nextSpan * handle.x : previousSpan * (1 - handle.x);
  const pairedDistance = other === 'outgoing' ? nextSpan * otherX : previousSpan * (1 - otherX);
  const anchor = registry.normalizeValue(key.property, key.value) ?? 0;
  if (changedDistance <= 0 || pairedDistance <= 0) {
    return;
  }
  const ratio = pairedDistance / changedDistance;
  const delta = Math.max(-anchor, Math.min(1 - anchor, handle.y - anchor));
  const constrained = Math.max(-(1 - anchor) / ratio, Math.min(anchor / ratio, delta));
  handle.y = anchor + constrained;
  key[other] = { interpolation: 'bezier', handle: { x: otherX, y: anchor - constrained * ratio } };
}
