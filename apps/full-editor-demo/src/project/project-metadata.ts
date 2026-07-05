import { demoProject } from '@/data/demo-project';

export function normalizeProjectTitle(title: string) {
  const trimmedTitle = title.trim();
  return trimmedTitle === '' ? demoProject.title : trimmedTitle;
}
