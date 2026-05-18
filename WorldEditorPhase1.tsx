import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ============================================================
// Types
// ============================================================

type ToolId = "select" | "floor" | "wall" | "platform" | "stair" | "object" | "zone";

interface Vec3 { x: number; y: number; z: number }
interface MousePos { x: number; y: number }

// Typed event map — every bus event name maps to its payload type
interface BusEvents {
  "tool:select":   { tool: ToolId };
  "floor:select":  { level: number };
  "object:selected": {
    id: string;
    type: string;
    zoneId: string;
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
  };
  "object:deselected": Record<string, never>;
  "object:updated": { id: string; zoneId: string; changes: Partial<Record<string, unknown>> };
  "preview:start": Record<string, never>;
  "preview:stop":  Record<string, never>;
  "scene:save":    Record<string, never>;
  "scene:load":    { json: unknown };
  "scene:saved":   { json: unknown };
  "gizmo:dragging": { isDragging: boolean };
}

type BusEventName = keyof BusEvents;
type BusCallback<K extends BusEventName> = (payload: BusEvents[K]) => void;

// ============================================================
// EventBus — typed pub/sub between React UI and Three.js
// ============================================================
class EventBus {
  private _listeners: Partial<{ [K in BusEventName]: BusCallback<K>[] }> = {};

  on<K extends BusEventName>(event: K, cb: BusCallback<K>): () => void {
    if (!this._listeners[event]) {
      (this._listeners[event] as BusCallback<K>[]) = [];
    }
    (this._listeners[event] as BusCallback<K>[]).push(cb);
    return () => this.off(event, cb);
  }

  off<K extends BusEventName>(event: K, cb: BusCallback<K>): void {
    const listeners = this._listeners[event] as BusCallback<K>[] | undefined;
    if (!listeners) return;
    (this._listeners[event] as BusCallback<K>[]) = listeners.filter(l => l !== cb);
  }

  emit<K extends BusEventName>(event: K, payload: BusEvents[K]): void {
    const listeners = this._listeners[event] as BusCallback<K>[] | undefined;
    if (listeners) listeners.forEach(cb => cb(payload));
  }
}

// ============================================================
// EditorCamera — Sims-style floating orbital camera
// ============================================================
class EditorCamera {
  public focus: THREE.Vector3;
  public spherical: THREE.Spherical;
  public targetSpherical: THREE.Spherical;
  public targetFocus: THREE.Vector3;

  private readonly _camera: THREE.PerspectiveCamera;
  private readonly _dom: HTMLCanvasElement;
  private readonly _bus: EventBus;
  private _mouse: MousePos = { x: 0, y: 0 };
  private _isOrbiting = false;
  private _isPanning = false;
  private _keys: Record<string, boolean> = {};
  private _gizmoDragging = false;

