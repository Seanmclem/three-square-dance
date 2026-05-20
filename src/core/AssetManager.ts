import * as THREE from "three";

interface MaterialDef {
  texture:    string;
  tileWidth?: number;
  tileHeight?: number;
  roughness?: number;
  metalness?: number;
  normalMap?: string;
}

const MATERIAL_REGISTRY: Record<string, MaterialDef> = {
  brick_01:          { texture: "/assets/textures/brick_01.jpg",         tileWidth: 1.0, tileHeight: 1.0, roughness: 0.9 },
  brick_exterior_01: { texture: "/assets/textures/brick_ext_01.jpg",     tileWidth: 1.0, tileHeight: 1.0, roughness: 0.85 },
  cobblestone:       { texture: "/assets/textures/cobblestone_01.jpg",   tileWidth: 1.0, tileHeight: 1.0, roughness: 0.95 },
  wood_planks:       { texture: "/assets/textures/wood_planks_01.jpg",   tileWidth: 0.8, tileHeight: 0.8, roughness: 0.7 },
  concrete_01:       { texture: "/assets/textures/concrete_01.jpg",      tileWidth: 2.0, tileHeight: 2.0, roughness: 0.8 },
};

export const MATERIAL_IDS = Object.keys(MATERIAL_REGISTRY) as (keyof typeof MATERIAL_REGISTRY)[];

export class AssetManager {
  private readonly _textureCache  = new Map<string, THREE.Texture>();
  private readonly _materialCache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly _gltfCache     = new Map<string, unknown>();
  private readonly _textureLoader = new THREE.TextureLoader();
  private _gltfLoader: unknown    = null;

  async loadTexture(url: string): Promise<THREE.Texture> {
    const cached = this._textureCache.get(url);
    if (cached) return cached;
    const tex = await this._textureLoader.loadAsync(url);
    tex.wrapS     = THREE.RepeatWrapping;
    tex.wrapT     = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    this._textureCache.set(url, tex);
    return tex;
  }

  async getMaterial(materialId: string): Promise<THREE.MeshStandardMaterial> {
    const cached = this._materialCache.get(materialId);
    if (cached) return cached;

    const def = MATERIAL_REGISTRY[materialId];
    if (!def) {
      console.warn(`Unknown material: ${materialId}, using default`);
      return new THREE.MeshStandardMaterial({ color: 0x888888 });
    }

    const mat = new THREE.MeshStandardMaterial({
      map:       await this.loadTexture(def.texture),
      roughness: def.roughness ?? 0.8,
      metalness: def.metalness ?? 0.0,
    });
    if (def.normalMap) mat.normalMap = await this.loadTexture(def.normalMap);
    this._materialCache.set(materialId, mat);
    return mat;
  }

  /** Synchronous fallback material used before async textures load. */
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
