import { useMemo, type ReactNode } from 'react';
import {
  ProjectContext,
  type ProjectContextValue,
} from '#full-editor/editor/project/project-context';

export function ProjectProvider({
  autosaveStatus,
  children,
  metadata,
  projectRestoreError,
  resetProject,
  rulerFormat,
  setProjectFrameRatePreset,
  setProjectResolutionPreset,
  setProjectTitle,
  setRulerFormat,
  storageAvailable,
}: ProjectContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({
      autosaveStatus,
      metadata,
      projectRestoreError,
      resetProject,
      rulerFormat,
      setProjectFrameRatePreset,
      setProjectResolutionPreset,
      setProjectTitle,
      setRulerFormat,
      storageAvailable,
    }),
    [
      autosaveStatus,
      metadata,
      projectRestoreError,
      resetProject,
      rulerFormat,
      setProjectFrameRatePreset,
      setProjectResolutionPreset,
      setProjectTitle,
      setRulerFormat,
      storageAvailable,
    ]
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}
