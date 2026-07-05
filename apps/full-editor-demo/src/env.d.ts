/// <reference types="vite/client" />

type FileSystemWriteChunkType = BufferSource | Blob | string;

interface FileSystemCreateHandleOptions {
  create?: boolean;
}

interface FileSystemRemoveOptions {
  recursive?: boolean;
}

interface FileSystemWritableFileStream extends WritableStream<FileSystemWriteChunkType> {
  close: () => Promise<void>;
  write: (data: FileSystemWriteChunkType) => Promise<void>;
}

interface FileSystemFileHandle {
  createWritable: () => Promise<FileSystemWritableFileStream>;
  getFile: () => Promise<File>;
}

interface FileSystemDirectoryHandle {
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
