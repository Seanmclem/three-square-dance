import * as THREE from "three";
import { MATERIAL_REGISTRY } from "./materials";
import type { MaterialMapConfig } from "./materials";

export { MATERIAL_REGISTRY };
export const MATERIAL_IDS = Object.keys(MATERIAL_REGISTRY);

export class AssetManager {
  private readonly _textureCache  = new Map<string, THREE.Texture>();
  private readonly _materialCache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly _gltfCache     = new Map<string, unknown>();
  private readonly _textureLoader = new THREE.TextureLoader();
  private _gltfLoader: unknown    = null;
  private _renderer: THREE.WebGLRenderer | null = null;

  /** Call once after renderer is created so anisotropy uses hardware max. */
  init(renderer: THREE.WebGLRenderer): void {
    this._renderer = renderer;
  }

  async loadTexture(url: string, colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace): Promise<THREE.Texture> {
    const key = `${url}:${colorSpace}`;
    const cached = this._textureCache.get(key);
    if (cached) return cached;
    const tex = await this._textureLoader.loadAsync(url);
    tex.wrapS      = THREE.RepeatWrapping;
    tex.wrapT      = THREE.RepeatWrapping;
    tex.colorSpace = colorSpace;
    tex.anisotropy = this._renderer?.capabilities.getMaxAnisotropy() ?? 4;
    this._textureCache.set(key, tex);
    return tex;
  }

  async getMaterial(materialId: string): Promise<THREE.MeshStandardMaterial> {
    const cached = this._materialCache.get(materialId);
    if (cached) return cached;

    const def = MATERIAL_REGISTRY[materialId];
    if (!def) {
      console.warn(`Unknown material: ${materialId}`);
      return new THREE.MeshStandardMaterial({ color: 0x888888 });
    }

    const loadData  = (m: MaterialMapConfig) => this.loadTexture(m.path, THREE.NoColorSpace);
    const loadColor = (m: MaterialMapConfig) => this.loadTexture(m.path, THREE.SRGBColorSpace);

    const mat = new THREE.MeshStandardMaterial({
      roughness: def.roughnessVal,
      metalness: def.metalnessVal,
    });

    if (def.maps.albedo.enabled)      mat.map          = await loadColor(def.maps.albedo);
    if (def.maps.normal.enabled)      mat.normalMap     = await loadData(def.maps.normal);
    if (def.maps.roughness.enabled)   mat.roughnessMap  = await loadData(def.maps.roughness);
    if (def.maps.metalness.enabled)   mat.metalnessMap  = await loadData(def.maps.metalness);
    if (def.maps.ao.enabled)          mat.aoMap         = await loadData(def.maps.ao);
    if (def.maps.displacement.enabled) {
      mat.displacementMap   = await loadData(def.maps.displacement);
      mat.displacementScale = def.displacementScale;
    }

    this._materialCache.set(materialId, mat);
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

  dispose(): void {
    this._textureCache.forEach(t => t.dispose());
    this._materialCache.forEach(m => m.dispose());
    this._textureCache.clear();
    this._materialCache.clear();
    this._gltfCache.clear();
  }
}

export const assetManager = new AssetManager();
