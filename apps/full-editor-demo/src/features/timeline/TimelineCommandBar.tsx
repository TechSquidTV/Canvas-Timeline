import {
  useTimelineClipboard,
  useTimelineClipGroups,
  useTimelineClips,
  useTimelineEditCommands,
  useTimelineHistory,
  useTimeline,
} from '@techsquidtv/canvas-timeline-react';
import { ClipboardPaste, Copy, Redo2, Trash2, Undo2, Unlink2 } from 'lucide-react';
import { Button } from '#full-editor/shared/ui/button';
import { Separator } from '#full-editor/shared/ui/separator';
import type { EditorTrackKind } from '#full-editor/features/project/demo-project';
import {
  useTimelineDropMode,
  type TimelineSourceDropMode,
} from '#full-editor/features/timeline/drop-mode-context';

function HistoryCommandGroup() {
  const history = useTimelineHistory();

  return (
    <div className="timeline-command-group" role="group" aria-label="History">
      <Button
        aria-label="Undo"
        disabled={!history.canUndo}
        iconOnly
        onClick={history.undo}
        title="Undo"
        variant="ghost"
      >
        <Undo2 aria-hidden="true" />
      </Button>
      <Button
        aria-label="Redo"
        disabled={!history.canRedo}
        iconOnly
        onClick={history.redo}
        title="Redo"
        variant="ghost"
      >
        <Redo2 aria-hidden="true" />
      </Button>
    </div>
  );
}

function CopySelectionButton() {
  const clipboard = useTimelineClipboard();

  return (
    <Button
      aria-label="Copy selected clip"
      disabled={!clipboard.canCopy}
      iconOnly
      onClick={clipboard.copySelection}
      title="Copy selected clip"
      variant="ghost"
    >
      <Copy aria-hidden="true" />
    </Button>
  );
}

function PasteAtPlayheadButton() {
  const { engine } = useTimeline();
  const clipboard = useTimelineClipboard();

  return (
    <Button
      aria-label="Paste at playhead"
      disabled={!clipboard.canPaste}
      iconOnly
      onClick={() => clipboard.pasteSelection(engine.getTime())}
      title="Paste at playhead"
      variant="ghost"
    >
      <ClipboardPaste aria-hidden="true" />
    </Button>
  );
}

function ClipboardCommandGroup() {
  return (
    <div className="timeline-command-group" role="group" aria-label="Clipboard">
      <CopySelectionButton />
      <PasteAtPlayheadButton />
    </div>
  );
}

function DeleteSelectedClipButton() {
  const { selectedClip } = useTimelineClips<EditorTrackKind>();
  const { deleteClip } = useTimelineEditCommands();
  const canDeleteSelectedClip = selectedClip !== null;

  return (
    <Button
      aria-label="Delete selected clip"
      disabled={!canDeleteSelectedClip}
      iconOnly
      onClick={() => {
        if (selectedClip !== null) {
          deleteClip(selectedClip.id);
        }
      }}
      title="Delete selected clip"
      variant="ghost"
    >
      <Trash2 aria-hidden="true" />
    </Button>
  );
}

function UngroupSelectedClipsButton() {
  const clipGroups = useTimelineClipGroups();
  const canUngroupSelectedClips = clipGroups.selectedGroupId !== null;

  return (
    <Button
      aria-label="Ungroup selected linked clips"
      className="timeline-command-text-button"
      disabled={!canUngroupSelectedClips}
      onClick={clipGroups.ungroupSelectedClips}
      title="Ungroup selected linked clips"
      variant="ghost"
    >
      <Unlink2 aria-hidden="true" />
      Ungroup
    </Button>
  );
}

function SelectionEditCommandGroup() {
  return (
    <div className="timeline-command-group" role="group" aria-label="Selection edits">
      <DeleteSelectedClipButton />
      <UngroupSelectedClipsButton />
    </div>
  );
}

function DropModeCommandGroup() {
  const { dropMode, setDropMode } = useTimelineDropMode();

  return (
    <div className="timeline-command-group" role="group" aria-label="Source drop mode">
      <DropModeButton
        activeDropMode={dropMode}
        dropMode="insert"
        label="Ins"
        onSelectDropMode={setDropMode}
        title="Insert source drops"
      />
      <DropModeButton
        activeDropMode={dropMode}
        dropMode="overwrite"
        label="Ovr"
        onSelectDropMode={setDropMode}
        title="Overwrite source drops"
      />
    </div>
  );
}

function DropModeButton({
  activeDropMode,
  dropMode,
  label,
  onSelectDropMode,
  title,
}: {
  activeDropMode: TimelineSourceDropMode;
  dropMode: TimelineSourceDropMode;
  label: string;
  onSelectDropMode: (dropMode: TimelineSourceDropMode) => void;
  title: string;
}) {
  const active = activeDropMode === dropMode;

  return (
    <Button
      aria-label={title}
      aria-pressed={active}
      className={active ? 'is-active timeline-command-text-button' : 'timeline-command-text-button'}
      onClick={() => onSelectDropMode(dropMode)}
      title={title}
      variant="ghost"
    >
      {label}
    </Button>
  );
}

export function TimelineCommandBar() {
  return (
    <div className="timeline-command-bar" aria-label="Timeline edit commands">
      <DropModeCommandGroup />

      <Separator orientation="vertical" />

      <HistoryCommandGroup />

      <Separator orientation="vertical" />

      <ClipboardCommandGroup />

      <Separator orientation="vertical" />

      <SelectionEditCommandGroup />
    </div>
  );
}
