import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { ViewHelper } from "three/addons/helpers/ViewHelper.js";
import { EditorCamera } from "@/editor/EditorCamera";
import type { EventBus } from "@/core/EventBus";
import type { MeshUserData } from "@/types";

type UpdateCallback = (dt: number) => void;

const DEMO_ZONE = "demo";

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
  private readonly _unsubLighting: () => void;
  private readonly _viewHelper:   ViewHelper | null = null;
  private readonly _viewHelperEl: HTMLDivElement | null = null;

  constructor(canvas: HTMLCanvasElement, bus: EventBus, opts?: { mode?: "editor" | "game" }) {
    const editor = (opts?.mode ?? "editor") === "editor";
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    // PCF (not PCFSoft) — cheaper per-pixel shadow sampling. See TESTING.md §7 (perf).
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
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
    // World-level ambient/sun config (WorldState emits on load and on panel edits).
    this._unsubLighting = bus.on("world:lighting", ({ ambient, sun }) => {
      this._ambientLight.color.set(ambient.color);
      this._ambientLight.intensity = ambient.intensity;
      this._sunLight.color.set(sun.color);
      this._sunLight.intensity = sun.intensity;
    });
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
    sun.shadow.mapSize.set(1024, 1024);   // 1024² halves shadow-map fill vs 2048² (perf)
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.near = 0.5; sc.far = 200;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40;
    sun.shadow.bias = -0.001;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x6688cc, 0.6);
    fill.position.set(-20, 10, -20);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffeedd, 0.3);
    rim.position.set(0, 5, -30);
    this.scene.add(rim);

    return sun;
  }

  private _setupSky(): void {
    const sky = new Sky();
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
    const envMap = pmrem.fromScene(new RoomEnvironment()).texture;
    this.scene.environment = envMap;
    pmrem.dispose();

    // Atmospheric fog derived from sky
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.006);
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

  private _loop(): void {
    if (this._disposed) return;
    const dt = this._clock.getDelta();
    if (!this._previewCamera) this.editorCamera?.update(dt);
    this._updateCallbacks.forEach(cb => cb(dt));
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
    cancelAnimationFrame(this._raf);
    this.editorCamera?.dispose();
    window.removeEventListener("resize", this._onResize);
    this._viewHelperEl?.remove();
    this.renderer.dispose();
  }
}
