import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { Button } from '#full-editor/components/ui/button';
import { Separator } from '#full-editor/components/ui/separator';
import { formatRationalTime } from '#full-editor/lib/timeline-format';
import type { ProjectMetadata } from '#full-editor/project/project-metadata';
import {
  formatProjectFrameRate,
  isProjectFrameRatePresetId,
  projectFrameRatePresets,
  type ProjectFrameRatePresetId,
} from '#full-editor/project/frame-rate';
import {
  formatVideoResolution,
  isVideoResolutionPresetId,
  type VideoResolutionPresetId,
  videoResolutionPresets,
} from '#full-editor/project/video-settings';

interface ProjectMenuProps {
  confirmingNewProject: boolean;
  duration?: RationalTime;
  metadata: ProjectMetadata;
  newProjectFrameRateDraft: ProjectFrameRatePresetId;
  newProjectResolutionDraft: VideoResolutionPresetId;
  newProjectTitleDraft: string;
  onCancelNewProject: () => void;
  onConfirmNewProject: () => void;
  onNewProjectFrameRateDraftChange: (presetId: ProjectFrameRatePresetId) => void;
  onNewProjectResolutionDraftChange: (presetId: VideoResolutionPresetId) => void;
  onNewProjectTitleDraftChange: (title: string) => void;
  onStartNewProject: () => void;
  resetError: string | null;
  resetting: boolean;
  sourcesCount: number;
  storageAvailable: boolean;
}

export function ProjectMenu({
  confirmingNewProject,
  duration,
  metadata,
  newProjectFrameRateDraft,
  newProjectResolutionDraft,
  newProjectTitleDraft,
  onCancelNewProject,
  onConfirmNewProject,
  onNewProjectFrameRateDraftChange,
  onNewProjectResolutionDraftChange,
  onNewProjectTitleDraftChange,
  onStartNewProject,
  resetError,
  resetting,
  sourcesCount,
  storageAvailable,
}: ProjectMenuProps) {
  return (
    <div className="editor-menu-popover editor-project-menu">
      <section className="editor-menu-section">
        <h2 className="editor-menu-section-title">Current Project</h2>
        <dl className="panel-readout">
          <div>
            <dt>Project</dt>
            <dd>{metadata.title}</dd>
          </div>
          <div>
            <dt>Resolution</dt>
            <dd>{formatVideoResolution(metadata)}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{duration === undefined ? 'Not set' : formatRationalTime(duration)}</dd>
          </div>
          <div>
            <dt>Frame rate</dt>
            <dd>{formatProjectFrameRate(metadata.frameRate)}</dd>
          </div>
          <div>
            <dt>Sources</dt>
            <dd>{sourcesCount}</dd>
          </div>
        </dl>
      </section>
      <Separator />
      <section className="editor-menu-section">
        <h2 className="editor-menu-section-title">New Project</h2>
        {confirmingNewProject ? (
          <div className="editor-new-project-confirm">
            <label className="editor-field">
              <span>Project name</span>
              <input
                className="editor-input"
                onChange={(event) => onNewProjectTitleDraftChange(event.currentTarget.value)}
                value={newProjectTitleDraft}
              />
            </label>
            <label className="editor-field">
              <span>Frame rate</span>
              <select
                className="editor-input"
                onChange={(event) => {
                  if (isProjectFrameRatePresetId(event.currentTarget.value)) {
                    onNewProjectFrameRateDraftChange(event.currentTarget.value);
                  }
                }}
                value={newProjectFrameRateDraft}
              >
                {projectFrameRatePresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="editor-field">
              <span>Resolution</span>
              <select
                className="editor-input"
                onChange={(event) => {
                  if (isVideoResolutionPresetId(event.currentTarget.value)) {
                    onNewProjectResolutionDraftChange(event.currentTarget.value);
                  }
                }}
                value={newProjectResolutionDraft}
              >
                {videoResolutionPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <p>
              This deletes the current timeline, project settings, imported media, posters, and
              Source Bin entries.
            </p>
            {resetError === null ? null : <p className="editor-menu-error">{resetError}</p>}
            <div className="editor-menu-row">
              <Button disabled={resetting} onClick={onCancelNewProject} variant="subtle">
                Cancel
              </Button>
              <Button
                disabled={resetting || !storageAvailable}
                onClick={() => onConfirmNewProject()}
                variant="subtle"
              >
                {resetting ? 'Deleting' : 'Delete and start new'}
              </Button>
            </div>
          </div>
        ) : (
          <Button disabled={!storageAvailable} onClick={onStartNewProject} variant="subtle">
            New Project
          </Button>
        )}
      </section>
    </div>
  );
}
