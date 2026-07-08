import { Input as BaseInput } from '@base-ui/react/input';
import React from 'react';

/**
 * Props for the timecode text input primitive.
 *
 * Extends Base UI `Input` props, so controlled and uncontrolled React input
 * patterns both work. Use `onValueChange` for the current text value as the
 * user types, or `onChange` when composing with native form handlers.
 *
 * By default it renders as a plain text input, disables browser autocomplete,
 * and disables spellcheck so punctuation-heavy values such as `1:02:03.04`
 * stay visually stable. Pass explicit native input props when a form needs
 * different behavior.
 */
export interface TimecodeInputProps extends React.ComponentPropsWithoutRef<typeof BaseInput> {
  /**
   * Marks the current input text as invalid when `aria-invalid` is not provided.
   *
   * Prefer this boolean for parser-driven validation state. Pass
   * `aria-invalid` directly only when you need a custom ARIA value such as
   * `'grammar'` or `'spelling'`.
   */
  invalid?: boolean;
}

/**
 * Text input for entering timeline positions as timecode.
 *
 * Use `TimecodeInput` when a toolbar, inspector, or properties panel needs a
 * native text input for clip starts, clip ends, playhead positions, or range
 * boundaries. It keeps flexible entry open to the user (`90`, `1:30.25`,
 * `1:02:03.4567`, and `00:01:30:12` can all represent timeline positions)
 * while the companion helpers parse precise input and format display text
 * consistently.
 *
 * This component renders only the input. Pair it with `parseTimecode` to
 * validate the current text, pass `invalid` when parsing returns `null`, and
 * convert valid seconds back to `RationalTime` with `fromSeconds(parsed, rate)`
 * at your timeline boundary.
 *
 * The rendered input receives `data-slot="timecode-input"` and a
 * `timecode-input` class before consumer classes, which keeps it compatible
 * with shadcn-style slot selectors and Canvas Timeline's semantic stylesheet
 * approach. It forwards refs to the underlying native input element.
 *
 * @param props - Base UI input props plus default text-entry attributes and invalid styling.
 * @returns A text input element configured for timecode entry.
 *
 * @example
 * ```tsx
 * import { useState } from 'react';
 * import { TimecodeInput } from '@techsquidtv/canvas-timeline-react/timecode-input';
 * import { fromSeconds, type RationalTime } from '@techsquidtv/canvas-timeline-utils';
 * import {
 *   type TimecodeFormatOptions,
 *   type TimecodeParseOptions,
 *   formatTimecode,
 *   parseTimecode,
 * } from '@techsquidtv/canvas-timeline-utils/timecode';
 *
 * const formatOptions = [
 *   { value: 'seconds', label: 'Seconds', formatOptions: { format: 'seconds' } },
 *   {
 *     value: 'frames-24',
 *     label: '24 fps',
 *     formatOptions: { format: 'frames', frameRate: 24 },
 *     parseOptions: { frameRate: 24 },
 *   },
 * ] satisfies Array<{
 *   value: string;
 *   label: string;
 *   formatOptions: TimecodeFormatOptions;
 *   parseOptions?: TimecodeParseOptions;
 * }>;
 * const sequenceRate = 24000;
 * const initialSeconds = 3723.04;
 *
 * function ClipStartInput({
 *   onApply,
 * }: {
 *   onApply: (time: RationalTime) => void;
 * }) {
 *   const [formatValue, setFormatValue] = useState('seconds');
 *   const [text, setText] = useState(() =>
 *     formatTimecode(initialSeconds, { format: 'seconds' })
 *   );
 *   const selectedFormat =
 *     formatOptions.find((option) => option.value === formatValue) ?? formatOptions[0];
 *   const parsedSeconds = parseTimecode(text, selectedFormat.parseOptions);
 *
 *   function handleFormatChange(nextFormatValue: string) {
 *     const nextFormat = formatOptions.find((option) => option.value === nextFormatValue);
 *     const nextSeconds = parseTimecode(text, selectedFormat.parseOptions);
 *
 *     if (!nextFormat) {
 *       return;
 *     }
 *
 *     setFormatValue(nextFormat.value);
 *
 *     if (nextSeconds !== null) {
 *       setText(formatTimecode(nextSeconds, nextFormat.formatOptions));
 *     }
 *   }
 *
 *   return (
 *     <form
 *       onSubmit={(event) => {
 *         event.preventDefault();
 *         if (parsedSeconds !== null) {
 *           onApply(fromSeconds(parsedSeconds, sequenceRate));
 *           setText(formatTimecode(parsedSeconds, selectedFormat.formatOptions));
 *         }
 *       }}
 *     >
 *       <TimecodeInput
 *         aria-label="Clip start"
 *         value={text}
 *         invalid={parsedSeconds === null}
 *         onValueChange={setText}
 *       />
 *       <select
 *         aria-label="Timecode format"
 *         value={formatValue}
 *         onChange={(event) => handleFormatChange(event.currentTarget.value)}
 *       >
 *         {formatOptions.map((option) => (
 *           <option key={option.value} value={option.value}>
 *             {parsedSeconds === null
 *               ? option.label
 *               : `${option.label} (${formatTimecode(parsedSeconds, {
 *                   ...option.formatOptions,
 *                 })})`}
 *           </option>
 *         ))}
 *       </select>
 *       <button disabled={parsedSeconds === null} type="submit">
 *         Apply
 *       </button>
 *     </form>
 *   );
 * }
 * ```
 */
export const TimecodeInput = React.forwardRef<HTMLInputElement, TimecodeInputProps>(
  (
    {
      'aria-invalid': ariaInvalid,
      autoComplete = 'off',
      className = '',
      inputMode = 'text',
      invalid = false,
      spellCheck = false,
      type = 'text',
      ...props
    },
    ref
  ) => (
    <BaseInput
      ref={ref as React.ForwardedRef<HTMLElement>}
      {...props}
      aria-invalid={ariaInvalid ?? (invalid ? true : undefined)}
      autoComplete={autoComplete}
      className={['timecode-input', className].filter(Boolean).join(' ')}
      data-slot="timecode-input"
      inputMode={inputMode}
      spellCheck={spellCheck}
      type={type}
    />
  )
);

TimecodeInput.displayName = 'TimecodeInput';
