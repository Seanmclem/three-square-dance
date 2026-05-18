import * as THREE from "three";
import { EditorCamera } from "@/editor/EditorCamera";
import type { EventBus } from "@/core/EventBus";

type UpdateCallback = (dt: number) => void;

export class SceneManager {
  public readonly scene:        THREE.Scene;
  public readonly camera:       THREE.PerspectiveCamera;
  public readonly renderer:     THREE.WebGLRenderer;
  public readonly editorCamera: EditorCamera;

  private readonly _clock:           THREE.Clock;
  private readonly _updateCallbacks: UpdateCallback[] = [];
  private _raf:      number = 0;
  private _disposed  = false;
  private readonly _onResize: () => void;

  constructor(canvas: HTMLCanvasElement, bus: EventBus) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1f2e);
    this.scene.fog = new THREE.FogExp2(0x1a1f2e, 0.012);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    this.editorCamera = new EditorCamera(this.camera, canvas, bus);

    this._setupLighting();
    this._setupGrid();
    this._setupDemoScene();

    this._onResize = this._handleResize.bind(this);
    window.addEventListener("resize", this._onResize);
    this._handleResize();

    this._clock = new THREE.Clock();
    this._raf = requestAnimationFrame(this._loop.bind(this));
  }

  private _setupLighting(): void {
    this.scene.add(new THREE.AmbientLight(0x8899bb, 0.6));

    const sun = new THREE.DirectionalLight(0xfff4e0, 1.8);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.near = 0.5; sc.far = 200;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40;
    sun.shadow.bias = -0.001;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x4466aa, 0.4);
    fill.position.set(-20, 10, -20);
    this.scene.add(fill);
  }

  private _setupGrid(): void {
    const minor = new THREE.GridHelper(100, 100, 0x334466, 0x222d44);
    minor.position.y = 0.001;
    this.scene.add(minor);

    const major = new THREE.GridHelper(100, 10, 0x445577, 0x2d3d55);
    major.position.y = 0.002;
    this.scene.add(major);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x1a2530, roughness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  private _setupDemoScene(): void {
    const buildingMat = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.7, metalness: 0.1 });
    const wallMat     = new THREE.MeshStandardMaterial({ color: 0x4a5a6a, roughness: 0.8 });
    const roofMat     = new THREE.MeshStandardMaterial({ color: 0x2a3545, roughness: 0.6 });
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x5a6a7a, roughness: 0.5 });
    const stepMat     = new THREE.MeshStandardMaterial({ color: 0x4a5a6a });

    const addBuilding = (x: number, z: number, w: number, d: number, h: number): void => {
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat);
      body.position.set(x, h / 2, z);
      body.castShadow = true;
      body.receiveShadow = true;
      this.scene.add(body);

      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.15, d + 0.3), roofMat);
      roof.position.set(x, h + 0.075, z);
      this.scene.add(roof);
    };

    addBuilding(-8, -5,  6,  8, 4);
    addBuilding( 5, -8, 10,  7, 6);
    addBuilding(-12, 6,  5,  5, 3.2);
    addBuilding( 8,  5,  8, 10, 8);

    const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.2), wallMat);
    wall.position.set(0, 1.5, 0);
    wall.castShadow = true;
    this.scene.add(wall);

    const platform = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 6), platformMat);
    platform.position.set(0, 3.2, 8);
    platform.castShadow = true;
    platform.receiveShadow = true;
    this.scene.add(platform);

    for (let i = 0; i < 8; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.5), stepMat);
      step.position.set(-5, i * 0.4 + 0.2, 8 + i * 0.5 - 2);
      step.castShadow = true;
      this.scene.add(step);
    }
  }

  onUpdate(cb: UpdateCallback): void {
    this._updateCallbacks.push(cb);
  }

  private _loop(): void {
    if (this._disposed) return;
    const dt = this._clock.getDelta();
    this.editorCamera.update(dt);
    this._updateCallbacks.forEach(cb => cb(dt));
    this.renderer.render(this.scene, this.camera);
    this._raf = requestAnimationFrame(this._loop.bind(this));
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
    cancelAnimationFrame(this._raf);
    this.editorCamera.dispose();
    window.removeEventListener("resize", this._onResize);
    this.renderer.dispose();
  }
}
