const SOURCE_BIN_DRAG_MIME_TYPE = 'application/x.canvas-timeline-full-editor-source';
const SOURCE_BIN_DRAG_TEXT_PREFIX = 'canvas-timeline-source:';

export interface SourceBinDragPayload {
  sourceId: string;
  type: 'full-editor/source';
}

export function createSourceBinDragPayload(sourceId: string): SourceBinDragPayload {
  return {
    type: 'full-editor/source',
    sourceId,
  };
}

export function writeSourceBinDragPayload(dataTransfer: DataTransfer, sourceId: string) {
  const payload = createSourceBinDragPayload(sourceId);
  dataTransfer.effectAllowed = 'copy';
  dataTransfer.setData(SOURCE_BIN_DRAG_MIME_TYPE, JSON.stringify(payload));
  dataTransfer.setData('text/plain', `${SOURCE_BIN_DRAG_TEXT_PREFIX}${sourceId}`);
}

export function readSourceBinDragPayload(dataTransfer: DataTransfer): SourceBinDragPayload | null {
  const customPayload = dataTransfer.getData(SOURCE_BIN_DRAG_MIME_TYPE);
  if (customPayload !== '') {
    return parseSourceBinDragPayload(customPayload);
  }

  const plainTextPayload = dataTransfer.getData('text/plain');
  if (!plainTextPayload.startsWith(SOURCE_BIN_DRAG_TEXT_PREFIX)) {
    return null;
  }

  const sourceId = plainTextPayload.slice(SOURCE_BIN_DRAG_TEXT_PREFIX.length);
  return sourceId === '' ? null : createSourceBinDragPayload(sourceId);
}

function parseSourceBinDragPayload(text: string): SourceBinDragPayload | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isSourceBinDragPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isSourceBinDragPayload(value: unknown): value is SourceBinDragPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'full-editor/source' &&
    'sourceId' in value &&
    typeof value.sourceId === 'string'
  );
}
