import { useEffect, useState } from 'react';
import { AlertTriangle, FileImage, Film, LoaderCircle, Music2 } from 'lucide-react';
import type { SourceBinSource } from '#full-editor/features/source-bin/types';

interface SourceThumbnailProps {
  source: SourceBinSource;
}

export function SourceThumbnail({ source }: SourceThumbnailProps) {
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null);
  const thumbnailUrl =
    source.thumbnailUrl !== null && source.thumbnailUrl !== failedThumbnailUrl
      ? source.thumbnailUrl
      : null;

  useEffect(() => {
    setFailedThumbnailUrl(null);
  }, [source.thumbnailUrl]);

  if (thumbnailUrl !== null) {
    return (
      <span className="source-bin-thumbnail">
        <img alt="" onError={() => setFailedThumbnailUrl(thumbnailUrl)} src={thumbnailUrl} />
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
