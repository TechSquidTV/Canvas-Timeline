import {
  formatTimecode,
  fromSeconds,
  parseTimecode,
  toSeconds,
  type RationalTime,
  type TimecodeFormatOptions,
  type TimecodeParseOptions,
} from '@techsquidtv/canvas-timeline-utils';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { TimecodeInput, type TimecodeInputProps } from '../timecodeInput';

/**
 * Reason a `TimecodeField` committed the current draft text.
 */
export type TimecodeFieldCommitReason = 'enter' | 'blur';

/**
 * Details passed when a `TimecodeField` commits a valid value.
 */
export interface TimecodeFieldCommitDetails {
  /** Parsed seconds from the committed draft text. */
  seconds: number;
  /** Parsed time converted to `RationalTime` at the field's configured timebase. */
  time: RationalTime;
  /** User-entered text that produced the committed value. */
  text: string;
  /** Interaction that committed the value. */
  reason: TimecodeFieldCommitReason;
}

/**
 * Props for the compact inline timecode editing root.
 */
export interface TimecodeFieldRootProps extends Omit<
  React.HTMLAttributes<HTMLSpanElement>,
  'children' | 'onChange'
> {
  /** Current field value as seconds or `RationalTime`. */
  value: number | RationalTime;
  /** Duration used to size fixed-width display slots. Defaults to the current value. */
  duration?: number | RationalTime;
  /** Human-readable name used for default trigger and input labels. */
  ariaLabel: string;
  /** Called when the user commits valid timecode text. */
  onCommit: (seconds: number, details: TimecodeFieldCommitDetails) => void | Promise<void>;
  /** Optional label used in trigger accessibility text instead of the formatted value. */
  valueLabel?: string;
  /** Formatting options used for the trigger text and draft value when editing starts. */
  formatOptions?: TimecodeFormatOptions;
  /** Parsing options used for draft validation and commit. */
  parseOptions?: TimecodeParseOptions;
  /** Tick rate used for `details.time`. Defaults to the value rate, or `60000` for seconds. */
  timebase?: number;
  /** Disables trigger activation and cancels active editing when true. */
  disabled?: boolean;
  /** Controlled editing state. */
  editing?: boolean;
  /** Initial editing state when uncontrolled. */
  defaultEditing?: boolean;
  /** Called when the field requests an editing state change. */
  onEditingChange?: (editing: boolean) => void;
  /** Field parts. Defaults to the compact trigger plus the temporary editing input. */
  children?: React.ReactNode;
}

/**
 * Props for the compact displayed timecode value.
 */
export interface TimecodeFieldTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Custom display content. Defaults to the formatted timecode value. */
  children?: React.ReactNode;
}

/**
 * Props for the temporary typed timecode editor.
 */
export interface TimecodeFieldInputProps extends Omit<
  TimecodeInputProps,
  'className' | 'defaultValue' | 'invalid' | 'onValueChange' | 'value'
> {
  /** Adds design-system classes to the active input. */
  className?: string;
  /** Called with draft text as the user types, after internal state updates. */
  onValueChange?: TimecodeInputProps['onValueChange'];
}

interface TimecodeFieldContextValue {
  accessibleValue: string;
  ariaLabel: string;
  describedBy: string;
  disabled: boolean;
  displaySegments: TimecodeFieldDisplaySegment[];
  draftValue: string;
  editing: boolean;
  errorId: string;
  formattedValue: string;
  hintId: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  invalid: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  cancelEditing: (options: { restoreFocus: boolean }) => void;
  commitDraft: (options: {
    cancelOnInvalid: boolean;
    reason: TimecodeFieldCommitReason;
    restoreFocus: boolean;
  }) => void;
  setDraftValue: (value: string) => void;
  setInvalid: (invalid: boolean) => void;
  startEditing: () => void;
}

const TimecodeFieldContext = createContext<TimecodeFieldContextValue | null>(null);

type TimecodeFieldDisplaySegment =
  | {
      part: 'hours' | 'minutes' | 'seconds' | 'centiseconds' | 'frames';
      text: string;
      widthCh: number;
    }
  | {
      part: 'separator';
      text: string;
    };

type TimecodeFieldSegmentStyle = React.CSSProperties & {
  '--timecode-field-segment-width'?: string;
};

function useTimecodeFieldContext() {
  const context = useContext(TimecodeFieldContext);
  if (!context) {
    throw new Error('TimecodeField parts must be used within TimecodeField.Root');
  }

  return context;
}

