import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { assetManager } from "@/core/AssetManager";
import { CharacterAnimator } from "./CharacterAnimator";
import { rigInfo } from "./rig";
import {
  loadCharacter, moveResolver, topBoneNames, keepInPlace, clipTravels, applyCharacterLook,
  modelHeight, materialNames, materialColors, CAPSULE_HEIGHT, type PooledClip,
} from "./characterRuntime";
import { LOOPING_MOVES } from "./autoFill";
import type { SceneManager } from "@/core/SceneManager";
import type { ZoneManager } from "@/world/ZoneManager";
import type { WorldState } from "@/world/WorldState";
import type { CharacterDef, EditorCameraPose, RigInfo } from "@/types";

/** What the editor's player bar shows. */
export interface StagePlayback {
  label: string | null;      // "Walk_Loop" (or "move: walk")
  source: string | null;     // the file it came from
  time: number; duration: number;
  playing: boolean; loop: boolean; speed: number;
  testing: boolean;          // a BLEND TEST is running (its button reads STOP)
}

/** One clip the character can use, for the ANIMATIONS list. */
export interface StageClip { name: string; source: string; duration: number; loop: boolean; travels: boolean }

/**
 * Phase 86 part B: the character editor's isolated view. The level's zone is set aside
 * (unloaded, not changed: characters live in game.json, not in the world, so the undo
 * history is untouched) and the character stands alone on the brush editor's dark grid,
 * with its collision capsule drawn as a ghost. Plays clips and moves through the same
 * CharacterAnimator the game uses, so what you see here is what plays in the game.
 */
export class CharacterStage {
  private _def: CharacterDef | null = null;
  private _root: THREE.Object3D | null = null;
  private _anim: CharacterAnimator | null = null;
  private _pool: PooledClip[] = [];
  private _tops: string[] = [];
  private _rawHeight = 0;
  private _capsule: THREE.Object3D | null = null;
  private _prevZone: string | null = null;
  private _prevPose: EditorCameraPose | null = null;
  private _paused = false;
  private _loop = true;
  private _speed = 1;
  private _source: string | null = null;
  private _blend: { to: string; at: number } | null = null;
  private _testing = false;   // from blendTest until STOP or any other clip / move
  private _rig: RigInfo | null = null;
  private _baseColors: Record<string, string> = {};
  private _materials: string[] = [];
  private _build = 0;
  private readonly _tick = (dt: number) => this._update(dt);

  constructor(
    private readonly _scene: SceneManager,
    private readonly _world: WorldState,
    private readonly _zones: ZoneManager,
    private readonly _capsuleScale: number,
  ) {}

  get active(): boolean { return this._def !== null; }
  get rig(): RigInfo | null { return this._rig; }
  get materials(): string[] { return this._materials; }
  get baseColors(): Record<string, string> { return this._baseColors; }
  /** The model's own height (m), before the character's size setting. */
  get modelHeight(): number { return this._rawHeight; }
  get capsuleHeight(): number { return CAPSULE_HEIGHT * this._capsuleScale; }

  async enter(def: CharacterDef): Promise<void> {
    if (this._def) return;
    this._def = def;
    this._prevZone = this._world.activeZoneId;
    this._prevPose = this._scene.editorCamera?.getPose() ?? null;
    if (this._prevZone) this._zones.unloadZone(this._prevZone);
    this._buildCapsule();
    this._scene.onUpdate(this._tick);
    await this._rebuild(true);
  }

  /** Back to the level: the zone reloads, the camera returns. */
  async exit(): Promise<void> {
    if (!this._def) return;
    this._def = null;
    this._scene.offUpdate(this._tick);
    this._clearModel();
    if (this._capsule) { this._scene.scene.remove(this._capsule); this._disposeTree(this._capsule); this._capsule = null; }
    if (this._prevZone) await this._zones.loadZone(this._prevZone);
    const cam = this._scene.editorCamera;
    if (cam && this._prevPose) cam.setPose(this._prevPose);
    this._prevZone = null; this._prevPose = null;
  }

