// File System Access API — ambient augmentation for environments where
// these aren't yet included in the bundled DOM lib.

interface DirectoryPickerOptions {
  id?:      string;
  mode?:    "read" | "readwrite";
  startIn?: FileSystemHandle | "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
}

interface FilePickerAcceptType {
  description?: string;
  accept:       Record<string, string[]>;
}

interface SaveFilePickerOptions {
  id?:                    string;
  suggestedName?:         string;
  types?:                 FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
  startIn?:               FileSystemHandle | "desktop" | "documents" | "downloads";
}

interface OpenFilePickerOptions {
  id?:                    string;
  multiple?:              boolean;
  types?:                 FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
  startIn?:               FileSystemHandle | "desktop" | "documents" | "downloads";
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
  showSaveFilePicker(options?: SaveFilePickerOptions):   Promise<FileSystemFileHandle>;
  showOpenFilePicker(options?: OpenFilePickerOptions):   Promise<FileSystemFileHandle[]>;
}
