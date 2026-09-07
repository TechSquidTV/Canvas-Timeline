import { isEditorTrack } from '#full-editor/features/project/demo-project';
import { useTimelineTracks } from '@techsquidtv/canvas-timeline-react';
import { useMemo } from 'react';
export function useEditorTracks() {
  const result = useTimelineTracks();
  const tracks = useMemo(
    () =>
      result.tracks.map((track) => {
        if (!isEditorTrack(track)) {
          throw new Error(`Unsupported editor track kind: ${track.kind}`);
        }
        return track;
      }),
    [result.tracks]
  );
  return { ...result, tracks };
}