  /**
   * The character changed. Moves only → the resolver reads the new def at once; the
   * model, the files, the size, the colors or KEEP IN PLACE → the model is rebuilt (the
   * playing clip carries on).
   */
  async update(def: CharacterDef): Promise<void> {
    const prev = this._def;
    this._def = def;
    if (!prev) return;
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (prev.modelAssetId !== def.modelAssetId || !same(prev.clipSources, def.clipSources)
      || !same(prev.colors ?? {}, def.colors ?? {}) || prev.height !== def.height || prev.inPlace !== def.inPlace) {
      await this._rebuild(prev.modelAssetId !== def.modelAssetId);
    }
  }

  /** Every clip the character can use, own file first. */
  clips(): StageClip[] {
    return this._pool.map(p => ({
      name: p.clip.name, source: p.source, duration: p.clip.duration,
      loop: /(^|[_\s-])loop($|[_\s-])/i.test(p.clip.name) || /Loop$/.test(p.clip.name),
      travels: clipTravels(p.clip, this._tops),
    }));
  }

  /** Preview one clip (from `source`), looping or once. */
  playClip(name: string, source: string): void {
    const p = this._pool.find(x => x.clip.name === name && x.source === source);
    if (!p || !this._anim) return;
    this._source = source;
    this._blend = null; this._testing = false;
    this._anim.playClip(this._prep(p.clip), this._loop, this._speed, `clip:${name}`);
    this._paused = false;
  }

  /** Preview a move: the clip it's set to, looping if it's a looping move. */
  playMove(move: string): void {
    if (!this._anim || !this._def) return;
    const clip = this._anim.clipFor(move);
    if (!clip) return;
    this._source = this._def.moves[move]?.source ?? this._pool.find(p => p.clip.name === clip.name)?.source ?? null;
    this._blend = null; this._testing = false;
    this._loop = LOOPING_MOVES.has(move);
    this._anim.playClip(clip, this._loop, this._speed, `move:${move}`);
    this._paused = false;
  }

  /** BLEND TEST: `from` for a moment, then blend into `to` the way the game does. */
  blendTest(from: string, to: string): void {
    this.playMove(from);
    this._blend = { to, at: 1.2 };
    this._testing = true;
  }

  /** STOP on the blend test: back to idle. */
  stopTest(): void {
    this._blend = null; this._testing = false;   // even when idle has no clip
    this.playMove("idle");
  }

  setPaused(on: boolean): void { this._paused = on; }
  setLoop(on: boolean): void {
    this._loop = on;
    const a = this._anim?.currentAction;
    if (a) { a.setLoop(on ? THREE.LoopRepeat : THREE.LoopOnce, on ? Infinity : 1); a.clampWhenFinished = !on; if (on && !a.isRunning()) { a.reset(); a.play(); } }
  }
  setSpeed(speed: number): void {
    this._speed = speed;
    const a = this._anim?.currentAction;
    if (a) a.timeScale = speed;
  }
  /** Scrub: jump the playing clip to `t` seconds (pauses, so the pose holds). */
  seek(t: number): void {
    const a = this._anim?.currentAction;
    if (!a || !this._anim) return;
    a.paused = false;
    a.time = Math.max(0, t);
    if (!a.isRunning()) a.play();
    this._anim.mixer.update(0);
    this._paused = true;
  }

  playback(): StagePlayback {
    const a = this._anim?.currentAction, c = this._anim?.currentClip;
    const key = this._anim?.current ?? "";
    return {
      label: !c ? null : key.startsWith("move:") ? `${key.slice(5)} · ${c.name}` : c.name,
      source: this._source, time: a ? Math.min(a.time, c?.duration ?? 0) : 0, duration: c?.duration ?? 0,
      playing: !!a && !this._paused, loop: this._loop, speed: this._speed, testing: this._testing,
    };
  }

  // ── internals ────────────────────────────────────────────────────────────────

  private _prep(clip: THREE.AnimationClip): THREE.AnimationClip {
    return this._def?.inPlace === false ? clip : keepInPlace(clip, this._tops);
  }

