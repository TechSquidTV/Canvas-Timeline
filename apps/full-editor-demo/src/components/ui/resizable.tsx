import {
  Group as ResizablePanelGroup,
  Panel as ResizablePanel,
  Separator as ResizableHandle,
} from 'react-resizable-panels';
import { GripVertical } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type ResizablePanelGroupProps = ComponentProps<typeof ResizablePanelGroup>;
type ResizablePanelProps = ComponentProps<typeof ResizablePanel>;
type ResizableHandleProps = ComponentProps<typeof ResizableHandle> & {
  withHandle?: boolean;
};

function EditorResizablePanelGroup({ className, ...props }: ResizablePanelGroupProps) {
  return <ResizablePanelGroup className={cn('h-full w-full', className)} {...props} />;
}

function EditorResizablePanel({ className, ...props }: ResizablePanelProps) {
  return <ResizablePanel className={cn('min-h-0 min-w-0', className)} {...props} />;
}

function EditorResizableHandle({
  children,
  className,
  withHandle = false,
  ...props
}: ResizableHandleProps) {
  return (
    <ResizableHandle className={cn('editor-resizable-handle', className)} {...props}>
      {withHandle ? (
        <span className="editor-resizable-handle-grip">
          <GripVertical aria-hidden="true" />
        </span>
      ) : null}
      {children}
    </ResizableHandle>
  );
}

export {
  EditorResizableHandle as ResizableHandle,
  EditorResizablePanel as ResizablePanel,
  EditorResizablePanelGroup as ResizablePanelGroup,
};
