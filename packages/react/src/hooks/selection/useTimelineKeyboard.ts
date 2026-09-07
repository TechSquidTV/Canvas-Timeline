import type {
  TimelineKeyboardCommand,
  TimelineKeyboardPlatform,
  TimelineKeyBinding,
  TimelineKeyboardBindings,
  TimelineKeyboardEventLike,
  TimelineKeyboardBindingOptions,
  TimelineKeyboardCommandResult,
  TimelineKeyboardOptions,
  UseTimelineKeyboardResult,
} from '#react/hooks/selection/timelineKeyboardModel';
import { useTimelineEngine } from '#react/hooks/core/useTimelineEngine';
import { createTimelinePlaybackCommands } from '#react/hooks/playback/createTimelinePlaybackCommands';
import { createTimelineMarkersCommands } from '#react/hooks/markers/createTimelineMarkersCommands';
import { runTimelineCommand } from '#react/hooks/core/runTimelineCommand';
import { timelineCommandFail, timelineCommandOk } from '@techsquidtv/canvas-timeline-core';
import { resolveTimecodeFrameRate } from '@techsquidtv/canvas-timeline-utils';
import type { TimecodeFrameRate } from '@techsquidtv/canvas-timeline-utils';
import React, { useCallback, useMemo } from 'react';
const timelineKeyboardCommandOrder = [
  'togglePlayback',
  'stepBackward',
  'stepForward',
  'setInPoint',
  'setOutPoint',
  'clearInOutPoints',
  'addMarker',
  'seekToNextMarker',
  'seekToPreviousMarker',
  'toggleSnapping',
  'zoomIn',
  'zoomOut',
] as const satisfies readonly TimelineKeyboardCommand[];

/** Minimal keyboard preset: playback only. */
export const minimalTimelineKeyboardBindings = {
  /** Toggle timeline playback with the spacebar. */
  togglePlayback: [{ key: 'Space' }],
} as const satisfies TimelineKeyboardBindings;

/** Professional editor preset bindings that do not depend on frame rate or platform. */
export const professionalEditorTimelineKeyboardBindings = {
  /** Toggle timeline playback with the spacebar. */
  togglePlayback: [{ key: 'Space' }],
  /** Mark the current playhead time as the In point. */
  setInPoint: [{ key: 'I' }],
  /** Mark the current playhead time as the Out point. */
  setOutPoint: [{ key: 'O' }],
  /** Add a marker at the current playhead time. */
  addMarker: [{ key: 'M' }],
  /** Jump to the next marker. */
  seekToNextMarker: [{ key: 'M', shiftKey: true }],
  /** Toggle magnetic snapping. */
  toggleSnapping: [{ key: 'S' }],
  /** Zoom the timeline viewport in. */
  zoomIn: [{ key: '=' }],
  /** Zoom the timeline viewport out. */
  zoomOut: [{ key: '-' }],
} as const satisfies TimelineKeyboardBindings;

function normalizeKey(key: string) {
  if (key === 'Space' || key === 'Spacebar') {
    return ' ';
  }

  return key.length === 1 ? key.toLowerCase() : key;
}

function bindingMatchesEvent(binding: TimelineKeyBinding, event: TimelineKeyboardEventLike) {
  return (
    normalizeKey(binding.key) === normalizeKey(event.key) &&
    Boolean(binding.altKey) === Boolean(event.altKey) &&
    Boolean(binding.ctrlKey) === Boolean(event.ctrlKey) &&
    Boolean(binding.metaKey) === Boolean(event.metaKey) &&
    Boolean(binding.shiftKey) === Boolean(event.shiftKey)
  );
}

function getCurrentKeyboardPlatform(): TimelineKeyboardPlatform {
  if (typeof navigator === 'undefined') {
    return 'other';
  }

  const platform = navigator.platform.toLowerCase();
  if (platform.includes('mac') || platform.includes('iphone') || platform.includes('ipad')) {
    return 'mac';
  }
  if (platform.includes('win')) {
    return 'windows';
  }
  if (platform.includes('linux')) {
    return 'linux';
  }

  return 'other';
}

function getPlatformBindings(platform: TimelineKeyboardPlatform): TimelineKeyboardBindings {
  if (platform === 'mac') {
    return {
      clearInOutPoints: [{ key: 'X', altKey: true }],
      seekToPreviousMarker: [{ key: 'M', metaKey: true, shiftKey: true }],
    };
  }

  return {
    clearInOutPoints: [{ key: 'X', ctrlKey: true, shiftKey: true }],
    seekToPreviousMarker: [{ key: 'M', ctrlKey: true, shiftKey: true }],
  };
}

