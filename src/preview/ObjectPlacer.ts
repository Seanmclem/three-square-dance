import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { InstancedObjectPool } from "@/world/InstancedObjectPool";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { enablePaddedSkinnedCulling } from "./skinnedCulling";
import { fadeMeshes, cancelAllFades } from "@/world/meshFade";
import { assetManager } from "@/core/AssetManager";
import type { EventBus } from "@/core/EventBus";
import type { WorldObject, Vec3 } from "@/types";
import { reportTransformWrite } from "@/world/transformWatchdog";
import { CharacterAnimator } from "@/characters/CharacterAnimator";
import { legacyGuess } from "@/characters/autoFill";
import { loadCharacter, moveResolver, topBoneNames, applyCharacterLook, keepInPlace, moveSpeedOf, clipSpeedOf } from "@/characters/characterRuntime";
import type { CharacterDef } from "@/types";

/** Default crossfade duration (seconds) when switching animation clips. */
const BLEND_SEC = 0.3;

// Animation-arbiter levels (Phase 62): who may own an object's mixer.
const ANIM_AUTOPLAY = 0;
const ANIM_AI       = 1;
const ANIM_SCRIPT   = 2;

/**
 * Owns the placed-object domain: builds object meshes (mesh + transform + userData,
 * skeleton-safe clone for skinned/animated GLTFs, fallback box on load failure) and
 * the per-object animation subsystem (AnimationMixer + clip map, auto-play, editor
 * clip preview). ZoneManager parents the returned mesh into the per-zone scene graph
 * and disposes its geometry; everything else about an object lives here.
 *
 * Phase 13 (NPCs/enemies) reuses this same object-mixer subsystem.
 *
 * Phase 86 part C: each animated object's clips are played by a shared
 * `CharacterAnimator` (the player's too), with this class keeping its priority
 * arbiter (autoplay < AI < script) and its blend (`fadeToClip`).
 */
export class ObjectPlacer {
  private readonly _anims    = new Map<string, CharacterAnimator>();   // Phase 86: was a raw mixer per object
  private readonly _characterObjs = new Set<string>();                  // Phase 86: objects that are game characters
  private readonly _clips    = new Map<string, Map<string, THREE.AnimationClip>>();
  private readonly _autoPlay = new Map<string, string | null>();
  private readonly _finish   = new Map<string, () => void>();
  private readonly _meshes   = new Map<string, THREE.Object3D>();
  private readonly _despawned = new Set<string>();
  private _previewingId: string | null = null;
  // Phase 86: game characters by id (App / runtime point this at world.gameCharacters).
  private _characterLookup: (id: string) => CharacterDef | null = () => null;
  setCharacterLookup(fn: (id: string) => CharacterDef | null): void { this._characterLookup = fn; }

  // Runtime-shell InstancedMesh pooling (never set in the editor). Type-only
  // import keeps the pool module out of the editor bundle.
  private readonly _pool: InstancedObjectPool | null;

