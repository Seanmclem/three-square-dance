// Self-contained game export (phase D): builds a static-host-ready folder with
// the runtime shell, the project's JSON, and ONLY the asset files the game
// references. Replaces the FSA "Publish" flow deleted in phase 55.
//
// Bundle layout (stateDir/exports/<projectId>-bundle/):
//   index.html                 tiny redirect into runtime.html?manifest=./manifest.json
//   runtime.html               copied from dist ("/assets/" script refs → "./assets/")
//   manifest.json              game manifest, assetsBase rewritten to "./"
//   game.json + scenes/*.json  the project's JSON, paths preserved
//   assets/*.js                Vite's hashed chunks (depth-1 dist/assets files only)
//   assets/<kind>/manifest.json  pruned to the referenced entries
//   assets/<kind>/<rel>          referenced files, workspace-first with dist fallback

import { assertSafeId, atomicWriteText, type Workspace } from "./workspace.ts";
import {
  collectAssetRefs,
  resolveAssetFiles,
  type AssetKind,
  type ManifestSet,
} from "../src/export/assetRefs.ts";
import type { GameConfig, SceneFile } from "../src/types.ts";

const ASSET_KINDS: AssetKind[] = ["models", "textures", "audio", "skyboxes", "graphics", "decals"];

interface ProjectManifest {
  manifestVersion: number;
  id: string;
  entryScene: string;
  scenes: Record<string, string>;
  assetsBase?: string;
  game?: string;
}

/** Project-relative paths from manifest.json (scene files, game.json) — no traversal. */
function assertSafeRel(rel: string): void {
  if (!rel || rel.startsWith("/") || rel.includes("..")) throw new Error(`unsafe project path: ${JSON.stringify(rel)}`);
  for (const seg of rel.split("/")) assertSafeId(seg);
}

