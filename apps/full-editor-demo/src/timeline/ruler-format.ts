import type { TimelineRulerOptions } from '@techsquidtv/canvas-timeline-renderer';
import type { TimecodeFrameRate } from '@techsquidtv/canvas-timeline-utils';

export const editorRulerFormats = [
  { id: 'seconds', label: 'Seconds' },
  { id: 'timecode', label: 'Timecode' },
  { id: 'frame-number', label: 'Frame number' },
] as const;

export type EditorRulerFormat = (typeof editorRulerFormats)[number]['id'];

export const defaultEditorRulerFormat: EditorRulerFormat = 'seconds';

const editorRulerFormatStorageKey = 'canvas-timeline:full-editor:ruler-format';

export function isEditorRulerFormat(value: string): value is EditorRulerFormat {
  return editorRulerFormats.some((format) => format.id === value);
}

export function formatEditorRulerFormat(format: EditorRulerFormat) {
  return editorRulerFormats.find((option) => option.id === format)?.label ?? format;
}

export function getEditorRulerOptions(
  format: EditorRulerFormat,
  frameRate: TimecodeFrameRate
): TimelineRulerOptions {
  if (format === 'seconds') {
    return { format };
  }

  return { format, frameRate };
}

export function loadEditorRulerFormat(): EditorRulerFormat {
  if (typeof window === 'undefined') {
    return defaultEditorRulerFormat;
  }

  try {
    const storedFormat = window.localStorage.getItem(editorRulerFormatStorageKey);
    return storedFormat !== null && isEditorRulerFormat(storedFormat)
      ? storedFormat
      : defaultEditorRulerFormat;
  } catch {
    return defaultEditorRulerFormat;
  }
}

export function saveEditorRulerFormat(format: EditorRulerFormat) {
  try {
    window.localStorage.setItem(editorRulerFormatStorageKey, format);
  } catch {
    // The in-memory preference remains usable when browser storage is unavailable.
  }
}
