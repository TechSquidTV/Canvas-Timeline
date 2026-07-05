import type { Clip, TimelineState, Track } from '@techsquidtv/canvas-timeline-core';
import type { EditorTrackKind } from '@/data/demo-project';
import type { SourceBinSource } from '@/components/source-bin/types';

export type TimelineExportResolutionId = '720p' | '1080p';

export interface TimelineExportResolution {
  height: number;
  id: TimelineExportResolutionId;
  label: string;
  videoBitrate: number;
  width: number;
}

export interface TimelineExportProfile {
  audioBitrate: number;
  filename: string;
  frameRate: number;
  resolution: TimelineExportResolution;
}

export interface TimelineExportPlanInput {
  profile: TimelineExportProfile;
  sources: readonly SourceBinSource[];
  state: TimelineState;
}

export interface TimelineExportSegment {
  clip: Clip;
  endSeconds: number;
  source: SourceBinSource & { file: File };
  sourceStartSeconds: number;
  startSeconds: number;
  track: Track<EditorTrackKind>;
}

export interface TimelineExportPlan {
  audioSegments: readonly TimelineExportSegment[];
  durationSeconds: number;
  endSeconds: number;
  profile: TimelineExportProfile;
  videoSegments: readonly TimelineExportSegment[];
}

export interface TimelineExportValidationIssue {
  message: string;
}

export type TimelineExportPlanResult =
  | {
      ok: true;
      plan: TimelineExportPlan;
    }
  | {
      issues: readonly TimelineExportValidationIssue[];
      ok: false;
    };

export type TimelineExportStatus =
  | {
      phase: 'idle';
    }
  | {
      phase: 'running';
      progress: number;
    }
  | {
      phase: 'complete';
    }
  | {
      message: string;
      phase: 'error';
    };

export interface TimelineExportProgress {
  phase: 'audio' | 'finalizing' | 'video';
  progress: number;
}
