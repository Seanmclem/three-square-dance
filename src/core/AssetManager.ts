import * as THREE from "three";
import type { MaterialDef, MaterialManifest, MaterialOverrides, QualityScale } from "@/types";

export type { MaterialDef };

export class AssetManager {
  private readonly _textureCache  = new Map<string, THREE.Texture>();
  private readonly _materialCache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly _gltfCache     = new Map<string, unknown>();
  private readonly _textureLoader = new THREE.TextureLoader();
  private _gltfLoader: unknown    = null;
  private _renderer: THREE.WebGLRenderer | null = null;
  private _materialRegistry: Record<string, MaterialDef> = {};
  private _quality: QualityScale = 'high';

  /** Call once after renderer is created so anisotropy uses hardware max. */
  init(renderer: THREE.WebGLRenderer): void {
    this._renderer = renderer;
  }

  setQuality(q: QualityScale): void {
    this._quality = q;
    // Clear all caches; next getMaterial() calls reload at new quality level
    this._textureCache.forEach(t => t.dispose());
    this._materialCache.forEach(m => m.dispose());
    this._textureCache.clear();
    this._materialCache.clear();
  }

  getQuality(): QualityScale { return this._quality; }

  /** Fetch manifest.json, populate the material registry, return the list. */
  async initMaterials(): Promise<MaterialDef[]> {
    try {
      const res = await fetch('/assets/textures/manifest.json');
      if (!res.ok) {
        console.warn('AssetManager: no manifest found — material picker will be empty');
        this._materialRegistry = {};
        return [];
      }
      const manifest: MaterialManifest = await res.json();
      this._materialRegistry = Object.fromEntries(manifest.materials.map(m => [m.id, m]));
      return manifest.materials;
    } catch (err) {
      console.warn('AssetManager: failed to load manifest', err);
      this._materialRegistry = {};
      return [];
    }
  }

  getMaterialDef(id: string): MaterialDef | undefined {
    return this._materialRegistry[id];
  }

  getMaterialList(): MaterialDef[] {
    return Object.values(this._materialRegistry);
  }

  async loadTexture(url: string, colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace): Promise<THREE.Texture> {
    const key = `${url}:${colorSpace}`;
    const cached = this._textureCache.get(key);
    if (cached) return cached;
    const tex = await this._textureLoader.loadAsync(url);
    tex.wrapS      = THREE.RepeatWrapping;
    tex.wrapT      = THREE.RepeatWrapping;
    tex.colorSpace = colorSpace;
    // Quality-dependent settings
    if (this._quality === 'low') {
      tex.anisotropy    = 1;
      tex.minFilter     = THREE.LinearFilter;
      tex.generateMipmaps = false;
    } else {
      tex.anisotropy = this._quality === 'medium'
        ? Math.min(4, this._renderer?.capabilities.getMaxAnisotropy() ?? 4)
        : (this._renderer?.capabilities.getMaxAnisotropy() ?? 4);
    }
    this._textureCache.set(key, tex);
    return tex;
  }

  async getMaterial(materialId: string): Promise<THREE.MeshStandardMaterial> {
    const cacheKey = `${materialId}:${this._quality}`;
    const cached = this._materialCache.get(cacheKey);
    if (cached) return cached;

    const def = this._materialRegistry[materialId];
    if (!def) {
      console.warn(`Unknown material: ${materialId}`);
      return new THREE.MeshStandardMaterial({ color: 0x888888 });
    }

    const mat = await this._buildMaterial(def, undefined);
    this._materialCache.set(cacheKey, mat);
    return mat;
  }

  /** Build an uncached material applying per-instance overrides. */
  async getMaterialWithOverrides(
    materialId: string,
    overrides:  MaterialOverrides,
  ): Promise<THREE.MeshStandardMaterial> {
    const def = this._materialRegistry[materialId];
    if (!def) return new THREE.MeshStandardMaterial({ color: 0x888888 });
    return this._buildMaterial(def, overrides);
  }

  private async _buildMaterial(
    def:       MaterialDef,
    overrides: MaterialOverrides | undefined,
  ): Promise<THREE.MeshStandardMaterial> {
    const isEnabled = (key: keyof MaterialDef['maps']): boolean => {
      const ov = overrides?.maps?.[key]?.enabled;
      return ov !== undefined ? ov : def.maps[key].enabled;
    };

    const loadData  = (path: string) => this.loadTexture(path, THREE.NoColorSpace);
    const loadColor = (path: string) => this.loadTexture(path, THREE.SRGBColorSpace);

    const mat = new THREE.MeshStandardMaterial({
      roughness: overrides?.roughnessVal ?? def.roughnessVal,
      metalness: def.metalnessVal,
    });

    if (isEnabled('albedo'))       mat.map           = await loadColor(def.maps.albedo.path);
    if (isEnabled('normal'))       mat.normalMap      = await loadData(def.maps.normal.path);
    if (isEnabled('roughness'))    mat.roughnessMap   = await loadData(def.maps.roughness.path);
    if (isEnabled('metalness'))    mat.metalnessMap   = await loadData(def.maps.metalness.path);
    if (isEnabled('ao'))           mat.aoMap          = await loadData(def.maps.ao.path);
    if (isEnabled('displacement')) {
      mat.displacementMap   = await loadData(def.maps.displacement.path);
      mat.displacementScale = overrides?.displacementScale ?? def.displacementScale;
    }

    return mat;
  }

  /** Synchronous fallback used before async textures load. */
  getDefaultMaterial(color = 0x888888): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  }

  async loadGLTF(assetId: string): Promise<unknown> {
    const cached = this._gltfCache.get(assetId);
    if (cached) return cached;
    if (!this._gltfLoader) {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      this._gltfLoader = new GLTFLoader();
    }
    const loader = this._gltfLoader as { loadAsync: (url: string) => Promise<unknown> };
    const gltf = await loader.loadAsync(`/assets/models/${assetId}.glb`);
    this._gltfCache.set(assetId, gltf);
    return gltf;
  }

  /** Bust the cached Three.js material so next getMaterial() reloads. */
  evictMaterial(materialId: string): void {
    for (const [key, mat] of this._materialCache) {
      if (key.startsWith(`${materialId}:`)) { mat.dispose(); this._materialCache.delete(key); }
    }
  }

  dispose(): void {
    this._textureCache.forEach(t => t.dispose());
    this._materialCache.forEach(m => m.dispose());
    this._textureCache.clear();
    this._materialCache.clear();
    this._gltfCache.clear();
  }
}

export const assetManager = new AssetManager();
