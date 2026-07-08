import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { TimecodeInput } from './index';

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
