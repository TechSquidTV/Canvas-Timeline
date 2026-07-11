import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '#full-editor/shared/lib/cn';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#full-editor/shared/ui/collapsible';

interface ToolPanelProps {
  badge?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
  icon: ReactNode;
  title: string;
}

export function ToolPanel({
  badge,
  children,
  className,
  contentClassName,
  defaultOpen = true,
  icon,
  title,
}: ToolPanelProps) {
  return (
    <Collapsible className={cn('tool-panel', className)} defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="tool-panel-trigger">
        <span className="tool-panel-title">
          <span className="tool-panel-icon">{icon}</span>
          {title}
        </span>
        <span className="tool-panel-trigger-meta">
          {badge ? <span className="tool-panel-badge">{badge}</span> : null}
          <ChevronDown aria-hidden="true" className="tool-panel-chevron" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className={cn('tool-panel-content', contentClassName)}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
