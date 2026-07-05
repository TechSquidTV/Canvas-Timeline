import { AlertTriangle, FileImage, Film, LoaderCircle, Music2 } from 'lucide-react';
import type { SourceBinSource } from './types';

interface SourceThumbnailProps {
  source: SourceBinSource;
}

export function SourceThumbnail({ source }: SourceThumbnailProps) {
  if (source.thumbnailUrl !== null) {
    return (
      <span className="source-bin-thumbnail">
        <img alt="" src={source.thumbnailUrl} />
      </span>
    );
  }

  return (
    <span className="source-bin-thumbnail source-bin-thumbnail-icon">
      {source.status === 'failed' ? <AlertTriangle aria-hidden="true" /> : null}
      {source.status === 'importing' ? <LoaderCircle aria-hidden="true" /> : null}
      {source.status === 'ready' && source.kind === 'audio' ? <Music2 aria-hidden="true" /> : null}
      {source.status === 'ready' && source.kind === 'image' ? (
        <FileImage aria-hidden="true" />
      ) : null}
      {source.status === 'ready' && source.kind === 'video' ? <Film aria-hidden="true" /> : null}
    </span>
  );
}
