import type { MaterialDef, MaterialManifest, MaterialCategory, Attribution } from "@/types";
import { readManifest, writeManifest, writeAssetFile } from "@/assets/assetLibrary";

export interface DetectedMap {
  file:    File;
  srcName: string;
}

export type DetectedMaps = Partial<Record<keyof MaterialDef["maps"], DetectedMap>>;

/** One image of a "folder of PNGs" import — becomes its own albedo-only material. */
export interface ImageEntry {
  id:    string;
  label: string;
  file:  File;
}

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
    tags:         string[],
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

    await this._upsertManifest([this._buildEntry(materialId, label, category, attribution, tags, detectedMaps)]);

    return result;
  }

  /** Top-level image files of a picked folder, for the "folder of PNGs" import type. */
  scanImages(files: File[]): File[] {
    return files
      .filter(f => !(f.webkitRelativePath && f.webkitRelativePath.split("/").length > 2))
      .filter(f => IMAGE_EXTS.has(f.name.toLowerCase().slice(f.name.lastIndexOf("."))))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Import each image as its own material with only an albedo map. The file keeps its
   *  extension (albedo.png), and the manifest is written once for the whole batch. */
  async importImages(
    entries:     ImageEntry[],
    category:    MaterialCategory,
    attribution: Attribution,
    tags:        string[],
  ): Promise<ImportResult[]> {
    const results: ImportResult[] = [];
    const defs:    MaterialDef[]   = [];
    for (const { id, label, file } of entries) {
      const result: ImportResult = { materialId: id, copied: [], skipped: [], failed: [] };
      const ext        = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
      const targetName = `albedo${ext}`;
      try {
        const res = await fetch(`/assets/textures/${id}/high/${targetName}`, { cache: "no-store" });
        if (res.ok) {
          void res.body?.cancel();
          result.skipped.push(targetName);
        }
      } catch { /* doesn't exist — proceed */ }
      if (!result.skipped.length) {
        try {
          const buf = await file.arrayBuffer();
          for (const quality of ["low", "medium", "high"] as const) {
            await writeAssetFile("textures", `${id}/${quality}/${targetName}`, buf);
          }
          result.copied.push(targetName);
        } catch (err) {
          console.error(`Failed to copy ${file.name} → ${id}/${targetName}`, err);
          result.failed.push(targetName);
        }
      }
      results.push(result);
      if (!result.failed.length) defs.push(this._buildEntry(id, label, category, attribution, tags, {}, targetName));
    }
    await this._upsertManifest(defs);
    return results;
  }

  private async _upsertManifest(entries: MaterialDef[]): Promise<void> {
    const manifest = await readManifest<MaterialManifest>("textures", { version: "1.0", materials: [] });
    for (const entry of entries) {
      const idx = manifest.materials.findIndex(m => m.id === entry.id);
      if (idx >= 0) manifest.materials[idx] = entry;
      else manifest.materials.push(entry);
    }
    await writeManifest("textures", manifest);
  }

  private _buildEntry(
    id:           string,
    label:        string,
    category:     MaterialCategory,
    attribution:  Attribution,
    tags:         string[],
    detectedMaps: DetectedMaps,
    albedoName  = "albedo.jpg",
  ): MaterialDef {
    const base = `/assets/textures/${id}/{quality}`;
    return {
      id,
      label,
      category,
      ...(Object.keys(attribution).length ? { attribution } : {}),
      ...(tags.length ? { tags } : {}),
      tileScale:         1.0,
      roughnessVal:      0.85,
      metalnessVal:      0.0,
      displacementScale: 0.03,
      maps: {
        albedo:       { enabled: true,                        path: `${base}/${albedoName}` },
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
