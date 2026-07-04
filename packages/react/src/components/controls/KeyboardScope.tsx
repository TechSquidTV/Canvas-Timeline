import React from 'react';
import { useTimelineKeyboard, type TimelineKeyboardOptions } from '../../hooks';

/** Props for the focus-scoped timeline keyboard shortcut wrapper. */
export interface KeyboardScopeProps
  extends
    Omit<React.HTMLAttributes<HTMLDivElement>, keyof TimelineKeyboardOptions>,
    TimelineKeyboardOptions {}

/**
 * Focus-scoped keyboard shortcut container for timeline editor surfaces.
 *
 * Keyboard handling is opt-in and local to this element or its descendants.
 */
export const KeyboardScope = React.forwardRef<HTMLDivElement, KeyboardScopeProps>(
  (
    {
      bindings,
      children,
      disabled,
      frameRate,
      frameStepCount,
      label,
      onKeyDown,
      platform,
      preset,
      preventDefault,
      stopPropagation,
      tabIndex,
      zoomStepRatio,
      ...props
    },
    ref
  ) => {
    const keyboard = useTimelineKeyboard({
      bindings,
      disabled,
      frameRate,
      frameStepCount,
      label,
      platform,
      preset,
      preventDefault,
      stopPropagation,
      zoomStepRatio,
    });

    return (
      <div
        ref={ref}
        {...keyboard.scopeProps}
        {...props}
        tabIndex={tabIndex ?? keyboard.scopeProps.tabIndex}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          keyboard.scopeProps.onKeyDown?.(event);
        }}
      >
        {children}
      </div>
    );
  }
);

KeyboardScope.displayName = 'Timeline.KeyboardScope';
