type FileSystemWriteChunkType = BufferSource | Blob | string;

interface FileSystemCreateHandleOptions {
  create?: boolean;
}

interface FileSystemRemoveOptions {
  recursive?: boolean;
}

interface FileSystemHandle {
  readonly kind: 'directory' | 'file';
  readonly name: string;
}

interface FileSystemWritableFileStream extends WritableStream<FileSystemWriteChunkType> {
  close: () => Promise<void>;
  write: (data: FileSystemWriteChunkType) => Promise<void>;
}

interface FileSystemFileHandle extends FileSystemHandle {
  readonly kind: 'file';
  createWritable: () => Promise<FileSystemWritableFileStream>;
  getFile: () => Promise<File>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  readonly kind: 'directory';
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  getDirectoryHandle: (
    name: string,
    options?: FileSystemCreateHandleOptions
  ) => Promise<FileSystemDirectoryHandle>;
  getFileHandle: (
    name: string,
    options?: FileSystemCreateHandleOptions
  ) => Promise<FileSystemFileHandle>;
  removeEntry: (name: string, options?: FileSystemRemoveOptions) => Promise<void>;
}

interface StorageManager {
  getDirectory: () => Promise<FileSystemDirectoryHandle>;
}
