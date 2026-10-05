import * as THREE from "three";

/** Which clip a move plays: null = none (the model has nothing for it). */
export type MoveResolver = (move: string) => THREE.AnimationClip | null;

/**
 * Phase 86: the one piece that plays a character's animations. Drivers (the player's
 * CharacterController, later EnemyAI and NPCs) decide WHICH move; this owns the mixer,
 * the crossfades and the script override, so every driver behaves the same.
 *
 * Moves are names ("idle", "walk", "jump_land" …) resolved to clips by `resolve` (the
 * player's animClips overrides + name match today; a character's moves list later).
 */
export class CharacterAnimator {
  readonly mixer: THREE.AnimationMixer;
  private _current = "";                                   // the playing move, "script:<clip>" for a script clip
  private _action: THREE.AnimationAction | null = null;
  private _clip:   THREE.AnimationClip  | null = null;
  // Script override (play_animation on this character): LOOPING clips cancel when the
  // character moves; one-shots and holds play through movement; a finished one-shot
  // (not hold) hands back to the driver.
  private _script: { name: string; loop: boolean; hold: boolean } | null = null;

  constructor(
    readonly root: THREE.Object3D,
    readonly clips: THREE.AnimationClip[],
    private readonly _resolve: MoveResolver,
    private readonly _label = "character",
    // Phase 86: the character's per-move SPEED (by move for drivers that play moves, by
    // clip name for placed objects whose AI plays clips). Absent = every rate as given.
    private readonly _speeds: { move?: (move: string) => number; clip?: (clipName: string) => number } = {},
  ) {
    this.mixer = new THREE.AnimationMixer(root);
  }

  /** The playing move ("" when nothing is). */
  get current(): string { return this._current; }
  get currentAction(): THREE.AnimationAction | null { return this._action; }

  clipFor(move: string): THREE.AnimationClip | null { return this._resolve(move); }
  /** The character's SPEED for a move (1 when unset). */
  moveSpeed(move: string): number { return this._speeds.move?.(move) ?? 1; }
  has(move: string): boolean { return this._resolve(move) != null; }

  update(dt: number): void { this.mixer.update(dt); }

  /** Crossfade to a move. No-op when it's already the playing move, or it has no clip.
   *  `loop` false = a one-shot that clamps on its last frame; `speed` scales the rate. */
  play(move: string, loop: boolean, speed = 1): void {
    if (move === this._current) return;
    const clip = this._resolve(move);
    if (!clip) return;
    this._crossfadeTo(this.mixer.clipAction(clip), loop, speed * this.moveSpeed(move));
    this._clip = clip;
    this._current = move;
  }

  /** Retime the playing move (only if it is `move`). */
  setSpeed(move: string, speed: number): void {
    if (this._action && this._current === move) this._action.timeScale = speed * this.moveSpeed(move);
  }

  /** Has the current one-shot reached its end? (Only meaningful for a clamped LoopOnce.) */
  done(): boolean {
    const a = this._action, c = this._clip;
    return !!a && !!c && a.time >= c.duration - 0.02;
  }

  /**
   * Crossfade to `next`. `mixer.clipAction(clip)` returns ONE action per clip, so two
   * moves that resolve to the same clip share it (platfrom-obby maps WALK to the "Run"
   * clip, and RUN auto-matches "Run" too). Crossfading an action with ITSELF fades it in
   * and straight back out: weight 0, nothing playing, the skeleton drops to its bind pose
   * (user report, v4.81.1). Same action = keep it playing and only retime / reloop it
   * (restarting it if it was a finished one-shot).
   */
  private _crossfadeTo(next: THREE.AnimationAction, loop: boolean, speed: number): void {
    const same = next === this._action;
    if (!same || !next.isRunning()) next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.timeScale = speed;
    if (same) { next.play(); return; }
    next.fadeIn(0.15).play();
    this._action?.fadeOut(0.15);
    this._action = next;
  }

  /** Play a given clip (the character editor's preview), labelled `key` as the current
   *  move; replays from the start even when it's already the playing one. */
  playClip(clip: THREE.AnimationClip, loop: boolean, speed = 1, key = `clip:${clip.name}`): void {
    this._script = null;
    const next = this.mixer.clipAction(clip);
    if (next === this._action) next.reset();
    this._crossfadeTo(next, loop, speed);
    this._clip = clip;
    this._current = key;
  }

  get currentClip(): THREE.AnimationClip | null { return this._clip; }

  // ── Placed objects (enemies, props): ObjectPlacer's blend, kept exactly ───────────
  // Always restart the clip at full weight and crossfade from the playing one
  // (`crossFadeTo`, no warp); a 0 fade just stops the old one.

