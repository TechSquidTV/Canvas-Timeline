import { useEffect, useMemo, useRef } from 'react';
import { useTimelineState } from '@techsquidtv/canvas-timeline-react';
import {
  sanitizeTimelineState,
  savePersistedProjectState,
} from '@/persistence/project/project-store';

const PROJECT_AUTOSAVE_DELAY_MS = 600;

export function ProjectAutosave({ enabled }: { enabled: boolean }) {
  const state = useTimelineState();
  const persistedState = useMemo(() => sanitizeTimelineState(state), [state]);
  const persistedStateRef = useRef(persistedState);
  const persistedStateFingerprint = useMemo(() => JSON.stringify(persistedState), [persistedState]);

  useEffect(() => {
    persistedStateRef.current = persistedState;
  }, [persistedState]);

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
  }, [enabled, persistedStateFingerprint]);

  return null;
}
