import { useMemo, type ReactNode } from 'react';
import {
  ProjectContext,
  type ProjectContextValue,
} from '#full-editor/editor/project/project-context';

export function ProjectProvider({
  autosaveStatus,
  children,
  metadata,
  resetProject,
  setProjectResolutionPreset,
  setProjectTitle,
  storageAvailable,
}: ProjectContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({
      autosaveStatus,
      metadata,
      resetProject,
      setProjectResolutionPreset,
      setProjectTitle,
      storageAvailable,
    }),
    [
      autosaveStatus,
      metadata,
      resetProject,
      setProjectResolutionPreset,
      setProjectTitle,
      storageAvailable,
    ]
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}
