import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { IEditorModule, Vec3 } from "@/types";

/**
 * Centralizes all DOM input and re-emits it as typed bus events so tools never
 * attach their own listeners. `_suppress` mutes emission during transitions.
 */
export class InputManager implements IEditorModule {
  private readonly _dom:    HTMLCanvasElement;
  private readonly _camera: THREE.PerspectiveCamera;
  private readonly _bus:    EventBus;

  private readonly _keys:        Record<string, boolean> = {};
  private readonly _mouse        = new THREE.Vector2();
  private readonly _raycaster    = new THREE.Raycaster();
  private readonly _groundPlane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly _hit          = new THREE.Vector3();
  private _suppress = false;
  private _unsub: Array<() => void> = [];
  private _mouseDownScreenPos: { x: number; y: number } | null = null;
  private readonly _DRAG_THRESHOLD = 5; // pixels — moves beyond this are drags, not clicks

  private readonly _onMouseDown:   (e: MouseEvent) => void;
  private readonly _onMouseMove:   (e: MouseEvent) => void;
  private readonly _onMouseUp:     (e: MouseEvent) => void;
  private readonly _onClick:       (e: MouseEvent) => void;
  private readonly _onDblClick:    (e: MouseEvent) => void;
  private readonly _onWheel:       (e: WheelEvent) => void;
  private readonly _onContextMenu: (e: Event) => void;
  private readonly _onKeyDown:     (e: KeyboardEvent) => void;
  private readonly _onKeyUp:       (e: KeyboardEvent) => void;

  constructor(domElement: HTMLCanvasElement, camera: THREE.PerspectiveCamera, bus: EventBus) {
    this._dom    = domElement;
    this._camera = camera;
    this._bus    = bus;

    this._onMouseDown   = e => this._handleMouseDown(e);
    this._onMouseMove   = e => this._handleMouseMove(e);
    this._onMouseUp     = e => this._handleMouseUp(e);
    this._onClick       = e => this._handleClick(e);
    this._onDblClick    = e => this._handleDblClick(e);
    this._onWheel       = e => this._handleWheel(e);
    this._onContextMenu = e => e.preventDefault();
    this._onKeyDown     = e => this._handleKeyDown(e);
    this._onKeyUp       = e => this._handleKeyUp(e);
  }

  init(): void {
    this._dom.addEventListener("mousedown",   this._onMouseDown);
    this._dom.addEventListener("mousemove",   this._onMouseMove);
    this._dom.addEventListener("mouseup",     this._onMouseUp);
    this._dom.addEventListener("click",       this._onClick);
    this._dom.addEventListener("dblclick",    this._onDblClick);
    this._dom.addEventListener("wheel",       this._onWheel, { passive: false });
    this._dom.addEventListener("contextmenu", this._onContextMenu);
    window.addEventListener("keydown",        this._onKeyDown);
    window.addEventListener("keyup",          this._onKeyUp);

    this._unsub.push(
      this._bus.on("overlay:fade-in",  () => { this._suppress = true; }),
      this._bus.on("overlay:fade-out", () => { this._suppress = false; }),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._dom.removeEventListener("mousedown",   this._onMouseDown);
    this._dom.removeEventListener("mousemove",   this._onMouseMove);
    this._dom.removeEventListener("mouseup",     this._onMouseUp);
    this._dom.removeEventListener("click",       this._onClick);
    this._dom.removeEventListener("dblclick",    this._onDblClick);
    this._dom.removeEventListener("wheel",       this._onWheel);
    this._dom.removeEventListener("contextmenu", this._onContextMenu);
    window.removeEventListener("keydown",        this._onKeyDown);
    window.removeEventListener("keyup",          this._onKeyUp);
    this._unsub.forEach(u => u());
    this._unsub = [];
  }

  get isShiftDown(): boolean { return !!(this._keys["ShiftLeft"]   || this._keys["ShiftRight"]); }
  get isAltDown():   boolean { return !!(this._keys["AltLeft"]     || this._keys["AltRight"]); }
  get isCtrlDown():  boolean { return !!(this._keys["ControlLeft"] || this._keys["ControlRight"]); }
  isKeyDown(code: string): boolean { return !!this._keys[code]; }

  private _worldPos(e: MouseEvent): Vec3 {
    const rect = this._dom.getBoundingClientRect();
    this._mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    this._mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, this._camera);
    this._raycaster.ray.intersectPlane(this._groundPlane, this._hit);
    return { x: this._hit.x, y: this._hit.y, z: this._hit.z };
  }

  private _handleMouseDown(e: MouseEvent): void {
    this._mouseDownScreenPos = { x: e.clientX, y: e.clientY };
    if (this._suppress) return;
    this._bus.emit("input:mousedown", { button: e.button, screenPos: { x: e.clientX, y: e.clientY } });
  }

  private _handleMouseMove(e: MouseEvent): void {
    if (this._suppress) return;
    this._bus.emit("input:mousemove", {
      screenPos: { x: e.clientX, y: e.clientY },
      worldPos:  this._worldPos(e),
      delta:     { x: e.movementX, y: e.movementY },
    });
  }

  private _handleMouseUp(e: MouseEvent): void {
    if (this._suppress) return;
    this._bus.emit("input:mouseup", { button: e.button, screenPos: { x: e.clientX, y: e.clientY } });
  }

  private _handleClick(e: MouseEvent): void {
    if (this._suppress) return;
    if (this._mouseDownScreenPos) {
      const dx = e.clientX - this._mouseDownScreenPos.x;
      const dy = e.clientY - this._mouseDownScreenPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > this._DRAG_THRESHOLD) return;
    }
    this._bus.emit("input:click", {
      screenPos: { x: e.clientX, y: e.clientY },
      worldPos:  this._worldPos(e),
      button:    e.button,
      shift:     e.shiftKey,
      ctrl:      e.ctrlKey,
      meta:      e.metaKey,
    });
  }

  private _handleDblClick(e: MouseEvent): void {
    if (this._suppress) return;
    this._bus.emit("input:dblclick", {
      screenPos: { x: e.clientX, y: e.clientY },
      worldPos:  this._worldPos(e),
    });
  }

  private _handleWheel(e: WheelEvent): void {
    e.preventDefault();
    if (this._suppress) return;
    this._bus.emit("input:wheel", { delta: e.deltaY });
  }

  private _handleKeyDown(e: KeyboardEvent): void {
    if (this._isTypingTarget(e)) return;
    this._keys[e.code] = true;
    if (this._suppress) return;
    this._bus.emit("input:keydown", {
      code: e.code, key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey,
    });
  }

  private _handleKeyUp(e: KeyboardEvent): void {
    if (this._isTypingTarget(e)) return;
    delete this._keys[e.code];
    if (this._suppress) return;
    this._bus.emit("input:keyup", { code: e.code });
  }

  private _isTypingTarget(e: KeyboardEvent): boolean {
    const el = e.target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
  }
}
