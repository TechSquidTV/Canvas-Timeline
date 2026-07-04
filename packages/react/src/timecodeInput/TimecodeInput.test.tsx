import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { TimecodeInput, formatTimecodeInput, parseTimecodeInput } from './index';

describe('timecode input helpers', () => {
  it('formats seconds with centisecond precision', () => {
    expect(formatTimecodeInput(7425)).toBe('2:03:45.00');
    expect(formatTimecodeInput(0)).toBe('0:00.00');
    expect(formatTimecodeInput(0.1)).toBe('0:00.10');
    expect(formatTimecodeInput(0.105)).toBe('0:00.11');
    expect(formatTimecodeInput(Number.NaN)).toBe('0:00.00');
    expect(formatTimecodeInput(-1)).toBe('0:00.00');
  });

  it('formats seconds with an explicit output shape', () => {
    expect(formatTimecodeInput(62.5, { format: 'auto' })).toBe('1:02.50');
    expect(formatTimecodeInput(62.5, { format: 'seconds' })).toBe('62.50');
    expect(formatTimecodeInput(62.5, { format: 'minutes' })).toBe('1:02.50');
    expect(formatTimecodeInput(62.5, { format: 'hours' })).toBe('0:01:02.50');
    expect(formatTimecodeInput(3723.04, { format: 'minutes' })).toBe('62:03.04');
  });

  it('formats frame-based timecode through the React helper wrapper', () => {
    expect(formatTimecodeInput(90.5, { frameRate: 24 })).toBe('00:01:30:12');
    expect(
      formatTimecodeInput(1800 / (30000 / 1001), {
        frameRate: { numerator: 30000, denominator: 1001 },
        dropFrame: true,
      })
    ).toBe('00:01:00;02');
  });

  it('parses flexible timecode input', () => {
    expect(parseTimecodeInput('90')).toBe(90);
    expect(parseTimecodeInput('90.5')).toBe(90.5);
    expect(parseTimecodeInput('1:30')).toBe(90);
    expect(parseTimecodeInput('1:30.25')).toBe(90.25);
    expect(parseTimecodeInput('1:02:03.04')).toBe(3723.04);
    expect(parseTimecodeInput('90:00')).toBe(5400);
    expect(parseTimecodeInput('0.105')).toBe(0.105);
    expect(parseTimecodeInput('1:30.123456')).toBeCloseTo(90.123456, 12);
    expect(parseTimecodeInput('1:02:03.4567')).toBeCloseTo(3723.4567, 12);
    expect(parseTimecodeInput(' 1 : 30 ')).toBe(90);
    expect(parseTimecodeInput('1 : 02 : 03.04')).toBe(3723.04);
  });

  it('parses frame-based timecode through the React helper wrapper', () => {
    expect(parseTimecodeInput('00:01:30:12', { frameRate: 24 })).toBe(90.5);
    expect(
      parseTimecodeInput('00:01:00;02', {
        frameRate: { numerator: 30000, denominator: 1001 },
        dropFrame: true,
      })
    ).toBeCloseTo(1800 / (30000 / 1001), 12);
  });

  it('parses unit suffixes and compound inputs through the wrapper helper', () => {
    expect(parseTimecodeInput('1h 20m')).toBe(4800);
    expect(parseTimecodeInput('1m 30s')).toBe(90);
    expect(parseTimecodeInput('24f', { frameRate: 24 })).toBe(1);
    expect(parseTimecodeInput('1h 20m invalid')).toBeNull();
  });

  it('optionally rounds parsed input to centiseconds', () => {
    expect(parseTimecodeInput('0.105', { rounding: 'centisecond' })).toBe(0.11);
    expect(parseTimecodeInput('1:30.105', { rounding: 'centisecond' })).toBe(90.11);
    expect(parseTimecodeInput('1:02:03.4567', { rounding: 'centisecond' })).toBe(3723.46);
  });

  it('rejects malformed timecode input', () => {
    expect(parseTimecodeInput('')).toBeNull();
    expect(parseTimecodeInput('-1')).toBeNull();
    expect(parseTimecodeInput('1:')).toBeNull();
    expect(parseTimecodeInput(':30')).toBeNull();
    expect(parseTimecodeInput('1::30')).toBeNull();
    expect(parseTimecodeInput('1:02:03:04')).toBeNull();
    expect(parseTimecodeInput('1:60')).toBeNull();
    expect(parseTimecodeInput('1:02:60')).toBeNull();
    expect(parseTimecodeInput('1:60:00')).toBeNull();
  });
});

describe('TimecodeInput', () => {
  it('renders a Base UI input with text-entry defaults', () => {
    const { getByLabelText } = render(<TimecodeInput aria-label="Clip start" />);
    const input = getByLabelText('Clip start') as HTMLInputElement;

    expect(input.tagName).toBe('INPUT');
    expect(input.type).toBe('text');
    expect(input.inputMode).toBe('text');
    expect(input.autocomplete).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
    expect(input.getAttribute('data-slot')).toBe('timecode-input');
    expect(input.className).toContain('timecode-input');
  });

  it('merges consumer classes and forwards normal input props', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <TimecodeInput
        aria-label="Clip end"
        className="editor-input"
        placeholder="0:00.00"
        onChange={onChange}
      />
    );
    const input = getByLabelText('Clip end') as HTMLInputElement;

    expect(input.className).toContain('timecode-input');
    expect(input.className).toContain('editor-input');
    expect(input.placeholder).toBe('0:00.00');

    fireEvent.change(input, { target: { value: '1:02.50' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('forwards Base UI onValueChange updates', () => {
    const onValueChange = vi.fn();
    const { getByLabelText } = render(
      <TimecodeInput aria-label="Source in" onValueChange={onValueChange} />
    );
    const input = getByLabelText('Source in') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '00:01:30:12' } });
    expect(onValueChange).toHaveBeenCalledWith('00:01:30:12', expect.anything());
  });

  it('maps invalid to aria-invalid while preserving explicit aria-invalid', () => {
    const { getByLabelText, rerender } = render(<TimecodeInput aria-label="Playhead" invalid />);
    expect(getByLabelText('Playhead').getAttribute('aria-invalid')).toBe('true');

    rerender(<TimecodeInput aria-label="Playhead" invalid aria-invalid={false} />);
    expect(getByLabelText('Playhead').getAttribute('aria-invalid')).toBe('false');
  });

  it('forwards refs to the underlying input element', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<TimecodeInput ref={ref} aria-label="Duration" />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current?.tagName).toBe('INPUT');
  });
});