  private _update(dt: number): void {
    if (!this._anim) return;
    if (!this._paused) this._anim.update(dt);
    if (this._blend) {
      this._blend.at -= dt;
      if (this._blend.at <= 0) {
        const to = this._blend.to;
        this._blend = null;
        const clip = this._anim.clipFor(to);
        if (clip) { this._loop = LOOPING_MOVES.has(to); this._anim.playClip(clip, this._loop, this._speed, `move:${to}`); }
      }
    }
  }

  private async _rebuild(frame: boolean): Promise<void> {
    const def = this._def;
    if (!def) return;
    const build = ++this._build;
    const keep = this.playback();
    const loaded = await loadCharacter(def);
    if (build !== this._build || !this._def) return;   // superseded by a newer change, or closed
    this._clearModel();
    const root = cloneSkinned(loaded.scene);
    this._rig = rigInfo(root);
    this._rawHeight = modelHeight(root);
    this._materials = materialNames(root);
    this._baseColors = materialColors(root);
    const s = applyCharacterLook(root, def, this._rawHeight) * this._capsuleScale;
    root.scale.setScalar(s);
    this._pool = loaded.pool;
    this._tops = topBoneNames(root);
    // The resolver reads this._def live, so editing moves needs no rebuild.
    const resolve = (move: string) => moveResolver(this._def ?? def, this._pool, this._tops)(move);
    this._anim = new CharacterAnimator(root, loaded.pool.map(p => p.clip), resolve, "Character editor");
    this._root = root;
    this._scene.scene.add(root);
    // Carry on with what was playing, else idle.
    const was = keep.label && this._pool.find(p => keep.label === p.clip.name || keep.label?.endsWith(` · ${p.clip.name}`));
    if (was) {
      this._anim.playClip(this._prep(was.clip), keep.loop, keep.speed);
      // Same moment of the clip; paused (after a scrub) holds that pose, not the bind pose.
      const a = this._anim.currentAction;
      if (a) { a.time = keep.time; a.weight = 1; a.fadeIn(0); this._anim.mixer.update(0); }
    } else this.playMove("idle");
    if (frame) this._frame();
  }

  private _clearModel(): void {
    if (!this._root) return;
    this._anim?.stopAll();
    this._scene.scene.remove(this._root);
    this._root = null;
    this._anim = null;
  }

  private _buildCapsule(): void {
    const r = 0.3 * this._capsuleScale, half = 0.6 * this._capsuleScale;
    // A sparse wireframe (edges of a smooth capsule would be almost none).
    const geo = new THREE.CapsuleGeometry(r, half * 2, 2, 12);
    const lines = new THREE.LineSegments(new THREE.WireframeGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x80aaff, transparent: true, opacity: 0.35, depthWrite: false }));
    geo.dispose();
    lines.position.y = half + r;
    lines.userData = { editorOnly: true, hideInGame: true, selectable: false };
    lines.raycast = () => {};
    this._capsule = lines;
    this._scene.scene.add(lines);
  }

  private _frame(): void {
    const cam = this._scene.editorCamera;
    if (!cam) return;
    const h = Math.max(this.capsuleHeight, 1);
    cam.focus.set(0, h * 0.55, 0); cam.targetFocus.set(0, h * 0.55, 0);
    const radius = Math.max(3.5, h * 2.4);
    cam.spherical.radius = radius; cam.targetSpherical.radius = radius;
    cam.update(0.016);
  }

  private _disposeTree(o: THREE.Object3D): void {
    o.traverse(n => {
      const m = n as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose();
    });
  }
}

/** Rig of any model asset, loading it once (cached per session; manifest `rig` wins). */
const rigCache = new Map<string, Promise<RigInfo | null>>();
export function rigOfAsset(assetId: string, manifestRig?: RigInfo): Promise<RigInfo | null> {
  if (manifestRig) return Promise.resolve(manifestRig);
  let p = rigCache.get(assetId);
  if (!p) {
    p = assetManager.loadGLTF(assetId).then(g => rigInfo((g as { scene: THREE.Object3D }).scene)).catch(() => null);
    rigCache.set(assetId, p);
  }
  return p;
}
