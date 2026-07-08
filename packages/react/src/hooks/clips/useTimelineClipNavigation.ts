import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { Clip, Track } from '@techsquidtv/canvas-timeline-core';
import { addRational, fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { getClipAccessibleDescription, getClipAccessibleName } from '#react/accessibility';
import { useTimeline } from '#react/hooks/core/useTimeline';
import { useTimelineClips } from '#react/hooks/clips/useTimelineClips';
import { useTimelineEditCommands } from '#react/hooks/editing/useTimelineEditCommands';
import { useTimelineSnapping } from '#react/hooks/editing/useTimelineSnapping';
import type { TimelineClipEntry } from '#react/hooks/clips/timelineClipModel';
import { timelineCommandFail } from '#react/hooks/core/timelineCommandResult';

/**
 * Metadata for one canvas-rendered clip exposed through clip navigation.
 *
 * @remarks
 *
 * Canvas Timeline keeps clip visuals on canvas for performance. This model
 * gives a single DOM focus target enough metadata to announce and manipulate
 * whichever canvas clip is currently active.
 *
 * @template TrackKind - App-defined track kind values carried by the containing
 * track.
 *
 * @see {@link useTimelineClipNavigation}
 */
export interface TimelineNavigableClip<TrackKind = string> {
  /** Raw timeline clip represented by this navigation item. */
  clip: Clip;
  /** Track containing the clip. */
  track: Track<TrackKind>;
  /** Zero-based track index in timeline order. */
  trackIndex: number;
  /** Zero-based clip index inside the track. */
  clipIndex: number;
  /** Zero-based flattened clip index across all tracks. */
  index: number;
  /** Whether the active clip may be moved by command helpers. */
  canMove: boolean;
  /** Whether the active clip may be trimmed by command helpers. */
  canTrim: boolean;
  /** Concise accessible name derived from clip and track labels. */
  name: string;
  /** Longer accessible description with timing and edit-state details. */
  description: string;
}

/**
 * Options for constant-DOM canvas clip navigation.
 *
 * @remarks
 *
 * Use these options when a canvas timeline needs keyboard navigation without
 * rendering one DOM button per clip. `selectOnNavigate` is useful for inspector
 * workflows; leave it disabled when navigation should move a virtual cursor
 * without mutating timeline selection.
 *
 * @template TrackKind - App-defined track kind values passed to custom label
 * and description formatters.
 */
export interface TimelineClipNavigationOptions<TrackKind = string> {
  /** Initial active clip id. Defaults to selected clip, then the first clip. */
  initialClipId?: string | null;
  /** Whether next/previous navigation wraps around the clip list. Defaults to true. */
  wrap?: boolean;
  /** Whether navigation also selects the active clip in the engine. Defaults to false. */
  selectOnNavigate?: boolean;
  /** Optional accessible label formatter for a canvas-rendered clip. */
  getClipAriaLabel?: (clip: Clip, track: Track<TrackKind>) => string;
  /** Optional accessible description formatter for a canvas-rendered clip. */
  getClipAriaDescription?: (clip: Clip, track: Track<TrackKind>) => string;
}

function buildNavigableClips<TrackKind>(
  clipEntries: TimelineClipEntry<TrackKind>[],
  getClipAriaLabel?: (clip: Clip, track: Track<TrackKind>) => string,
  getClipAriaDescription?: (clip: Clip, track: Track<TrackKind>) => string
): TimelineNavigableClip<TrackKind>[] {
  return clipEntries.map(({ clip, clipIndex, track, trackIndex }, index) => ({
    clip,
    track,
    trackIndex,
    clipIndex,
    index,
    canMove: !track.locked && clip.movable !== false,
    canTrim: !track.locked && clip.resizable !== false,
    name: getClipAriaLabel?.(clip, track) ?? getClipAccessibleName(clip, track),
    description: getClipAriaDescription?.(clip, track) ?? getClipAccessibleDescription(clip, track),
  }));
}

function getActiveClipStatus<TrackKind>(
  activeClip: TimelineNavigableClip<TrackKind> | null,
  clipCount: number
) {
  if (!activeClip) {
    return clipCount === 0 ? 'No clips in timeline' : 'No active clip';
  }

  return `Clip ${activeClip.index + 1} of ${clipCount}, ${activeClip.name}, ${
    activeClip.description
  }`;
}

/**
 * Provides constant-DOM keyboard navigation and commands for canvas clips.
 *
 * The hook flattens canvas-rendered clips into a navigable model without
 * mounting one DOM element per clip. Consumers can use the returned
 * `focusTargetProps` on a single focused element, or wire the navigation and
 * edit commands into their own shortcut system and selected-clip inspector.
 *
 * @param options - Initial active clip and navigation behavior options.
 * @returns Active clip metadata, flattened clip list, navigation commands, edit commands, and optional focus-target props.
 * @template TrackKind - App-defined track kind values carried by navigable
 * clips.
 *
 * @example
 * ```tsx
 * import { useTimelineClipNavigation } from '#react/hooks';
 *
 * export function CanvasClipNavigator() {
 *   const clipNavigation = useTimelineClipNavigation({ selectOnNavigate: true });
 *
 *   return (
 *     <div {...clipNavigation.focusTargetProps}>
 *       <p>{clipNavigation.activeClipStatus}</p>
 *       <button type="button" onClick={() => clipNavigation.navigatePrevious()}>
 *         Previous clip
 *       </button>
 *       <button type="button" onClick={() => clipNavigation.navigateNext()}>
 *         Next clip
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 *
 * @see {@link TimelineNavigableClip}
 * @see {@link https://canvastimeline.com/docs/react-hooks | React editor hooks}
 */
export function useTimelineClipNavigation<TrackKind = string>(
  options: TimelineClipNavigationOptions<TrackKind> = {}
) {
  const {
    getClipAriaDescription,
    getClipAriaLabel,
    initialClipId,
    selectOnNavigate = false,
    wrap = true,
  } = options;
  const { engine, state } = useTimeline();
  const { clips: clipEntries, selectedClipId } = useTimelineClips<TrackKind>();
  const { moveClip, trimClip } = useTimelineEditCommands();
  const { prepareSnapping, settle } = useTimelineSnapping();
  const clips = useMemo(
    () => buildNavigableClips(clipEntries, getClipAriaLabel, getClipAriaDescription),
    [clipEntries, getClipAriaDescription, getClipAriaLabel]
  );

  const [requestedActiveClipId, setRequestedActiveClipId] = useState<string | null>(
    initialClipId ?? selectedClipId ?? clips[0]?.clip.id ?? null
  );
  const [isFocusTargetFocused, setIsFocusTargetFocused] = useState(false);

  const activeClipId = useMemo(
    () =>
      requestedActiveClipId &&
      clips.some((candidate) => candidate.clip.id === requestedActiveClipId)
        ? requestedActiveClipId
        : (selectedClipId ?? clips[0]?.clip.id ?? null),
    [clips, requestedActiveClipId, selectedClipId]
  );

  const activeClip = useMemo(
    () => clips.find((candidate) => candidate.clip.id === activeClipId) ?? null,
    [activeClipId, clips]
  );

  const setActiveClip = useCallback(
    (clipId: string | null) => {
      setRequestedActiveClipId(clipId);
      if (selectOnNavigate) {
        engine.selectClip(clipId);
      }
    },
    [engine, selectOnNavigate]
  );

  const navigateBy = useCallback(
    (delta: number) => {
      if (clips.length === 0) {
        setActiveClip(null);
        return null;
      }

      const currentIndex = Math.max(
        0,
        activeClip ? clips.findIndex((candidate) => candidate.clip.id === activeClip.clip.id) : 0
      );
      let nextIndex = currentIndex + delta;

      if (wrap) {
        nextIndex = (nextIndex + clips.length) % clips.length;
      } else {
        nextIndex = Math.max(0, Math.min(clips.length - 1, nextIndex));
      }

      const next = clips[nextIndex] ?? null;
      setActiveClip(next?.clip.id ?? null);
      return next;
    },
    [activeClip, clips, setActiveClip, wrap]
  );

  const navigateToTrack = useCallback(
    (delta: number) => {
      if (!activeClip) {
        return navigateBy(delta > 0 ? 1 : -1);
      }

      const nextTrackIndex = activeClip.trackIndex + delta;
      const nextTrack = (state.tracks as Track<TrackKind>[])[nextTrackIndex];
      if (!nextTrack || nextTrack.clips.length === 0) {
        return activeClip;
      }

      const nextClip = nextTrack.clips[Math.min(activeClip.clipIndex, nextTrack.clips.length - 1)];
      setActiveClip(nextClip.id);
      return clips.find((candidate) => candidate.clip.id === nextClip.id) ?? null;
    },
    [activeClip, clips, navigateBy, setActiveClip, state.tracks]
  );

  const navigateToFirst = useCallback(() => {
    const next = clips[0] ?? null;
    setActiveClip(next?.clip.id ?? null);
    return next;
  }, [clips, setActiveClip]);

  const navigateToLast = useCallback(() => {
    const next = clips[clips.length - 1] ?? null;
    setActiveClip(next?.clip.id ?? null);
    return next;
  }, [clips, setActiveClip]);

  const selectActiveClip = useCallback(() => {
    engine.selectClip(activeClip?.clip.id ?? null);
  }, [activeClip, engine]);

  const moveActiveClipBy = useCallback(
    (deltaSeconds: number) => {
      if (!activeClip?.canMove) {
        return timelineCommandFail('locked');
      }
      const found = engine.getClip(activeClip.clip.id);
      if (!found) {
        return timelineCommandFail('not-found');
      }
      prepareSnapping(found.clip.id);
      const result = moveClip({
        clipId: found.clip.id,
        startTime: addRational(
          found.clip.timelineStart,
          fromSeconds(deltaSeconds, found.clip.timelineStart.r)
        ),
      });
      if (result.ok) {
        settle();
      }
      return result;
    },
    [activeClip, engine, moveClip, prepareSnapping, settle]
  );

  const moveActiveClipToTrack = useCallback(
    (deltaTrackIndex: number) => {
      if (!activeClip?.canMove) {
        return timelineCommandFail('locked');
      }
      const found = engine.getClip(activeClip.clip.id);
      if (!found) {
        return timelineCommandFail('not-found');
      }

      const nextTrack = (state.tracks as Track<TrackKind>[])[found.trackIndex + deltaTrackIndex];
      if (!nextTrack) {
        return timelineCommandFail('invalid-track');
      }

      prepareSnapping(found.clip.id);
      const result = moveClip({
        clipId: found.clip.id,
        startTime: found.clip.timelineStart,
        targetTrackId: nextTrack.id,
      });
      if (result.ok) {
        settle();
      }
      return result;
    },
    [activeClip, engine, moveClip, prepareSnapping, settle, state.tracks]
  );

  const trimActiveClipBy = useCallback(
    (edge: 'start' | 'end', deltaSeconds: number) => {
      if (!activeClip?.canTrim) {
        return timelineCommandFail('locked');
      }
      const found = engine.getClip(activeClip.clip.id);
      if (!found) {
        return timelineCommandFail('not-found');
      }
      const currentTime = edge === 'start' ? found.clip.timelineStart : found.clip.timelineEnd;
      prepareSnapping(found.clip.id);
      const result = trimClip({
        clipId: found.clip.id,
        edge,
        newTime: addRational(currentTime, fromSeconds(deltaSeconds, currentTime.r)),
      });
      if (result.ok) {
        settle();
      }
      return result;
    },
    [activeClip, engine, prepareSnapping, settle, trimClip]
  );

  const activeClipStatusText = useMemo(
    () => getActiveClipStatus(activeClip, clips.length),
    [activeClip, clips.length]
  );

  const getFocusTargetProps = useCallback(
    <T extends HTMLElement>(props: React.HTMLAttributes<T> = {}): React.HTMLAttributes<T> => ({
      ...props,
      role: props.role ?? 'group',
      'aria-roledescription': props['aria-roledescription'] ?? 'timeline clip navigator',
      tabIndex: props.tabIndex ?? 0,
      'aria-label': props['aria-label'] ?? activeClipStatusText,
      'aria-description': props['aria-description'] ?? activeClip?.description,
      onFocus: (event) => {
        props.onFocus?.(event);
        setIsFocusTargetFocused(true);
      },
      onBlur: (event) => {
        props.onBlur?.(event);
        setIsFocusTargetFocused(false);
      },
      onKeyDown: (event) => {
        props.onKeyDown?.(event);
        if (event.defaultPrevented) {
          return;
        }

        setIsFocusTargetFocused(true);

        switch (event.key) {
          case 'ArrowRight':
            event.preventDefault();
            navigateBy(1);
            break;
          case 'ArrowLeft':
            event.preventDefault();
            navigateBy(-1);
            break;
          case 'ArrowDown':
            event.preventDefault();
            navigateToTrack(1);
            break;
          case 'ArrowUp':
            event.preventDefault();
            navigateToTrack(-1);
            break;
          case 'Home':
            event.preventDefault();
            navigateToFirst();
            break;
          case 'End':
            event.preventDefault();
            navigateToLast();
            break;
          case 'Enter':
          case ' ':
            event.preventDefault();
            selectActiveClip();
            break;
          default:
            break;
        }
      },
    }),
    [
      activeClip,
      activeClipStatusText,
      navigateBy,
      navigateToFirst,
      navigateToLast,
      navigateToTrack,
      selectActiveClip,
    ]
  );

  const focusTargetProps = useMemo(() => getFocusTargetProps(), [getFocusTargetProps]);

  return useMemo(
    () => ({
      /** Metadata for the active navigable clip, or `null` when no clips exist. */
      activeClip,
      /** Clip id for the active navigable clip. */
      activeClipId,
      /** Flattened list of canvas clips with accessibility metadata. */
      clips,
      /** Number of navigable clips. */
      clipCount: clips.length,
      /** Sets the active clip id and optionally selects it in the engine. */
      setActiveClip,
      /** Moves active navigation by a flattened clip delta. */
      navigateBy,
      /** Moves active navigation vertically between tracks. */
      navigateToTrack,
      /** Moves active navigation to the first clip in timeline order. */
      navigateToFirst,
      /** Moves active navigation to the last clip in timeline order. */
      navigateToLast,
      /** Selects the active clip in the timeline engine. */
      selectActiveClip,
      /** Moves the active clip by a relative number of seconds and returns the command result. */
      moveActiveClipBy,
      /** Moves the active clip vertically by a relative track delta and returns the command result. */
      moveActiveClipToTrack,
      /** Trims one edge of the active clip by a relative number of seconds and returns the command result. */
      trimActiveClipBy,
      /** Builds props for a single focusable clip-navigation target. */
      getFocusTargetProps,
      /** Whether the returned focus target currently contains focus. */
      isFocusTargetFocused,
      /** Active clip summary suitable for an accessible label or live status. */
      activeClipStatusText,
      /** Default props for a single focusable clip-navigation target. */
      focusTargetProps,
    }),
    [
      activeClip,
      activeClipId,
      activeClipStatusText,
      clips,
      focusTargetProps,
      getFocusTargetProps,
      isFocusTargetFocused,
      moveActiveClipBy,
      moveActiveClipToTrack,
      navigateBy,
      navigateToFirst,
      navigateToLast,
      navigateToTrack,
      selectActiveClip,
      setActiveClip,
      trimActiveClipBy,
    ]
  );
}
