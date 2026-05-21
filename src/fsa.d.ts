// File System Access API — ambient augmentation for environments where
// these aren't yet included in the bundled DOM lib.

interface DirectoryPickerOptions {
  id?:      string;
  mode?:    "read" | "readwrite";
  startIn?: FileSystemHandle | "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
