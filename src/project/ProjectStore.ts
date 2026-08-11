import type { SceneFile, GameConfig } from "@/types";
import type { RuntimeManifest } from "@/runtime/manifest";
import { desktop } from "@/shared/desktopApi";

/**
 * Phase 33 — a "project" is a directory of one game: an auto-generated
 * `manifest.json` (the runtime's boot descriptor — never hand-edited),
 * a shared `game.json` (GameConfig: items + stateSchema defaults), and
 * `scenes/<sceneId>.json` (exact editor SceneFile format).
 *
 * ALL project file IO lives here so backends swap underneath without touching
 * App. Phase 55: the backend is the desktop shell — reads go over HTTP against
 * the shell's server (`/games/<id>/…`, same URL shapes the runtime uses),
 * writes go over its HTTP api (`POST /api/<method>`; atomic + backed up on
 * the Deno side — the bindings bridge deadlocked per-launch and is unused).
 * The File System Access implementation is gone and with it the whole
 * handle-permission dance (IDB persistence, re-grant banners, user-activation
 * ordering).
 *
 * Projects live in the workspace games dir: dev = `<repo>/public/games/<id>`,
 * packaged app = `~/WorldBuilder/games/<id>` — saving IS publishing for local
 * play, same as before.
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

function api() {
  const d = desktop();
  if (!d) throw new Error("Projects need the desktop app (no bindings bridge in a plain browser).");
  return d;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return await res.json() as T;
}

const DEFAULT_GAME: GameConfig = { gameVersion: 1 };

export class ProjectStore {
  private constructor(
    public manifest: RuntimeManifest,
    public game: GameConfig,
  ) {}

  get id(): string { return this.manifest.id; }
  get name(): string { return this.manifest.name; }
  get sceneIds(): string[] { return Object.keys(this.manifest.scenes); }
  get entryScene(): string { return this.manifest.entryScene; }

  /** Create `games/<id>/` in the workspace. */
  static async create(name: string): Promise<ProjectStore> {
    const id = slugifyId(name) || "game";
    await api().createProject(id);
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
    const store = new ProjectStore(manifest, structuredClone(DEFAULT_GAME));
    await store.writeGame();
    // manifest written by the first addScene (entryScene must exist first)
    return store;
  }

  /** Open an existing project by id. Manifest problems fail loudly; a
   *  missing/invalid game.json degrades to the default (next save rewrites it). */
  static async open(projectId: string): Promise<ProjectStore> {
    let manifest: RuntimeManifest;
    try {
      manifest = await fetchJSON<RuntimeManifest>(`/games/${projectId}/manifest.json`);
    } catch {
      throw new Error(`"${projectId}" has no readable manifest.json — not a project folder.`);
    }
    if (manifest.manifestVersion !== 1) throw new Error(`Unsupported manifestVersion: ${String(manifest.manifestVersion)}`);
    if (!manifest.id || !manifest.scenes || !manifest.entryScene) throw new Error("manifest.json is missing id / scenes / entryScene.");

    let game: GameConfig = structuredClone(DEFAULT_GAME);
    try {
      const g = await fetchJSON<GameConfig>(`/games/${projectId}/game.json`);
      if (g.gameVersion === 1) game = g;
      else console.warn(`[project] game.json has unsupported gameVersion ${String(g.gameVersion)} — using defaults`);
    } catch {
      console.warn("[project] game.json missing/invalid — using defaults (next save rewrites it)");
    }
    return new ProjectStore(manifest, game);
  }

  async loadScene(id: string): Promise<SceneFile> {
    return fetchJSON<SceneFile>(`/games/${this.id}/scenes/${id}.json`);
  }

  async saveScene(id: string, file: SceneFile): Promise<void> {
    await api().saveScene(this.id, id, JSON.stringify(file, null, 2));
  }

  async addScene(id: string, file: SceneFile): Promise<void> {
    await this.saveScene(id, file);
    this.manifest.scenes[id] = `scenes/${id}.json`;
    if (!this.manifest.entryScene) this.manifest.entryScene = id;
    await this.writeManifest();
  }

  async removeScene(id: string): Promise<void> {
    await api().deleteScene(this.id, id);   // moved to workspace trash, not unlinked
    delete this.manifest.scenes[id];
    await this.writeManifest();
  }

  setEntryScene(id: string): void {
    if (id in this.manifest.scenes) this.manifest.entryScene = id;
  }

  async writeManifest(): Promise<void> {
    await api().writeProjectManifest(this.id, JSON.stringify(this.manifest, null, 2));
  }

  async writeGame(): Promise<void> {
    await api().writeGameFile(this.id, JSON.stringify(this.game, null, 2));
  }
}

// ── Session persistence (workspace settings.json via the shell) ─────────────

export async function persistLastProject(projectId: string, sceneId: string): Promise<void> {
  try { await desktop()?.setLastSession({ projectId, sceneId }); } catch { /* shell unavailable */ }
}

export async function clearLastProject(): Promise<void> {
  try { await desktop()?.setLastSession(null); } catch { /* shell unavailable */ }
}

export async function restoreLastProject(): Promise<{ projectId: string; sceneId: string } | null> {
  try { return await desktop()?.getLastSession() ?? null; } catch { return null; }
}
