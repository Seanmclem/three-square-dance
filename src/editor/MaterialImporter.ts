import type { MaterialDef, MaterialManifest, MaterialCategory, Attribution } from "@/types";
import { readManifest, writeManifest, writeAssetFile } from "@/assets/assetLibrary";

export interface DetectedMap {
  file:    File;
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

  /** Classify the files of a picked ambientCG folder (webkitdirectory input).
   *  Only the folder's top level is scanned — same as the old directory walk. */
  scanFiles(files: File[]): DetectedMaps {
    const detected: DetectedMaps = {};
    for (const file of files) {
      // webkitRelativePath is "<folder>/<name>" for top-level files; deeper files have more segments.
      if (file.webkitRelativePath && file.webkitRelativePath.split("/").length > 2) continue;
      const mapKey = classifyFile(file.name);
      if (!mapKey || mapKey === "skip") continue;
      if (!(mapKey in detected)) {
        detected[mapKey] = { file, srcName: file.name };
      }
    }
    return detected;
  }

  async importMaterial(
    materialId:   string,
    label:        string,
    category:     MaterialCategory,
    attribution:  Attribution,
    detectedMaps: DetectedMaps,
  ): Promise<ImportResult> {
    const result: ImportResult = { materialId, copied: [], skipped: [], failed: [] };

    for (const [mapKey, info] of Object.entries(detectedMaps) as Array<[keyof MaterialDef["maps"], DetectedMap]>) {
      const targetName = `${mapKey}.jpg`;

      // Use the high/ copy as the existence check proxy
      try {
        const res = await fetch(`/assets/textures/${materialId}/high/${targetName}`, { cache: "no-store" });
        if (res.ok) {
          void res.body?.cancel();
          result.skipped.push(targetName);
          continue;
        }
      } catch { /* doesn't exist — proceed */ }

      try {
        const buf = await info.file.arrayBuffer();
        for (const quality of ["low", "medium", "high"] as const) {
          await writeAssetFile("textures", `${materialId}/${quality}/${targetName}`, buf);
        }
        result.copied.push(targetName);
      } catch (err) {
        console.error(`Failed to copy ${info.srcName} → ${targetName}`, err);
        result.failed.push(targetName);
      }
    }

    // Read or create manifest
    const manifest = await readManifest<MaterialManifest>("textures", { version: "1.0", materials: [] });

    const entry = this._buildEntry(materialId, label, category, attribution, detectedMaps);
    const idx   = manifest.materials.findIndex(m => m.id === materialId);
    if (idx >= 0) manifest.materials[idx] = entry;
    else manifest.materials.push(entry);

    await writeManifest("textures", manifest);

    return result;
  }

  private _buildEntry(
    id:           string,
    label:        string,
    category:     MaterialCategory,
    attribution:  Attribution,
    detectedMaps: DetectedMaps,
  ): MaterialDef {
    const base = `/assets/textures/${id}/{quality}`;
    return {
      id,
      label,
      category,
      ...(Object.keys(attribution).length ? { attribution } : {}),
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
