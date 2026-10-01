import * as THREE from "three";
import { softDisplace, type SoftCurve } from "@/editor/brushOps";
import type { EventBus } from "@/core/EventBus";
import type { IEditorModule, ToolId, ShapeDef, Vec3, BrushFace } from "@/types";

/**
 * Soft falloff (Phase 82): when a brush drag moves corners, the corners near them
 * follow part of the way (`softDisplace`). One setting for every brush and every corner
 * drag (corner, edge, face, face set, corner set, PUSH): SOFT on/off, a radius in
 * meters and a slope. Kept here as module state so the four drag editors and the panel
 * read one copy; changes go out as "brush:soft-changed". Remembered in localStorage.
 */
export interface SoftSettings { on: boolean; radius: number; curve: SoftCurve }

const KEY = "brushSoftFalloff";
const MIN_RADIUS = 0.25, MAX_RADIUS = 50;

function load(): SoftSettings {
  const d: SoftSettings = { on: false, radius: 2, curve: "smooth" };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<SoftSettings> | null;
    if (s) return { on: !!s.on, radius: clampRadius(s.radius ?? d.radius), curve: s.curve === "linear" || s.curve === "sharp" ? s.curve : "smooth" };
  } catch { /* storage blocked */ }
  return d;
}

const clampRadius = (r: number) => Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, +r.toFixed(2)));

let current: SoftSettings = load();

export function softSettings(): SoftSettings { return current; }

export function setSoftSettings(bus: EventBus, patch: Partial<SoftSettings>): void {
  current = { ...current, ...patch, radius: clampRadius(patch.radius ?? current.radius) };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage blocked */ }
  bus.emit("brush:soft-changed", current);
}

/**
 * Called by each drag editor with the drag's result before writing it: returns the
 * vertices with falloff applied (just `next` when SOFT is off) and shows which corners
 * follow, and how much, until the drag ends.
 */
export function applySoft(bus: EventBus, shape: ShapeDef, orig: Vec3[], next: Vec3[], sources: number[], faces: BrushFace[] | undefined): Vec3[] {
  if (!current.on) return next;
  const r = softDisplace(orig, next, sources, faces, current.radius, current.curve);
  const m = shapeMatrix(shape);
  const p = new THREE.Vector3();
  bus.emit("brush:soft-preview", {
    points: r.affected.map(({ i, w }) => {
      const v = r.vertices[i]!;
      p.set(v.x, v.y, v.z).applyMatrix4(m);
      return { x: p.x, y: p.y, z: p.z, w };
    }),
  });
  return r.vertices;
}

function shapeMatrix(shape: ShapeDef): THREE.Matrix4 {
  const D2R = Math.PI / 180;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(shape.position.x, shape.position.y, shape.position.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(shape.rotation.x * D2R, shape.rotation.y * D2R, shape.rotation.z * D2R, "XYZ")),
    new THREE.Vector3(1, 1, 1),
  );
}

const SUB_TOOLS: ToolId[] = ["select-face", "select-vertex", "select-edge"];

/**
 * Keys and the drag preview: O toggles SOFT in face / corner / edge mode; [ and ] shrink
 * and grow the radius (also mid-drag: the editors re-apply on "brush:soft-changed").
 * While a soft drag runs, the following corners show as green dots, brighter the more
 * they follow; they clear when the drag ends.
 */
export class SoftFalloffController implements IEditorModule {
  private _tool: ToolId = "select";
  private readonly _points: THREE.Points;
  private readonly _unsubs: Array<() => void> = [];

  constructor(private readonly _scene: THREE.Scene, private readonly _bus: EventBus) {
    const mat = new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, vertexColors: true, depthTest: false, transparent: true });
    this._points = new THREE.Points(new THREE.BufferGeometry(), mat);
    this._points.renderOrder = 7;
    this._points.frustumCulled = false;
    this._points.visible = false;
    this._points.userData = { hideInGame: true, editorOnly: true, selectable: false };
  }

  init(): void {
    this._scene.add(this._points);
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => { this._tool = tool; }),
      this._bus.on("input:keydown", ({ code, ctrl, meta, alt }) => {
        if (ctrl || meta || alt || !SUB_TOOLS.includes(this._tool)) return;
        if (code === "KeyO") setSoftSettings(this._bus, { on: !current.on });
        else if (current.on && code === "BracketLeft")  setSoftSettings(this._bus, { radius: current.radius / 1.25 });
        else if (current.on && code === "BracketRight") setSoftSettings(this._bus, { radius: current.radius * 1.25 });
      }),
      this._bus.on("brush:soft-preview", ({ points }) => this._show(points)),
      this._bus.on("gizmo:dragging", ({ isDragging }) => { if (!isDragging) this._points.visible = false; }),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._unsubs.forEach(u => u());
    this._unsubs.length = 0;
    this._scene.remove(this._points);
    this._points.geometry.dispose();
    (this._points.material as THREE.Material).dispose();
  }

  private _show(points: Array<{ x: number; y: number; z: number; w: number }>): void {
    const pos = new Float32Array(points.length * 3), col = new Float32Array(points.length * 3);
    const dim = new THREE.Color(0x1d5c45), bright = new THREE.Color(0x3ccf91), c = new THREE.Color();
    points.forEach((p, k) => {
      pos.set([p.x, p.y, p.z], k * 3);
      c.copy(dim).lerp(bright, p.w);
      col.set([c.r, c.g, c.b], k * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this._points.geometry.dispose();
    this._points.geometry = g;
    this._points.visible = points.length > 0;
  }
}
