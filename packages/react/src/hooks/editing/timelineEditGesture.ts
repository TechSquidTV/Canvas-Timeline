import type {
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
