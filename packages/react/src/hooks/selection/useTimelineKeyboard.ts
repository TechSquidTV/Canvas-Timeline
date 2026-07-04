import type React from 'react';
import { useCallback, useMemo } from 'react';
import {
  resolveTimecodeFrameRate,
  type TimecodeFrameRate,
} from '@techsquidtv/canvas-timeline-utils';
import { useTimeline } from '../core/useTimeline';
import { useTimelineMarkers } from '../markers/useTimelineMarkers';
import { useTimelinePlayback } from '../playback/useTimelinePlayback';
import { useTimelineSnapping } from '../editing/useTimelineSnapping';
import { useTimelineViewport } from '../viewport/useTimelineViewport';

/** Named shortcut presets for `useTimelineKeyboard`. */
export type TimelineKeyboardPreset = 'professionalEditor' | 'minimal';

/** Timeline command names supported by the keyboard scope. */
export type TimelineKeyboardCommand =
  | 'togglePlayback'
  | 'stepBackward'
  | 'stepForward'
  | 'setInPoint'
  | 'setOutPoint'
  | 'clearInOutPoints'
  | 'addMarker'
  | 'seekToNextMarker'
  | 'seekToPreviousMarker'
  | 'toggleSnapping'
  | 'zoomIn'
  | 'zoomOut';

/** Platform bucket used for platform-specific professional editor bindings. */
export type TimelineKeyboardPlatform = 'mac' | 'windows' | 'linux' | 'other';

/** Single keyboard chord mapped to a timeline command. */
export interface TimelineKeyBinding {
  /** `KeyboardEvent.key` value. Use `Space` or a literal space for the spacebar. */
  key: string;
  /** Whether Alt/Option must be held. Defaults to `false`. */
  altKey?: boolean;
  /** Whether Ctrl must be held. Defaults to `false`. */
  ctrlKey?: boolean;
  /** Whether Meta/Command must be held. Defaults to `false`. */
  metaKey?: boolean;
  /** Whether Shift must be held. Defaults to `false`. */
  shiftKey?: boolean;
}

/** Command-to-bindings map accepted by `useTimelineKeyboard`. */
export type TimelineKeyboardBindings = Partial<
  Record<TimelineKeyboardCommand, readonly TimelineKeyBinding[]>
>;

/** Keyboard-event fields used by the pure shortcut matcher. */
export interface TimelineKeyboardEventLike {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

/** Options for creating preset timeline keyboard bindings. */
export interface TimelineKeyboardBindingOptions {
  /** Preset to create. Defaults to `professionalEditor`. */
  preset?: TimelineKeyboardPreset;
  /** Sequence frame rate. Enables frame-step bindings when supplied. */
  frameRate?: TimecodeFrameRate;
  /** Platform for platform-specific shortcuts. Defaults to the current browser platform. */
  platform?: TimelineKeyboardPlatform;
}

/** Options for `useTimelineKeyboard`. */
export interface TimelineKeyboardOptions {
  /** Preset used when `bindings` is not supplied. Defaults to `professionalEditor`. */
  preset?: TimelineKeyboardPreset;
  /** Platform used for platform-specific preset bindings. Defaults to the current browser platform. */
  platform?: TimelineKeyboardPlatform;
  /** Custom command bindings. Passing `false` disables all shortcut handling. */
  bindings?: TimelineKeyboardBindings | false;
  /** Disables keyboard handling while preserving returned scope props. */
  disabled?: boolean;
  /** Sequence frame rate used for exact frame stepping. */
  frameRate?: TimecodeFrameRate;
  /** Number of frames moved by step commands. Defaults to `1`. */
  frameStepCount?: number;
  /** Multiplicative zoom step used by zoom commands. Defaults to `1.2`. */
  zoomStepRatio?: number;
  /** Prevents browser defaults after a shortcut is claimed. Defaults to `true`. */
  preventDefault?: boolean;
  /** Stops propagation after a shortcut is claimed. Defaults to `false`. */
  stopPropagation?: boolean;
  /** Accessible label for the default scope props. */
  label?: string;
}

/** Result returned by `useTimelineKeyboard`. */
export interface UseTimelineKeyboardResult {
  /** Bindings currently used by the scope. */
  bindings: TimelineKeyboardBindings;
  /** Props for a focus-scoped keyboard shortcut container. */
  scopeProps: React.HTMLAttributes<HTMLDivElement>;
  /** Resolves a keyboard event to a command using the current bindings. */
  getCommandForEvent: (event: TimelineKeyboardEventLike) => TimelineKeyboardCommand | null;
}

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
  togglePlayback: [{ key: 'Space' }],
} as const satisfies TimelineKeyboardBindings;

