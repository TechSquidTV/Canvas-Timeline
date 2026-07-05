import { useEffect, useState } from 'react';
import {
  useTimelineClips,
  useTimelineState,
  useTimelineTracks,
} from '@techsquidtv/canvas-timeline-react';
import { Button } from '@/components/ui/button';
import type { EditorTrackKind } from '@/data/demo-project';
import { useEditorProject } from '@/editor/project/project-context';
import { formatRationalTime } from '@/lib/timeline-format';
import { normalizeProjectTitle } from '@/project/project-metadata';
import {
  defaultVideoResolutionPresetId,
  formatVideoResolution,
  getVideoResolutionPresetId,
  isVideoResolutionPresetId,
  type VideoResolutionPresetId,
  videoResolutionPresets,
} from '@/project/video-settings';

export function ProjectPanel() {
  const state = useTimelineState();
  const { metadata, setProjectResolutionPreset, setProjectTitle } = useEditorProject();
  const { clips } = useTimelineClips<EditorTrackKind>();
  const { tracks } = useTimelineTracks<EditorTrackKind>();
  const currentResolutionPresetId =
    getVideoResolutionPresetId(metadata) ?? defaultVideoResolutionPresetId;
  const [titleDraft, setTitleDraft] = useState(metadata.title);
  const [resolutionDraft, setResolutionDraft] =
    useState<VideoResolutionPresetId>(currentResolutionPresetId);
  const settingsChanged =
    titleDraft !== metadata.title || resolutionDraft !== currentResolutionPresetId;

  useEffect(() => {
    setTitleDraft(metadata.title);
    setResolutionDraft(currentResolutionPresetId);
  }, [currentResolutionPresetId, metadata.title]);

  function applyProjectSettings() {
    setProjectTitle(normalizeProjectTitle(titleDraft));
    setProjectResolutionPreset(resolutionDraft);
  }

  function cancelProjectSettings() {
    setTitleDraft(metadata.title);
    setResolutionDraft(currentResolutionPresetId);
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
          <dd>{metadata.frameRate} fps</dd>
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
