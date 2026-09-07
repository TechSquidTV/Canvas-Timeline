import { timelineCommandFail, timelineCommandOk } from '@techsquidtv/canvas-timeline-core';
import type {
  TimelineCommandResult,
  TimelineEditCommand,
  TimelineEditPreview,
  TimelineEngine,
} from '@techsquidtv/canvas-timeline-core';

/** Owns one gesture's preview, including cancellation before its first move. */
export class TimelineEditGesture {
  preview: TimelineEditPreview | null = null;
  private current = true;
  private publishing = false;
  private readonly unsubscribe: () => void;

  constructor(private readonly engine: TimelineEngine) {
    this.unsubscribe = engine.on('edit:preview', () => {
      if (!this.publishing) {
        this.current = false;
      }
    });
  }

  isCurrent() {
    return this.current && this.engine.getEditPreview() === this.preview;
  }

  publish(command: TimelineEditCommand) {
    this.publishing = true;
    try {
      this.preview = this.engine.previewEdit(command);
      return this.preview;
    } finally {
      this.publishing = false;
    }
  }

  /** Commits only this gesture's preview, then clears its feedback. */
  commit(): TimelineCommandResult {
    const current = this.isCurrent();
    const preview = this.preview;
    this.release();
    if (!current) {
      return timelineCommandFail('unsupported', 'The gesture preview was replaced.');
    }
    if (!preview) {
      this.engine.cancelEdit();
      return timelineCommandOk();
    }
    const result = this.engine.commitEdit(preview.command);
    this.engine.cancelEdit();
    return result.committed
      ? timelineCommandOk()
      : timelineCommandFail(result.preview.reason ?? 'unsupported', result.preview.message);
  }

  cancel() {
    const current = this.isCurrent();
    this.release();
    if (current) {
      this.engine.cancelEdit();
    }
    return current;
  }

  release() {
    this.unsubscribe();
    this.current = false;
  }
}
