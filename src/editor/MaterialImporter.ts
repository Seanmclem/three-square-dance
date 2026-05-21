import type { MaterialDef, MaterialManifest } from "@/types";

export interface DetectedMap {
  handle:  FileSystemFileHandle;
  srcName: string;
}

export type DetectedMaps = Partial<Record<keyof MaterialDef["maps"], DetectedMap>>;

export interface ImportResult {
  materialId: string;
  copied:     string[];
  skipped:    string[];
  failed:     string[];
}

// Case-insensitive substring → canonical map key
const MAP_RULES: Array<{ patterns: string[]; key: keyof MaterialDef["maps"] }> = [
  { patterns: ["_color", "_diff", "_albedo"],                     key: "albedo" },
  { patterns: ["_normalgl", "_normal_gl"],                        key: "normal" },
  { patterns: ["_roughness", "_rough"],                           key: "roughness" },
  { patterns: ["_metalness", "_metal", "_metallic"],              key: "metalness" },
  { patterns: ["_ambientocclusion", "_ao"],                       key: "ao" },
  { patterns: ["_displacement", "_height", "_disp"],              key: "displacement" },
];

const SKIP_PATTERNS = ["_normaldx", "_normal_dx"];
const IMAGE_EXTS    = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function classifyFile(name: string): keyof MaterialDef["maps"] | "skip" | null {
  const lower = name.toLowerCase();
  const ext   = lower.slice(lower.lastIndexOf("."));
  if (!IMAGE_EXTS.has(ext)) return null;
  if (SKIP_PATTERNS.some(p => lower.includes(p))) return "skip";
  for (const { patterns, key } of MAP_RULES) {
    if (patterns.some(p => lower.includes(p))) return key;
  }
  return null;
}

export class MaterialImporter {

  async scanFolder(sourceDir: FileSystemDirectoryHandle): Promise<DetectedMaps> {
    const detected: DetectedMaps = {};
    for await (const [name, handle] of sourceDir.entries()) {
      if (handle.kind !== "file") continue;
      const mapKey = classifyFile(name);
      if (!mapKey || mapKey === "skip") continue;
      if (!(mapKey in detected)) {
        detected[mapKey] = { handle: handle as FileSystemFileHandle, srcName: name };
      }
    }
    return detected;
  }

  async importMaterial(
    materialId:   string,
    label:        string,
    texturesDir:  FileSystemDirectoryHandle,
    detectedMaps: DetectedMaps,
  ): Promise<ImportResult> {
    const result: ImportResult = { materialId, copied: [], skipped: [], failed: [] };

    // Create/open target subfolder
    const outDir = await texturesDir.getDirectoryHandle(materialId, { create: true });

    for (const [mapKey, info] of Object.entries(detectedMaps) as Array<[keyof MaterialDef["maps"], DetectedMap]>) {
      const targetName = `${mapKey}.jpg`;

      // Skip if already exists
      try {
        await outDir.getFileHandle(targetName);
        result.skipped.push(targetName);
        continue;
      } catch { /* doesn't exist — proceed */ }

      try {
        const srcFile = await info.handle.getFile();
        const buf     = await srcFile.arrayBuffer();
        const outHandle  = await outDir.getFileHandle(targetName, { create: true });
        const writable   = await outHandle.createWritable();
        await writable.write(buf);
        await writable.close();
        result.copied.push(targetName);
      } catch (err) {
        console.error(`Failed to copy ${info.srcName} → ${targetName}`, err);
        result.failed.push(targetName);
      }
    }

    // Read or create manifest
    let manifest: MaterialManifest = { version: "1.0", materials: [] };
    try {
      const mfHandle = await texturesDir.getFileHandle("manifest.json");
      const mfFile   = await mfHandle.getFile();
      manifest = JSON.parse(await mfFile.text()) as MaterialManifest;
    } catch { /* no manifest yet */ }

    const entry = this._buildEntry(materialId, label, detectedMaps);
    const idx   = manifest.materials.findIndex(m => m.id === materialId);
    if (idx >= 0) manifest.materials[idx] = entry;
    else manifest.materials.push(entry);

    const mfOut  = await texturesDir.getFileHandle("manifest.json", { create: true });
    const mfWrit = await mfOut.createWritable();
    await mfWrit.write(JSON.stringify(manifest, null, 2));
    await mfWrit.close();

    return result;
  }

  private _buildEntry(
    id:           string,
    label:        string,
    detectedMaps: DetectedMaps,
  ): MaterialDef {
    const base = `/assets/textures/${id}`;
    return {
      id,
      label,
      tileScale:         1.0,
      roughnessVal:      0.85,
      metalnessVal:      0.0,
      displacementScale: 0.03,
      maps: {
        albedo:       { enabled: true,                        path: `${base}/albedo.jpg` },
        normal:       { enabled: "normal" in detectedMaps,    path: `${base}/normal.jpg` },
        roughness:    { enabled: "roughness" in detectedMaps, path: `${base}/roughness.jpg` },
        metalness:    { enabled: false,                       path: `${base}/metalness.jpg` },
        ao:           { enabled: "ao" in detectedMaps,        path: `${base}/ao.jpg` },
        displacement: { enabled: false,                       path: `${base}/displacement.jpg` },
      },
    };
  }
}

export const materialImporter = new MaterialImporter();
