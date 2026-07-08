import {
  formatVideoResolution,
  getRecommendedVideoBitrate,
  videoResolutionPresets,
} from '#full-editor/project/video-settings';
import {
  getDefaultProjectMetadata,
  type ProjectMetadata,
} from '#full-editor/project/project-metadata';
import type {
  TimelineExportProfile,
  TimelineExportResolution,
  TimelineExportResolutionId,
} from '#full-editor/export/timeline-export-types';

const timelineExportResolutions = videoResolutionPresets.map((preset) => ({
  ...preset,
  videoBitrate: getRecommendedVideoBitrate(preset),
})) satisfies readonly TimelineExportResolution[];

export const defaultTimelineExportResolutionId: TimelineExportResolutionId = 'project';

export function createTimelineExportProfile(options: {
  filename: string;
  projectMetadata: ProjectMetadata;
  resolutionId: TimelineExportResolutionId;
}): TimelineExportProfile {
  return {
    audioBitrate: 192_000,
    filename: normalizeExportFilename(options.filename),
    frameRate: options.projectMetadata.frameRate,
    resolution: getTimelineExportResolution(options.resolutionId, options.projectMetadata),
  };
}

export function getDefaultExportFilename(projectTitle: string = getDefaultProjectMetadata().title) {
  return normalizeExportFilename(projectTitle);
}

function getTimelineExportResolution(
  resolutionId: TimelineExportResolutionId,
  projectMetadata: ProjectMetadata
): TimelineExportResolution {
  if (resolutionId === 'project') {
    return {
      height: projectMetadata.height,
      id: 'project',
      label: `Project (${formatVideoResolution(projectMetadata)})`,
      videoBitrate: getRecommendedVideoBitrate(projectMetadata),
      width: projectMetadata.width,
    };
  }

  return (
    timelineExportResolutions.find((resolution) => resolution.id === resolutionId) ??
    timelineExportResolutions[0]
  );
}

export function getTimelineExportResolutionOptions(
  projectMetadata: ProjectMetadata
): readonly TimelineExportResolution[] {
  return [getTimelineExportResolution('project', projectMetadata), ...timelineExportResolutions];
}

export function normalizeExportFilename(value: string) {
  const withoutExtension = value
    .trim()
    .replace(/\.mp4$/i, '')
    .replaceAll(/[^\w .-]+/g, '-')
    .replaceAll(/\s+/g, ' ')
    .replaceAll(/^[ .-]+|[ .-]+$/g, '');

  return `${withoutExtension.length === 0 ? 'timeline-export' : withoutExtension}.mp4`;
}