/** Professional editor preset bindings that do not depend on frame rate or platform. */
export const professionalEditorTimelineKeyboardBindings = {
  togglePlayback: [{ key: 'Space' }],
  setInPoint: [{ key: 'I' }],
  setOutPoint: [{ key: 'O' }],
  addMarker: [{ key: 'M' }],
  seekToNextMarker: [{ key: 'M', shiftKey: true }],
  toggleSnapping: [{ key: 'S' }],
  zoomIn: [{ key: '=' }],
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
 *
 * @param options - Keyboard preset, custom bindings, frame rate, and event handling options.
 * @returns Current bindings, scope props, and a pure shortcut matcher.
 */
export function useTimelineKeyboard(
  options: TimelineKeyboardOptions = {}
): UseTimelineKeyboardResult {
  const {
    bindings: optionBindings,
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
  const { engine } = useTimeline();
  const playback = useTimelinePlayback();
  const markers = useTimelineMarkers();
  const snapping = useTimelineSnapping();
  const viewport = useTimelineViewport();

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
    (direction: -1 | 1) => {
      if (frameRate === undefined) {
        return false;
      }

      const frameRateValue = resolveTimecodeFrameRate(frameRate);
      const amountSeconds = (frameStepCount * direction) / frameRateValue;
      const result =
        direction > 0
          ? playback.stepForward(amountSeconds)
          : playback.stepBackward(Math.abs(amountSeconds));
      return result.ok;
    },
    [frameRate, frameStepCount, playback]
  );

  const executeCommand = useCallback(
    (command: TimelineKeyboardCommand) => {
      switch (command) {
        case 'togglePlayback':
          return playback.togglePlayback().ok;
        case 'stepBackward':
          return stepByFrames(-1);
        case 'stepForward':
          return stepByFrames(1);
        case 'setInPoint':
          return playback.setInPoint().ok;
        case 'setOutPoint':
          return playback.setOutPoint().ok;
        case 'clearInOutPoints':
          return playback.clearInOutPoints().ok;
        case 'addMarker':
          return markers.addMarkerAtPlayhead().ok;
        case 'seekToNextMarker':
          return markers.seekToNextMarker().ok;
        case 'seekToPreviousMarker':
          return markers.seekToPreviousMarker().ok;
        case 'toggleSnapping':
          return snapping.setEnabled(!snapping.enabled).ok;
        case 'zoomIn': {
          const result = viewport.setZoomScale(viewport.zoomScale * zoomStepRatio);
          engine.settle();
          return result.ok;
        }
        case 'zoomOut': {
          const safeZoomStepRatio = Math.max(zoomStepRatio, Number.MIN_VALUE);
          const result = viewport.setZoomScale(viewport.zoomScale / safeZoomStepRatio);
          engine.settle();
          return result.ok;
        }
      }
    },
    [engine, markers, playback, snapping, stepByFrames, viewport, zoomStepRatio]
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

      executeCommand(command);
    },
    [disabled, executeCommand, getCommandForEvent, optionBindings, preventDefault, stopPropagation]
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
    }),
    [bindings, getCommandForEvent, scopeProps]
  );
}