function isRationalTime(value: number | RationalTime): value is RationalTime {
  return typeof value === 'object' && value !== null && 'v' in value && 'r' in value;
}

function getValueSeconds(value: number | RationalTime) {
  return isRationalTime(value) ? toSeconds(value) : value;
}

function getSafeSlotSeconds(seconds: number) {
  return Math.max(0, Number.isFinite(seconds) ? seconds : 0);
}

function getDigitCount(value: number) {
  return Math.max(1, Math.floor(Math.max(0, value)).toString().length);
}

function getTimecodeFieldDisplaySegments(
  formattedValue: string,
  durationSeconds: number
): TimecodeFieldDisplaySegment[] {
  const safeDurationSeconds = getSafeSlotSeconds(durationSeconds);
  const frameMatch = /^(\d+):(\d{2}):(\d{2})([:;])(\d+)$/.exec(formattedValue);

  if (frameMatch) {
    const [, hours, minutes, seconds, separator, frames] = frameMatch;
    const durationHoursWidth = getDigitCount(Math.floor(safeDurationSeconds / 3600));

    return [
      { part: 'hours', text: hours, widthCh: Math.max(hours.length, durationHoursWidth) },
      { part: 'separator', text: ':' },
      { part: 'minutes', text: minutes, widthCh: Math.max(minutes.length, 2) },
      { part: 'separator', text: ':' },
      { part: 'seconds', text: seconds, widthCh: 2 },
      { part: 'separator', text: separator },
      { part: 'frames', text: frames, widthCh: frames.length },
    ];
  }

  const decimalMatch = /^(.+)\.(\d{2})$/.exec(formattedValue);
  if (!decimalMatch) {
    return [{ part: 'seconds', text: formattedValue, widthCh: Math.max(2, formattedValue.length) }];
  }

  const [, clockText, centiseconds] = decimalMatch;
  const clockParts = clockText.split(':');

  if (clockParts.length === 3) {
    const [hours, minutes, seconds] = clockParts;
    const durationHoursWidth = getDigitCount(Math.floor(safeDurationSeconds / 3600));

    return [
      { part: 'hours', text: hours, widthCh: Math.max(hours.length, durationHoursWidth) },
      { part: 'separator', text: ':' },
      { part: 'minutes', text: minutes, widthCh: Math.max(minutes.length, 2) },
      { part: 'separator', text: ':' },
      { part: 'seconds', text: seconds, widthCh: 2 },
      { part: 'separator', text: '.' },
      { part: 'centiseconds', text: centiseconds, widthCh: 2 },
    ];
  }

  if (clockParts.length === 2) {
    const [minutes, seconds] = clockParts;
    const durationMinutesWidth = getDigitCount(Math.floor(safeDurationSeconds / 60));

    return [
      { part: 'minutes', text: minutes, widthCh: Math.max(minutes.length, durationMinutesWidth) },
      { part: 'separator', text: ':' },
      { part: 'seconds', text: seconds, widthCh: 2 },
      { part: 'separator', text: '.' },
      { part: 'centiseconds', text: centiseconds, widthCh: 2 },
    ];
  }

  const [seconds] = clockParts;
  const durationSecondsWidth = getDigitCount(Math.floor(safeDurationSeconds));

  return [
    { part: 'seconds', text: seconds, widthCh: Math.max(seconds.length, durationSecondsWidth, 2) },
    { part: 'separator', text: '.' },
    { part: 'centiseconds', text: centiseconds, widthCh: 2 },
  ];
}

function mergeClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

function setRef<T>(ref: React.ForwardedRef<T> | undefined, value: T | null) {
  if (!ref) {
    return;
  }

  if (typeof ref === 'function') {
    ref(value);
    return;
  }

  ref.current = value;
}

function useComposedRef<T>(
  internalRef: React.RefObject<T | null>,
  externalRef: React.ForwardedRef<T>
) {
  return useCallback(
    (value: T | null) => {
      internalRef.current = value;
      setRef(externalRef, value);
    },
    [externalRef, internalRef]
  );
}

function getEffectiveParseOptions(
  formatOptions: TimecodeFormatOptions | undefined,
  parseOptions: TimecodeParseOptions | undefined
): TimecodeParseOptions {
  return {
    frameRate: formatOptions?.frameRate,
    dropFrame: formatOptions?.format === 'drop-frame' ? true : formatOptions?.dropFrame,
    ...parseOptions,
  };
}

