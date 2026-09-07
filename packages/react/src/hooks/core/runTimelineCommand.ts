import { timelineCommandInvalidInput } from '@techsquidtv/canvas-timeline-core';
import type { TimelineCommandResult } from '@techsquidtv/canvas-timeline-core';

/** Converts expected input validation failures while preserving unexpected programming errors. */
export function runTimelineCommand<Value = void>(
  command: () => TimelineCommandResult<Value>
): TimelineCommandResult<Value> {
  try {
    return command();
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return timelineCommandInvalidInput(error.message, error);
    }
    throw error;
  }
}
