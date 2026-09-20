import * as THREE from "three";
import type { AssetManager } from "@/core/AssetManager";
import type { SceneFile } from "@/types";
import { collectAssetRefs, type AssetKind, type AssetRefs } from "@/export/assetRefs";
import type { LoadedManifest } from "./manifest";

const KINDS: AssetKind[] = ["models", "textures", "skyboxes", "decals", "graphics", "audio"];

/** Menu tier: nothing is being played, so decode freely — 6 matches the browser's
 *  per-host connection limit. */
const WARM_CONCURRENCY = 6;
/** Play tier: stay out of the way of the running level's own lazy loads. */
const PREFETCH_CONCURRENCY = 2;
/** Let the level's first frames (shader compiles, texture uploads, its own late
 *  loads) settle before spending bandwidth on the next one. */
const PREFETCH_DELAY_MS = 3000;
/** A hub level can link many scenes; bound the speculative download. */
const MAX_NEXT_SCENES = 3;

/**
 * Gets a level's assets ahead of the moment the player needs them. Two depths:
 *
 *  - `warm(sceneId)` — MENU: download AND decode into AssetManager's caches, so
 *    Start finds the level already in memory. Main-thread parsing is free here;
 *    no gameplay is running to hitch.
 *  - `sceneEntered(...)` — PLAYING: find the level's `load_scene` targets and
 *    download (never decode) what those levels need into the browser's HTTP
 *    cache at low priority. The transition then parses from disk instead of
 *    waiting on the network, and gameplay frames are never touched.
 *
 * Purely speculative: every failure is swallowed (the real load reports real
 * errors), and `stop()` halts queued work the moment a transition begins —
 * downloads already in flight finish and are shared with the level build via
 * AssetManager's in-flight map / the browser's cache.
 */
export class ScenePreloader {
  private _gen = 0;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  /** `${kind}:${id}` already decoded in memory / already downloaded. */
  private readonly _warmed  = new Set<string>();
  private readonly _fetched = new Set<string>();
  private readonly _images: HTMLImageElement[] = [];   // keep <img> preloads alive until they settle
  /** The host refuses caching (the dev shell serves the workspace no-store):
   *  a download-only prefetch would just be fetched again, so stop doing it. */
  private _cacheless = false;

  /** Counters for tests / the dev console (`__runtime.preloader.stats`). */
  readonly stats = { warmed: 0, prefetched: 0, skipped: 0, failed: 0 };

  constructor(private readonly deps: {
    assets:   AssetManager;
    manifest: LoadedManifest;
    /** Resolves once every asset registry is populated — ids can't be mapped to files before. */
    ready:    Promise<unknown>;
  }) {}

