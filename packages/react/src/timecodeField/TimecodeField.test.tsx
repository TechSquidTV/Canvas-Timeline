import { fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { TimecodeField } from '#react/timecodeField';

describe('TimecodeField', () => {
  it('renders a formatted trigger by default and opens a focused selected input', () => {
    const onCommit = vi.fn();
    const { getByLabelText, getByRole } = render(
      <TimecodeField.Root ariaLabel="Playhead" value={90.5} onCommit={onCommit} />
    );
    const trigger = getByRole('button', { name: 'Edit Playhead: 1:30.50' });

    expect(trigger.textContent).toBe('1:30.50');

    fireEvent.click(trigger);

    const input = getByLabelText('Edit Playhead') as HTMLInputElement;
    expect(input.value).toBe('1:30.50');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('commits valid text on Enter and restores focus to the trigger', () => {
    const onCommit = vi.fn();
    const { getByLabelText, getByRole } = render(
      <TimecodeField.Root ariaLabel="Playhead" value={fromSeconds(10, 24000)} onCommit={onCommit} />
    );

    fireEvent.click(getByRole('button'));
    const input = getByLabelText('Edit Playhead') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2:00' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith(
      120,
      expect.objectContaining({
        reason: 'enter',
        seconds: 120,
        text: '2:00',
        time: { v: 2880000, r: 24000 },
      })
    );
    expect(document.activeElement).toBe(getByRole('button'));
  });

  it('commits valid text on blur without restoring trigger focus', () => {
    const onCommit = vi.fn();
    const { getByLabelText, getByRole } = render(
      <TimecodeField.Root ariaLabel="Clip start" value={10} onCommit={onCommit} />
    );

    fireEvent.click(getByRole('button'));
    const input = getByLabelText('Edit Clip start') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1:30' } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith(
      90,
      expect.objectContaining({
        reason: 'blur',
        text: '1:30',
        time: { v: 5400000, r: 60000 },
      })
    );
    expect(getByRole('button')).toBeTruthy();
  });

  it('keeps editing and marks invalid text on Enter, then cancels with Escape', () => {
    const onCommit = vi.fn();
    const { getByLabelText, getByRole, queryByRole } = render(
      <TimecodeField.Root ariaLabel="Duration" value={10} onCommit={onCommit} />
    );

    fireEvent.click(getByRole('button'));
    const input = getByLabelText('Edit Duration') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1:60' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCommit).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(queryByRole('alert')?.textContent).toBe('Invalid timecode.');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(getByRole('button')).toBeTruthy();
    expect(document.activeElement).toBe(getByRole('button'));
  });

  it('cancels invalid text on blur', () => {
    const onCommit = vi.fn();
    const { getByLabelText, getByRole } = render(
      <TimecodeField.Root ariaLabel="Out point" value={10} onCommit={onCommit} />
    );

    fireEvent.click(getByRole('button'));
    const input = getByLabelText('Edit Out point') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1:60' } });
    fireEvent.blur(input);

    expect(onCommit).not.toHaveBeenCalled();
    expect(getByRole('button')).toBeTruthy();
  });

  it('cancels active editing when disabled', async () => {
    const onCommit = vi.fn();
    const { getByLabelText, getByRole, queryByLabelText, rerender } = render(
      <TimecodeField.Root ariaLabel="Playhead" value={10} onCommit={onCommit}>
        <TimecodeField.Trigger />
        <TimecodeField.Input />
      </TimecodeField.Root>
    );

    fireEvent.click(getByRole('button'));
    expect(getByLabelText('Edit Playhead')).toBeTruthy();

    rerender(
      <TimecodeField.Root ariaLabel="Playhead" value={10} disabled onCommit={onCommit}>
        <TimecodeField.Trigger />
        <TimecodeField.Input />
      </TimecodeField.Root>
    );

    await waitFor(() => expect(queryByLabelText('Edit Playhead')).toBeNull());
    expect((getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('uses frame format options for draft text and parsed commit details', () => {
    const onCommit = vi.fn();
    const { getByLabelText, getByRole } = render(
      <TimecodeField.Root
        ariaLabel="Source in"
        value={90.5}
        formatOptions={{ frameRate: 24 }}
        parseOptions={{ frameRate: 24 }}
        timebase={24000}
        onCommit={onCommit}
      />
    );

    expect(getByRole('button').textContent).toBe('00:01:30:12');
    fireEvent.click(getByRole('button'));

    const input = getByLabelText('Edit Source in') as HTMLInputElement;
    expect(input.value).toBe('00:01:30:12');

    fireEvent.change(input, { target: { value: '00:01:31:00' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith(
      91,
      expect.objectContaining({
        reason: 'enter',
        time: { v: 2184000, r: 24000 },
      })
    );
  });

  it('supports controlled editing requests', () => {
    const onEditingChange = vi.fn();
    const { getByRole, queryByLabelText } = render(
      <TimecodeField.Root
        ariaLabel="Playhead"
        value={10}
        editing={false}
        onCommit={vi.fn()}
        onEditingChange={onEditingChange}
      />
    );

    fireEvent.click(getByRole('button'));

    expect(onEditingChange).toHaveBeenCalledWith(true);
    expect(queryByLabelText('Edit Playhead')).toBeNull();
  });

  it('updates the trigger button content when the value prop changes', () => {
    const { getByRole, rerender } = render(
      <TimecodeField.Root ariaLabel="Playhead" value={10} onCommit={vi.fn()} />
    );
    expect(getByRole('button').textContent).toBe('0:10.00');

    rerender(<TimecodeField.Root ariaLabel="Playhead" value={20} onCommit={vi.fn()} />);
    expect(getByRole('button').textContent).toBe('0:20.00');
  });

  it('sizes display slots from duration while keeping seconds and centiseconds fixed', () => {
    const { getByRole } = render(
      <TimecodeField.Root
        ariaLabel="Playhead"
        value={90.5}
        duration={fromSeconds(7425)}
        onCommit={vi.fn()}
      />
    );
    const trigger = getByRole('button');
    const minutes = trigger.querySelector('[data-timecode-part="minutes"]') as HTMLSpanElement;
    const seconds = trigger.querySelector('[data-timecode-part="seconds"]') as HTMLSpanElement;
    const centiseconds = trigger.querySelector(
      '[data-timecode-part="centiseconds"]'
    ) as HTMLSpanElement;

    expect(trigger.textContent).toBe('1:30.50');
    expect(minutes.style.getPropertyValue('--timecode-field-segment-width')).toBe('3ch');
    expect(seconds.style.getPropertyValue('--timecode-field-segment-width')).toBe('2ch');
    expect(centiseconds.style.getPropertyValue('--timecode-field-segment-width')).toBe('2ch');
  });

  it('sizes hour display slots from duration', () => {
    const { getByRole } = render(
      <TimecodeField.Root
        ariaLabel="Playhead"
        value={3723.04}
        duration={fromSeconds(36000)}
        onCommit={vi.fn()}
      />
    );
    const trigger = getByRole('button');
    const hours = trigger.querySelector('[data-timecode-part="hours"]') as HTMLSpanElement;
    const minutes = trigger.querySelector('[data-timecode-part="minutes"]') as HTMLSpanElement;

    expect(trigger.textContent).toBe('1:02:03.04');
    expect(hours.style.getPropertyValue('--timecode-field-segment-width')).toBe('2ch');
    expect(minutes.style.getPropertyValue('--timecode-field-segment-width')).toBe('2ch');
  });

  it('does not overwrite the active user draft when value prop updates in the background', () => {
    const { getByLabelText, getByRole, rerender } = render(
      <TimecodeField.Root ariaLabel="Playhead" value={10} onCommit={vi.fn()} />
    );

    // Enter edit mode
    fireEvent.click(getByRole('button'));
    const input = getByLabelText('Edit Playhead') as HTMLInputElement;

    // User types something
    fireEvent.change(input, { target: { value: '1:30' } });
    expect(input.value).toBe('1:30');

    // Background playhead update happens (value changes from 10 to 12)
    rerender(<TimecodeField.Root ariaLabel="Playhead" value={12} onCommit={vi.fn()} />);

    // Draft input should NOT be overwritten
    expect(input.value).toBe('1:30');
  });

  it('merges classes and forwards root, trigger, and input refs', () => {
    const rootRef = React.createRef<HTMLSpanElement>();
    const triggerRef = React.createRef<HTMLButtonElement>();
    const inputRef = React.createRef<HTMLInputElement>();
    const { getByLabelText, getByRole } = render(
      <TimecodeField.Root
        ref={rootRef}
        ariaLabel="Playhead"
        className="editor-timecode"
        value={10}
        onCommit={vi.fn()}
      >
        <TimecodeField.Trigger ref={triggerRef} className="editor-timecode-trigger" />
        <TimecodeField.Input ref={inputRef} className="editor-timecode-input" />
      </TimecodeField.Root>
    );

    expect(rootRef.current?.className).toContain('timecode-field');
    expect(rootRef.current?.className).toContain('editor-timecode');
    expect(triggerRef.current?.className).toContain('timecode-field-trigger');
    expect(triggerRef.current?.className).toContain('editor-timecode-trigger');

    fireEvent.click(getByRole('button'));
    const input = getByLabelText('Edit Playhead') as HTMLInputElement;

    expect(inputRef.current).toBe(input);
    expect(input.className).toContain('timecode-field-input');
    expect(input.className).toContain('editor-timecode-input');
  });
});
