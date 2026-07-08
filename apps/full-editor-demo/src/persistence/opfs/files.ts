import { isNotFoundError } from '#full-editor/persistence/opfs/support';

const APP_ROOT_SEGMENTS = ['canvas-timeline-full-editor-demo', 'v1'] as const;

export async function getAppStorageRoot() {
  let directory = await navigator.storage.getDirectory();

  for (const segment of APP_ROOT_SEGMENTS) {
    directory = await directory.getDirectoryHandle(segment, { create: true });
  }

  return directory;
}

export async function getDirectoryFromPath(
  root: FileSystemDirectoryHandle,
  path: readonly string[],
  create: boolean
) {
  let directory = root;

  for (const segment of path) {
    directory = await directory.getDirectoryHandle(segment, { create });
  }

  return directory;
}

export async function readFileFromPath(
  root: FileSystemDirectoryHandle,
  path: string
): Promise<File | null> {
  const segments = splitStoragePath(path);
  if (segments.length === 0) {
    return null;
  }

  let directory = root;
  for (const segment of segments.slice(0, -1)) {
    try {
      directory = await directory.getDirectoryHandle(segment);
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  try {
    const fileName = segments[segments.length - 1];
    if (fileName === undefined) {
      return null;
    }

    const fileHandle = await directory.getFileHandle(fileName);
    return fileHandle.getFile();
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

export async function writeBlobToPath(root: FileSystemDirectoryHandle, path: string, blob: Blob) {
  const segments = splitStoragePath(path);
  const fileName = segments[segments.length - 1];

  if (fileName === undefined) {
    throw new Error('Storage path must include a file name.');
  }

  const directory = await getDirectoryFromPath(root, segments.slice(0, -1), true);
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  await writeBlob(fileHandle, blob);
}

export async function removeEntryIfExists(
  directory: FileSystemDirectoryHandle,
  name: string,
  options?: FileSystemRemoveOptions
) {
  try {
    await directory.removeEntry(name, options);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
}

export async function listDirectoryEntries(directory: FileSystemDirectoryHandle) {
  const entries: FileSystemHandle[] = [];

  for await (const [, handle] of directory.entries()) {
    entries.push(handle);
  }

  return entries;
}

async function writeBlob(fileHandle: FileSystemFileHandle, blob: Blob) {
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function splitStoragePath(path: string) {
  return path.split('/').filter(Boolean);
}
