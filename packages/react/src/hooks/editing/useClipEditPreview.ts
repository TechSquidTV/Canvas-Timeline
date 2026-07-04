import type { ClipEditPreview } from '@techsquidtv/canvas-timeline-core';
import { useEffect, useState } from 'react';
import { useTimeline } from '../core/useTimeline';

/**
 * Reads the transient edit-preview state for a clip.
 *
 * Use this for custom clip UIs that need to render live editing affordances,
 * such as overwrite cut indicators, without depending on internal engine flags.
 *
 * @param clipId - Clip id whose live edit preview should be read.
 * @returns The current edit-preview state, or undefined when the clip is not being preview-edited.
 */
export function useClipEditPreview(clipId: string): ClipEditPreview | undefined {
  const { engine } = useTimeline();
  const [, setPreviewRevision] = useState(0);

  useEffect(() => {
    const update = () => setPreviewRevision((revision) => revision + 1);

    const unsubscribePreview = engine.on('state:preview', update);
    const unsubscribeSettled = engine.on('state:settled', update);

    return () => {
      unsubscribePreview();
      unsubscribeSettled();
    };
  }, [engine]);

  return engine.getClip(clipId)?.clip.editPreview;
}