  /** Crossfade to `clip` the way placed objects always have (see above). */
  fadeToClip(clip: THREE.AnimationClip, opts: { loop: boolean; fade: number; key?: string }): THREE.AnimationAction {
    const next = this.mixer.clipAction(clip);
    next.reset();
    next.setLoop(opts.loop ? THREE.LoopRepeat : THREE.LoopOnce, opts.loop ? Infinity : 1);
    next.clampWhenFinished = !opts.loop;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (this._speeds.clip) next.timeScale = this._speeds.clip(clip.name);
    next.play();
    const prev = this._action;
    if (prev && prev !== next) {
      if (opts.fade > 0) prev.crossFadeTo(next, opts.fade, false);
      else prev.stop();
    }
    this._action = next;
    this._clip = clip;
    this._current = opts.key ?? `clip:${clip.name}`;
    return next;
  }

  /** Start a looping clip with no fade (a placed object's auto-play clip at build). */
  startLoop(clip: THREE.AnimationClip): void {
    const a = this.mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity);
    if (this._speeds.clip) a.timeScale = this._speeds.clip(clip.name);
    a.play();
    this._action = a;
    this._clip = clip;
    this._current = `clip:${clip.name}`;
  }

  /** Fade the playing clip out to the bind pose. */
  fadeOutCurrent(fade: number): void {
    this._action?.fadeOut(fade);
    this._action = null;
    this._clip = null;
    this._current = "";
  }

  /** Stop everything and forget the playing clip (a despawned object). */
  clearPlaying(): void {
    this.mixer.stopAllAction();
    this._action = null;
    this._clip = null;
    this._current = "";
  }

  // ── Script override ─────────────────────────────────────────────────────────

  get scripted(): boolean { return this._script !== null; }

  /** Play an exact clip by NAME for a script (exact, then case-insensitive, then "contains").
   *  False (and a console note listing the clips) when the model has no such clip. */
  playScript(name: string, loop: boolean, hold: boolean): boolean {
    const lc = name.toLowerCase();
    const clip = this.clips.find(c => c.name === name)
      ?? this.clips.find(c => c.name.toLowerCase() === lc)
      ?? this.clips.find(c => c.name.toLowerCase().includes(lc));
    if (!clip) {
      console.warn(`${this._label}: no clip "${name}" on the model — available: [${this.clips.map(c => c.name).join(", ")}]`);
      this._script = null;
      return false;
    }
    this._script = { name: clip.name, loop, hold };
    this._crossfadeTo(this.mixer.clipAction(clip), loop, 1);
    this._clip = clip;
    this._current = `script:${clip.name}`;   // never collides with a move name
    return true;
  }

  /** Script override with a given clip (a move resolved to its clip, from its own file). */
  playScriptClip(clip: THREE.AnimationClip, loop: boolean, hold: boolean, speed = 1): void {
    this._script = { name: clip.name, loop, hold };
    this._crossfadeTo(this.mixer.clipAction(clip), loop, speed);
    this._clip = clip;
    this._current = `script:${clip.name}`;
  }

  /** Drop the script override (the driver re-picks its move next frame). */
  clearScript(): void { this._script = null; }

  /**
   * Does a script clip still own the character this frame? Applies the rules: a looping
   * clip ends when the character moves, a finished one-shot (not hold) ends by itself.
   * Returns false (and clears it) once it has ended.
   */
  scriptOwns(isMoving: boolean): boolean {
    const s = this._script;
    if (!s) return false;
    if ((s.loop && isMoving) || (!s.loop && !s.hold && this.done())) { this._script = null; return false; }
    return true;
  }

  /**
   * Warp-time reset (respawn / teleport): stop every action and start `move` at FULL
   * weight, no crossfade. Blending out of a clamped death pose or the fall loop takes
   * 0.15 s+, which outlives the respawn fade and shows the avatar "getting up" / still
   * falling after the fade-in.
   */
  snapTo(move: string): void {
    this.mixer.stopAllAction();
    this._action = null;
    this._clip = null;
    this._current = "";
    const clip = this._resolve(move);
    if (!clip) return;
    const a = this.mixer.clipAction(clip);
    a.reset();
    a.setLoop(THREE.LoopRepeat, Infinity);
    a.timeScale = this.moveSpeed(move);
    a.setEffectiveWeight(1);
    a.play();
    this._action = a;
    this._clip = clip;
    this._current = move;
  }

  stopAll(): void { this.mixer.stopAllAction(); }
}
