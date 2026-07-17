import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { ViewHelper } from "three/addons/helpers/ViewHelper.js";
import { EditorCamera } from "@/editor/EditorCamera";
import { assetManager } from "@/core/AssetManager";
import type { EventBus } from "@/core/EventBus";
import type { MeshUserData } from "@/types";

type UpdateCallback = (dt: number) => void;

const DEMO_ZONE = "demo";

// Sun shadow frustum: a small box that FOLLOWS the view (editor focus / ahead of the
// player) instead of a large static one — fewer meters per shadow texel = sharper
// shadows, with full-world coverage because the box re-centers every frame. The box
// position is snapped to whole shadow-map texels so edges don't shimmer as it moves.
const SHADOW_HALF     = 25;     // ortho half-extent (meters); was a static ±40
const SHADOW_MAP_SIZE = 1024;   // 1024² halves shadow-map fill vs 2048² (perf)
const SHADOW_AHEAD    = 15;     // preview/game: center this far along the view direction
const UP = new THREE.Vector3(0, 1, 0);

export class SceneManager {
  public readonly scene:        THREE.Scene;
  public readonly camera:       THREE.PerspectiveCamera;
  public readonly renderer:     THREE.WebGLRenderer;
  /** null in game mode (runtime shell) — the character camera drives rendering there. */
  public readonly editorCamera: EditorCamera | null;

  private readonly _clock:           THREE.Clock;
  private readonly _updateCallbacks: UpdateCallback[] = [];
  private _raf:             number = 0;
  private readonly _loopBound = () => this._loop();   // bind once; avoids a per-frame closure alloc
  private _disposed         = false;
  private _previewCamera:   THREE.PerspectiveCamera | null = null;
  private readonly _onResize: () => void;

  // Phase 28 — occlusion-test cull view: hide world meshes outside this camera's
  // frustum for the render, restore right after. All scratch preallocated.
  private _cullCamera: THREE.PerspectiveCamera | null = null;
  private readonly _cullFrustum = new THREE.Frustum();
  private readonly _cullMat     = new THREE.Matrix4();
  private readonly _cullSphere  = new THREE.Sphere();
  private readonly _cullHidden: THREE.Object3D[] = [];   // only ever holds meshes WE hid this frame
  private _cullStats: { tested: number; hidden: number } | null = null;

  private readonly _sunLight:     THREE.DirectionalLight;
  private readonly _ambientLight: THREE.AmbientLight;
  private _fillLight!: THREE.DirectionalLight;   // assigned in _setupLighting
  private _rimLight!:  THREE.DirectionalLight;
  private readonly _unsubLighting: () => void;
  private readonly _viewHelper:   ViewHelper | null = null;
  private readonly _viewHelperEl: HTMLDivElement | null = null;

  // Follow-the-camera sun shadow frustum. The light's world direction is fixed after
  // _setupSky, so the shadow camera's basis is captured once (lazily, on the first
  // loop tick) and each frame just re-centers position+target — all scratch
  // preallocated (no allocations in the RAF path, TESTING.md §7).
  private readonly _shadowFollow = {
    ready: false,
    offset: new THREE.Vector3(),   // sun.position − target (fixed light offset)
    x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(),   // shadow-cam basis
    center: new THREE.Vector3(), fwd: new THREE.Vector3(),
  };

  // Skybox (Phase 37). The procedural Sky mesh + its RoomEnvironment env map are the
  // "sky" default; an image skybox hides the mesh, sets scene.background, and swaps in
  // a PMREM env map generated from the image. _skyReqToken guards stale async loads.
  private _sky!:          Sky;
  private _roomEnvMap:    THREE.Texture | null = null;   // RoomEnvironment PMREM (procedural)
  private _skyboxEnvMap:  THREE.Texture | null = null;   // generated from an image skybox
  private _skyReqToken    = 0;
  private readonly _unsubSky: () => void;

