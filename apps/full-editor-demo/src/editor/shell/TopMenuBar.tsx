import { useState } from 'react';
import { useTimelineState } from '@techsquidtv/canvas-timeline-react';
import { ExportPanel } from '@/components/panels/ExportPanel';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useSourceBin } from '@/components/source-bin/source-bin-context';
import { useEditorProject, type ProjectAutosaveStatus } from '@/editor/project/project-context';
import { formatRationalTime } from '@/lib/timeline-format';
import {
  defaultVideoResolutionPresetId,
  formatVideoResolution,
  getVideoResolutionPresetId,
  type VideoResolutionPresetId,
  videoResolutionPresets,
} from '@/project/video-settings';
import type { TimelineExportStatus } from '@/export/timeline-export-types';

type OpenMenu = 'export' | 'project' | null;

export function TopMenuBar() {
  const {
    autosaveStatus,
    metadata,
    resetProject,
    setProjectResolutionPreset,
    setProjectTitle,
    storageAvailable,
  } = useEditorProject();
  const state = useTimelineState();
  const { sources } = useSourceBin();
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [confirmingNewProject, setConfirmingNewProject] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<TimelineExportStatus>({ phase: 'idle' });

  async function confirmNewProject() {
    if (!storageAvailable || resetting) {
      return;
    }

    setResetting(true);
    setResetError(null);
    try {
      await resetProject();
      setConfirmingNewProject(false);
      setOpenMenu(null);
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'Unable to create a new project.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <header className="editor-top-menu" aria-label="Editor menu">
      <div className="editor-top-menu-title">
        <span>Canvas Timeline</span>
        <strong>{metadata.title}</strong>
      </div>

      <nav className="editor-top-menu-actions" aria-label="Application actions">
        <div className="editor-menu-popover-root">
          <Button
            aria-expanded={openMenu === 'project'}
            aria-haspopup="menu"
            className={`editor-menu-trigger${openMenu === 'project' ? ' is-active' : ''}`}
            onClick={() => {
              setOpenMenu((currentMenu) => (currentMenu === 'project' ? null : 'project'));
            }}
            variant="ghost"
          >
            Project
          </Button>
          {openMenu === 'project' ? (
            <div className="editor-menu-popover editor-project-menu">
              <label className="editor-menu-field">
                <span>Project name</span>
                <input
                  className="export-input"
                  onChange={(event) => setProjectTitle(event.currentTarget.value)}
                  value={metadata.title}
                />
              </label>
              <label className="editor-menu-field">
                <span>Resolution</span>
                <select
                  className="export-input"
                  onChange={(event) =>
                    setProjectResolutionPreset(event.currentTarget.value as VideoResolutionPresetId)
                  }
                  value={getVideoResolutionPresetId(metadata) ?? defaultVideoResolutionPresetId}
                >
                  {videoResolutionPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>
              <dl className="panel-readout editor-menu-readout">
                <div>
                  <dt>Duration</dt>
                  <dd>{formatRationalTime(state.duration)}</dd>
                </div>
                <div>
                  <dt>Canvas</dt>
                  <dd>{formatVideoResolution(metadata)}</dd>
                </div>
                <div>
                  <dt>Frame rate</dt>
                  <dd>{metadata.frameRate} fps</dd>
                </div>
                <div>
                  <dt>Sources</dt>
                  <dd>{sources.length}</dd>
                </div>
              </dl>
              <Separator />
              {confirmingNewProject ? (
                <div className="editor-new-project-confirm">
                  <p>
                    This deletes the current timeline, project settings, imported media, posters,
                    and Source Bin entries.
                  </p>
                  {resetError === null ? null : <p className="editor-menu-error">{resetError}</p>}
                  <div className="editor-menu-row">
                    <Button
                      disabled={resetting}
                      onClick={() => {
                        setConfirmingNewProject(false);
                        setResetError(null);
                      }}
                      variant="subtle"
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={resetting || !storageAvailable}
                      onClick={() => void confirmNewProject()}
                      variant="subtle"
                    >
                      {resetting ? 'Deleting' : 'Delete and start new'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  disabled={!storageAvailable}
                  onClick={() => setConfirmingNewProject(true)}
                  variant="subtle"
                >
                  New Project
                </Button>
              )}
            </div>
          ) : null}
        </div>

        <div className="editor-menu-popover-root">
          <Button
            aria-expanded={openMenu === 'export'}
            aria-haspopup="menu"
            className={`editor-menu-trigger${openMenu === 'export' ? ' is-active' : ''}`}
            onClick={() => {
              setOpenMenu((currentMenu) => (currentMenu === 'export' ? null : 'export'));
            }}
            variant="ghost"
          >
            Export
          </Button>
          {openMenu === 'export' ? (
            <div className="editor-menu-popover editor-export-menu">
              <ExportPanel status={exportStatus} onStatusChange={setExportStatus} />
            </div>
          ) : null}
        </div>
      </nav>

      <div className="editor-autosave-status">{getAutosaveLabel(autosaveStatus)}</div>
    </header>
  );
}

function getAutosaveLabel(status: ProjectAutosaveStatus) {
  switch (status) {
    case 'error':
      return 'Save error';
    case 'idle':
      return 'Unsaved changes';
    case 'saving':
      return 'Saving';
    case 'unavailable':
      return 'Storage unavailable';
    case 'saved':
      return 'Saved';
  }
}