  // Bound handlers stored for removal
  private readonly _onMouseDown: (e: MouseEvent) => void;
  private readonly _onMouseMove: (e: MouseEvent) => void;
  private readonly _onMouseUp:   (e: MouseEvent) => void;
  private readonly _onWheel:     (e: WheelEvent) => void;
  private readonly _onKeyDown:   (e: KeyboardEvent) => void;
  private readonly _onKeyUp:     (e: KeyboardEvent) => void;
  private readonly _onCtxMenu:   (e: Event) => void;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLCanvasElement, bus: EventBus) {
    this._camera = camera;
    this._dom = domElement;
    this._bus = bus;

    this.focus          = new THREE.Vector3(0, 0, 0);
    this.spherical      = new THREE.Spherical(20, Math.PI / 4, Math.PI / 4);
    this.targetSpherical = new THREE.Spherical(20, Math.PI / 4, Math.PI / 4);
    this.targetFocus    = new THREE.Vector3(0, 0, 0);

    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp   = this._handleMouseUp.bind(this);
    this._onWheel     = this._handleWheel.bind(this);
    this._onKeyDown   = this._handleKeyDown.bind(this);
    this._onKeyUp     = this._handleKeyUp.bind(this);
    this._onCtxMenu   = (e: Event) => e.preventDefault();

    domElement.addEventListener("mousedown",   this._onMouseDown);
    domElement.addEventListener("mousemove",   this._onMouseMove);
    domElement.addEventListener("mouseup",     this._onMouseUp);
    domElement.addEventListener("wheel",       this._onWheel, { passive: false });
    domElement.addEventListener("contextmenu", this._onCtxMenu);
    window.addEventListener("keydown",         this._onKeyDown);
    window.addEventListener("keyup",           this._onKeyUp);

    bus.on("gizmo:dragging", ({ isDragging }) => { this._gizmoDragging = isDragging; });

    this._applyCamera();
  }

  private _handleMouseDown(e: MouseEvent): void {
    if (this._gizmoDragging) return;
    if (e.button === 2) { this._isOrbiting = true; this._mouse = { x: e.clientX, y: e.clientY }; }
    if (e.button === 1) { this._isPanning  = true; this._mouse = { x: e.clientX, y: e.clientY }; e.preventDefault(); }
  }

  private _handleMouseMove(e: MouseEvent): void {
    if (this._gizmoDragging) return;
    const dx = e.clientX - this._mouse.x;
    const dy = e.clientY - this._mouse.y;
    this._mouse = { x: e.clientX, y: e.clientY };

    if (this._isOrbiting) {
      this.targetSpherical.theta -= dx * 0.005;
      this.targetSpherical.phi = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, this.targetSpherical.phi - dy * 0.005));
    }
    if (this._isPanning) {
      const speed = this.spherical.radius * 0.001;
      const up    = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3()
        .setFromSpherical(this.spherical).normalize()
        .cross(up).normalize();
      const fwd = new THREE.Vector3(-Math.sin(this.spherical.theta), 0, -Math.cos(this.spherical.theta));
      this.targetFocus.addScaledVector(right, -dx * speed);
      this.targetFocus.addScaledVector(fwd,    dy * speed);
    }
  }

  private _handleMouseUp(e: MouseEvent): void {
    if (e.button === 2) this._isOrbiting = false;
    if (e.button === 1) this._isPanning  = false;
  }

  private _handleWheel(e: WheelEvent): void {
    e.preventDefault();
    this.targetSpherical.radius = Math.max(3, Math.min(80, this.targetSpherical.radius + e.deltaY * 0.05));
  }

  private _handleKeyDown(e: KeyboardEvent): void { this._keys[e.code] = true; }
  private _handleKeyUp(e: KeyboardEvent):   void { delete this._keys[e.code]; }

  update(dt: number): void {
    if (this._gizmoDragging) return;
    const speed = this.spherical.radius * 0.02;
    const angle = this.spherical.theta;

    if (this._keys["KeyW"] || this._keys["ArrowUp"])    this.targetFocus.x -= Math.sin(angle) * speed * dt * 60;
    if (this._keys["KeyS"] || this._keys["ArrowDown"])  this.targetFocus.x += Math.sin(angle) * speed * dt * 60;
    if (this._keys["KeyA"] || this._keys["ArrowLeft"])  this.targetFocus.z += Math.cos(angle) * speed * dt * 60;
    if (this._keys["KeyD"] || this._keys["ArrowRight"]) this.targetFocus.z -= Math.cos(angle) * speed * dt * 60;

    const k = 0.12;
    this.spherical.radius += (this.targetSpherical.radius - this.spherical.radius) * k;
    this.spherical.theta  += (this.targetSpherical.theta  - this.spherical.theta)  * k;
    this.spherical.phi    += (this.targetSpherical.phi    - this.spherical.phi)    * k;
    this.focus.lerp(this.targetFocus, k);

    this._applyCamera();
  }

  private _applyCamera(): void {
    const pos = new THREE.Vector3().setFromSpherical(this.spherical);
    this._camera.position.copy(this.focus).add(pos);
    this._camera.lookAt(this.focus);
  }

  dispose(): void {
    this._dom.removeEventListener("mousedown",   this._onMouseDown);
    this._dom.removeEventListener("mousemove",   this._onMouseMove);
    this._dom.removeEventListener("mouseup",     this._onMouseUp);
    this._dom.removeEventListener("wheel",       this._onWheel);
    this._dom.removeEventListener("contextmenu", this._onCtxMenu);
    window.removeEventListener("keydown",        this._onKeyDown);
    window.removeEventListener("keyup",          this._onKeyUp);
  }
}

// ============================================================
// SceneManager — owns Three.js scene, renderer, RAF loop
// ============================================================
type UpdateCallback = (dt: number) => void;