  constructor(canvas: HTMLCanvasElement, bus: EventBus, opts?: { mode?: "editor" | "game" }) {
    const editor = (opts?.mode ?? "editor") === "editor";
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.5;
    this.renderer.autoClear = false; // ViewHelper needs manual clear control

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    this.editorCamera = editor ? new EditorCamera(this.camera, canvas, bus) : null;

    this._ambientLight = new THREE.AmbientLight(0xaabbcc, 0.5);
    this.scene.add(this._ambientLight);
    this._sunLight  = this._setupLighting();
    this._setupSky();
    // World-level ambient/sun/environment config (WorldState emits on load and on
    // panel edits). The hardcoded fill/rim directionals scale with the sun (baseline
    // ratios 0.6/2.0 and 0.3/2.0) so SUN 0 means genuinely no directional light, and
    // envIntensity drives the IBL term — all three at 0 = a truly dark scene.
    this._unsubLighting = bus.on("world:lighting", ({ ambient, sun, envIntensity }) => {
      this._ambientLight.color.set(ambient.color);
      this._ambientLight.intensity = ambient.intensity;
      this._sunLight.color.set(sun.color);
      this._sunLight.intensity = sun.intensity;
      this._fillLight.intensity = sun.intensity * 0.3;
      this._rimLight.intensity  = sun.intensity * 0.15;
      this.scene.environmentIntensity = envIntensity ?? 1;
    });
    // Skybox selection (WorldState emits on load and on panel edits). "sky" = procedural.
    this._unsubSky = bus.on("world:sky", ({ skybox }) => this._applySkybox(skybox));
    if (editor) this._setupGrid();   // grid helpers + demo ground are editor furniture

    if (editor) {
      const helperEl = document.createElement("div");
      helperEl.style.cssText =
        "position:absolute;left:0;bottom:0;width:172px;height:128px;pointer-events:none;z-index:1;";
      canvas.parentElement?.appendChild(helperEl);
      this._viewHelperEl = helperEl;
      this._viewHelper = new ViewHelper(this.camera, helperEl as unknown as HTMLCanvasElement);
    }

    this._onResize = this._handleResize.bind(this);
    window.addEventListener("resize", this._onResize);
    this._handleResize();

    this._clock = new THREE.Clock();
    this._raf = requestAnimationFrame(this._loopBound);
  }

  private _setupLighting(): THREE.DirectionalLight {
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    // near/far bracket the follow box (light sits 50m from the box center, box ±25m,
    // ~10m content-height slack). A tight depth range matters: shadow.bias is in
    // normalized [near,far] units, so range 200 made -0.001 ≈ 20cm of world depth —
    // enough to light-leak a bright band into every floor/wall crease.
    sc.near = 10; sc.far = 100;
    sc.left = -SHADOW_HALF; sc.right = SHADOW_HALF; sc.top = SHADOW_HALF; sc.bottom = -SHADOW_HALF;
    // Acne control via normalBias (offsets the sample along the surface normal — no
    // depth detachment, so creases stay dark); keep only a hair of depth bias.
    sun.shadow.bias = -0.0001;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.scene.add(sun.target);   // target must be in the scene for its matrix to update

    const fill = new THREE.DirectionalLight(0x6688cc, 0.6);
    fill.position.set(-20, 10, -20);
    this.scene.add(fill);
    this._fillLight = fill;

    const rim = new THREE.DirectionalLight(0xffeedd, 0.3);
    rim.position.set(0, 5, -30);
    this.scene.add(rim);
    this._rimLight = rim;

    return sun;
  }

