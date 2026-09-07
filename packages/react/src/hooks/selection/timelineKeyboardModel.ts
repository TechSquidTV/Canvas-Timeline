import type { TimelineCommandResult } from '@techsquidtv/canvas-timeline-core';
import type { TimelineMediaPlayResult } from '#react/hooks/playback/useTimelineMediaSync';
import type { TimecodeFrameRate } from '@techsquidtv/canvas-timeline-utils';
import type React from 'react';
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
  /** `KeyboardEvent.key` value from a browser event or test double. */
  key: string;
  /** Whether Alt/Option was held. */
  altKey?: boolean;
  /** Whether Ctrl was held. */
  ctrlKey?: boolean;
  /** Whether Meta/Command was held. */
  metaKey?: boolean;
  /** Whether Shift was held. */
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

/** Common command status. Payloads stay with the originating command API. */
export type TimelineKeyboardCommandResult =
  | { ok: true }
  | Extract<TimelineCommandResult | TimelineMediaPlayResult, { ok: false }>
  | void;

/** App-owned command handler, including asynchronous media transport. */
export type TimelineKeyboardCommandHandler = () =>
  | TimelineKeyboardCommandResult
  | Promise<TimelineKeyboardCommandResult>;

/** Overrides for individual commands; unspecified commands keep the built-in behavior. */
export type TimelineKeyboardCommandHandlers = Partial<
  Record<TimelineKeyboardCommand, TimelineKeyboardCommandHandler>
>;

/** Options for `useTimelineKeyboard`. */
export interface TimelineKeyboardOptions {
  /** Replaces individual command implementations, such as media-aware playback. */
  commandHandlers?: TimelineKeyboardCommandHandlers;
  /** Receives a command's settled status after a keyboard shortcut invokes it. */
  onCommandResult?: (
    command: TimelineKeyboardCommand,
    result: TimelineKeyboardCommandResult
  ) => void;
  /** Receives unexpected thrown/rejected errors. Defaults to browser error reporting. */
  onCommandError?: (error: Error, command: TimelineKeyboardCommand) => void;
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
  /** Executes an override or built-in command and returns its status; does not claim a keyboard event. */
  executeCommand: (
    command: TimelineKeyboardCommand
  ) => TimelineKeyboardCommandResult | Promise<TimelineKeyboardCommandResult>;
  /** Bindings currently used by the scope. */
  bindings: TimelineKeyboardBindings;
  /** Props for a focus-scoped keyboard shortcut container. */
  scopeProps: React.HTMLAttributes<HTMLDivElement>;
  /** Resolves a keyboard event to a command using the current bindings. */
  getCommandForEvent: (event: TimelineKeyboardEventLike) => TimelineKeyboardCommand | null;
}