  /** Halt queued work (in-flight items finish). Called when a transition starts. */
  stop(): void {
    this._gen++;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  dispose(): void {
    this.stop();
    this._images.length = 0;
  }

  /** MENU tier — download + decode everything `sceneId` references. */
  async warm(sceneId: string): Promise<void> {
    const gen = this._gen;
    await this.deps.ready;
    const refs = await this._refsOf(sceneId, "auto");
    if (!refs || gen !== this._gen) return;
    const tasks: Array<() => Promise<unknown>> = [];
    for (const kind of KINDS) {
      for (const id of this._ids(refs, kind)) {
        const key = `${kind}:${id}`;
        if (this._warmed.has(key)) { this.stats.skipped++; continue; }
        tasks.push(async () => { await this._decode(kind, id); this._warmed.add(key); this.stats.warmed++; });
      }
    }
    await this._run(tasks, WARM_CONCURRENCY, gen);
  }

  /** PLAYING tier, download only. Also usable from the menu for a second candidate scene. */
  async prefetch(sceneId: string): Promise<void> {
    if (this._cacheless || saveData()) return;
    const gen = this._gen;
    await this.deps.ready;
    const refs = await this._refsOf(sceneId, "low");
    if (!refs || gen !== this._gen) return;
    const tasks: Array<() => Promise<unknown>> = [];
    for (const kind of KINDS) {
      for (const id of this._ids(refs, kind)) {
        const key = `${kind}:${id}`;
        if (this._warmed.has(key) || this._fetched.has(key)) { this.stats.skipped++; continue; }
        tasks.push(async () => {
          for (const url of this._urls(kind, id)) await this._download(url);
          if (this._cacheless) return;   // found out mid-run: nothing was kept
          this._fetched.add(key);
          this.stats.prefetched++;
        });
      }
    }
    await this._run(tasks, PREFETCH_CONCURRENCY, gen);
  }

  /**
   * The router finished building `file`. Everything it references is now in
   * memory (audio aside — sounds load when first played), so later prefetches
   * skip it; then, once the level has settled, download its next levels.
   */
  sceneEntered(sceneId: string, file: SceneFile): void {
    this.stop();
    const refs = collectAssetRefs([file], this.deps.manifest.game);
    for (const kind of KINDS) {
      if (kind === "audio") continue;
      for (const id of this._ids(refs, kind)) this._warmed.add(`${kind}:${id}`);
    }
    const known = this.deps.manifest.manifest.scenes;
    const next = [...refs.scenes].filter(id => id !== sceneId && id in known).slice(0, MAX_NEXT_SCENES);
    if (next.length === 0) return;
    const gen = this._gen;
    this._timer = setTimeout(() => {
      this._timer = null;
      void (async () => {
        for (const id of next) {
          if (gen !== this._gen) return;
          await this.prefetch(id);
        }
      })();
    }, PREFETCH_DELAY_MS);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** Graphic ids + raw `<img src>` paths share one kind; everything else is its own set. */
  private _ids(refs: AssetRefs, kind: AssetKind): string[] {
    if (kind !== "graphics") return [...refs[kind]];
    return [...refs.graphics, ...[...refs.rawPaths].map(p => `path:${p}`)];
  }

  private async _refsOf(sceneId: string, priority: RequestPriority): Promise<AssetRefs | null> {
    try {
      const res = await fetch(this.deps.manifest.sceneUrl(sceneId).href, { priority });
      if (!res.ok) return null;
      return collectAssetRefs([await res.json() as SceneFile], this.deps.manifest.game);
    } catch {
      return null;   // unknown scene id / network — the real load reports it
    }
  }

  private async _decode(kind: AssetKind, id: string): Promise<void> {
    const a = this.deps.assets;
    switch (kind) {
      case "models":   await a.preloadModel(id); break;
      case "textures": await a.getMaterial(id); break;
      case "skyboxes": await a.loadSkybox(id); break;
      case "audio":    await a.loadSound(id); break;
      case "decals": {   // mirrors ZoneManager's decal texture loads, so the cache keys match
        const d = a.getDecalDef(id);
        if (!d) break;
        await a.loadTexture(d.path);
        if (d.maps?.normal)    await a.loadTexture(d.maps.normal, THREE.NoColorSpace);
        if (d.maps?.roughness) await a.loadTexture(d.maps.roughness, THREE.NoColorSpace);
        break;
      }
      case "graphics":   // UI overlays use plain <img src>; decode into the browser's image cache
        for (const url of this._urls(kind, id)) await this._image(url);
        break;
    }
  }

  private _urls(kind: AssetKind, id: string): string[] {
    return id.startsWith("path:") ? [this.deps.assets.resolveUrl(id.slice(5))] : this.deps.assets.fileUrls(kind, id);
  }

  private _image(url: string): Promise<void> {
    return new Promise(resolve => {
      const img = new Image();
      this._images.push(img);
      const done = () => { this._images.splice(this._images.indexOf(img), 1); resolve(); };
      img.onload = done;
      img.onerror = done;
      img.src = url;
    });
  }

  /** Pull a file through the HTTP cache and drop the bytes (streamed — no big buffer). */
  private async _download(url: string): Promise<void> {
    if (this._cacheless) return;
    const res = await fetch(url, { priority: "low" });
    this._noteCaching(res);
    const reader = res.body?.getReader();
    if (!reader) return;
    if (this._cacheless) { await reader.cancel(); return; }
    while (!(await reader.read()).done) { /* discard */ }
  }

  private _noteCaching(res: Response): void {
    if (/no-store/i.test(res.headers.get("cache-control") ?? "")) this._cacheless = true;
  }

  /** Bounded-concurrency queue; every worker re-checks `gen` before taking the next task. */
  private async _run(tasks: Array<() => Promise<unknown>>, concurrency: number, gen: number): Promise<void> {
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < tasks.length && gen === this._gen) {
        const task = tasks[next++]!;
        try { await task(); } catch { this.stats.failed++; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  }
}

/** The user asked the browser to save data — don't speculate with their bandwidth. */
function saveData(): boolean {
  return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
}
