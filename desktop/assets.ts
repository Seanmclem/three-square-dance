// Asset-library writes. Reads stay HTTP GETs against serve.ts, which overlays
// the workspace over the embedded dist (VFS): stock assets ship inside the
// binary and are never copied out; user imports/edits land in the workspace
// and shadow them. Deleting a stock asset is therefore a manifest-entry
// removal — deleteAssetFiles ignores files that only exist in the VFS.

import {
  assertSafeId,
  atomicWriteText,
  backupExisting,
  trashFile,
  type Workspace,
} from "./workspace.ts";

export const ASSET_KINDS = ["models", "textures", "audio", "skyboxes", "graphics", "decals"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

function assertKind(kind: string): asserts kind is AssetKind {
  if (!(ASSET_KINDS as readonly string[]).includes(kind)) throw new Error(`unknown asset kind: ${kind}`);
}

/** rel may contain subdirs (textures/<matId>/<quality>/<map>.jpg) — validate
 *  each segment, no traversal. */
function assertSafeRel(rel: string): void {
  if (!rel || rel.startsWith("/") || rel.includes("..")) throw new Error(`unsafe path: ${JSON.stringify(rel)}`);
  for (const seg of rel.split("/")) assertSafeId(seg);
}

export async function writeAssetManifest(ws: Workspace, kind: string, json: string): Promise<void> {
  assertKind(kind);
  JSON.parse(json);
  const path = `${ws.contentDir}/assets/${kind}/manifest.json`;
  await backupExisting(ws, `assets/${kind}-manifest`, path);
  await atomicWriteText(path, json);
}

/** Raw file write (models, audio, images…). Bytes arrive as the request body
 *  (POST /api-file/<kind>/<rel>) — the JSON api can't carry binary. */
export async function writeAssetFile(ws: Workspace, kind: string, rel: string, bytes: Uint8Array): Promise<{ path: string; byteLength: number }> {
  assertKind(kind);
  assertSafeRel(rel);
  const path = `${ws.contentDir}/assets/${kind}/${rel}`;
  const dir = path.slice(0, path.lastIndexOf("/"));
  await Deno.mkdir(dir, { recursive: true });
  await backupExisting(ws, `assets/${kind}/${rel.replaceAll("/", "_")}`, path);
  const tmp = `${path}.tmp-${crypto.randomUUID().slice(0, 8)}`;
  await Deno.writeFile(tmp, bytes);
  await Deno.rename(tmp, path);
  return { path, byteLength: bytes.byteLength };
}

/** Move workspace files to trash. Files that only exist in the embedded VFS
 *  (stock assets) are silently skipped — removing their manifest entry is the
 *  deletion. Returns how many real files were trashed. */
export async function deleteAssetFiles(ws: Workspace, kind: string, rels: string[]): Promise<{ trashed: number }> {
  assertKind(kind);
  let trashed = 0;
  for (const rel of rels) {
    assertSafeRel(rel);
    const path = `${ws.contentDir}/assets/${kind}/${rel}`;
    try {
      await Deno.stat(path);
      await trashFile(ws, path);
      trashed++;
    } catch { /* not in the workspace — stock/VFS-only file, nothing to move */ }
  }
  return { trashed };
}
