import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";

interface MousePos { x: number; y: number }

export class EditorCamera {
  public focus:            THREE.Vector3;
  public spherical:        THREE.Spherical;
  public targetSpherical:  THREE.Spherical;
  public targetFocus:      THREE.Vector3;

  private readonly _camera:  THREE.PerspectiveCamera;
  private readonly _dom:     HTMLCanvasElement;
  private _mouse:            MousePos = { x: 0, y: 0 };
  private _isOrbiting = false;
  private _isPanning  = false;
  private _keys:       Record<string, boolean> = {};
  private _gizmoDragging = false;
  private _enabled       = true;

  private readonly _onMouseDown: (e: MouseEvent) => void;
  private readonly _onMouseMove: (e: MouseEvent) => void;
  private readonly _onMouseUp:   (e: MouseEvent) => void;
  private readonly _onWheel:     (e: WheelEvent) => void;
  private readonly _onKeyDown:   (e: KeyboardEvent) => void;
  private readonly _onKeyUp:     (e: KeyboardEvent) => void;
  private readonly _onCtxMenu:   (e: Event) => void;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLCanvasElement, bus: EventBus) {
    this._camera = camera;
    this._dom    = domElement;

    this.focus           = new THREE.Vector3(0, 0, 0);
    this.spherical       = new THREE.Spherical(20, Math.PI / 4, Math.PI / 4);
    this.targetSpherical = new THREE.Spherical(20, Math.PI / 4, Math.PI / 4);
    this.targetFocus     = new THREE.Vector3(0, 0, 0);

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
    bus.on("camera:topdown", () => {
      this.targetSpherical.phi    = 0.02;
      this.targetSpherical.radius = Math.min(this.targetSpherical.radius, 30);
    });

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
      this.targetSpherical.phi = Math.max(0.02, Math.min(Math.PI / 2 - 0.02, this.targetSpherical.phi - dy * 0.005));
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

  set enabled(v: boolean) {
    this._enabled = v;
    if (!v) this._keys = {};
  }

  private _handleKeyDown(e: KeyboardEvent): void {
    if (!this._enabled || this._isTypingTarget(e)) return;
    this._keys[e.code] = true;
  }
  private _handleKeyUp(e: KeyboardEvent): void {
    if (!this._enabled || this._isTypingTarget(e)) return;
    delete this._keys[e.code];
  }
  private _isTypingTarget(e: KeyboardEvent): boolean {
    const el = e.target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  }

  update(dt: number): void {
    if (!this._enabled || this._gizmoDragging) return;
    const speed = this.spherical.radius * 0.02;
    const angle = this.spherical.theta;

    const sinA = Math.sin(angle);
    const cosA = Math.cos(angle);
    const s    = speed * dt * 60;

    // fwd = (-sinA, 0, -cosA), right = (cosA, 0, -sinA)
    if (this._keys["KeyW"] || this._keys["ArrowUp"])    { this.targetFocus.x -= sinA * s; this.targetFocus.z -= cosA * s; }
    if (this._keys["KeyS"] || this._keys["ArrowDown"])  { this.targetFocus.x += sinA * s; this.targetFocus.z += cosA * s; }
    if (this._keys["KeyA"] || this._keys["ArrowLeft"])  { this.targetFocus.x -= cosA * s; this.targetFocus.z += sinA * s; }
    if (this._keys["KeyD"] || this._keys["ArrowRight"]) { this.targetFocus.x += cosA * s; this.targetFocus.z -= sinA * s; }

    const zoomStep = this.targetSpherical.radius * 0.04 * dt * 60;
    if (this._keys["Equal"] || this._keys["NumpadAdd"])      this.targetSpherical.radius = Math.max(3, this.targetSpherical.radius - zoomStep);
    if (this._keys["Minus"] || this._keys["NumpadSubtract"]) this.targetSpherical.radius = Math.min(80, this.targetSpherical.radius + zoomStep);

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
