import { useEffect, useState } from 'react';
import { useTimelineState } from '@techsquidtv/canvas-timeline-react';
import { Popover, PopoverContent, PopoverTrigger } from '#full-editor/shared/ui/popover';
import { useSourceBin } from '#full-editor/features/source-bin/source-bin-context';
import { demoProject } from '#full-editor/features/project/demo-project';
import {
  useEditorProject,
  type ProjectAutosaveStatus,
} from '#full-editor/features/project/project-context';
import { normalizeProjectTitle } from '#full-editor/features/project/project-metadata';
import {
  defaultProjectFrameRatePresetId,
  findProjectFrameRatePreset,
  type ProjectFrameRatePresetId,
} from '#full-editor/features/project/frame-rate';
import {
  defaultVideoResolutionPresetId,
  findVideoResolutionPreset,
  getVideoResolutionPresetId,
  type VideoResolutionPresetId,
} from '#full-editor/features/project/video-settings';
import type { TimelineExportStatus } from '#full-editor/features/export/timeline-export-types';
import { AboutMenu } from '#full-editor/app/shell/top-menu/AboutMenu';
import { ExportMenu } from '#full-editor/features/export/ExportMenu';
import { ProjectMenu } from '#full-editor/features/project/ProjectMenu';

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
        <Popover
          onOpenChange={(open) => setOpenMenu(open ? 'project' : null)}
          open={openMenu === 'project'}
        >
          <PopoverTrigger
            className={`editor-button editor-button-ghost editor-menu-trigger${
              openMenu === 'project' ? ' is-active' : ''
            }`}
          >
            Project
          </PopoverTrigger>
          {openMenu === 'project' ? (
            <PopoverContent aria-label="Project settings" className="editor-project-menu">
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
            </PopoverContent>
          ) : null}
        </Popover>

        <Popover
          onOpenChange={(open) => setOpenMenu(open ? 'export' : null)}
          open={openMenu === 'export'}
        >
          <PopoverTrigger
            className={`editor-button editor-button-ghost editor-menu-trigger${
              openMenu === 'export' ? ' is-active' : ''
            }`}
          >
            Export
          </PopoverTrigger>
          {openMenu === 'export' ? (
            <PopoverContent aria-label="Export project" className="editor-export-menu">
              <ExportMenu status={exportStatus} onStatusChange={setExportStatus} />
            </PopoverContent>
          ) : null}
        </Popover>

        <Popover
          onOpenChange={(open) => setOpenMenu(open ? 'about' : null)}
          open={openMenu === 'about'}
        >
          <PopoverTrigger
            className={`editor-button editor-button-ghost editor-menu-trigger${
              openMenu === 'about' ? ' is-active' : ''
            }`}
          >
            About
          </PopoverTrigger>
          {openMenu === 'about' ? (
            <PopoverContent aria-label="About Canvas Timeline" className="editor-about-menu">
              <AboutMenu onNavigate={() => setOpenMenu(null)} />
            </PopoverContent>
          ) : null}
        </Popover>
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
