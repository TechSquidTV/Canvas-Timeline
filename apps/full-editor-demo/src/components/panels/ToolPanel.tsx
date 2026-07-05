import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ToolPanelProps {
  badge?: string;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  icon: ReactNode;
  title: string;
}

export function ToolPanel({
  badge,
  children,
  className,
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
      <CollapsibleContent className="tool-panel-content">{children}</CollapsibleContent>
    </Collapsible>
  );
}