function TimecodeFieldFormattedValue({ segments }: { segments: TimecodeFieldDisplaySegment[] }) {
  const segmentCounts = new Map<string, number>();

  return (
    <>
      {segments.map((segment) => {
        const segmentIdentity =
          segment.part === 'separator'
            ? `${segment.part}-${segment.text}`
            : `${segment.part}-${segment.text}-${segment.widthCh}`;
        const segmentCount = segmentCounts.get(segmentIdentity) ?? 0;
        segmentCounts.set(segmentIdentity, segmentCount + 1);
        const segmentKey = `${segmentIdentity}-${segmentCount}`;

        if (segment.part === 'separator') {
          return (
            <span
              key={segmentKey}
              className="timecode-field-separator"
              data-timecode-part={segment.part}
            >
              {segment.text}
            </span>
          );
        }

        return (
          <span
            key={segmentKey}
            className="timecode-field-segment"
            data-timecode-part={segment.part}
            style={
              {
                '--timecode-field-segment-width': `${segment.widthCh}ch`,
              } as TimecodeFieldSegmentStyle
            }
          >
            {segment.text}
          </span>
        );
      })}
    </>
  );
}

/**
 * Compact displayed value for `TimecodeField`.
 *
 * Renders while the field is not editing so dense timeline chrome can read like
 * text instead of a form. Clicking it starts editing unless the field or trigger
 * is disabled.
 *
 * @param props - Native button props and optional custom trigger content.
 * @returns A button that opens the temporary inline timecode input.
 */
