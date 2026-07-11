import { describe, expect, it } from 'vite-plus/test';
import {
  defaultEditorRulerFormat,
  getEditorRulerOptions,
  isEditorRulerFormat,
  loadEditorRulerFormat,
  saveEditorRulerFormat,
} from '#full-editor/features/timeline/ruler-format';

describe('editor ruler format', () => {
  it('defaults to a second-based ruler', () => {
    expect(defaultEditorRulerFormat).toBe('seconds');
    expect(getEditorRulerOptions('seconds', 30)).toEqual({ format: 'seconds' });
  });

  it('maps timecode and frame-number preferences to renderer options', () => {
    expect(getEditorRulerOptions('timecode', 30)).toEqual({ format: 'timecode', frameRate: 30 });
    expect(getEditorRulerOptions('frame-number', 30)).toEqual({
      format: 'frame-number',
      frameRate: 30,
    });
  });

  it('validates persisted ruler preferences', () => {
    expect(isEditorRulerFormat('seconds')).toBe(true);
    expect(isEditorRulerFormat('timecode')).toBe(true);
    expect(isEditorRulerFormat('frame-number')).toBe(true);
    expect(isEditorRulerFormat('frames')).toBe(false);
  });

  it('persists the editor ruler preference', () => {
    saveEditorRulerFormat('timecode');

    expect(loadEditorRulerFormat()).toBe('timecode');

    saveEditorRulerFormat(defaultEditorRulerFormat);
  });
});
