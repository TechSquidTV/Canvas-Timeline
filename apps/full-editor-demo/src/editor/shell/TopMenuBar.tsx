import { useEffect, useState } from 'react';
import { useTimelineState } from '@techsquidtv/canvas-timeline-react';
import { ExportPanel } from '@/components/panels/ExportPanel';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useSourceBin } from '@/components/source-bin/source-bin-context';
import { demoProject } from '@/data/demo-project';
import { useEditorProject, type ProjectAutosaveStatus } from '@/editor/project/project-context';
import { formatRationalTime } from '@/lib/timeline-format';
import { normalizeProjectTitle } from '@/project/project-metadata';
import {
  defaultVideoResolutionPresetId,
  findVideoResolutionPreset,
  formatVideoResolution,
  getVideoResolutionPresetId,
  isVideoResolutionPresetId,
  type VideoResolutionPresetId,
  videoResolutionPresets,
} from '@/project/video-settings';
import type { TimelineExportStatus } from '@/export/timeline-export-types';

const aboutLinks = [
  {
    description: 'Project website and demos.',
    href: 'https://canvastimeline.com',
    label: 'Website',
  },
  {
    description: 'Guides, API notes, and examples.',
    href: 'https://canvastimeline.com/docs',
    label: 'Documentation',
  },
  {
    description: 'Full editor demo app source.',
    href: 'https://github.com/TechSquidTV/Canvas-Timeline/tree/main/apps/full-editor-demo',
    label: 'Demo source code',
  },
  {
    description: 'Canvas Timeline monorepo.',
    href: 'https://github.com/TechSquidTV/Canvas-Timeline',
    label: 'GitHub repository',
  },
] as const;

type OpenMenu = 'about' | 'export' | 'project' | null;

export function TopMenuBar() {
  const { autosaveStatus, metadata, resetProject, storageAvailable } = useEditorProject();
  const state = useTimelineState();
  const { sources } = useSourceBin();
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [confirmingNewProject, setConfirmingNewProject] = useState(false);
  const [newProjectTitleDraft, setNewProjectTitleDraft] = useState<string>(demoProject.title);
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
    setConfirmingNewProject(false);
    setResetError(null);
  }, [currentResolutionPresetId, openMenu]);

  async function confirmNewProject() {
    if (!storageAvailable || resetting) {
      return;
    }

    const preset = findVideoResolutionPreset(newProjectResolutionDraft);
    setResetting(true);
    setResetError(null);
    try {
      await resetProject({
        height: preset.height,
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
                    <dd>{formatRationalTime(state.duration)}</dd>
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
                        onChange={(event) => setNewProjectTitleDraft(event.currentTarget.value)}
                        value={newProjectTitleDraft}
                      />
                    </label>
                    <label className="editor-field">
                      <span>Resolution</span>
                      <select
                        className="editor-input"
                        onChange={(event) => {
                          if (isVideoResolutionPresetId(event.currentTarget.value)) {
                            setNewProjectResolutionDraft(event.currentTarget.value);
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
                          setNewProjectTitleDraft(demoProject.title);
                          setNewProjectResolutionDraft(currentResolutionPresetId);
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
              </section>
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
          {openMenu === 'about' ? (
            <div className="editor-menu-popover editor-about-menu">
              <section className="editor-menu-section">
                <h2 className="editor-menu-section-title">About Canvas Timeline</h2>
                <div className="editor-menu-link-list">
                  {aboutLinks.map((link) => (
                    <a
                      className="editor-menu-link"
                      href={link.href}
                      key={link.href}
                      onClick={() => setOpenMenu(null)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span>{link.label}</span>
                      <small>{link.description}</small>
                    </a>
                  ))}
                </div>
              </section>
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