class SceneManager {
  public readonly scene:        THREE.Scene;
  public readonly camera:       THREE.PerspectiveCamera;
  public readonly renderer:     THREE.WebGLRenderer;
  public readonly editorCamera: EditorCamera;

  private readonly _bus:             EventBus;
  private readonly _clock:           THREE.Clock;
  private readonly _updateCallbacks: UpdateCallback[] = [];
  private _raf:      number = 0;
  private _disposed: boolean = false;
  private readonly _onResize: () => void;

  constructor(canvas: HTMLCanvasElement, bus: EventBus) {
    this._bus = bus;

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
      new THREE.MeshStandardMaterial({ color: 0x1a2530, roughness: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  private _setupDemoScene(): void {
    const buildingMat  = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.7, metalness: 0.1 });
    const wallMat      = new THREE.MeshStandardMaterial({ color: 0x4a5a6a, roughness: 0.8 });
    const roofMat      = new THREE.MeshStandardMaterial({ color: 0x2a3545, roughness: 0.6 });
    const platformMat  = new THREE.MeshStandardMaterial({ color: 0x5a6a7a, roughness: 0.5 });
    const stepMat      = new THREE.MeshStandardMaterial({ color: 0x4a5a6a });

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

    addBuilding(-8, -5, 6, 8, 4);
    addBuilding( 5, -8, 10, 7, 6);
    addBuilding(-12, 6, 5, 5, 3.2);
    addBuilding( 8,  5, 8, 10, 8);

    // Demo wall segment
    const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.2), wallMat);
    wall.position.set(0, 1.5, 0);
    wall.castShadow = true;
    this.scene.add(wall);

    // Demo platform (mall-style)
    const platform = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 6), platformMat);
    platform.position.set(0, 3.2, 8);
    platform.castShadow = true;
    platform.receiveShadow = true;
    this.scene.add(platform);

    // Demo stair steps
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

// ============================================================
// SVG Icon components
// ============================================================

interface IconProps { color: string }

const IconSelect = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <polygon points="6,4 6,22 10,17 13,24 16,23 13,16 19,16"
      stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
  </svg>
);
const IconFloor = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <rect x="5" y="8" width="18" height="12" rx="1.5" stroke={color} strokeWidth="1.5"/>
    <line x1="5" y1="14" x2="23" y2="14" stroke={color} strokeWidth="0.75" strokeDasharray="2.5,2"/>
    <line x1="14" y1="8" x2="14" y2="20" stroke={color} strokeWidth="0.75" strokeDasharray="2.5,2"/>
  </svg>
);
const IconWall = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <rect x="6"  y="6" width="6" height="16" rx="1" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.12"/>
    <rect x="16" y="6" width="6" height="16" rx="1" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.12"/>
    <rect x="5"  y="4" width="18" height="3.5" rx="1" fill={color} fillOpacity="0.45"/>
  </svg>
);
const IconPlatform = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <polygon points="14,5 23,10 14,15 5,10"  stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill={color} fillOpacity="0.1"/>
    <polygon points="5,10 14,15 14,21 5,16"  stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill={color} fillOpacity="0.2"/>
    <polygon points="23,10 14,15 14,21 23,16" stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill={color} fillOpacity="0.07"/>
  </svg>
);
const IconStair = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <polyline points="5,22 5,18 9,18 9,14 13,14 13,10 17,10 17,6 23,6"
      stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/>
  </svg>
);
const IconObject = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <rect x="7"    y="13" width="14"  height="3"  rx="0.5" fill={color} fillOpacity="0.8" stroke={color} strokeWidth="0.5"/>
    <rect x="7"    y="6"  width="3"   height="9"  rx="0.5" fill={color} fillOpacity="0.8" stroke={color} strokeWidth="0.5"/>
    <rect x="8"    y="16" width="2.5" height="6"  rx="0.5" fill={color} fillOpacity="0.6"/>
    <rect x="17.5" y="16" width="2.5" height="6"  rx="0.5" fill={color} fillOpacity="0.6"/>
  </svg>
);
const IconZone = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <rect x="4" y="6" width="20" height="16" rx="2" stroke={color} strokeWidth="1.5" strokeDasharray="3.5,2.5"/>
    <circle cx="4"  cy="6"  r="2" fill={color}/>
    <circle cx="24" cy="6"  r="2" fill={color}/>
    <circle cx="4"  cy="22" r="2" fill={color}/>
    <circle cx="24" cy="22" r="2" fill={color}/>
  </svg>
);
const IconPlay = ({ color }: IconProps) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <polygon points="5,3 17,10 5,17" fill={color} stroke={color} strokeWidth="1" strokeLinejoin="round"/>
  </svg>
);

