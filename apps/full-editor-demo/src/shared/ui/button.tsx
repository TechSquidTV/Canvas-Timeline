import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '#full-editor/shared/lib/cn';

type ButtonVariant = 'ghost' | 'primary' | 'subtle';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  iconOnly?: boolean;
  variant?: ButtonVariant;
}

export function Button({
  children,
  className,
  iconOnly = false,
  type = 'button',
  variant = 'subtle',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'editor-button',
        `editor-button-${variant}`,
        iconOnly && 'editor-button-icon-only',
        className
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
