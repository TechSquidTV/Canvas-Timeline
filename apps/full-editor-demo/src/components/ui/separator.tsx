import type { HTMLAttributes } from 'react';
import { cn } from '#full-editor/lib/cn';

interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
}

export function Separator({
  className,
  orientation = 'horizontal',
  role = 'separator',
  ...props
}: SeparatorProps) {
  return (
    <div
      aria-orientation={orientation}
      className={cn('editor-separator', `editor-separator-${orientation}`, className)}
      role={role}
      {...props}
    />
  );
}
