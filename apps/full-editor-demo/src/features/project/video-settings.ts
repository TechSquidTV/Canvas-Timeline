export type VideoResolutionPresetId = '720p' | '1080p' | '4k';

export interface VideoResolution {
  height: number;
  width: number;
}

export interface VideoResolutionPreset extends VideoResolution {
  id: VideoResolutionPresetId;
  label: string;
}

export const videoResolutionPresets = [
  {
    height: 720,
    id: '720p',
    label: '720p',
    width: 1280,
  },
  {
    height: 1080,
    id: '1080p',
    label: '1080p',
    width: 1920,
  },
  {
    height: 2160,
    id: '4k',
    label: '4K',
    width: 3840,
  },
] as const satisfies readonly VideoResolutionPreset[];

export const defaultVideoResolutionPresetId: VideoResolutionPresetId = '1080p';

export function findVideoResolutionPreset(
  presetId: VideoResolutionPresetId
): VideoResolutionPreset {
  return (
    videoResolutionPresets.find((preset) => preset.id === presetId) ??
    videoResolutionPresets.find((preset) => preset.id === defaultVideoResolutionPresetId) ??
    videoResolutionPresets[0]
  );
}

export function getVideoResolutionPresetId(
  resolution: VideoResolution
): VideoResolutionPresetId | null {
  return (
    videoResolutionPresets.find(
      (preset) => preset.width === resolution.width && preset.height === resolution.height
    )?.id ?? null
  );
}

export function isVideoResolutionPresetId(value: string): value is VideoResolutionPresetId {
  return videoResolutionPresets.some((preset) => preset.id === value);
}

export function formatVideoResolution(resolution: VideoResolution) {
  return `${resolution.width}x${resolution.height}`;
}

export function getRecommendedVideoBitrate(resolution: VideoResolution) {
  const pixelCount = resolution.width * resolution.height;

  if (pixelCount >= 3840 * 2160) {
    return 35_000_000;
  }

  if (pixelCount >= 1920 * 1080) {
    return 8_000_000;
  }

  return 4_000_000;
}

export function getPreviewVideoResolution(
  resolution: VideoResolution,
  maxLongEdge = 1920
): VideoResolution {
  const longEdge = Math.max(resolution.width, resolution.height);

  if (longEdge <= maxLongEdge) {
    return resolution;
  }

  const scale = maxLongEdge / longEdge;

  return {
    height: Math.max(1, Math.round(resolution.height * scale)),
    width: Math.max(1, Math.round(resolution.width * scale)),
  };
}
