/**
 * Client for the desktop shell's HTTP API (desktop/main.ts).
 *
 * Transport note (phase 55): this started on the webview bindings bridge —
 * in-process, 1 MB string in 28 ms — but the bridge intermittently deadlocks
 * at launch (first call never resolves), which hung the editor boot on
 * readAutosave and blanked the window. Plain HTTP against the shell's own
 * Deno.serve has been reliable in every run, so ALL app traffic goes over
 * `POST /api/<method>` (JSON array of args); the bindings global remains only
 * as a spike diagnostic.
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

  // single-file export (replaces the browser save-file picker)
  writeExportFile(name: string, text: string): Promise<{ path: string }>;

  // self-contained game export: runtime shell + project JSON + referenced assets
  exportGameBundle(opts: { projectId: string; format?: "folder" }): Promise<{ outputPath: string; fileCount: number; totalBytes: number; missing: string[] }>;

  // asset library (binary file uploads use uploadAssetFile below — the JSON
  // api can't carry bytes)
  writeAssetManifest(kind: AssetKind, json: string): Promise<void>;
  deleteAssetFiles(kind: AssetKind, rels: string[]): Promise<{ trashed: number }>;
}

export type AssetKind = "models" | "textures" | "audio" | "skyboxes" | "graphics" | "decals";

/** Raw-bytes asset write: POST /api-file/<kind>/<rel>. `rel` may contain
 *  subdirs (textures/<matId>/<quality>/<map>.jpg). Desktop shell only. */
export async function uploadAssetFile(kind: AssetKind, rel: string, data: Blob | ArrayBuffer | Uint8Array): Promise<{ path: string; byteLength: number }> {
  const body = data instanceof Blob ? data : new Blob([data instanceof Uint8Array ? (data.slice().buffer as ArrayBuffer) : data]);
  const res = await fetch(`/api-file/${kind}/${rel.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", body });
  const json = await res.json() as { error?: string; path: string; byteLength: number };
  if (!res.ok) throw new Error(json?.error ?? `api-file → HTTP ${res.status}`);
  return json;
}

async function call(method: string, args: unknown[]): Promise<unknown> {
  const res = await fetch(`/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const body = await res.json() as { error?: string } | null;
  if (!res.ok) throw new Error(body && "error" in (body as object) ? (body as { error: string }).error : `api/${method} → HTTP ${res.status}`);
  return body;
}

const client = new Proxy({}, {
  get: (_t, method: string) => (...args: unknown[]) => call(method, args),
}) as DesktopApi;

let _detected: boolean | null = null;
let _appInfo: { dev?: boolean } | null = null;

/** Resolve whether the desktop shell is serving this page (cached). Call once
 *  early in boot; sync accessors below answer from the cache afterwards. */
export async function detectDesktop(): Promise<boolean> {
  if (_detected === null) {
    try {
      const res = await fetch("/api/getAppInfo");
      _detected = res.ok;
      if (res.ok) _appInfo = await res.json().catch(() => null);
    } catch {
      _detected = false;
    }
  }
  return _detected;
}

/** The shell API, or null when not (yet known to be) running under the shell.
 *  Before detectDesktop() resolves this returns null — callers fall back to
 *  their browser path, which is the safe default. */
export function desktop(): DesktopApi | null {
  return _detected === true ? client : null;
}

export function isDesktop(): boolean {
  return _detected === true;
}

/** True when the serving shell is a DEV shell (deno task desktop:hmr / desktop:dev).
 *  The shell serves the production dist, where import.meta.env.DEV is false — this
 *  flag re-enables the dev tooling (window.__* globals, __test harness) there.
 *  Packaged builds report dev:false, so end users never get the globals. */
export function isDesktopDev(): boolean {
  return _detected === true && _appInfo?.dev === true;
}