  constructor(private readonly _bus: EventBus, opts?: { instancing?: InstancedObjectPool }) {
    this._pool = opts?.instancing ?? null;
    // Script-driven actions (Phase 10.9). Object id is already group-resolved by ScriptEngine.
    // "__auto__" is the panel's pinned "auto-play (resting) clip" sentinel — it routes to
    // stopPreview, which crossfades back to the auto-play clip (or bind pose), so it also
    // serves as the script-reachable way to STOP a looping/held clip.
    this._bus.on("object:play-animation", ({ id, clipName, loop, hold, blend }) =>
      clipName === "__auto__" ? this.stopPreview(id) : this.previewClip(id, clipName, { loop, hold, blend }));
    // Phase 86: play move (a character's move, else the model's clip that the name guess picks).
    this._bus.on("object:play-move", ({ id, move, loop, hold }) => {
      if (!this.playMove(id, move, { loop, hold })) console.warn(`ObjectPlacer: object "${id}" has no move "${move}"`);
    });
    this._bus.on("object:updated", ({ id, changes }) => {
      if (import.meta.env.DEV && this._meshes.get(id)?.userData["_instanced"] &&
          (changes.material || changes.position || changes.rotation || changes.scale)) {
        console.warn(`[ObjectPlacer] pooled object "${id}" received a runtime mutation — instancing eligibility scan gap`);
      }
      if (changes.material) void this._applyMaterial(id, changes.material);
      // move_object (and editor transform edits): apply to the live mesh for any object,
      // not just the selected one. Script edits are runtime-only (data untouched).
      if (changes.position || changes.rotation || changes.scale) this._applyTransformChanges(id, changes);
    });
    // despawn_object: runtime-only hide (optionally faded). Tracked so preview:stop
    // can un-hide (exiting preview doesn't rebuild the zone), matching ZoneManager's
    // non-object despawn.
    this._bus.on("object:despawn", ({ id, fade }) => {
      const mesh = this._meshes.get(id);
      if (import.meta.env.DEV && mesh?.userData["_instanced"]) {
        console.warn(`[ObjectPlacer] pooled object "${id}" received despawn — instancing eligibility scan gap`);
      }
      // Mixer cleanup happens when the object actually disappears — stopping at
      // fade START resets the pose (a held Chest_Open snaps shut / autoplay
      // restarts) while the mesh is still fading in view. A preview:stop that
      // cancels the fade skips the stop entirely — same as an uncompleted despawn.
      const finish = () => { this._anims.get(id)?.clearPlaying(); };
      if (mesh && fade && fade > 0 && mesh.visible) {
        fadeMeshes([mesh], "out", fade, () => { mesh.visible = false; finish(); });
      } else {
        if (mesh) mesh.visible = false;
        finish();
      }
      this._despawned.add(id);
    });
    // spawn_object: the opposite — re-show (optionally faded in). Colliders are
    // ZoneManager's side of the same event. Already-visible targets are a no-op
    // so a stray spawn can't blink an object.
    this._bus.on("object:spawn", ({ id, fade }) => {
      const mesh = this._meshes.get(id);
      if (!mesh) return;
      const wasHidden = this._despawned.delete(id);
      if (!wasHidden && mesh.visible) return;
      mesh.visible = true;
      if (fade && fade > 0) fadeMeshes([mesh], "in", fade);
    });
    this._bus.on("preview:stop", () => {
      cancelAllFades();   // mid-fade clone materials must not leak into the editor
      for (const id of this._despawned) {
        const mesh = this._meshes.get(id);
        if (mesh) mesh.visible = true;
      }
      this._despawned.clear();
      this._channel.clear();
    });
  }

