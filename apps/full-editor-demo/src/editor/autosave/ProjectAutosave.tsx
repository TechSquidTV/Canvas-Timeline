import { useEffect, useRef } from 'react';
import { savePersistedProjectState } from '@/persistence/project/project-store';
import type { ProjectMetadata } from '@/project/project-metadata';
import type { ProjectAutosaveStatus } from '@/editor/project/project-context';
import { usePersistableTimelineSnapshot } from './usePersistableTimelineSnapshot';

const PROJECT_AUTOSAVE_DELAY_MS = 600;

interface ProjectAutosaveProps {
  enabled: boolean;
  metadata: ProjectMetadata;
  onStatusChange: (status: ProjectAutosaveStatus) => void;
}

export function ProjectAutosave({ enabled, metadata, onStatusChange }: ProjectAutosaveProps) {
  const snapshot = usePersistableTimelineSnapshot();
  const metadataRef = useRef(metadata);
  const persistedStateRef = useRef(snapshot.timelineState);

  useEffect(() => {
    metadataRef.current = metadata;
  }, [metadata]);

  useEffect(() => {
    persistedStateRef.current = snapshot.timelineState;
  }, [snapshot.timelineState]);

  useEffect(() => {
    if (!enabled) {
      onStatusChange('unavailable');
      return;
    }

    onStatusChange('idle');
    const timeoutId = window.setTimeout(() => {
      onStatusChange('saving');
      void savePersistedProjectState(persistedStateRef.current, metadataRef.current)
        .then(() => {
          onStatusChange('saved');
        })
        .catch(() => {
          onStatusChange('error');
        });
    }, PROJECT_AUTOSAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [enabled, metadata, onStatusChange, snapshot.fingerprint]);

  return null;
}
