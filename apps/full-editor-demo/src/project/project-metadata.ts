import { demoProject } from '../data/demo-project';

export interface ProjectMetadata {
  description: string;
  frameRate: number;
  height: number;
  projectId: string;
  title: string;
  width: number;
}

export type ProjectMetadataOverride = Partial<Pick<ProjectMetadata, 'height' | 'title' | 'width'>>;

export function getDefaultProjectMetadata(): ProjectMetadata {
  return {
    description: demoProject.description,
    frameRate: demoProject.frameRate,
    height: demoProject.height,
    projectId: demoProject.id,
    title: demoProject.title,
    width: demoProject.width,
  };
}

export function normalizeProjectTitle(title: string) {
  const trimmedTitle = title.trim();
  return trimmedTitle === '' ? demoProject.title : trimmedTitle;
}
