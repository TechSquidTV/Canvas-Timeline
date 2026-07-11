import { useEffect, useState } from 'react';
import {
  useTimelineClips,
  useTimelineState,
  useTimelineTracks,
} from '@techsquidtv/canvas-timeline-react';
import { Button } from '#full-editor/shared/ui/button';
import type { EditorTrackKind } from '#full-editor/features/project/demo-project';
import { useEditorProject } from '#full-editor/features/project/project-context';
import { formatRationalTime } from '#full-editor/shared/lib/timeline-format';
import { normalizeProjectTitle } from '#full-editor/features/project/project-metadata';
import {
  formatProjectFrameRate,
  getProjectFrameRatePresetId,
  isProjectFrameRatePresetId,
  projectFrameRatePresets,
  type ProjectFrameRatePresetId,
} from '#full-editor/features/project/frame-rate';
import {
  defaultVideoResolutionPresetId,
  formatVideoResolution,
  getVideoResolutionPresetId,
  isVideoResolutionPresetId,
  type VideoResolutionPresetId,
  videoResolutionPresets,
} from '#full-editor/features/project/video-settings';
import {
  editorRulerFormats,
  formatEditorRulerFormat,
  isEditorRulerFormat,
  type EditorRulerFormat,
} from '#full-editor/features/timeline/ruler-format';

export function ProjectPanel() {
  const state = useTimelineState();
  const {
    metadata,
    projectRestoreError,
    rulerFormat,
    setProjectFrameRatePreset,
    setProjectResolutionPreset,
    setProjectTitle,
    setRulerFormat,
  } = useEditorProject();
  const { clips } = useTimelineClips<EditorTrackKind>();
  const { tracks } = useTimelineTracks<EditorTrackKind>();
  const currentResolutionPresetId =
    getVideoResolutionPresetId(metadata) ?? defaultVideoResolutionPresetId;
  const currentFrameRatePresetId = getProjectFrameRatePresetId(metadata.frameRate);
  const [titleDraft, setTitleDraft] = useState(metadata.title);
  const [resolutionDraft, setResolutionDraft] =
    useState<VideoResolutionPresetId>(currentResolutionPresetId);
  const [frameRateDraft, setFrameRateDraft] =
    useState<ProjectFrameRatePresetId>(currentFrameRatePresetId);
  const [rulerFormatDraft, setRulerFormatDraft] = useState<EditorRulerFormat>(rulerFormat);
  const settingsChanged =
    titleDraft !== metadata.title ||
    resolutionDraft !== currentResolutionPresetId ||
    frameRateDraft !== currentFrameRatePresetId ||
    rulerFormatDraft !== rulerFormat;

  useEffect(() => {
    setTitleDraft(metadata.title);
    setResolutionDraft(currentResolutionPresetId);
    setFrameRateDraft(currentFrameRatePresetId);
    setRulerFormatDraft(rulerFormat);
  }, [currentFrameRatePresetId, currentResolutionPresetId, metadata.title, rulerFormat]);

  function applyProjectSettings() {
    const normalizedTitle = normalizeProjectTitle(titleDraft);
    if (normalizedTitle !== metadata.title) {
      setProjectTitle(normalizedTitle);
    }
    if (resolutionDraft !== currentResolutionPresetId) {
      setProjectResolutionPreset(resolutionDraft);
    }
    if (frameRateDraft !== currentFrameRatePresetId) {
      setProjectFrameRatePreset(frameRateDraft);
    }
    if (rulerFormatDraft !== rulerFormat) {
      setRulerFormat(rulerFormatDraft);
    }
    setTitleDraft(normalizedTitle);
  }

  function cancelProjectSettings() {
    setTitleDraft(metadata.title);
    setResolutionDraft(currentResolutionPresetId);
    setFrameRateDraft(currentFrameRatePresetId);
    setRulerFormatDraft(rulerFormat);
  }

  return (
    <div className="project-panel">
      <dl className="panel-readout">
        <div>
          <dt>Project</dt>
          <dd>{metadata.title}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{formatRationalTime(state.duration)}</dd>
        </div>
        <div>
          <dt>Resolution</dt>
          <dd>{formatVideoResolution(metadata)}</dd>
        </div>
        <div>
          <dt>Frame rate</dt>
          <dd>{formatProjectFrameRate(metadata.frameRate)}</dd>
        </div>
        <div>
          <dt>Ruler</dt>
          <dd>{formatEditorRulerFormat(rulerFormat)}</dd>
        </div>
        <div>
          <dt>Tracks</dt>
          <dd>{tracks.length}</dd>
        </div>
        <div>
          <dt>Clips</dt>
          <dd>{clips.length}</dd>
        </div>
      </dl>

      {projectRestoreError === undefined ? null : (
        <p className="editor-menu-error">
          Saved project restore failed: {projectRestoreError} Autosave is disabled until a new
          project is created.
        </p>
      )}

      <section className="project-panel-settings">
        <h3 className="project-panel-heading">Project Settings</h3>
        <label className="editor-field">
          <span>Project name</span>
          <input
            className="editor-input"
            onChange={(event) => setTitleDraft(event.currentTarget.value)}
            value={titleDraft}
          />
        </label>
        <label className="editor-field">
          <span>Ruler format</span>
          <select
            className="editor-input"
            onChange={(event) => {
              if (isEditorRulerFormat(event.currentTarget.value)) {
                setRulerFormatDraft(event.currentTarget.value);
              }
            }}
            value={rulerFormatDraft}
          >
            {editorRulerFormats.map((format) => (
              <option key={format.id} value={format.id}>
                {format.label}
              </option>
            ))}
          </select>
        </label>
        <label className="editor-field">
          <span>Frame rate</span>
          <select
            className="editor-input"
            onChange={(event) => {
              if (isProjectFrameRatePresetId(event.currentTarget.value)) {
                setFrameRateDraft(event.currentTarget.value);
              }
            }}
            value={frameRateDraft}
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
                setResolutionDraft(event.currentTarget.value);
              }
            }}
            value={resolutionDraft}
          >
            {videoResolutionPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <div className="editor-menu-row">
          <Button disabled={!settingsChanged} onClick={cancelProjectSettings} variant="subtle">
            Cancel
          </Button>
          <Button disabled={!settingsChanged} onClick={applyProjectSettings} variant="subtle">
            Apply
          </Button>
        </div>
      </section>
    </div>
  );
}
