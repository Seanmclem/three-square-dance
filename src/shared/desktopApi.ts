/**
 * Typed surface of the desktop shell's bindings bridge (desktop/main.ts +
 * desktop/projects.ts). JSON-serializable payloads only — Uint8Array args are
 * broken in the current CEF backend (phase-54 spike), so binary asset traffic
 * uses HTTP routes instead.
 */

export interface ProjectRow {
  id: string;
  name: string;
  entryScene: string;
  sceneIds: string[];
  updatedAt: string;
}

export interface AutosavePayload {
  meta: { projectId: string | null; sceneId: string | null; savedAt: string };
  json: string;
}

export interface DesktopApi {
  // shell
  getAppInfo(): Promise<{ version: string; platform: string; contentDir: string; stateDir: string; serveOrigin: string; dev: boolean }>;
  openRuntimeWindow(opts: { manifestUrl: string; title?: string }): Promise<{ url: string }>;
  revealPath(path: string): Promise<void>;
  getPref(key: string): Promise<string | null>;
  setPref(key: string, value: string | null): Promise<void>;

  // projects (writes; reads stay fetch('/games/…'))
  listProjects(): Promise<ProjectRow[]>;
  createProject(id: string): Promise<void>;
  saveScene(projectId: string, sceneId: string, json: string): Promise<{ backup: string | null }>;
  deleteScene(projectId: string, sceneId: string): Promise<void>;
  writeGameFile(projectId: string, json: string): Promise<void>;
  writeProjectManifest(projectId: string, json: string): Promise<void>;
  getLastSession(): Promise<{ projectId: string; sceneId: string } | null>;
  setLastSession(s: { projectId: string; sceneId: string } | null): Promise<void>;

  // autosave
  writeAutosave(meta: { projectId: string | null; sceneId: string | null }, json: string): Promise<void>;
  readAutosave(): Promise<AutosavePayload | null>;
  clearAutosave(): Promise<void>;

  // single-file export (replaces showSaveFilePicker)
  writeExportFile(name: string, text: string): Promise<{ path: string }>;
}

/** The bindings global the desktop shell injects; null in a plain browser. */
export function desktop(): DesktopApi | null {
  return (globalThis as { bindings?: DesktopApi }).bindings ?? null;
}

export function isDesktop(): boolean {
  return desktop() !== null;
}
