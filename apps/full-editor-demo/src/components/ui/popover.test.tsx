import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test } from 'vite-plus/test';
import { Popover, PopoverContent, PopoverTrigger } from '#full-editor/components/ui/popover';

test('Popover exposes dialog semantics and restores focus after Escape', async () => {
  render(
    <Popover>
      <PopoverTrigger>Project</PopoverTrigger>
      <PopoverContent aria-label="Project settings">
        <button type="button">First action</button>
      </PopoverContent>
    </Popover>
  );

  const trigger = screen.getByRole('button', { name: 'Project' });
  fireEvent.click(trigger);

  const dialog = await screen.findByRole('dialog', { name: 'Project settings' });
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First action' }))
  );

  fireEvent.keyDown(dialog, { key: 'Escape' });

  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Project settings' })).toBeNull()
  );
  expect(document.activeElement).toBe(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});
