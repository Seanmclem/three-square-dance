import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { MaterialDef, MaterialManifest, MaterialOverrides, QualityScale, AssetDef, AssetManifest } from "@/types";

export type { MaterialDef };

export class AssetManager {
  private readonly _textureCache  = new Map<string, THREE.Texture>();
  private readonly _materialCache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly _gltfCache     = new Map<string, unknown>();
  private readonly _textureLoader = new THREE.TextureLoader();
  private _gltfLoader: unknown    = null;
  private _renderer: THREE.WebGLRenderer | null = null;
  private _materialRegistry: Record<string, MaterialDef> = {};
  private _assetRegistry:   Record<string, AssetDef>    = {};
  private _missingAssetIds    = new Set<string>();
  private _missingMaterialIds = new Set<string>();
  private _fallbackMat: THREE.MeshStandardMaterial | null = null;
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
      // Filter out entries whose texture files are missing on disk (e.g. gitignored,
      // closed-source). They silently vanish from the UI; the manifest is left untouched.
      const checks = await Promise.all(manifest.materials.map(m =>
        this._fileExists(this._resolveQualityPath(m.maps.albedo.path))));
      const present = manifest.materials.filter((_, i) => checks[i]);
      this._missingMaterialIds = new Set(manifest.materials.filter((_, i) => !checks[i]).map(m => m.id));
      if (this._missingMaterialIds.size)
        console.info(`AssetManager: ${this._missingMaterialIds.size} material(s) missing files, hidden:`, [...this._missingMaterialIds]);
      this._materialRegistry = Object.fromEntries(present.map(m => [m.id, m]));
      return present;
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

  /** Merge a metadata patch into a registry material entry (attribution merged one level deep). */
  updateMaterial(id: string, patch: Partial<MaterialDef>): void {
    const def = this._materialRegistry[id];
    if (!def) return;
    this._materialRegistry[id] = { ...def, ...patch, attribution: { ...def.attribution, ...patch.attribution } };
  }

  /** Drop materials from the registry (and their cached Three.js materials) after a manifest delete. */
  removeMaterials(ids: string[]): void {
    for (const id of ids) {
      delete this._materialRegistry[id];
      this.evictMaterial(id);
    }
  }

  /** Fetch models/manifest.json, populate the asset registry, return the list. */
  async initAssets(): Promise<AssetDef[]> {
    try {
      const res = await fetch('/assets/models/manifest.json');
      if (!res.ok) {
        console.warn('AssetManager: no model manifest found');
        this._assetRegistry = {};
        return [];
      }
      const manifest: AssetManifest = await res.json();
      // Filter out entries whose model file is missing on disk (gitignored / closed-source).
      const checks = await Promise.all(manifest.assets.map(a => this._fileExists(a.path)));
      const present = manifest.assets.filter((_, i) => checks[i]);
      this._missingAssetIds = new Set(manifest.assets.filter((_, i) => !checks[i]).map(a => a.id));
      if (this._missingAssetIds.size)
        console.info(`AssetManager: ${this._missingAssetIds.size} model(s) missing files, hidden:`, [...this._missingAssetIds]);
      this._assetRegistry = Object.fromEntries(present.map(a => [a.id, a]));
      return present;
    } catch (err) {
      console.warn('AssetManager: failed to load model manifest', err);
      this._assetRegistry = {};
      return [];
    }
  }

  /** HEAD-check a static file's existence (used to hide manifest entries with missing files). */
  private async _fileExists(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  }

  isAssetMissing(id: string):    boolean { return this._missingAssetIds.has(id); }
  isMaterialMissing(id: string): boolean { return this._missingMaterialIds.has(id); }

  getAssetDef(id: string): AssetDef | undefined {
    return this._assetRegistry[id];
  }

  getAssetList(): AssetDef[] {
    return Object.values(this._assetRegistry);
  }

  /** Merge a metadata patch into a registry asset entry (attribution merged one level deep). */
  updateAsset(id: string, patch: Partial<AssetDef>): void {
    const def = this._assetRegistry[id];
    if (!def) return;
    this._assetRegistry[id] = { ...def, ...patch, attribution: { ...def.attribution, ...patch.attribution } };
  }

  /** Drop assets from the registry (and any cached GLTF) after a manifest delete. */
  removeAssets(ids: string[]): void {
    for (const id of ids) {
      delete this._assetRegistry[id];
      this._gltfCache.delete(id);
      this._gltfCache.delete(`obj:${id}`);
    }
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
    if (!def) return this._fallbackMaterial();   // missing-file or unknown id

    try {
      const mat = await this._buildMaterial(def, undefined);
      this._materialCache.set(cacheKey, mat);
      return mat;
    } catch (err) {
      console.warn(`AssetManager: failed to build material "${materialId}"`, err);
      return this._fallbackMaterial();
    }
  }

