import { useEffect, useRef } from 'react';
import { savePersistedProjectState } from '@/persistence/project/project-store';
import { usePersistableTimelineSnapshot } from './usePersistableTimelineSnapshot';

const PROJECT_AUTOSAVE_DELAY_MS = 600;

export function ProjectAutosave({ enabled }: { enabled: boolean }) {
  const snapshot = usePersistableTimelineSnapshot();
  const persistedStateRef = useRef(snapshot.timelineState);

  useEffect(() => {
    persistedStateRef.current = snapshot.timelineState;
  }, [snapshot.timelineState]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void savePersistedProjectState(persistedStateRef.current);
    }, PROJECT_AUTOSAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [enabled, snapshot.fingerprint]);

  return null;
}
