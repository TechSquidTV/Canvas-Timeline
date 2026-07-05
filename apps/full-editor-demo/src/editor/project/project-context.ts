import { createContext, useContext } from 'react';
import type { VideoResolutionPresetId } from '@/project/video-settings';
import type { ProjectMetadata } from '@/persistence/project/types';

export type ProjectAutosaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'unavailable';

export interface ProjectContextValue {
  autosaveStatus: ProjectAutosaveStatus;
  metadata: ProjectMetadata;
  resetProject: () => Promise<void>;
  setProjectResolutionPreset: (presetId: VideoResolutionPresetId) => void;
  setProjectTitle: (title: string) => void;
  storageAvailable: boolean;
}

export const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useEditorProject() {
  const context = useContext(ProjectContext);

  if (context === null) {
    throw new Error('useEditorProject must be used inside ProjectProvider');
  }

  return context;
}