const TOOL_ICONS: Record<ToolId, React.FC<IconProps>> = {
  select:   IconSelect,
  floor:    IconFloor,
  wall:     IconWall,
  platform: IconPlatform,
  stair:    IconStair,
  object:   IconObject,
  zone:     IconZone,
};

// ============================================================
// Toolbar
// ============================================================

interface ToolDef {
  id: ToolId;
  label: string;
  shortcut: string;
}

const TOOLS: ToolDef[] = [
  { id: "select",   label: "Select",   shortcut: "V" },
  { id: "floor",    label: "Floor",    shortcut: "F" },
  { id: "wall",     label: "Wall",     shortcut: "W" },
  { id: "platform", label: "Platform", shortcut: "L" },
  { id: "stair",    label: "Stair",    shortcut: "T" },
  { id: "object",   label: "Object",   shortcut: "O" },
  { id: "zone",     label: "Zone",     shortcut: "Z" },
];

interface ToolbarProps {
  activeTool: ToolId;
  onToolSelect: (tool: ToolId) => void;
}

function Toolbar({ activeTool, onToolSelect }: ToolbarProps) {
  return (
    <div style={{
      position: "absolute", left: 0, top: 0, bottom: 0, width: 64,
      background: "rgba(10,14,22,0.95)",
      borderRight: "1px solid rgba(80,120,180,0.2)",
      display: "flex", flexDirection: "column", alignItems: "center",
      paddingTop: 56, gap: 2, zIndex: 10,
    }}>
      {TOOLS.map(tool => {
        const active = activeTool === tool.id;
        const Icon = TOOL_ICONS[tool.id];
        const color = active ? "#80aaff" : "#5a7a9a";
        return (
          <button
            key={tool.id}
            title={`${tool.label} (${tool.shortcut})`}
            onClick={() => onToolSelect(tool.id)}
            style={{
              width: 48, height: 48, border: "none", cursor: "pointer",
              borderRadius: 8, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 2,
              background: active ? "rgba(80,140,255,0.2)" : "transparent",
              outline: active ? "1px solid rgba(80,140,255,0.45)" : "none",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(80,140,255,0.08)"; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
          >
            <Icon color={color} />
            <span style={{ fontSize: 8, letterSpacing: 0.8, color, opacity: 0.7, fontFamily: "monospace" }}>
              {tool.shortcut}
            </span>
          </button>
        );
      })}

      <div style={{ flex: 1 }} />
      <div style={{ width: 40, height: 1, background: "rgba(80,120,180,0.2)", marginBottom: 4 }} />

      <button
        title="Preview (P)"
        style={{
          width: 48, height: 48, border: "1px solid rgba(80,200,120,0.3)",
          borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(80,200,120,0.08)", cursor: "pointer", marginBottom: 8,
        }}
      >
        <IconPlay color="#80cc90" />
      </button>
    </div>
  );
}

// ============================================================
// TopBar
// ============================================================

interface TopBarProps {
  activeFloor: number;
  onFloorChange: (level: number) => void;
}

function TopBar({ activeFloor, onFloorChange }: TopBarProps) {
  const floors: Array<{ level: number; label: string }> = [
    { level: 0, label: "G" },
    { level: 1, label: "1" },
    { level: 2, label: "2" },
    { level: 3, label: "3" },
  ];

  return (
    <div style={{
      position: "absolute", top: 0, left: 64, right: 280, height: 48,
      background: "rgba(10,14,22,0.95)",
      borderBottom: "1px solid rgba(80,120,180,0.2)",
      display: "flex", alignItems: "center", gap: 12,
      padding: "0 16px", zIndex: 10,
    }}>
      <span style={{ color: "#80aaff", fontFamily: "monospace", fontSize: 13, letterSpacing: 2, opacity: 0.8 }}>
        WORLD EDITOR
      </span>
      <div style={{ width: 1, height: 24, background: "rgba(80,120,180,0.3)" }} />

      <span style={{ color: "#5a7a9a", fontSize: 11, letterSpacing: 1 }}>FLOOR</span>
      {floors.map(({ level, label }) => (
        <button
          key={level}
          onClick={() => onFloorChange(level)}
          style={{
            width: 28, height: 28, border: "1px solid",
            borderColor: activeFloor === level ? "rgba(80,140,255,0.6)" : "rgba(80,120,180,0.2)",
            borderRadius: 6,
            background: activeFloor === level ? "rgba(80,140,255,0.2)" : "transparent",
            color: activeFloor === level ? "#80aaff" : "#5a7a9a",
            fontSize: 12, cursor: "pointer", fontFamily: "monospace",
          }}
        >
          {label}
        </button>
      ))}

      <div style={{ flex: 1 }} />

      {(["Save", "Load"] as const).map(label => (
        <button
          key={label}
          style={{
            padding: "4px 12px", border: "1px solid rgba(80,120,180,0.3)",
            borderRadius: 6, background: "transparent", color: "#7a9ab8",
            fontSize: 11, cursor: "pointer", letterSpacing: 1,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// PropertiesPanel
// ============================================================

interface ToolInfo { desc: string; hint: string }

const TOOL_INFO: Record<ToolId, ToolInfo> = {
  select:   { desc: "Click any object to select it. Use gizmos to transform.", hint: "Nothing selected" },
  floor:    { desc: "Click and drag to paint a floor region.",                 hint: "Click to place floor origin" },
  wall:     { desc: "Click to set wall start, click again to set end.",        hint: "Click to place wall start" },
  platform: { desc: "Click and drag to define a freestanding platform.",       hint: "Click to place platform" },
  stair:    { desc: "Click bottom point, then top point of staircase.",        hint: "Click bottom of stair" },
  object:   { desc: "Choose an asset below, click to place.",                  hint: "Select an asset first" },
  zone:     { desc: "Draw a zone boundary to group rooms.",                    hint: "Click to define zone area" },
};

const PLACEHOLDER_ASSETS = ["Wall Segment", "Floor Tile", "Door Frame", "Window", "Staircase", "Platform"] as const;
type AssetName = typeof PLACEHOLDER_ASSETS[number];

const TRANSFORM_AXES = [
  { axis: "X", color: "#ff6b6b" },
  { axis: "Y", color: "#6bff8a" },
  { axis: "Z", color: "#6b8aff" },
] as const;

interface PropertiesPanelProps {
  activeTool: ToolId;
}

function PropertiesPanel({ activeTool }: PropertiesPanelProps) {
  const info = TOOL_INFO[activeTool];

  return (
    <div style={{
      position: "absolute", right: 0, top: 0, bottom: 0, width: 280,
      background: "rgba(10,14,22,0.95)", borderLeft: "1px solid rgba(80,120,180,0.2)",
      display: "flex", flexDirection: "column", zIndex: 10,
    }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(80,120,180,0.15)" }}>
        <div style={{ color: "#80aaff", fontSize: 11, letterSpacing: 2, marginBottom: 4 }}>PROPERTIES</div>
        <div style={{ color: "#4a6a8a", fontSize: 11 }}>{info.desc}</div>
      </div>

      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(80,120,180,0.1)" }}>
        <div style={{
          padding: "8px 12px", background: "rgba(80,140,255,0.06)",
          border: "1px solid rgba(80,140,255,0.15)", borderRadius: 6,
          color: "#6a90b8", fontSize: 11,
        }}>
          {info.hint}
        </div>
      </div>

      <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {(["Position", "Rotation", "Scale"] as const).map(label => (
          <div key={label}>
            <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>{label}</div>
            <div style={{ display: "flex", gap: 4 }}>
              {TRANSFORM_AXES.map(({ axis, color }) => (
                <div key={axis} style={{
                  flex: 1, padding: "4px 8px",
                  background: "rgba(20,30,45,0.8)", border: "1px solid rgba(80,120,180,0.15)",
                  borderRadius: 4, display: "flex", gap: 4, alignItems: "center",
                }}>
                  <span style={{ color, fontSize: 9 }}>{axis}</span>
                  <span style={{ color: "#3a5a7a", fontSize: 10, fontFamily: "monospace" }}>0.00</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ margin: "8px 16px 0", borderTop: "1px solid rgba(80,120,180,0.1)", paddingTop: 10 }}>
        <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>ASSETS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {PLACEHOLDER_ASSETS.map((name: AssetName) => (
            <div
              key={name}
              style={{
                padding: "8px 6px", background: "rgba(20,30,45,0.8)",
                border: "1px solid rgba(80,120,180,0.12)", borderRadius: 6,
                color: "#5a7a9a", fontSize: 10, textAlign: "center", cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(80,140,255,0.3)"; e.currentTarget.style.color = "#80aaff"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(80,120,180,0.12)"; e.currentTarget.style.color = "#5a7a9a"; }}
            >
              {name}
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ padding: "8px 16px", borderTop: "1px solid rgba(80,120,180,0.15)", display: "flex", gap: 12 }}>
        {([["RMB", "Orbit"], ["MMB", "Pan"], ["Scroll", "Zoom"]] as const).map(([key, action]) => (
          <div key={key} style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{
              background: "rgba(80,120,180,0.15)", border: "1px solid rgba(80,120,180,0.3)",
              borderRadius: 3, padding: "1px 4px", fontSize: 8, color: "#5a7a9a", fontFamily: "monospace",
            }}>{key}</span>
            <span style={{ color: "#3a5a7a", fontSize: 9 }}>{action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// CoordinateDisplay
// ============================================================

interface CoordinateDisplayProps { coords: Vec3 }

function CoordinateDisplay({ coords }: CoordinateDisplayProps) {
  const axes = [
    { label: "X", value: coords.x, color: "#ff6b6b" },
    { label: "Y", value: coords.y, color: "#6bff8a" },
    { label: "Z", value: coords.z, color: "#6b8aff" },
  ] as const;

  return (
    <div style={{
      position: "absolute", bottom: 16, left: 80,
      background: "rgba(10,14,22,0.8)", border: "1px solid rgba(80,120,180,0.2)",
      borderRadius: 6, padding: "4px 10px", zIndex: 10, display: "flex", gap: 12,
    }}>
      {axes.map(({ label, value, color }) => (
        <span key={label} style={{ fontFamily: "monospace", fontSize: 11 }}>
          <span style={{ color }}>{label} </span>
          <span style={{ color: "#5a7a9a" }}>{value.toFixed(2)}</span>
        </span>
      ))}
    </div>
  );
}

// ============================================================
// App — wires React UI + Three.js SceneManager
// ============================================================
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef  = useRef<SceneManager | null>(null);
  const busRef    = useRef<EventBus>(new EventBus());

  const [activeTool,  setActiveTool]  = useState<ToolId>("select");
  const [activeFloor, setActiveFloor] = useState<number>(0);
  const [coords,      setCoords]      = useState<Vec3>({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sm = new SceneManager(canvas, busRef.current);
    sceneRef.current = sm;

    // Track mouse world position for coordinate readout
    const raycaster   = new THREE.Raycaster();
    const mouse       = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target      = new THREE.Vector3();

    const onMouseMove = (e: MouseEvent): void => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, sm.camera);
      if (raycaster.ray.intersectPlane(groundPlane, target)) {
        setCoords({ x: target.x, y: target.y, z: target.z });
      }
    };

    canvas.addEventListener("mousemove", onMouseMove);
    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      sm.dispose();
    };
  }, []);

  const handleToolSelect = (tool: ToolId): void => {
    setActiveTool(tool);
    busRef.current.emit("tool:select", { tool });
  };

  const handleFloorChange = (level: number): void => {
    setActiveFloor(level);
    busRef.current.emit("floor:select", { level });
  };

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0e16", position: "relative", overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />

      <Toolbar      activeTool={activeTool}   onToolSelect={handleToolSelect} />
      <TopBar       activeFloor={activeFloor} onFloorChange={handleFloorChange} />
      <PropertiesPanel activeTool={activeTool} />
      <CoordinateDisplay coords={coords} />

      <div style={{
        position: "absolute", bottom: 16, right: 296,
        color: "rgba(80,120,180,0.25)", fontSize: 10, fontFamily: "monospace", letterSpacing: 2,
      }}>
        PHASE 1 — SCENE FOUNDATION
      </div>
    </div>
  );
}
