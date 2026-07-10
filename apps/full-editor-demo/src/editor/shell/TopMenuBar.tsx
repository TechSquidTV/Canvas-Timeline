import { useEffect, useState } from 'react';
import { useTimelineState } from '@techsquidtv/canvas-timeline-react';
import { Button } from '#full-editor/components/ui/button';
import { useSourceBin } from '#full-editor/components/source-bin/source-bin-context';
import { demoProject } from '#full-editor/data/demo-project';
import {
  useEditorProject,
  type ProjectAutosaveStatus,
} from '#full-editor/editor/project/project-context';
import { normalizeProjectTitle } from '#full-editor/project/project-metadata';
import {
  defaultProjectFrameRatePresetId,
  findProjectFrameRatePreset,
  type ProjectFrameRatePresetId,
} from '#full-editor/project/frame-rate';
import {
  defaultVideoResolutionPresetId,
  findVideoResolutionPreset,
  getVideoResolutionPresetId,
  type VideoResolutionPresetId,
} from '#full-editor/project/video-settings';
import type { TimelineExportStatus } from '#full-editor/export/timeline-export-types';
import { AboutMenu } from '#full-editor/editor/shell/top-menu/AboutMenu';
import { ExportMenu } from '#full-editor/editor/shell/top-menu/ExportMenu';
import { ProjectMenu } from '#full-editor/editor/shell/top-menu/ProjectMenu';

type OpenMenu = 'about' | 'export' | 'project' | null;

export function TopMenuBar() {
  const { autosaveStatus, metadata, resetProject, storageAvailable } = useEditorProject();
  const state = useTimelineState();
  const { sources } = useSourceBin();
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [confirmingNewProject, setConfirmingNewProject] = useState(false);
  const [newProjectTitleDraft, setNewProjectTitleDraft] = useState<string>(demoProject.title);
  const [newProjectFrameRateDraft, setNewProjectFrameRateDraft] =
    useState<ProjectFrameRatePresetId>(defaultProjectFrameRatePresetId);
  const [newProjectResolutionDraft, setNewProjectResolutionDraft] =
    useState<VideoResolutionPresetId>(
      getVideoResolutionPresetId(metadata) ?? defaultVideoResolutionPresetId
    );
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<TimelineExportStatus>({ phase: 'idle' });
  const currentResolutionPresetId =
    getVideoResolutionPresetId(metadata) ?? defaultVideoResolutionPresetId;

  useEffect(() => {
    if (openMenu !== 'project') {
      return;
    }

    setNewProjectTitleDraft(demoProject.title);
    setNewProjectResolutionDraft(currentResolutionPresetId);
    setNewProjectFrameRateDraft(defaultProjectFrameRatePresetId);
    setConfirmingNewProject(false);
    setResetError(null);
  }, [currentResolutionPresetId, openMenu]);

  async function confirmNewProject() {
    if (!storageAvailable || resetting) {
      return;
    }

    const preset = findVideoResolutionPreset(newProjectResolutionDraft);
    const frameRatePreset = findProjectFrameRatePreset(newProjectFrameRateDraft);
    setResetting(true);
    setResetError(null);
    try {
      await resetProject({
        height: preset.height,
        frameRate: frameRatePreset.value,
        title: normalizeProjectTitle(newProjectTitleDraft),
        width: preset.width,
      });
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
        <a
          className="editor-top-menu-brand"
          href="https://canvastimeline.com"
          rel="noreferrer"
          target="_blank"
        >
          Canvas Timeline
        </a>
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
            <ProjectMenu
              confirmingNewProject={confirmingNewProject}
              duration={state.duration}
              metadata={metadata}
              newProjectFrameRateDraft={newProjectFrameRateDraft}
              newProjectResolutionDraft={newProjectResolutionDraft}
              newProjectTitleDraft={newProjectTitleDraft}
              onCancelNewProject={() => {
                setConfirmingNewProject(false);
                setResetError(null);
                setNewProjectTitleDraft(demoProject.title);
                setNewProjectResolutionDraft(currentResolutionPresetId);
                setNewProjectFrameRateDraft(defaultProjectFrameRatePresetId);
              }}
              onConfirmNewProject={() => void confirmNewProject()}
              onNewProjectFrameRateDraftChange={setNewProjectFrameRateDraft}
              onNewProjectResolutionDraftChange={setNewProjectResolutionDraft}
              onNewProjectTitleDraftChange={setNewProjectTitleDraft}
              onStartNewProject={() => setConfirmingNewProject(true)}
              resetError={resetError}
              resetting={resetting}
              sourcesCount={sources.length}
              storageAvailable={storageAvailable}
            />
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
            <ExportMenu status={exportStatus} onStatusChange={setExportStatus} />
          ) : null}
        </div>

        <div className="editor-menu-popover-root">
          <Button
            aria-expanded={openMenu === 'about'}
            aria-haspopup="menu"
            className={`editor-menu-trigger${openMenu === 'about' ? ' is-active' : ''}`}
            onClick={() => {
              setOpenMenu((currentMenu) => (currentMenu === 'about' ? null : 'about'));
            }}
            variant="ghost"
          >
            About
          </Button>
          {openMenu === 'about' ? <AboutMenu onNavigate={() => setOpenMenu(null)} /> : null}
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
