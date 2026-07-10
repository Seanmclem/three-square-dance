import type { GameConfig } from "@/types";

/**
 * Runtime manifest (v1) — the shell's boot descriptor. A tiny JSON file,
 * loadable from any URL (CORS permitting), that names the experience and maps
 * scene ids to scene-JSON URLs (each scene = a full SceneFile as saved by the
 * editor). All relative URLs resolve against the manifest's own URL.
 */
export interface RuntimeManifest {
  manifestVersion: 1;
  /** Stable slug — namespaces the game save; future registry key. */
  id:          string;
  name:        string;
  version?:     string;
  description?: string;
  author?:      string;
  /** Reserved for the future launcher UI; unused by the v1 shell. */
  thumbnail?:   string;
  entryScene:  string;
  scenes:      Record<string, string>;
  /** Base for the /assets/** tree (texture/model/decal manifests and all
   *  their paths). Default: the manifest's directory. */
  assetsBase?:  string;
  /** URL of a shared GameConfig (game.json) — items + stateSchema defaults
   *  merged under every scene's own config (Phase 33). Relative to the manifest. */
  game?:        string;
}

export interface LoadedManifest {
  manifest:      RuntimeManifest;
  url:           URL;
  assetsBaseUrl: URL;
  /** Parsed game.json, or null (absent / failed to load — never fatal). */
  game:          GameConfig | null;
  sceneUrl(id: string): URL;
}

/** Fetch + validate a manifest; resolve scene/asset URLs against its URL. */
export async function loadManifest(rawUrl: string): Promise<LoadedManifest> {
  const url = new URL(rawUrl, window.location.href);
  let res: Response;
  try {
    res = await fetch(url.href);
  } catch (err) {
    throw new Error(
      `Could not fetch manifest at ${url.href} — if it lives on another origin, ` +
      `the server must send CORS headers (Access-Control-Allow-Origin). (${String(err)})`,
    );
  }
  if (!res.ok) throw new Error(`Manifest fetch failed: HTTP ${res.status} for ${url.href}`);

  let m: Partial<RuntimeManifest>;
  try {
    m = await res.json() as Partial<RuntimeManifest>;
  } catch {
    throw new Error(`Manifest at ${url.href} is not valid JSON — check the URL (dev servers often return an HTML fallback for missing files).`);
  }
  if (m.manifestVersion !== 1) throw new Error(`Unsupported manifestVersion: ${String(m.manifestVersion)} (this runtime supports 1)`);
  if (!m.id || !m.name)        throw new Error("Manifest is missing required fields: id, name");
  if (!m.scenes || typeof m.scenes !== "object" || Object.keys(m.scenes).length === 0)
    throw new Error("Manifest has no scenes");
  if (!m.entryScene || !(m.entryScene in m.scenes))
    throw new Error(`Manifest entryScene "${String(m.entryScene)}" is not a key of scenes`);

  const manifest = m as RuntimeManifest;
  const assetsBaseUrl = new URL(manifest.assetsBase ?? "./", url);

  // Shared game config — best-effort: a missing/broken game.json must never
  // brick a game whose scenes are fine.
  let game: GameConfig | null = null;
  if (manifest.game) {
    try {
      const gres = await fetch(new URL(manifest.game, url).href);
      if (!gres.ok) throw new Error(`HTTP ${gres.status}`);
      const g = await gres.json() as Partial<GameConfig>;
      if (g.gameVersion !== 1) throw new Error(`unsupported gameVersion ${String(g.gameVersion)}`);
      game = g as GameConfig;
    } catch (err) {
      console.warn(`[manifest] game config '${manifest.game}' skipped:`, err);
    }
  }

  return {
    manifest,
    url,
    assetsBaseUrl,
    game,
    sceneUrl(id: string): URL {
      const rel = manifest.scenes[id];
      if (!rel) throw new Error(`Unknown scene id "${id}" — not in the manifest`);
      return new URL(rel, url);
    },
  };
}