function hasFrameRate(frameRate: TimecodeFrameRate | undefined) {
  return frameRate !== undefined;
}

/**
 * Creates the built-in keyboard binding map for a preset.
 *
 * @param options - Preset, frame rate, and platform used to derive bindings.
 * @returns Shortcut bindings for the requested preset.
 */
export function createTimelineKeyboardBindings(
  options: TimelineKeyboardBindingOptions = {}
): TimelineKeyboardBindings {
  const preset = options.preset ?? 'professionalEditor';

  if (preset === 'minimal') {
    return minimalTimelineKeyboardBindings;
  }

  return {
    ...professionalEditorTimelineKeyboardBindings,
    ...(hasFrameRate(options.frameRate)
      ? {
          stepBackward: [{ key: 'ArrowLeft' }],
          stepForward: [{ key: 'ArrowRight' }],
        }
      : {}),
    ...getPlatformBindings(options.platform ?? getCurrentKeyboardPlatform()),
  };
}

/**
 * Resolves a keyboard event to the first matching command in stable command order.
 *
 * @param event - Keyboard event fields to match.
 * @param bindings - Command bindings to search.
 * @returns The matched command, or `null` when no binding applies.
 */
export function getTimelineKeyboardCommand(
  event: TimelineKeyboardEventLike,
  bindings: TimelineKeyboardBindings
): TimelineKeyboardCommand | null {
  if (event.key === 'Tab') {
    return null;
  }

  for (const command of timelineKeyboardCommandOrder) {
    const commandBindings = bindings[command];
    if (commandBindings?.some((binding) => bindingMatchesEvent(binding, event))) {
      return command;
    }
  }

  return null;
}

function isElementTarget(target: EventTarget | null): target is Element {
  return typeof Element !== 'undefined' && target instanceof Element;
}

const timelineKeyboardIgnoredRoleSelectors = [
  'button',
  'checkbox',
  'combobox',
  'listbox',
  'menuitem',
  'option',
  'radio',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
] as const;

const timelineKeyboardIgnoredSelector = [
  'input',
  'textarea',
  'select',
  'button',
  'a[href]',
  '[contenteditable]:not([contenteditable="false"])',
  '[data-timeline-keyboard-ignore]',
  ...timelineKeyboardIgnoredRoleSelectors.map((role) => `[role~="${role}"]`),
].join(',');

function isTimelineKeyboardIgnoredTarget(target: EventTarget | null) {
  if (!isElementTarget(target)) {
    return false;
  }

  return Boolean(target.closest(timelineKeyboardIgnoredSelector));
}

function scopeContainsActiveElement(scope: HTMLElement) {
  const activeElement = scope.ownerDocument.activeElement;
  return activeElement !== null && scope.contains(activeElement);
}

/**
 * Provides focus-scoped timeline keyboard shortcuts.
 *
 * The hook never installs global listeners. It handles shortcuts only from the
 * element that spreads `scopeProps` or one of that element's descendants.
 * Commands read current engine state without subscribing to document or viewport updates.
 * Use `commandHandlers.togglePlayback` to compose media-aware transport.
 *
 * @example
 * ```tsx
 * const keyboard = useTimelineKeyboard({
 *   commandHandlers: { togglePlayback: () => media.playing ? media.pause() : media.play() },
 * });
 * return <div {...keyboard.scopeProps}>Timeline surface</div>;
 * ```
 *
 * @param options - Keyboard preset, custom bindings, frame rate, and event handling options.
 * @returns Current bindings, scope props, a shortcut matcher, and a command executor.
 */
