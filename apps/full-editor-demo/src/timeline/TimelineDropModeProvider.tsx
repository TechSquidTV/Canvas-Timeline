import { useMemo, useState, type ReactNode } from 'react';
import { TimelineDropModeContext, type TimelineSourceDropMode } from './drop-mode-context';

export function TimelineDropModeProvider({ children }: { children: ReactNode }) {
  const [dropMode, setDropMode] = useState<TimelineSourceDropMode>('insert');
  const value = useMemo(() => ({ dropMode, setDropMode }), [dropMode]);

  return (
    <TimelineDropModeContext.Provider value={value}>{children}</TimelineDropModeContext.Provider>
  );
}
