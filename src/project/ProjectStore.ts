import type { SceneFile, GameConfig } from "@/types";
import type { RuntimeManifest } from "@/runtime/manifest";
import { idbSet, idbGet } from "@/lib/fileHandleStore";

/**
 * Phase 33 — a "project" is a directory of one game: an auto-generated
 * `manifest.json` (the runtime's boot descriptor — never hand-edited),
 * a shared `game.json` (GameConfig: items + stateSchema defaults), and
 * `scenes/<sceneId>.json` (exact editor SceneFile format).
 *
 * ALL project file IO lives here so future backends (fully-external folders,
 * zip export, remote publish) swap underneath without touching App.
 *
 * Default home is `<repo>/public/games/<id>/` — served by the dev server at
 * `/games/<id>/…`, so saving IS publishing for local play (PUBLISHING_GUIDE §0).
 */

export function slugifyId(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
  return s || "scene";
}

/** First free id: base, base_2, base_3, … */
export function uniqueSceneId(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  let k = 2;
  while (existing.includes(`${base}_${k}`)) k++;
  return `${base}_${k}`;
}

async function writeJSON(dir: FileSystemDirectoryHandle, name: string, data: unknown): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w  = await fh.createWritable();
  await w.write(JSON.stringify(data, null, 2));
  await w.close();
}

async function readJSON<T>(dir: FileSystemDirectoryHandle, name: string): Promise<T> {
  const fh   = await dir.getFileHandle(name);
  const file = await fh.getFile();
  return JSON.parse(await file.text()) as T;
}

const DEFAULT_GAME: GameConfig = { gameVersion: 1 };

export class ProjectStore {
  private constructor(
    readonly dir: FileSystemDirectoryHandle,
    public manifest: RuntimeManifest,
    public game: GameConfig,
  ) {}

  get id(): string { return this.manifest.id; }
  get name(): string { return this.manifest.name; }
  get sceneIds(): string[] { return Object.keys(this.manifest.scenes); }
  get entryScene(): string { return this.manifest.entryScene; }

  /** Create `<id>/` INSIDE parentDir (pick public/games once → public/games/<id>). */
  static async create(parentDir: FileSystemDirectoryHandle, name: string): Promise<ProjectStore> {
    const id  = slugifyId(name) || "game";
    const dir = await parentDir.getDirectoryHandle(id, { create: true });
    const manifest: RuntimeManifest = {
      manifestVersion: 1,
      id,
      name,
      version: "1.0.0",
      entryScene: "",
      scenes: {},
      assetsBase: "/",       // /assets/** resolves against the app origin (demo precedent)
      game: "game.json",
    };
    const store = new ProjectStore(dir, manifest, structuredClone(DEFAULT_GAME));
    await store.writeGame();
    // manifest written by the first addScene (entryScene must exist first)
    return store;
  }

  /** Open an existing project folder. Manifest problems fail loudly; a
   *  missing/invalid game.json degrades to the default (next save rewrites it). */
  static async open(dir: FileSystemDirectoryHandle): Promise<ProjectStore> {
    let manifest: RuntimeManifest;
    try {
      manifest = await readJSON<RuntimeManifest>(dir, "manifest.json");
    } catch {
      throw new Error(`"${dir.name}" has no readable manifest.json — not a project folder.`);
    }
    if (manifest.manifestVersion !== 1) throw new Error(`Unsupported manifestVersion: ${String(manifest.manifestVersion)}`);
    if (!manifest.id || !manifest.scenes || !manifest.entryScene) throw new Error("manifest.json is missing id / scenes / entryScene.");

    let game: GameConfig = structuredClone(DEFAULT_GAME);
    try {
      const g = await readJSON<GameConfig>(dir, "game.json");
      if (g.gameVersion === 1) game = g;
      else console.warn(`[project] game.json has unsupported gameVersion ${String(g.gameVersion)} — using defaults`);
    } catch {
      console.warn("[project] game.json missing/invalid — using defaults (next save rewrites it)");
    }
    return new ProjectStore(dir, manifest, game);
  }

  private async _scenesDir(): Promise<FileSystemDirectoryHandle> {
    return this.dir.getDirectoryHandle("scenes", { create: true });
  }

  async loadScene(id: string): Promise<SceneFile> {
    return readJSON<SceneFile>(await this._scenesDir(), `${id}.json`);
  }

  async saveScene(id: string, file: SceneFile): Promise<void> {
    await writeJSON(await this._scenesDir(), `${id}.json`, file);
  }

  async addScene(id: string, file: SceneFile): Promise<void> {
    await this.saveScene(id, file);
    this.manifest.scenes[id] = `scenes/${id}.json`;
    if (!this.manifest.entryScene) this.manifest.entryScene = id;
    await this.writeManifest();
  }

  async removeScene(id: string): Promise<void> {
    try { await (await this._scenesDir()).removeEntry(`${id}.json`); } catch { /* already gone */ }
    delete this.manifest.scenes[id];
    await this.writeManifest();
  }

  setEntryScene(id: string): void {
    if (id in this.manifest.scenes) this.manifest.entryScene = id;
  }

  async writeManifest(): Promise<void> {
    await writeJSON(this.dir, "manifest.json", this.manifest);
  }

  async writeGame(): Promise<void> {
    await writeJSON(this.dir, "game.json", this.game);
  }

  /** Copy manifest + game + scenes INTO the picked target folder (pickers have
   *  New Folder, so no extra <id> nesting). Returns the file count. Assets are
   *  deliberately NOT copied — see PUBLISHING_GUIDE.md (assetsBase). */
  async publishTo(target: FileSystemDirectoryHandle): Promise<number> {
    let n = 0;
    await writeJSON(target, "manifest.json", this.manifest); n++;
    await writeJSON(target, "game.json", this.game); n++;
    const srcScenes = await this._scenesDir();
    const dstScenes = await target.getDirectoryHandle("scenes", { create: true });
    for (const id of this.sceneIds) {
      const file = await readJSON<SceneFile>(srcScenes, `${id}.json`);
      await writeJSON(dstScenes, `${id}.json`, file); n++;
    }
    return n;
  }
}

// ── Session persistence (IDB, mirroring the 'lastFileHandle' pattern) ────────

const LAST_PROJECT_KEY = "lastProject";

interface LastProject {
  dir:     FileSystemDirectoryHandle;
  name:    string;   // stored so the reopen banner renders WITHOUT read permission
  sceneId: string;
}

export async function persistLastProject(dir: FileSystemDirectoryHandle, name: string, sceneId: string): Promise<void> {
  try { await idbSet(LAST_PROJECT_KEY, { dir, name, sceneId } satisfies LastProject); } catch { /* IDB unavailable */ }
}

export async function clearLastProject(): Promise<void> {
  try { await idbSet(LAST_PROJECT_KEY, undefined); } catch { /* IDB unavailable */ }
}

export async function restoreLastProject(): Promise<(LastProject & { granted: boolean }) | null> {
  try {
    const stored = await idbGet<LastProject>(LAST_PROJECT_KEY);
    if (!stored?.dir) return null;
    const perm = await stored.dir.queryPermission({ mode: "readwrite" });
    return { ...stored, granted: perm === "granted" };
  } catch {
    return null;
  }
}

/** MUST be called from a user gesture (Chrome requirement). */
export async function requestProjectPermission(dir: FileSystemDirectoryHandle): Promise<boolean> {
  try { return (await dir.requestPermission({ mode: "readwrite" })) === "granted"; }
  catch { return false; }
}
