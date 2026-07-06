import * as THREE from "three";

export const THUMB_SIZE = 256;

/** Orbit/exposure parameters for staging a thumbnail shot. */
export interface StageParams {
  yaw:   number;  // radians around Y (0 = looking from +Z)
  pitch: number;  // radians above the horizon
  zoom:  number;  // 1 = model exactly fills the frame; >1 = closer
  light: number;  // light-rig intensity multiplier (1 = default)
}

export const DEFAULT_STAGE: StageParams = { yaw: Math.PI / 4, pitch: 0.45, zoom: 1, light: 1 };

// One shared offscreen renderer — creating a fresh WebGL context per thumbnail
// exhausts the browser's context pool during bulk imports (later thumbs fail).
let _renderer: THREE.WebGLRenderer | null = null;

function getRenderer(): THREE.WebGLRenderer {
  if (!_renderer) {
    _renderer = new THREE.WebGLRenderer({ antialias: true });
    _renderer.setSize(THUMB_SIZE, THUMB_SIZE);
    _renderer.setPixelRatio(1);
  }
  return _renderer;
}

/** Free the shared offscreen WebGL context. Call once a thumbnail batch/session is done. */
export function releaseThumbnailRenderer(): void {
  if (!_renderer) return;
  _renderer.dispose();
  _renderer.forceContextLoss();
  _renderer = null;
}

export function dataURLtoArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)!;
  return bytes.buffer;
}

/**
 * Offscreen thumbnail stage: neutral light rig + orbit camera fitted to the
 * model's bounding sphere, so shots are centered and framed regardless of the
 * model's size or origin offset.
 */
export class ThumbnailStage {
  private _scene  = new THREE.Scene();
  private _camera = new THREE.PerspectiveCamera(35, 1, 0.01, 10000);
  private _hemi   = new THREE.HemisphereLight(0xffffff, 0x8d8d99, 1.2);
  private _key    = new THREE.DirectionalLight(0xffffff, 2.0);
  private _fill   = new THREE.DirectionalLight(0xffffff, 0.6);
  private _center = new THREE.Vector3();
  private _radius = 0;

  constructor(root: THREE.Object3D) {
    this._scene.background = new THREE.Color(0x2e2e33);
    this._key.position.set(2.5, 4, 2);
    this._fill.position.set(-2.5, 1.5, -2);
    this._scene.add(this._hemi, this._key, this._fill, root);

    const box = new THREE.Box3().setFromObject(root);
    if (!box.isEmpty()) {
      box.getCenter(this._center);
      this._radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-6);
    }
  }

  /** True when the model had no measurable geometry (nothing to render). */
  get isEmpty(): boolean { return this._radius === 0; }

  /** Render one frame at THUMB_SIZE² and return it as a PNG data URL. */
  render(params: StageParams = DEFAULT_STAGE): string | null {
    if (this._radius === 0) return null;
    try {
      const renderer = getRenderer();
      const { yaw, pitch, zoom, light } = params;
      this._hemi.intensity = 1.2 * light;
      this._key.intensity  = 2.0 * light;
      this._fill.intensity = 0.6 * light;

      const halfFov = THREE.MathUtils.degToRad(this._camera.fov / 2);
      const dist = (this._radius / Math.sin(halfFov)) * 1.06 / zoom;
      this._camera.position.set(
        this._center.x + dist * Math.cos(pitch) * Math.sin(yaw),
        this._center.y + dist * Math.sin(pitch),
        this._center.z + dist * Math.cos(pitch) * Math.cos(yaw),
      );
      this._camera.near = dist / 100;
      this._camera.far  = dist * 10;
      this._camera.updateProjectionMatrix();
      this._camera.lookAt(this._center);

      renderer.render(this._scene, this._camera);
      return renderer.domElement.toDataURL("image/png");
    } catch {
      return null;
    }
  }

  dispose(): void {
    this._scene.clear();
  }
}

/** Render a Three.js Object3D into a PNG data URL with the default staging. */
export function renderModelThumbnail(root: THREE.Object3D): string | null {
  const stage = new ThumbnailStage(root);
  try {
    return stage.render();
  } finally {
    stage.dispose();
  }
}
