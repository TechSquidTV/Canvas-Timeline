import {
  useTimelineClipboard,
  useTimelineClips,
  useTimelineHistory,
  useTimelinePlayheadTime,
  useTimelineRangeSelection,
} from '@techsquidtv/canvas-timeline-react';
import { ClipboardPaste, Copy, Redo2, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { EditorTrackKind } from '@/data/demo-project';

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
  const clipboard = useTimelineClipboard();
  const playheadTime = useTimelinePlayheadTime();

  return (
    <Button
      aria-label="Paste at playhead"
      disabled={!clipboard.canPaste}
      iconOnly
      onClick={() => clipboard.pasteSelection(playheadTime)}
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
  const clips = useTimelineClips<EditorTrackKind>();
  const canDeleteSelectedClip = clips.selectedClip !== null;

  return (
    <Button
      aria-label="Delete selected clip"
      disabled={!canDeleteSelectedClip}
      iconOnly
      onClick={() => {
        if (clips.selectedClip !== null) {
          clips.deleteClip(clips.selectedClip.id);
        }
      }}
      title="Delete selected clip"
      variant="ghost"
    >
      <Trash2 aria-hidden="true" />
    </Button>
  );
}

function RangeEditCommandGroup() {
  const rangeSelection = useTimelineRangeSelection();

  return (
    <div className="timeline-command-group" role="group" aria-label="Range and clip edits">
      <DeleteSelectedClipButton />
      <Button
        aria-label="Lift In/Out range"
        className="timeline-command-text-button"
        disabled={!rangeSelection.hasRange}
        onClick={() => rangeSelection.liftRange()}
        title="Lift In/Out range"
        variant="ghost"
      >
        Lift
      </Button>
      <Button
        aria-label="Delete In/Out range"
        className="timeline-command-text-button"
        disabled={!rangeSelection.hasRange}
        onClick={() => rangeSelection.deleteRange()}
        title="Delete In/Out range"
        variant="ghost"
      >
        Del
      </Button>
    </div>
  );
}

export function TimelineCommandBar() {
  return (
    <div className="timeline-command-bar" aria-label="Timeline edit commands">
      <HistoryCommandGroup />

      <Separator orientation="vertical" />

      <ClipboardCommandGroup />

      <Separator orientation="vertical" />

      <RangeEditCommandGroup />
    </div>
  );
}