  private _setupSky(): void {
    const sky = this._sky = new Sky();
    sky.scale.setScalar(450000);
    this.scene.add(sky);

    const uniforms = sky.material.uniforms;
    uniforms["turbidity"].value      = 10;
    uniforms["rayleigh"].value       = 3;
    uniforms["mieCoefficient"].value = 0.005;
    uniforms["mieDirectionalG"].value = 0.7;

    // Sun elevation 25°, azimuth 180°
    const elevation = 25;
    const azimuth   = 180;
    const phi   = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    const sunPos = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    uniforms["sunPosition"].value.copy(sunPos);

    // Link directional light to sky sun position
    this._sunLight.position.copy(sunPos.multiplyScalar(50));

    // Generate env map for reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this._roomEnvMap = pmrem.fromScene(new RoomEnvironment()).texture;
    this.scene.environment = this._roomEnvMap;
    pmrem.dispose();

    // Atmospheric fog derived from sky
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.006);
  }

  /**
   * Phase 37 — apply the selected skybox. "sky" (the default) is the procedural Sky
   * mesh + RoomEnvironment IBL; any other id is a SkyboxDef loaded as an equirectangular
   * image that becomes scene.background and (via PMREM) scene.environment. Async loads
   * are guarded by a request token so a fast re-selection can't be clobbered by a slow
   * earlier load. environmentIntensity (driven by world:lighting) still multiplies the
   * active env map, so ENVIRONMENT works the same for procedural and image skyboxes.
   */
  private _applySkybox(skyboxId: string): void {
    const token = ++this._skyReqToken;
    if (!skyboxId || skyboxId === "sky") {
      this._sky.visible = true;
      this.scene.background = null;
      this.scene.environment = this._roomEnvMap;
      if (this._skyboxEnvMap) { this._skyboxEnvMap.dispose(); this._skyboxEnvMap = null; }
      return;
    }
    assetManager.loadSkybox(skyboxId).then(tex => {
      if (token !== this._skyReqToken || this._disposed) return;   // superseded / torn down
      this._sky.visible = false;
      this.scene.background = tex;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const env = pmrem.fromEquirectangular(tex).texture;
      pmrem.dispose();
      if (this._skyboxEnvMap) this._skyboxEnvMap.dispose();
      this._skyboxEnvMap = env;
      this.scene.environment = env;
    }).catch(err => {
      console.warn(`SceneManager: failed to load skybox "${skyboxId}", using procedural sky`, err);
      if (token === this._skyReqToken) this._applySkybox("sky");
    });
  }

  private _setupGrid(): void {
    const minor = new THREE.GridHelper(100, 100, 0x334466, 0x222d44);
    minor.position.y = 0.001;
    minor.userData.hideInGame = true;
    this.scene.add(minor);

    const major = new THREE.GridHelper(100, 10, 0x445577, 0x2d3d55);
    major.position.y = 0.002;
    major.userData.hideInGame = true;
    this.scene.add(major);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x1a2530, roughness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData = {
      editorId: "ground", editorType: "terrain", zoneId: DEMO_ZONE,
      selectable: false, floorLevel: 0, _ownsMaterial: false,
    } satisfies MeshUserData;
    this.scene.add(ground);
  }

  onUpdate(cb: UpdateCallback): void {
    this._updateCallbacks.push(cb);
  }

  offUpdate(cb: UpdateCallback): void {
    const idx = this._updateCallbacks.indexOf(cb);
    if (idx !== -1) this._updateCallbacks.splice(idx, 1);
  }

  setPreviewCamera(cam: THREE.PerspectiveCamera | null): void {
    this._previewCamera = cam;
    if (this.editorCamera) this.editorCamera.enabled = (cam === null);
    if (this._viewHelperEl) this._viewHelperEl.style.display = cam ? "none" : "";
    if (cam === null) {
      // Restore editor camera aspect
      const w = this.renderer.domElement.clientWidth;
      const h = this.renderer.domElement.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Phase 28 — occlusion-test mode's "cull as player" view (C toggle). While set,
   * each frame replicates the renderer's own bounding-sphere-vs-frustum test from
   * `cam` (the character's logic camera) and hides the failing world meshes for
   * the render, so a detached vantage shows what the player's render would cull.
   * null = off (the default; _loop is then byte-for-byte the pre-phase-28 path).
   */
  setCullOverrideCamera(cam: THREE.PerspectiveCamera | null): void {
    this._cullCamera = cam;
    if (!cam) {
      this._restoreCullOverride();   // defensive — normally empty between frames
      this._cullStats = null;
    }
  }

  /** Last frame's cull-override counts (null when the cull view is off). */
  get cullStats(): { tested: number; hidden: number } | null { return this._cullStats; }

  /** The camera _loop will render with this frame. */
  get activeRenderCamera(): THREE.PerspectiveCamera { return this._previewCamera ?? this.camera; }

  private _applyCullOverride(): void {
    const cam = this._cullCamera;
    if (!cam) return;
    this.scene.updateMatrixWorld();   // renderer skips already-clean matrices, so no double cost
    cam.updateMatrixWorld();
    this._cullMat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this._cullFrustum.setFromProjectionMatrix(this._cullMat);
    let tested = 0, hidden = 0;
    this.scene.traverse(o => {
      if (!(o as THREE.Mesh).isMesh) return;   // meshes only — grid/CameraHelper are LineSegments
      const ud = o.userData as MeshUserData & { hideInGame?: boolean };
      if (!ud.editorId || ud.hideInGame || ud.editorOnly) return;   // world geometry only
      if (!o.visible || !o.frustumCulled) return;                   // respect script-hidden + opt-outs
      tested++;
      const geom = (o as THREE.Mesh).geometry;
      if (!geom.boundingSphere) geom.computeBoundingSphere();
      this._cullSphere.copy(geom.boundingSphere!).applyMatrix4(o.matrixWorld);
      if (!this._cullFrustum.intersectsSphere(this._cullSphere)) {
        o.visible = false;
        this._cullHidden.push(o);
        hidden++;
      }
    });
    this._cullStats = { tested, hidden };
  }

  private _restoreCullOverride(): void {
    for (const o of this._cullHidden) o.visible = true;   // only meshes that WERE visible got pushed
    this._cullHidden.length = 0;
  }

  /**
   * Re-center the sun's shadow box on where the view actually is: the editor
   * camera's focus point, or SHADOW_AHEAD meters along the preview camera's view
   * direction. Moving sun.position and sun.target by the same delta translates the
   * ortho frustum without changing the light direction. The center is snapped to
   * whole shadow-map texels in the shadow camera's basis (lookAt with up=(0,1,0),
   * captured once — the direction never changes after _setupSky) so shadow edges
   * don't crawl/shimmer as the camera pans.
   */
  private _updateSunShadow(): void {
    const s = this._shadowFollow;
    const sun = this._sunLight;
    if (!s.ready) {
      s.offset.copy(sun.position);              // target starts at the origin
      s.z.copy(s.offset).normalize();           // shadow cam looks down −z (toward target)
      s.x.crossVectors(UP, s.z).normalize();
      s.y.crossVectors(s.z, s.x);
      s.ready = true;
    }
    if (this.editorCamera && !this._previewCamera) {
      s.center.copy(this.editorCamera.focus);
    } else {
      const cam = this._previewCamera ?? this.camera;
      cam.getWorldDirection(s.fwd);
      s.center.copy(cam.position).addScaledVector(s.fwd, SHADOW_AHEAD);
    }
    const texel = (SHADOW_HALF * 2) / SHADOW_MAP_SIZE;
    const lx = Math.round(s.center.dot(s.x) / texel) * texel;
    const ly = Math.round(s.center.dot(s.y) / texel) * texel;
    const lz = s.center.dot(s.z);
    s.center.set(0, 0, 0).addScaledVector(s.x, lx).addScaledVector(s.y, ly).addScaledVector(s.z, lz);
    sun.target.position.copy(s.center);
    sun.position.copy(s.center).add(s.offset);
  }

  private _loop(): void {
    if (this._disposed) return;
    const dt = this._clock.getDelta();
    if (!this._previewCamera) this.editorCamera?.update(dt);
    this._updateCallbacks.forEach(cb => cb(dt));
    this._updateSunShadow();
    this._applyCullOverride();                 // no-op unless the occlusion cull view is on
    this.renderer.clear();
    this.renderer.render(this.scene, this._previewCamera ?? this.camera);
    this._restoreCullOverride();               // restore before anything else reads .visible
    if (!this._previewCamera) this._viewHelper?.render(this.renderer);
    this._raf = requestAnimationFrame(this._loopBound);
  }

  private _handleResize(): void {
    const parent = this.renderer.domElement.parentElement;
    const w = parent?.clientWidth  ?? window.innerWidth;
    const h = parent?.clientHeight ?? window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this._disposed = true;
    this._unsubLighting();
    this._unsubSky();
    this._skyboxEnvMap?.dispose();
    cancelAnimationFrame(this._raf);
    this.editorCamera?.dispose();
    window.removeEventListener("resize", this._onResize);
    this._viewHelperEl?.remove();
    this.renderer.dispose();
  }
}
