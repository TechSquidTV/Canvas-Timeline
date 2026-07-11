import { createContext, useContext } from 'react';

export type TimelineSourceDropMode = 'insert' | 'overwrite';

export interface TimelineDropModeContextValue {
  dropMode: TimelineSourceDropMode;
  setDropMode: (dropMode: TimelineSourceDropMode) => void;
}

export const TimelineDropModeContext = createContext<TimelineDropModeContextValue | null>(null);

export function useTimelineDropMode() {
  const context = useContext(TimelineDropModeContext);

  if (context === null) {
    throw new Error('useTimelineDropMode must be used inside TimelineDropModeProvider');
  }

  return context;
}
