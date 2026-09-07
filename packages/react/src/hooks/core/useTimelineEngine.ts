import { TimelineContext } from '#react/context';
import { useContext } from 'react';
/** Reads the stable engine without subscribing to timeline state. */
export function useTimelineEngine() {
  const engine = useContext(TimelineContext);
  if (!engine) {
    throw new Error('Timeline hooks must be used within TimelineProvider');
  }
  return engine;
}
