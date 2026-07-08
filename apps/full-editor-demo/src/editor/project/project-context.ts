import { createContext, useContext } from 'react';
import type { VideoResolutionPresetId } from '#full-editor/project/video-settings';
import type {
  ProjectMetadata,
  ProjectMetadataOverride,
} from '#full-editor/project/project-metadata';

export type ProjectAutosaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'unavailable';

export interface ProjectContextValue {
  autosaveStatus: ProjectAutosaveStatus;
  metadata: ProjectMetadata;
  resetProject: (metadataOverride?: ProjectMetadataOverride) => Promise<void>;
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