  /** Build an uncached material applying per-instance overrides. */
  async getMaterialWithOverrides(
    materialId: string,
    overrides:  MaterialOverrides,
  ): Promise<THREE.MeshStandardMaterial> {
    // Flat-color mode: skip the texture registry entirely, independent of whether
    // materialId resolves to anything.
    if (overrides.color) {
      return new THREE.MeshStandardMaterial({
        color:     overrides.color,
        roughness: overrides.roughnessVal ?? 0.85,
        metalness: 0,
      });
    }
    const def = this._materialRegistry[materialId];
    if (!def) return this._fallbackMaterial();
    try {
      return await this._buildMaterial(def, overrides);
    } catch (err) {
      console.warn(`AssetManager: failed to build material "${materialId}"`, err);
      return this._fallbackMaterial();
    }
  }

  /** Cached magenta/black checkerboard — the "missing texture" fallback for surfaces. */
  private _fallbackMaterial(): THREE.MeshStandardMaterial {
    if (this._fallbackMat) return this._fallbackMat;
    const size = 64, half = size / 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e000e0'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, half, half); ctx.fillRect(half, half, half, half);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    this._fallbackMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 });
    return this._fallbackMat;
  }

  /** Replace {quality} placeholder with the current quality level. */
  private _resolveQualityPath(path: string): string {
    return path.includes('{quality}') ? path.replace('{quality}', this._quality) : path;
  }

  private async _buildMaterial(
    def:       MaterialDef,
    overrides: MaterialOverrides | undefined,
  ): Promise<THREE.MeshStandardMaterial> {
    const isEnabled = (key: keyof MaterialDef['maps']): boolean => {
      const ov = overrides?.maps?.[key]?.enabled;
      return ov !== undefined ? ov : def.maps[key].enabled;
    };

    const r         = (path: string) => this._resolveQualityPath(path);
    const loadData  = (path: string) => this.loadTexture(r(path), THREE.NoColorSpace);
    const loadColor = (path: string) => this.loadTexture(r(path), THREE.SRGBColorSpace);

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

  /** Load any supported model format and return a cloned, scene-ready Object3D. */
  async loadModel(assetId: string): Promise<THREE.Object3D> {
    const def  = this._assetRegistry[assetId];
    const path = def?.path ?? `/assets/models/${assetId}.glb`;
    if (/\.obj$/i.test(path)) {
      return this._loadOBJ(assetId, path, def?.mtlPath);
    }
    const gltf = await this.loadGLTF(assetId) as { scene: THREE.Object3D };
    return this._cloneScene(gltf.scene);
  }

  /**
   * Skeleton-safe clone. Plain .clone() of a SkinnedMesh keeps it bound to the
   * cached source scene's skeleton (bones that never get matrix updates in the
   * render scene), so the clone renders frozen at the source pose/position.
   */
  private _cloneScene(scene: THREE.Object3D): THREE.Object3D {
    let skinned = false;
    scene.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true; });
    return skinned ? cloneSkinned(scene) : scene.clone();
  }

  private async _loadOBJ(assetId: string, path: string, mtlPath?: string): Promise<THREE.Object3D> {
    const cached = this._gltfCache.get(`obj:${assetId}`);
    if (cached) return (cached as THREE.Object3D).clone();

    const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
    const loader = new OBJLoader();

    if (mtlPath) {
      try {
        const { MTLLoader } = await import("three/addons/loaders/MTLLoader.js");
        const materials = await new MTLLoader().loadAsync(mtlPath) as { preload(): void };
        materials.preload();
        loader.setMaterials(materials as Parameters<typeof loader.setMaterials>[0]);
      } catch (err) {
        console.warn("AssetManager: failed to load MTL", err);
      }
    }

    const obj = await loader.loadAsync(path);
    // MeshPhongMaterial doesn't use the scene env map; convert to Standard so IBL applies.
    obj.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      const converted = mats.map(m => {
        if (!(m instanceof THREE.MeshPhongMaterial)) return m;
        const std = new THREE.MeshStandardMaterial({
          color:     m.color,
          map:       m.map,
          roughness: 0.75,
          metalness: 0.0,
          side:      m.side,
        });
        m.dispose();
        return std;
      });
      child.material = Array.isArray(child.material) ? converted : converted[0]!;
    });
    this._gltfCache.set(`obj:${assetId}`, obj);
    return obj.clone();
  }

  async loadGLTF(assetId: string): Promise<unknown> {
    const cached = this._gltfCache.get(assetId);
    if (cached) return cached;
    if (!this._gltfLoader) {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      this._gltfLoader = new GLTFLoader();
    }
    const loader = this._gltfLoader as { loadAsync: (url: string) => Promise<unknown> };
    const def  = this._assetRegistry[assetId];
    const url  = def?.path ?? `/assets/models/${assetId}.glb`;
    const gltf = await loader.loadAsync(url);
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
