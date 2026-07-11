import { Popover as BasePopover } from '@base-ui/react/popover';
import type { ComponentProps } from 'react';
import { cn } from '#full-editor/lib/cn';

type PopoverContentProps = Omit<ComponentProps<typeof BasePopover.Popup>, 'className'> & {
  className?: string;
  positionerClassName?: string;
};

function PopoverContent({ className, positionerClassName, ...props }: PopoverContentProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        align="start"
        className={cn('editor-menu-positioner', positionerClassName)}
        side="bottom"
        sideOffset={1}
      >
        <BasePopover.Popup className={cn('editor-menu-popover', className)} {...props} />
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

const Popover = BasePopover.Root;
const PopoverTrigger = BasePopover.Trigger;

export { Popover, PopoverContent, PopoverTrigger };
