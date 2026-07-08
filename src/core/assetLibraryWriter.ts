import type { AssetDef, AssetManifest } from "@/types";

/**
 * Write a generated asset (Phase 26 bake) into the assets/models directory the
 * same way ModelImporterModal does for imported files: model + optional
 * thumbnail as siblings, then a dedupe-splice of manifest.json. The caller
 * refreshes the registry afterwards (handleAssetsReload → assets:loaded).
 */
export async function writeAssetToLibrary(
  dir: FileSystemDirectoryHandle,
  files: { glbName: string; glb: ArrayBuffer; thumbName?: string; thumbPng?: ArrayBuffer },
  asset: AssetDef,
): Promise<void> {
  const write = async (name: string, data: ArrayBuffer): Promise<void> => {
    const fh = await dir.getFileHandle(name, { create: true });
    const w  = await fh.createWritable();
    await w.write(data);
    await w.close();
  };

  await write(files.glbName, files.glb);
  if (files.thumbName && files.thumbPng) await write(files.thumbName, files.thumbPng);

  let manifest: AssetManifest = { version: "1.0", assets: [] };
  try {
    const mh = await dir.getFileHandle("manifest.json");
    manifest = JSON.parse(await (await mh.getFile()).text()) as AssetManifest;
  } catch { /* new manifest */ }
  manifest.assets = manifest.assets.filter(a => a.id !== asset.id);
  manifest.assets.push(asset);

  const mh = await dir.getFileHandle("manifest.json", { create: true });
  const mw = await mh.createWritable();
  await mw.write(JSON.stringify(manifest, null, 2));
  await mw.close();
}