export function useTimelineKeyboard(
  options: TimelineKeyboardOptions = {}
): UseTimelineKeyboardResult {
  const {
    bindings: optionBindings,
    commandHandlers,
    onCommandResult,
    onCommandError,
    disabled = false,
    frameRate,
    frameStepCount = 1,
    label,
    platform,
    preset = 'professionalEditor',
    preventDefault = true,
    stopPropagation = false,
    zoomStepRatio = 1.2,
  } = options;
  const engine = useTimelineEngine();
  const playback = useMemo(() => createTimelinePlaybackCommands(engine), [engine]);
  const markers = useMemo(() => createTimelineMarkersCommands(engine), [engine]);

  const bindings = useMemo(
    () =>
      optionBindings === false
        ? {}
        : (optionBindings ??
          createTimelineKeyboardBindings({
            frameRate,
            platform,
            preset,
          })),
    [frameRate, optionBindings, platform, preset]
  );

  const getCommandForEvent = useCallback(
    (event: TimelineKeyboardEventLike) => getTimelineKeyboardCommand(event, bindings),
    [bindings]
  );

  const stepByFrames = useCallback(
    (direction: -1 | 1) =>
      runTimelineCommand(() => {
        if (frameRate === undefined) {
          return timelineCommandFail('unsupported', 'A frame rate is required for frame stepping.');
        }
        if (!Number.isSafeInteger(frameStepCount) || frameStepCount < 1) {
          return timelineCommandFail('invalid-input', 'frameStepCount must be a positive integer.');
        }
        const amountSeconds = frameStepCount / resolveTimecodeFrameRate(frameRate);
        return direction > 0
          ? playback.stepForward(amountSeconds)
          : playback.stepBackward(amountSeconds);
      }),
    [frameRate, frameStepCount, playback]
  );

  const executeCommand = useCallback(
    (
      command: TimelineKeyboardCommand
    ): TimelineKeyboardCommandResult | Promise<TimelineKeyboardCommandResult> => {
      const handler = commandHandlers?.[command];
      if (handler) {
        return handler();
      }
      switch (command) {
        case 'togglePlayback':
          return playback.togglePlayback();
        case 'stepBackward':
          return stepByFrames(-1);
        case 'stepForward':
          return stepByFrames(1);
        case 'setInPoint':
          return playback.setInPoint();
        case 'setOutPoint':
          return playback.setOutPoint();
        case 'clearInOutPoints':
          return playback.clearInOutPoints();
        case 'addMarker':
          return markers.addMarkerAtPlayhead();
        case 'seekToNextMarker':
          return markers.seekToNextMarker();
        case 'seekToPreviousMarker':
          return markers.seekToPreviousMarker();
        case 'toggleSnapping':
          return runTimelineCommand(() => {
            engine.setSnappingEnabled(!engine.getState().snapEnabled);
            return timelineCommandOk();
          });
        case 'zoomIn':
        case 'zoomOut':
          return runTimelineCommand(() => {
            if (!Number.isFinite(zoomStepRatio) || zoomStepRatio <= 0) {
              return timelineCommandFail(
                'invalid-input',
                'zoomStepRatio must be positive and finite.'
              );
            }
            engine.setZoomScale(
              command === 'zoomIn'
                ? engine.zoomScale * zoomStepRatio
                : engine.zoomScale / zoomStepRatio
            );
            engine.settle();
            return timelineCommandOk();
          });
      }
    },
    [commandHandlers, engine, markers, playback, stepByFrames, zoomStepRatio]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        disabled ||
        optionBindings === false ||
        event.defaultPrevented ||
        event.key === 'Tab' ||
        !scopeContainsActiveElement(event.currentTarget) ||
        isTimelineKeyboardIgnoredTarget(event.target)
      ) {
        return;
      }

      const command = getCommandForEvent(event);
      if (command === null) {
        return;
      }

      if (preventDefault) {
        event.preventDefault();
      }
      if (stopPropagation) {
        event.stopPropagation();
      }

      if (command === 'togglePlayback' && event.repeat) {
        return;
      }

      const reportFailure = (cause: unknown) => {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        if (onCommandError) {
          onCommandError(error, command);
        } else if (typeof globalThis.reportError === 'function') {
          globalThis.reportError(error);
        } else {
          console.error(error);
        }
      };
      try {
        void Promise.resolve(executeCommand(command))
          .then((result) => onCommandResult?.(command, result))
          .catch(reportFailure);
      } catch (cause) {
        reportFailure(cause);
      }
    },
    [
      disabled,
      executeCommand,
      getCommandForEvent,
      onCommandResult,
      onCommandError,
      optionBindings,
      preventDefault,
      stopPropagation,
    ]
  );

  const scopeProps = useMemo<React.HTMLAttributes<HTMLDivElement>>(
    () => ({
      role: 'group',
      tabIndex: disabled ? undefined : 0,
      'aria-label': label ?? 'Timeline keyboard shortcuts',
      onKeyDown: handleKeyDown,
    }),
    [disabled, handleKeyDown, label]
  );

  return useMemo(
    () => ({
      bindings,
      scopeProps,
      getCommandForEvent,
      executeCommand,
    }),
    [bindings, getCommandForEvent, scopeProps, executeCommand]
  );
}
