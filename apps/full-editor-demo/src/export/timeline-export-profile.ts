import { demoProject } from '@/data/demo-project';
import type {
  TimelineExportProfile,
  TimelineExportResolution,
  TimelineExportResolutionId,
} from './timeline-export-types';

export const timelineExportResolutions = [
  {
    height: 1080,
    id: '1080p',
    label: '1080p',
    videoBitrate: 8_000_000,
    width: 1920,
  },
  {
    height: 720,
    id: '720p',
    label: '720p',
    videoBitrate: 4_000_000,
    width: 1280,
  },
] as const satisfies readonly TimelineExportResolution[];

export const defaultTimelineExportResolutionId: TimelineExportResolutionId = '1080p';

export function createTimelineExportProfile(options: {
  filename: string;
  resolutionId: TimelineExportResolutionId;
}): TimelineExportProfile {
  return {
    audioBitrate: 192_000,
    filename: normalizeExportFilename(options.filename),
    frameRate: demoProject.frameRate,
    resolution: getTimelineExportResolution(options.resolutionId),
  };
}

export function getDefaultExportFilename() {
  return normalizeExportFilename(demoProject.title);
}

export function getTimelineExportResolution(
  resolutionId: TimelineExportResolutionId
): TimelineExportResolution {
  return (
    timelineExportResolutions.find((resolution) => resolution.id === resolutionId) ??
    timelineExportResolutions[0]
  );
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
