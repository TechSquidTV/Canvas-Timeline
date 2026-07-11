import { createContext, useContext } from 'react';
import type { VideoResolutionPresetId } from '#full-editor/features/project/video-settings';
import type { ProjectFrameRatePresetId } from '#full-editor/features/project/frame-rate';
import type { EditorRulerFormat } from '#full-editor/features/timeline/ruler-format';
import type {
  ProjectMetadata,
  ProjectMetadataOverride,
} from '#full-editor/features/project/project-metadata';

export type ProjectAutosaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'unavailable';

export interface ProjectContextValue {
  autosaveStatus: ProjectAutosaveStatus;
  metadata: ProjectMetadata;
  projectRestoreError?: string;
  resetProject: (metadataOverride?: ProjectMetadataOverride) => Promise<void>;
  rulerFormat: EditorRulerFormat;
  setProjectFrameRatePreset: (presetId: ProjectFrameRatePresetId) => void;
  setProjectResolutionPreset: (presetId: VideoResolutionPresetId) => void;
  setProjectTitle: (title: string) => void;
  setRulerFormat: (format: EditorRulerFormat) => void;
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
