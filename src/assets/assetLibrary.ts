import type { AssetDef } from "@/types";
import { desktop, uploadAssetFile, type AssetKind } from "@/shared/desktopApi";

/**
 * All asset-library mutations (manifests + files under /assets/<kind>/) go
 * through the desktop shell's HTTP API. Reads stay plain fetches so the
 * workspace-over-stock overlay applies. In a plain browser every mutation
 * throws — asset management is desktop-only.
 */

// Manifest list field per kind — every manifest is { version, <key>: {id,…}[] }.
const LIST_KEY: Record<AssetKind, string> = {
  models:   "assets",
  textures: "materials",
  audio:    "sounds",
  skyboxes: "skyboxes",
  graphics: "graphics",
  decals:   "decals",
};

type ManifestEntry = { id: string };
type AnyManifest   = { version: string } & { [key: string]: unknown };

function api() {
  const d = desktop();
  if (!d) throw new Error("Asset management needs the desktop app");
  return d;
}

/** Read the CURRENT manifest (cache-bypassing). A missing/unreadable manifest
 *  throws unless `fallback` is given — importers start fresh, editors abort. */
export async function readManifest<T>(kind: AssetKind, fallback?: T): Promise<T> {
  try {
    const res = await fetch(`/assets/${kind}/manifest.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as T;
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw new Error(`manifest read failed (${kind}): ${String(err)}`);
  }
}

export async function writeManifest(kind: AssetKind, manifest: unknown): Promise<void> {
  await api().writeAssetManifest(kind, JSON.stringify(manifest, null, 2));
}

/** Write one file under /assets/<kind>/<rel> (rel may contain subdirs). */
export async function writeAssetFile(kind: AssetKind, rel: string, data: Blob | ArrayBuffer | Uint8Array): Promise<void> {
  api();
  await uploadAssetFile(kind, rel, data);
}

/** Move files (or per-material directories) to the shell's trash. Stock files
 *  that only exist in the embedded library are skipped server-side. */
export async function removeAssetFiles(kind: AssetKind, rels: string[]): Promise<void> {
  if (!rels.length) return;
  await api().deleteAssetFiles(kind, rels);
}

/** Drop entries by id (read-modify-write on the current manifest). Returns the
 *  removed entries so callers can trash their files. */
export async function removeEntries<T extends ManifestEntry>(kind: AssetKind, ids: string[]): Promise<T[]> {
  const key = LIST_KEY[kind];
  const manifest = await readManifest<AnyManifest>(kind);
  const list = manifest[key] as T[];
  const removed = list.filter(e => ids.includes(e.id));
  manifest[key] = list.filter(e => !ids.includes(e.id));
  await writeManifest(kind, manifest);
  return removed;
}

/** Rewrite the entries with matching ids via `patch`; the rest pass through. */
export async function updateEntries<T extends ManifestEntry>(kind: AssetKind, ids: string[], patch: (entry: T) => T): Promise<void> {
  const key = LIST_KEY[kind];
  const manifest = await readManifest<AnyManifest>(kind);
  manifest[key] = (manifest[key] as T[]).map(e => ids.includes(e.id) ? patch(e) : e);
  await writeManifest(kind, manifest);
}

/** Dedupe-splice: drop any existing entry with the same id, append the new one.
 *  `fallback` seeds the manifest when none exists yet. */
export async function upsertEntry<T extends ManifestEntry>(kind: AssetKind, entry: T, fallback: AnyManifest): Promise<void> {
  const key = LIST_KEY[kind];
  const manifest = await readManifest<AnyManifest>(kind, fallback);
  const list = (manifest[key] as T[]).filter(e => e.id !== entry.id);
  list.push(entry);
  manifest[key] = list;
  await writeManifest(kind, manifest);
}

/**
 * Write a generated asset (Phase 26 bake) into assets/models the same way the
 * model importer does: model + optional thumbnail as siblings, then a
 * dedupe-splice of manifest.json. The caller refreshes the registry afterwards
 * (handleAssetsReload → assets:loaded).
 */
export async function writeAssetToLibrary(
  files: { glbName: string; glb: ArrayBuffer; thumbName?: string; thumbPng?: ArrayBuffer },
  asset: AssetDef,
): Promise<void> {
  await writeAssetFile("models", files.glbName, files.glb);
  if (files.thumbName && files.thumbPng) await writeAssetFile("models", files.thumbName, files.thumbPng);
  await upsertEntry("models", asset, { version: "1.0", assets: [] });
}