export async function exportGameBundle(
  ws: Workspace,
  distDir: string,
  opts: { projectId: string; format?: "folder" },
): Promise<{ outputPath: string; fileCount: number; totalBytes: number; missing: string[] }> {
  assertSafeId(opts.projectId);
  const projDir = `${ws.contentDir}/games/${opts.projectId}`;
  const outDir = `${ws.stateDir}/exports/${opts.projectId}-bundle`;

  // ── read the project ──────────────────────────────────────────────────────
  const manifest = JSON.parse(await Deno.readTextFile(`${projDir}/manifest.json`)) as ProjectManifest;
  if (manifest.manifestVersion !== 1) throw new Error(`unsupported manifestVersion: ${manifest.manifestVersion}`);

  const sceneRels = Object.values(manifest.scenes ?? {});
  if (sceneRels.length === 0) throw new Error("project has no scenes");
  sceneRels.forEach(assertSafeRel);
  const scenes: SceneFile[] = [];
  const sceneTexts = new Map<string, string>();
  for (const rel of sceneRels) {
    const text = await Deno.readTextFile(`${projDir}/${rel}`);
    sceneTexts.set(rel, text);
    scenes.push(JSON.parse(text) as SceneFile);
  }

  let game: GameConfig | null = null;
  let gameText: string | null = null;
  if (manifest.game) {
    assertSafeRel(manifest.game);
    try {
      gameText = await Deno.readTextFile(`${projDir}/${manifest.game}`);
      game = JSON.parse(gameText) as GameConfig;
    } catch {
      gameText = null;   // absent game.json is never fatal (runtime treats it the same)
    }
  }

  // ── collect + resolve asset references ────────────────────────────────────
  // Asset manifests read with the same overlay the shell serves: workspace
  // shadows the embedded dist (stock assets live only in dist).
  const readOverlay = async (rel: string): Promise<string | null> => {
    for (const root of [ws.contentDir, distDir]) {
      try {
        return await Deno.readTextFile(`${root}/${rel}`);
      } catch { /* try next */ }
    }
    return null;
  };

  const manifests: ManifestSet = {};
  for (const kind of ASSET_KINDS) {
    const text = await readOverlay(`assets/${kind}/manifest.json`);
    // deno-lint-ignore no-explicit-any
    if (text) (manifests as Record<string, any>)[kind] = JSON.parse(text);
  }

  const refs = collectAssetRefs(scenes, game);
  const { files, prunedManifests, missing } = resolveAssetFiles(refs, manifests);
  // Runtime fallback: an assetId with no manifest entry still loads from
  // /assets/models/<id>.glb (AssetManager.loadGLTF) — ship the file when it exists.
  for (const id of refs.models) {
    const known = (manifests.models?.assets ?? []).some((a) => a.id === id);
    if (!known) files.push({ kind: "models", rel: `${id}.glb` });
  }

  // ── write the bundle ──────────────────────────────────────────────────────
  await Deno.remove(outDir, { recursive: true }).catch(() => {});
  await Deno.mkdir(outDir, { recursive: true });

  let fileCount = 0;
  let totalBytes = 0;
  const writeText = async (rel: string, text: string): Promise<void> => {
    await atomicWriteText(`${outDir}/${rel}`, text);
    fileCount++;
    totalBytes += new TextEncoder().encode(text).byteLength;
  };
  /** Copy workspace-first, then dist (embedded VFS in the compiled app). */
  const copyOverlay = async (rel: string): Promise<boolean> => {
    for (const root of [ws.contentDir, distDir]) {
      try {
        const src = `${root}/${rel}`;
        const stat = await Deno.stat(src);
        if (!stat.isFile) continue;
        const dest = `${outDir}/${rel}`;
        await Deno.mkdir(dest.slice(0, dest.lastIndexOf("/")), { recursive: true });
        await Deno.copyFile(src, dest);
        fileCount++;
        totalBytes += stat.size;
        return true;
      } catch { /* try next */ }
    }
    return false;
  };

  // Runtime shell page. Vite emits absolute "/assets/…" script refs; the bundle
  // must work from any static-host subpath, so rebase them to "./assets/…".
  const runtimeHtml = await Deno.readTextFile(`${distDir}/runtime.html`);
  await writeText("runtime.html", runtimeHtml.replaceAll('"/assets/', '"./assets/'));

  // Vite's hashed js/css chunks: depth-1 files of dist/assets only — the
  // SUBDIRS there are the full copied asset library, which this export prunes.
  for await (const e of Deno.readDir(`${distDir}/assets`)) {
    if (!e.isFile) continue;
    const stat = await Deno.stat(`${distDir}/assets/${e.name}`);
    await Deno.mkdir(`${outDir}/assets`, { recursive: true });
    await Deno.copyFile(`${distDir}/assets/${e.name}`, `${outDir}/assets/${e.name}`);
    fileCount++;
    totalBytes += stat.size;
  }

  // Entry redirect, so the bundle root URL just works.
  await writeText(
    "index.html",
    `<!doctype html><script>location.replace("./runtime.html?manifest=" + encodeURIComponent("./manifest.json"));</script>\n`,
  );

  // Game manifest at bundle root — assets now live beside it.
  await writeText("manifest.json", JSON.stringify({ ...manifest, assetsBase: "./" }, null, 2));
  for (const [rel, text] of sceneTexts) await writeText(rel, text);
  if (manifest.game && gameText !== null) await writeText(manifest.game, gameText);

  // Referenced asset files + pruned per-kind manifests.
  for (const f of files) {
    if (!(await copyOverlay(`assets/${f.kind}/${f.rel}`))) missing.push(`${f.kind}: file not found "${f.rel}"`);
  }
  for (const kind of ASSET_KINDS) {
    await writeText(`assets/${kind}/manifest.json`, JSON.stringify(prunedManifests[kind], null, 2));
  }

  return { outputPath: outDir, fileCount, totalBytes, missing };
}