export const TimecodeFieldTrigger = React.forwardRef<HTMLButtonElement, TimecodeFieldTriggerProps>(
  (
    {
      'aria-label': ariaLabel,
      children,
      className = '',
      disabled,
      onClick,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const context = useTimecodeFieldContext();
    const triggerRef = useComposedRef(context.triggerRef, ref);
    const triggerDisabled = disabled ?? context.disabled;

    if (context.editing) {
      return null;
    }

    return (
      <button
        ref={triggerRef}
        {...props}
        aria-label={
          ariaLabel ??
          (triggerDisabled
            ? `${context.ariaLabel}: ${context.accessibleValue}`
            : `Edit ${context.ariaLabel}: ${context.accessibleValue}`)
        }
        className={mergeClassNames('timecode-field-trigger', className)}
        data-slot="timecode-field-trigger"
        disabled={triggerDisabled}
        onClick={(event) => {
          onClick?.(event);

          if (!event.defaultPrevented && !triggerDisabled) {
            context.startEditing();
          }
        }}
        type={type}
      >
        {children ?? <TimecodeFieldFormattedValue segments={context.displaySegments} />}
      </button>
    );
  }
);

TimecodeFieldTrigger.displayName = 'TimecodeField.Trigger';

/**
 * Temporary typed editor for `TimecodeField`.
 *
 * Renders only while the field is editing. Enter commits valid text, Escape
 * cancels, and blur commits valid text or cancels invalid text.
 *
 * @param props - `TimecodeInput` props for the editable control.
 * @returns A `TimecodeInput` plus screen-reader hint and error text.
 */
export const TimecodeFieldInput = React.forwardRef<HTMLInputElement, TimecodeFieldInputProps>(
  (
    {
      'aria-describedby': ariaDescribedBy,
      'aria-errormessage': ariaErrorMessage,
      'aria-label': ariaLabel,
      className = '',
      onBlur,
      onKeyDown,
      onValueChange,
      ...props
    },
    ref
  ) => {
    const context = useTimecodeFieldContext();
    const inputRef = useComposedRef(context.inputRef, ref);
    const describedBy = [context.describedBy, ariaDescribedBy].filter(Boolean).join(' ');

    if (!context.editing) {
      return null;
    }

    return (
      <>
        <TimecodeInput
          ref={inputRef}
          {...props}
          aria-describedby={describedBy || undefined}
          aria-errormessage={ariaErrorMessage ?? (context.invalid ? context.errorId : undefined)}
          aria-label={ariaLabel ?? `Edit ${context.ariaLabel}`}
          className={mergeClassNames('timecode-field-input', className)}
          invalid={context.invalid}
          onBlur={(event) => {
            onBlur?.(event);

            if (!event.defaultPrevented) {
              context.commitDraft({
                cancelOnInvalid: true,
                reason: 'blur',
                restoreFocus: false,
              });
            }
          }}
          onKeyDown={(event) => {
            onKeyDown?.(event);

            if (event.defaultPrevented) {
              return;
            }

            if (event.key === 'Enter') {
              event.preventDefault();
              context.commitDraft({
                cancelOnInvalid: false,
                reason: 'enter',
                restoreFocus: true,
              });
              return;
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              context.cancelEditing({ restoreFocus: true });
            }
          }}
          onValueChange={(value, details) => {
            context.setDraftValue(value);
            context.setInvalid(false);
            onValueChange?.(value, details);
          }}
          value={context.draftValue}
        />
        <span id={context.hintId} className="timecode-field-sr-only">
          Enter seconds, minutes and seconds, hours minutes and seconds, or frame timecode when
          configured. Press Enter to apply or Escape to cancel.
        </span>
        {context.invalid && (
          <span id={context.errorId} className="timecode-field-sr-only" role="alert">
            Invalid timecode.
          </span>
        )}
      </>
    );
  }
);

TimecodeFieldInput.displayName = 'TimecodeField.Input';

/**
 * Root state manager for compact label-to-input timecode editing.
 *
 * Use `TimecodeField.Root` around `TimecodeField.Trigger` and
 * `TimecodeField.Input` when playhead clocks, clip boundaries, trim controls, or
 * other dense editor chrome should show a stable timecode value until the user
 * chooses to type a precise correction. The root owns draft state, validation,
 * keyboard handling, blur behavior, focus restoration, and width reservation
 * while leaving timeline mutation to your `onCommit` handler.
 *
 * @param props - Inline editing state, value, parser/formatter options, and span props.
 * @returns A span containing the active `TimecodeField` part.
 */
export const TimecodeFieldRoot = React.forwardRef<HTMLSpanElement, TimecodeFieldRootProps>(
  (
    {
      ariaLabel,
      children,
      className = '',
      defaultEditing = false,
      disabled = false,
      duration,
      editing: controlledEditing,
      formatOptions,
      onCommit,
      onEditingChange,
      parseOptions,
      style,
      timebase,
      value,
      valueLabel,
      ...props
    },
    ref
  ) => {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const restoreFocusAfterEditRef = useRef(false);
    const descriptionId = useId();
    const valueSeconds = useMemo(() => getValueSeconds(value), [value]);
    const durationSeconds = useMemo(
      () => (duration === undefined ? valueSeconds : getValueSeconds(duration)),
      [duration, valueSeconds]
    );
    const formattedValue = useMemo(
      () => formatTimecode(valueSeconds, formatOptions),
      [formatOptions, valueSeconds]
    );
    const displaySegments = useMemo(
      () => getTimecodeFieldDisplaySegments(formattedValue, durationSeconds),
      [durationSeconds, formattedValue]
    );
    const commitTimebase = useMemo(
      () => timebase ?? (isRationalTime(value) ? value.r : 60000),
      [timebase, value]
    );
    const [uncontrolledEditing, setUncontrolledEditing] = useState(defaultEditing);
    const editing = useMemo(
      () => controlledEditing ?? uncontrolledEditing,
      [controlledEditing, uncontrolledEditing]
    );
    const [draftValue, setDraftValue] = useState(() =>
      formatTimecode(getValueSeconds(value), formatOptions)
    );
    const [invalid, setInvalid] = useState(false);
    const [reservedWidth, setReservedWidth] = useState<string | undefined>();
    const wasEditingRef = useRef(editing);
    const effectiveParseOptions = useMemo(
      () => getEffectiveParseOptions(formatOptions, parseOptions),
      [formatOptions, parseOptions]
    );

    const setEditing = useCallback(
      (nextEditing: boolean) => {
        if (controlledEditing === undefined) {
          setUncontrolledEditing(nextEditing);
        }

        onEditingChange?.(nextEditing);
      },
      [controlledEditing, onEditingChange]
    );

    useLayoutEffect(() => {
      if (editing) {
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      if (restoreFocusAfterEditRef.current) {
        restoreFocusAfterEditRef.current = false;
        triggerRef.current?.focus();
      }
    }, [editing]);

    useEffect(() => {
      if (editing && !wasEditingRef.current) {
        setDraftValue(formattedValue);
        setInvalid(false);
      }

      wasEditingRef.current = editing;
    }, [editing, formattedValue]);

    useEffect(() => {
      if (disabled && editing) {
        restoreFocusAfterEditRef.current = false;
        const timeoutId = window.setTimeout(() => {
          setInvalid(false);
          setEditing(false);
        }, 0);

        return () => window.clearTimeout(timeoutId);
      }

      return undefined;
    }, [disabled, editing, setEditing]);

    const startEditing = useCallback(() => {
      if (disabled) {
        return;
      }

      const triggerWidth = triggerRef.current?.getBoundingClientRect().width ?? 0;
      setReservedWidth(triggerWidth > 0 ? `${triggerWidth.toFixed(3)}px` : undefined);
      setDraftValue(formattedValue);
      setInvalid(false);
      setEditing(true);
    }, [disabled, formattedValue, setEditing]);

    const cancelEditing = useCallback(
      ({ restoreFocus }: { restoreFocus: boolean }) => {
        restoreFocusAfterEditRef.current = restoreFocus;
        setInvalid(false);
        setEditing(false);
      },
      [setEditing]
    );

    const commitDraft = useCallback(
      ({
        cancelOnInvalid,
        reason,
        restoreFocus,
      }: {
        cancelOnInvalid: boolean;
        reason: TimecodeFieldCommitReason;
        restoreFocus: boolean;
      }) => {
        const parsedSeconds = parseTimecode(draftValue, effectiveParseOptions);

        if (parsedSeconds === null) {
          if (cancelOnInvalid) {
            cancelEditing({ restoreFocus });
            return;
          }

          setInvalid(true);
          return;
        }

        const time = fromSeconds(parsedSeconds, commitTimebase);
        restoreFocusAfterEditRef.current = restoreFocus;
        setInvalid(false);
        setEditing(false);
        void onCommit(parsedSeconds, {
          reason,
          seconds: parsedSeconds,
          text: draftValue,
          time,
        });
      },
      [cancelEditing, commitTimebase, draftValue, effectiveParseOptions, onCommit, setEditing]
    );

    const hintId = useMemo(() => `${descriptionId}-hint`, [descriptionId]);
    const errorId = useMemo(() => `${descriptionId}-error`, [descriptionId]);
    const describedBy = useMemo(
      () => (invalid ? `${hintId} ${errorId}` : hintId),
      [errorId, hintId, invalid]
    );
    const accessibleValue = useMemo(
      () => valueLabel ?? formattedValue,
      [formattedValue, valueLabel]
    );
    const rootStyle = useMemo(
      () =>
        editing && (reservedWidth !== undefined || style?.width !== undefined)
          ? { ...style, width: reservedWidth ?? style?.width }
          : style,
      [editing, reservedWidth, style]
    );
    const context = useMemo<TimecodeFieldContextValue>(
      () => ({
        accessibleValue,
        ariaLabel,
        cancelEditing,
        commitDraft,
        describedBy,
        disabled,
        displaySegments,
        draftValue,
        editing,
        errorId,
        formattedValue,
        hintId,
        inputRef,
        invalid,
        setDraftValue,
        setInvalid,
        startEditing,
        triggerRef,
      }),
      [
        accessibleValue,
        ariaLabel,
        cancelEditing,
        commitDraft,
        describedBy,
        disabled,
        displaySegments,
        draftValue,
        editing,
        errorId,
        formattedValue,
        hintId,
        invalid,
        startEditing,
      ]
    );

    return (
      <TimecodeFieldContext.Provider value={context}>
        <span
          ref={ref}
          {...props}
          className={mergeClassNames('timecode-field', className)}
          data-slot="timecode-field"
          style={rootStyle}
        >
          {children ?? (
            <>
              <TimecodeFieldTrigger />
              <TimecodeFieldInput />
            </>
          )}
        </span>
      </TimecodeFieldContext.Provider>
    );
  }
);

TimecodeFieldRoot.displayName = 'TimecodeField.Root';

/**
 * Compact timecode field parts.
 *
 * `TimecodeField.Root` owns editing state. `TimecodeField.Trigger` renders the
 * compact displayed value, and `TimecodeField.Input` renders the temporary
 * `TimecodeInput` used for typed edits.
 */
// oxlint-disable-next-line react-refresh/only-export-components
export const TimecodeField = {
  /** Root state manager that swaps between compact display and typed editing. */
  Root: TimecodeFieldRoot,
  /** Button that displays the formatted timecode and starts editing on activation. */
  Trigger: TimecodeFieldTrigger,
  /** Temporary `TimecodeInput` rendered while the field is actively editing. */
  Input: TimecodeFieldInput,
};
