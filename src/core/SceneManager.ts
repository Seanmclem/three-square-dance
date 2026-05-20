import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EditorCamera } from "@/editor/EditorCamera";
import type { EventBus } from "@/core/EventBus";
import type { EditorObjectType, MeshUserData } from "@/types";

type UpdateCallback = (dt: number) => void;

const DEMO_ZONE = "demo";

function selData(id: string, type: EditorObjectType, parentId?: string): MeshUserData {
  const data: MeshUserData = {
    editorId: id, editorType: type, zoneId: DEMO_ZONE,
    selectable: true, floorLevel: 0, _ownsMaterial: false,
  };
  if (parentId) data._parentId = parentId;
  return data;
}

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

  private readonly _sunLight: THREE.DirectionalLight;

  constructor(canvas: HTMLCanvasElement, bus: EventBus) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.5;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    this.editorCamera = new EditorCamera(this.camera, canvas, bus);

    this._sunLight = this._setupLighting();
    this._setupSky();
    this._setupGrid();
    this._setupDemoScene();

    this._onResize = this._handleResize.bind(this);
    window.addEventListener("resize", this._onResize);
    this._handleResize();

    this._clock = new THREE.Clock();
    this._raf = requestAnimationFrame(this._loop.bind(this));
  }

  private _setupLighting(): THREE.DirectionalLight {
    this.scene.add(new THREE.AmbientLight(0xaabbcc, 0.5));

    const sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
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
    ground.userData = {
      editorId: "ground", editorType: "terrain", zoneId: DEMO_ZONE,
      selectable: false, floorLevel: 0, _ownsMaterial: false,
    } satisfies MeshUserData;
    this.scene.add(ground);
  }

  private _setupDemoScene(): void {
    const buildingMat = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.7, metalness: 0.1 });
    const wallMat     = new THREE.MeshStandardMaterial({ color: 0x4a5a6a, roughness: 0.8 });
    const roofMat     = new THREE.MeshStandardMaterial({ color: 0x2a3545, roughness: 0.6 });
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x5a6a7a, roughness: 0.5 });
    const stepMat     = new THREE.MeshStandardMaterial({ color: 0x4a5a6a });

    const addBuilding = (id: string, x: number, z: number, w: number, d: number, h: number): void => {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.userData = selData(id, "object");

      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat);
      body.position.set(0, h / 2, 0);
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData = selData(id, "object", id);
      group.add(body);

      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.15, d + 0.3), roofMat);
      roof.position.set(0, h + 0.075, 0);
      roof.userData = selData(id, "object", id);
      group.add(roof);

      this.scene.add(group);
    };

    addBuilding("building_0", -8, -5,  6,  8, 4);
    addBuilding("building_1",  5, -8, 10,  7, 6);
    addBuilding("building_2", -12, 6,  5,  5, 3.2);
    addBuilding("building_3",  8,  5,  8, 10, 8);

    const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.2), wallMat);
    wall.position.set(0, 1.5, 0);
    wall.castShadow = true;
    wall.userData = selData("wall_demo", "wall");
    this.scene.add(wall);

    const platform = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 6), platformMat);
    platform.position.set(0, 3.2, 8);
    platform.castShadow = true;
    platform.receiveShadow = true;
    platform.userData = selData("platform_demo", "platform");
    this.scene.add(platform);

    const stair = new THREE.Group();
    stair.userData = selData("stair_demo", "stair");
    for (let i = 0; i < 8; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.5), stepMat);
      step.position.set(-5, i * 0.4 + 0.2, 8 + i * 0.5 - 2);
      step.castShadow = true;
      step.userData = selData("stair_demo", "stair", "stair_demo");
      stair.add(step);
    }
    this.scene.add(stair);
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