  /** Build an object's mesh and wire up its animation mixer. Returns the scene-ready root. */
  async build(obj: WorldObject, zoneId: string): Promise<THREE.Object3D> {
    // Missing-file model (e.g. gitignored / closed-source): skip the wasted 404 fetch.
    if (assetManager.isAssetMissing(obj.assetId)) {
      const box = this._fallbackBox(obj, zoneId);
      box.userData["assetId"] = obj.assetId;
      return this._register(obj.id, box);
    }
    const def  = assetManager.getAssetDef(obj.assetId);
    const path = def?.path ?? `/assets/models/${obj.assetId}.glb`;
    const isGltf = !/\.obj$/i.test(path);
    try {
      // Runtime instancing: eligible objects register a placement in the pool
      // and get a proxy Object3D (userData + transform, no children) so the
      // collider/audio/interact paths keyed on the id map keep working.
      if (isGltf && this._pool && !obj.characterId) {   // a character animates: never pooled
        const pooled = await this._pool.tryAdd(obj, zoneId);
        if (pooled) {
          const proxy = new THREE.Object3D();
          this._applyTransform(proxy, obj, zoneId);
          if (pooled.localAABB) proxy.userData["localAABB"] = pooled.localAABB;
          proxy.userData["assetId"] = obj.assetId;
          proxy.userData["_instanced"] = true;
          return this._register(obj.id, proxy);
        }
      }
      let mesh: THREE.Object3D;
      let clips: THREE.AnimationClip[] = [];
      let resolve: ((move: string) => THREE.AnimationClip | null) | undefined;
      let speeds: { move: (m: string) => number; clip: (n: string) => number } | undefined;
      const character = obj.characterId ? this._characterLookup(obj.characterId) : null;
      if (character) {
        // A game character: its model, its clips (own + borrowed), its moves and its look.
        // The model sits in a holder group so the character's size multiplies the object's
        // scale instead of being overwritten by it.
        const loaded = await loadCharacter(character);
        const model = cloneSkinned(loaded.scene);
        enablePaddedSkinnedCulling(model);
        model.scale.setScalar(applyCharacterLook(model, character));
        mesh = new THREE.Group();
        mesh.add(model);
        const tops = topBoneNames(model);
        // KEEP IN PLACE applies to every clip (the AI and scripts play clips by name too).
        clips = loaded.pool.map(p => character.inPlace === false ? p.clip : keepInPlace(p.clip, tops));
        resolve = moveResolver(character, loaded.pool, tops);
        speeds = { move: m => moveSpeedOf(character, m), clip: n => clipSpeedOf(character, n) };   // each move's SPEED
      } else if (isGltf) {
        const gltf = await assetManager.loadGLTF(obj.assetId) as {
          scene: THREE.Object3D;
          animations: THREE.AnimationClip[];
        };
        // SkeletonUtils.clone rebinds skinned meshes to the cloned skeleton; plain
        // .clone() leaves the AnimationMixer driving the shared source skeleton.
        mesh  = cloneSkinned(gltf.scene);
        // Keep skinned meshes cullable (skip them off-screen in render + shadow passes) but with
        // padded bounds so animations don't pop them out. See skinnedCulling.ts.
        enablePaddedSkinnedCulling(mesh);
        clips = gltf.animations ?? [];
        // Lazy back-fill for assets imported before clip discovery existed.
        if (def && def.animations === undefined) def.animations = clips.map(c => c.name);
      } else {
        mesh = await assetManager.loadModel(obj.assetId);
      }
      // Model-local AABB (before the object transform is applied) — feeds the
      // auto-fit default collider and the Colliders panel. _applyTransform
      // overwrites userData, so stash after it runs.
      const box = new THREE.Box3().setFromObject(mesh);
      this._applyTransform(mesh, obj, zoneId);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const size   = box.getSize(new THREE.Vector3());
        mesh.userData["localAABB"] = {
          center: { x: center.x, y: center.y, z: center.z },
          size:   { x: size.x,   y: size.y,   z: size.z },
        };
      }
      // Which model this mesh was built from — ZoneManager compares it against
      // object:updated payloads to detect a model swap needing a full rebuild.
      mesh.userData["assetId"] = obj.assetId;
      if (clips.length) this._setupMixer(obj, mesh, clips, resolve, speeds);
      if (obj.material) void this._applyMaterial(obj.id, obj.material, mesh);
      return this._register(obj.id, mesh);
    } catch (err) {
      console.warn(`ObjectPlacer: failed to load model for asset "${obj.assetId}"`, err);
      const box = this._fallbackBox(obj, zoneId);
      box.userData["assetId"] = obj.assetId;
      return this._register(obj.id, box);
    }
  }

  /** Where the object's mesh IS right now (an AI enemy walks away from its authored position). */
  getLivePosition(objectId: string): { x: number; z: number } | null {
    const p = this._meshes.get(objectId)?.position;
    return p ? { x: p.x, z: p.z } : null;
  }

  /** Model-local AABB stashed at build time (null until the mesh has been built). */
  getLocalAABB(objectId: string): { center: Vec3; size: Vec3 } | null {
    const aabb = this._meshes.get(objectId)?.userData["localAABB"];
    return (aabb as { center: Vec3; size: Vec3 } | undefined) ?? null;
  }

  /**
   * Convex hull of the model's geometry in object-local (pre-scale) space —
   * the auto-fit source for "hull" attached colliders (Phase 27). Vertices are
   * stride-subsampled (~1.5k max inputs; skinned meshes read rest pose), reduced
   * via ConvexGeometry, then deduped. Null until the mesh is built, on empty
   * geometry, or when the hull is degenerate (flat/collinear models).
   */
  getLocalHullPoints(objectId: string): Vec3[] | null {
    const root = this._meshes.get(objectId);
    if (!root) return null;
    root.updateWorldMatrix(true, true);
    const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();

    const parts: Array<{ attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute; rel: THREE.Matrix4 }> = [];
    let total = 0;
    root.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const attr = o.geometry?.getAttribute("position");
      if (!attr?.count) return;
      parts.push({ attr, rel: new THREE.Matrix4().copy(rootInv).multiply(o.matrixWorld) });
      total += attr.count;
    });
    if (total === 0) return null;

    const stride = Math.max(1, Math.ceil(total / 1500));
    const samples: THREE.Vector3[] = [];
    for (const { attr, rel } of parts) {
      for (let i = 0; i < attr.count; i += stride) {
        samples.push(new THREE.Vector3().fromBufferAttribute(attr, i).applyMatrix4(rel));
      }
    }

    try {
      const hull = new ConvexGeometry(samples);
      const pos = hull.getAttribute("position");
      const seen = new Set<string>();
      const out: Vec3[] = [];
      for (let i = 0; i < pos.count; i++) {
        const x = +pos.getX(i).toFixed(4), y = +pos.getY(i).toFixed(4), z = +pos.getZ(i).toFixed(4);
        const key = `${x}|${y}|${z}`;
        if (!seen.has(key)) { seen.add(key); out.push({ x, y, z }); }
      }
      hull.dispose();
      return out.length >= 4 ? out : null;
    } catch {
      return null;   // degenerate input (flat / collinear)
    }
  }

  /** Tear down an object's mixer/clip state. Geometry disposal is ZoneManager's job. */
  remove(objectId: string): void {
    this._pool?.release(objectId);
    if (this._previewingId === objectId) this._previewingId = null;
    const anim = this._anims.get(objectId);
    if (anim) {
      const fin = this._finish.get(objectId);
      if (fin) anim.mixer.removeEventListener("finished", fin);
      anim.stopAll();
    }
    this._anims.delete(objectId);
    this._characterObjs.delete(objectId);
    this._clips.delete(objectId);
    this._autoPlay.delete(objectId);
    this._channel.delete(objectId);
    this._finish.delete(objectId);
    this._meshes.delete(objectId);
  }

  /** Crossfade the object's playing clip to `clip` (CharacterAnimator.fadeToClip). */
  private _fadeTo(objectId: string, clip: THREE.AnimationClip, opts: { loop: boolean; duration: number }): void {
    this._anims.get(objectId)?.fadeToClip(clip, { loop: opts.loop, fade: opts.duration });
  }

  /** Advance every active mixer. Registered on the SceneManager RAF loop. */
  update(dt: number): void {
    for (const anim of this._anims.values()) anim.update(dt);
  }

  /**
   * Play a clip on the object's mesh — no preview mode needed.
   * Default: play once, then revert to the auto-play clip / bind pose.
   * `opts.loop`: repeat forever. `opts.hold`: play once and freeze on the final frame.
   */
  /**
   * Phase 61 — the EnemyAI system's per-entity animation channel. Crossfades
   * like the script path but never touches `_previewingId` (the GLOBAL
   * one-shot preview slot), so many enemies can attack simultaneously without
   * stealing each other's clips. loop=false plays once and freezes on the
   * final frame (LoopOnce + clamp) — the AI always follows with walk/idle, so
   * no revert bookkeeping is needed. Returns false when the object has no
   * mixer or the clip name is unknown (AI falls back to un-animated movement).
   */
  aiPlay(objectId: string, clipName: string, opts?: { loop?: boolean; blend?: number }): boolean {
    // Arbiter: script-driven clips (play_animation — held death pose, the
    // checkpoint Dance) outrank AI clips until stopPreview drops the level.
    if (this._level(objectId) > ANIM_AI) return false;
    const anim = this._anims.get(objectId);
    const clip = this._clips.get(objectId)?.get(clipName);
    if (!anim || !clip) return false;
    this._channel.set(objectId, { level: ANIM_AI, clip: clipName });
    this._fadeTo(objectId, clip, { loop: opts?.loop ?? true, duration: opts?.blend ?? BLEND_SEC });
    return true;
  }

  // ── Animation priority arbiter (Phase 62) ─────────────────────────────────
  // ONE owner per object mixer, by level: autoplay(0) < ai(1) < script(2).
  // A play request below the current level is refused; ending a level falls
  // through to the next (stopPreview: script → autoplay; the AI re-issues its
  // clip on its next frame). Replaces the v4.76.5 _scriptClip flag pile —
  // the scattered-boolean coordination behind the death-anim override and
  // post-dance drift bugs.
  private readonly _channel = new Map<string, { level: number; clip: string | null }>();
  private _level(objectId: string): number { return this._channel.get(objectId)?.level ?? ANIM_AUTOPLAY; }

  /** True while a script-driven clip (play_animation) owns this object's mixer. */
  hasScriptClip(objectId: string): boolean { return this._level(objectId) === ANIM_SCRIPT; }

  /** Clip names available on an object's loaded model (Phase 61 auto-matching). */
  clipNamesFor(objectId: string): string[] {
    return [...(this._clips.get(objectId)?.keys() ?? [])];
  }

  /** Duration (s) of a clip on an object, or null when unknown (Phase 61). */
  clipDuration(objectId: string, clipName: string): number | null {
    return this._clips.get(objectId)?.get(clipName)?.duration ?? null;
  }

  previewClip(objectId: string, clipName: string, opts?: { loop?: boolean; hold?: boolean; blend?: number }): void {
    if (this._previewingId) this.stopPreview(this._previewingId);
    const anim  = this._anims.get(objectId);
    const mixer = anim?.mixer;
    const clip  = this._clips.get(objectId)?.get(clipName);
    if (!mixer || !clip) {
      console.warn(
        `ObjectPlacer.previewClip: nothing to play for object "${objectId}", clip "${clipName}" — ` +
        `${!mixer ? "no mixer (object has no animation clips)" : "clip name not found"}. ` +
        `Available: [${[...(this._clips.get(objectId)?.keys() ?? [])].join(", ")}]`,
      );
      return;
    }

    const loop = opts?.loop ?? false;
    this._channel.set(objectId, { level: ANIM_SCRIPT, clip: clipName });   // outranks AI until stopPreview
    this._fadeTo(objectId, clip, { loop, duration: opts?.blend ?? BLEND_SEC });

    // Only the default case plays once then reverts, and counts as the evictable preview.
    // Loop never finishes; hold freezes on the clamped final frame (e.g. a death pose stays
    // down) — neither should be reverted by a later play, so don't mark them as _previewingId.
    if (!loop && !opts?.hold) {
      this._previewingId = objectId;
      const onFinished = () => this.stopPreview(objectId);
      this._finish.set(objectId, onFinished);
      mixer.addEventListener("finished", onFinished);
    }

    this._bus.emit("animation:preview-start", { objectId, clipName });
  }

  /** Stop a preview and fall back to the object's auto-play clip (or bind pose). */
  stopPreview(objectId: string): void {
    this._channel.delete(objectId);   // level → autoplay; the AI re-issues on its next frame
    const anim = this._anims.get(objectId);
    if (!anim) return;
    const mixer = anim.mixer;
    const fin = this._finish.get(objectId);
    if (fin) { mixer.removeEventListener("finished", fin); this._finish.delete(objectId); }

    // Crossfade back to the resting clip (or fade out to bind pose if there's none).
    const auto = this._autoPlay.get(objectId);
    const clip = auto ? this._clips.get(objectId)?.get(auto) : undefined;
    if (clip) {
      this._fadeTo(objectId, clip, { loop: true, duration: BLEND_SEC });
    } else {
      anim.fadeOutCurrent(BLEND_SEC);
    }
    if (this._previewingId === objectId) this._previewingId = null;
    this._bus.emit("animation:preview-stop", { objectId });
  }

  /** Change the looping resting-state clip; takes effect immediately on the mesh. */
  setAutoPlay(objectId: string, clipName: string | null): void {
    this._autoPlay.set(objectId, clipName);
    this._bus.emit("animation:auto-play-changed", { objectId, clipName });
    // Arbiter: autoplay is the LOWEST level — never disturb an active script
    // clip (incl. holds, which the old _previewingId check missed) or AI clip.
    if (this._level(objectId) > ANIM_AUTOPLAY) return;
    const anim = this._anims.get(objectId);
    if (!anim) return;
    if (clipName) {
      const clip = this._clips.get(objectId)?.get(clipName);
      if (clip) this._fadeTo(objectId, clip, { loop: true, duration: BLEND_SEC });
    } else {
      anim.fadeOutCurrent(BLEND_SEC);
    }
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private _register(objectId: string, mesh: THREE.Object3D): THREE.Object3D {
    this._meshes.set(objectId, mesh);
    return mesh;
  }

  /** Swap every mesh material on a placed object to a registry material (change_material). */
  private async _applyMaterial(objectId: string, materialId: string, target?: THREE.Object3D): Promise<void> {
    const mesh = target ?? this._meshes.get(objectId);
    if (!mesh) return;
    const mat = await assetManager.getMaterial(materialId);
    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.material = mat;
        // This mesh's material is now shared/registry-owned, not built per-instance.
        (child.userData as { _ownsMaterial?: boolean })._ownsMaterial = false;
      }
    });
  }

  /** Apply a partial transform change (degrees for rotation) to a placed object's mesh. */
  private _applyTransformChanges(objectId: string, changes: Partial<WorldObject>): void {
    const mesh = this._meshes.get(objectId);
    if (!mesh) return;
    reportTransformWrite(objectId, "ObjectPlacer.object:updated");
    const DEG2RAD = Math.PI / 180;
    if (changes.position) mesh.position.set(changes.position.x, changes.position.y, changes.position.z);
    if (changes.rotation) mesh.rotation.set(changes.rotation.x * DEG2RAD, changes.rotation.y * DEG2RAD, changes.rotation.z * DEG2RAD);
    if (changes.scale)    mesh.scale.set(changes.scale.x, changes.scale.y, changes.scale.z);
  }

  private _applyTransform(mesh: THREE.Object3D, obj: WorldObject, zoneId: string): void {
    mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
    const DEG2RAD = Math.PI / 180;
    mesh.rotation.set(obj.rotation.x * DEG2RAD, obj.rotation.y * DEG2RAD, obj.rotation.z * DEG2RAD);
    mesh.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
    mesh.userData = { editorId: obj.id, editorType: "object", zoneId, selectable: true, floorLevel: obj.floor,
      interactable: obj.properties.interactable, interactLabel: obj.properties.interactLabel ?? "Interact" };
    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        // _parentId tells SelectionManager._resolveRoot to walk up to the root group,
        // so _selected is the root (world-space transform) not a local-space child mesh.
        child.userData = { ...mesh.userData, _parentId: obj.id };
        child.castShadow    = true;
        child.receiveShadow = true;
      }
    });
  }

  private _setupMixer(obj: WorldObject, mesh: THREE.Object3D, clips: THREE.AnimationClip[], resolve?: (move: string) => THREE.AnimationClip | null,
                      speeds?: { move: (m: string) => number; clip: (n: string) => number }): void {
    const clipMap = new Map<string, THREE.AnimationClip>();
    // A character's pool lists its own clips first (first name wins); a plain model keeps
    // the old map (a later clip of the same name wins).
    for (const c of clips) if (!resolve || !clipMap.has(c.name)) clipMap.set(c.name, c);
    // Moves: a character's own list, else the old name guess over the model's clips.
    const names = [...clipMap.keys()];
    const anim = new CharacterAnimator(mesh, clips, resolve ?? (move => {
      const n = legacyGuess(move, names);
      return n ? clipMap.get(n) ?? null : null;
    }), `object ${obj.id}`, speeds);
    this._anims.set(obj.id, anim);
    if (resolve) this._characterObjs.add(obj.id); else this._characterObjs.delete(obj.id);
    this._clips.set(obj.id, clipMap);
    // A placed character rests in its idle move unless an auto-play clip is set.
    const rest = obj.autoPlayAnimation ?? (resolve ? anim.clipFor("idle")?.name ?? null : null);
    this._autoPlay.set(obj.id, rest);

    if (rest && clipMap.has(rest)) {
      // Hard start (nothing to blend from); the first switch crossfades from it.
      anim.startLoop(clipMap.get(rest)!);
    }
  }

  /** Phase 86: the object's animator (null for objects with no clips). */
  animatorFor(objectId: string): CharacterAnimator | null { return this._anims.get(objectId) ?? null; }

  /** Phase 86: is this object a game character (its moves come from the character)? */
  isCharacter(objectId: string): boolean { return this._characterObjs.has(objectId); }

  /** Phase 86: play a MOVE on an object (play move action): the clip its moves give,
   *  through the script channel like play_animation. False when it has no such move. */
  playMove(objectId: string, move: string, opts?: { loop?: boolean; hold?: boolean }): boolean {
    const clip = this._anims.get(objectId)?.clipFor(move);
    if (!clip) return false;
    this.previewClip(objectId, clip.name, opts);
    return true;
  }

  private _fallbackBox(obj: WorldObject, zoneId: string): THREE.Object3D {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff6600, wireframe: true });
    const box = new THREE.Mesh(geo, mat);
    box.position.set(obj.position.x, obj.position.y, obj.position.z);
    box.userData = { editorId: obj.id, editorType: "object", zoneId, selectable: true, floorLevel: obj.floor,
      _ownsMaterial: true, interactable: obj.properties.interactable, interactLabel: obj.properties.interactLabel ?? "Interact",
      localAABB: { center: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } } };
    return box;
  }
}
