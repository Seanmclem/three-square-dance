import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { SceneManager } from "@/core/SceneManager";
import { assetManager } from "@/core/AssetManager";
import type { AudioMix, SoundCategory, Vec3, WorldObject } from "@/types";

/** Supertype of THREE.Audio<GainNode> and PositionalAudio (Audio<PannerNode>). */
type AnyAudio = THREE.Audio<AudioNode>;

/** Which mixer bus a category feeds. */
type Bus = "music" | "sfx" | "ambient";

export const DEFAULT_MIX: AudioMix = { master: 1, music: 1, sfx: 1, ambient: 1 };
const PLAYER_MIX_KEY = "audio_mix";

function catToBus(cat: SoundCategory): Bus {
  if (cat === "Music") return "music";
  if (cat === "Ambient") return "ambient";
  return "sfx";
}

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

/** Per-sound bookkeeping stashed on the AnyAudio's userData. */
interface SoundMeta { bus: Bus; base: number; fade: number }

interface Fade { s: AnyAudio; from: number; to: number; t: number; dur: number; stopAtEnd: boolean }

/**
 * Audio consumer (Phase 36) — the missing listener for `audio:play` and the new
 * music/ambient/positional events. Constructed in both composition roots (editor
 * App + runtime shell); self-manages via the bus, same lifecycle contract as
 * MoverSystem: sound plays only between `preview:start` and `preview:stop`.
 *
 * Mixer: four gain buses (master/music/sfx/ambient). Effective per-sound gain =
 * base × authoredMix[bus] × playerMix[bus]; master = authored.master × player.master
 * on the THREE.AudioListener. Authored mix is per-scene (WorldConfig.audio.mix);
 * player mix is the PauseMenu sliders persisted to localStorage.
 */
export class AudioSystem {
  private readonly _listener = new THREE.AudioListener();
  private _active = false;
  private _camera: THREE.Camera | null = null;

  private _music:   AnyAudio | null = null;
  private _musicId: string | null = null;
  private _ambient: AnyAudio | null = null;
  private _ambientId: string | null = null;

  private readonly _emitters = new Map<string, THREE.PositionalAudio>();  // objectId → emitter
  private readonly _keyed    = new Map<string, AnyAudio>();             // keyed one-shots (audio:stop by key)
  private readonly _all      = new Set<AnyAudio>();                     // every live sound, for re-gain
  private readonly _fades:   Fade[] = [];

  private _authoredMix: AudioMix = { ...DEFAULT_MIX };
  private _playerMix:   AudioMix = { ...DEFAULT_MIX };

  private readonly _offs: Array<() => void> = [];

  constructor(
    private readonly _bus:   EventBus,
    private readonly _world: WorldState,
    private readonly _scene: SceneManager,
  ) {
    this._playerMix = this._loadPlayerMix();
    this._offs.push(
      _bus.on("preview:start", () => this.activate()),
      _bus.on("preview:stop",  () => this.deactivate()),
      _bus.on("audio:play",    (p) => this._onPlay(p)),
      _bus.on("audio:stop",    (p) => this._onStop(p)),
      _bus.on("music:play",    (p) => this._playMusic(p.soundId, p.volume, p.loop, p.fade)),
      _bus.on("music:stop",    (p) => this._stopMusic(p.fade)),
      _bus.on("world:audio",   () => this._reconcileAuthored()),
      _bus.on("audio:player-mix", ({ mix }) => this.setPlayerMix(mix)),
      _bus.on("object:updated", ({ id, changes }) => { if (this._active && "sound" in changes) this._syncEmitter(id); }),
      _bus.on("object:added",   ({ object }) => { if (this._active) this._syncEmitter(object.id); }),
      _bus.on("object:removed", ({ id }) => this._removeEmitter(id)),
    );
  }

  /** THREE.AudioListener — exposed for tests / debugging. */
  getListener(): THREE.AudioListener { return this._listener; }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  activate(): void {
    if (this._active) return;
    this._active = true;

    // Attach the listener to the active render camera so it tracks the player.
    this._camera = this._scene.activeRenderCamera;
    this._camera.add(this._listener);
    // The Play click is a user gesture — safe to resume a suspended AudioContext.
    const ctx = this._listener.context;
    if (ctx.state === "suspended") void ctx.resume();

    const authored = this._world.world?.audio;
    this._authoredMix = { ...DEFAULT_MIX, ...authored?.mix };
    this._applyMaster();

    // Scene-level ambient + music (fire-and-forget; guarded on _active).
    if (authored?.ambient?.soundId) this._playAmbient(authored.ambient.soundId, authored.ambient.volume);
    if (authored?.music?.soundId)   this._playMusic(authored.music.soundId, authored.music.volume, authored.music.loop ?? true);

    // Attach positional emitters for every placed object that carries one.
    for (const zone of this._world.zones.values())
      for (const obj of zone.objects) if (obj.sound) this._syncEmitter(obj.id);
  }

  deactivate(): void {
    if (!this._active) return;
    this._active = false;
    this._fades.length = 0;

    for (const s of this._all) this._disposeSound(s);
    this._all.clear();
    this._emitters.clear();
    this._keyed.clear();
    this._music = this._ambient = null;
    this._musicId = this._ambientId = null;

    if (this._camera) { this._camera.remove(this._listener); this._camera = null; }
  }

  /** Drive fades only — sound transforms follow their parent camera/mesh matrices. */
  update(dt: number): void {
    if (!this._fades.length) return;
    for (let i = this._fades.length - 1; i >= 0; i--) {
      const f = this._fades[i]!;
      f.t += dt;
      const k = f.dur > 0 ? Math.min(1, f.t / f.dur) : 1;
      const meta = f.s.userData.audio as SoundMeta;
      meta.fade = f.from + (f.to - f.from) * k;
      this._applyGain(f.s);
      if (k >= 1) {
        this._fades.splice(i, 1);
        if (f.stopAtEnd) this._finish(f.s);
      }
    }
  }

  // ── Mixer ────────────────────────────────────────────────────────────────────

  setPlayerMix(mix: AudioMix): void {
    this._playerMix = { ...DEFAULT_MIX, ...mix };
    this._applyMaster();
    for (const s of this._all) this._applyGain(s);
  }

  private _reconcileAuthored(): void {
    const authored = this._world.world?.audio;
    this._authoredMix = { ...DEFAULT_MIX, ...authored?.mix };
    this._applyMaster();
    for (const s of this._all) this._applyGain(s);
    if (!this._active) return;
    // Swap scene ambient/music if the authored track changed while playing.
    if ((authored?.ambient?.soundId ?? null) !== this._ambientId) {
      if (this._ambient) { this._finish(this._ambient); this._ambient = null; this._ambientId = null; }
      if (authored?.ambient?.soundId) this._playAmbient(authored.ambient.soundId, authored.ambient.volume);
    }
    if ((authored?.music?.soundId ?? null) !== this._musicId) {
      if (this._music) { this._finish(this._music); this._music = null; this._musicId = null; }
      if (authored?.music?.soundId) this._playMusic(authored.music.soundId, authored.music.volume, authored.music.loop ?? true);
    }
  }

  private _applyMaster(): void {
    this._listener.setMasterVolume(clamp01(this._authoredMix.master * this._playerMix.master));
  }

  private _applyGain(s: AnyAudio): void {
    const m = s.userData.audio as SoundMeta;
    s.setVolume(clamp01(m.base * m.fade * this._authoredMix[m.bus] * this._playerMix[m.bus]));
  }

  // ── Event handlers ───────────────────────────────────────────────────────────

  private _onPlay(p: { id: string; position?: Vec3; volume?: number; loop?: boolean; key?: string }): void {
    if (!this._active || !p.id) return;
    const def = assetManager.getSoundDef(p.id);
    const bus = catToBus(def?.category ?? "SFX");
    const base = p.volume ?? def?.volume ?? 1;
    const loop = p.loop ?? def?.loop ?? false;

    if (p.position) {
      const holder = new THREE.Object3D();
      holder.position.set(p.position.x, p.position.y, p.position.z);
      this._scene.scene.add(holder);
      void this._makeSound(p.id, true, bus, base, loop, holder).then(s => {
        if (s && p.key) this._keyed.set(p.key, s);
      });
    } else {
      void this._makeSound(p.id, false, bus, base, loop, null).then(s => {
        if (s && p.key) this._keyed.set(p.key, s);
      });
    }
  }

  private _onStop(p: { id?: string; key?: string }): void {
    if (p.key) {
      const s = this._keyed.get(p.key);
      if (s) { this._keyed.delete(p.key); this._finish(s); }
      return;
    }
    if (p.id) {
      // Stop every live one-shot of this sound id.
      for (const s of [...this._all])
        if (s.userData.soundId === p.id && s !== this._music && s !== this._ambient && !this._isEmitter(s))
          this._finish(s);
      return;
    }
    // No id/key → stop all transient one-shots (leave music/ambient/emitters).
    for (const s of [...this._all])
      if (s !== this._music && s !== this._ambient && !this._isEmitter(s)) this._finish(s);
  }

  private _isEmitter(s: AnyAudio): boolean {
    for (const e of this._emitters.values()) if (e === s) return true;
    return false;
  }

  private _playMusic(soundId: string, volume?: number, loop = true, fade = 0): void {
    if (!this._active) return;
    if (this._music) { this._fadeOut(this._music, fade); this._music = null; this._musicId = null; }
    this._musicId = soundId;
    void this._makeSound(soundId, false, "music", volume ?? assetManager.getSoundDef(soundId)?.volume ?? 1, loop, null, fade > 0)
      .then(s => { if (s) { this._music = s; if (fade > 0) this._fadeIn(s, fade); } });
  }

  private _stopMusic(fade = 0): void {
    if (this._music) { this._fadeOut(this._music, fade); this._music = null; this._musicId = null; }
  }

  private _playAmbient(soundId: string, volume?: number): void {
    if (!this._active) return;
    this._ambientId = soundId;
    void this._makeSound(soundId, false, "ambient", volume ?? assetManager.getSoundDef(soundId)?.volume ?? 1, true, null)
      .then(s => { if (s) this._ambient = s; });
  }

  // ── Positional object emitters ───────────────────────────────────────────────

  private _syncEmitter(objectId: string): void {
    const obj = this._findObject(objectId);
    if (!obj?.sound) { this._removeEmitter(objectId); return; }
    this._removeEmitter(objectId);   // rebuild from scratch on any change

    const parent = this._findObjectMesh(objectId) ?? this._holderAt(obj.position);
    const s = obj.sound;
    const def = assetManager.getSoundDef(s.soundId);
    void this._makeSound(s.soundId, true, catToBus(def?.category ?? "Ambient"),
      s.volume ?? def?.volume ?? 1, s.loop ?? true, parent, false, {
        ref: s.refDistance ?? 1, max: s.maxDistance ?? 20,
      }).then(emitter => {
        if (emitter && emitter instanceof THREE.PositionalAudio) this._emitters.set(objectId, emitter);
      });
  }

  private _removeEmitter(objectId: string): void {
    const e = this._emitters.get(objectId);
    if (!e) return;
    this._emitters.delete(objectId);
    this._finish(e);
  }

  // ── Sound construction / teardown ────────────────────────────────────────────

  private async _makeSound(
    soundId: string, positional: boolean, bus: Bus, base: number, loop: boolean,
    parent: THREE.Object3D | null, startSilent = false,
    dist?: { ref: number; max: number },
  ): Promise<AnyAudio | null> {
    let buffer: AudioBuffer;
    try {
      buffer = await assetManager.loadSound(soundId);
    } catch (err) {
      console.warn(`[AudioSystem] failed to load sound "${soundId}"`, err);
      return null;
    }
    if (!this._active) return null;   // exited during the async load

    const sound = positional ? new THREE.PositionalAudio(this._listener) : new THREE.Audio(this._listener);
    sound.setBuffer(buffer);
    sound.setLoop(loop);
    if (sound instanceof THREE.PositionalAudio && dist) {
      sound.setRefDistance(dist.ref);
      sound.setMaxDistance(dist.max);
      sound.setDistanceModel("linear");
    }
    sound.userData.audio = { bus, base, fade: startSilent ? 0 : 1 } as SoundMeta;
    sound.userData.soundId = soundId;
    this._applyGain(sound);

    if (parent) parent.add(sound); else this._scene.scene.add(sound);
    this._all.add(sound);

    if (!loop) sound.onEnded = () => { sound.isPlaying = false; this._finish(sound); };
    sound.play();
    return sound;
  }

  /** Fully stop + dispose a sound and drop it from tracking. */
  private _finish(s: AnyAudio): void {
    this._disposeSound(s);
    this._all.delete(s);
    for (const [k, v] of this._keyed) if (v === s) this._keyed.delete(k);
    for (const [k, v] of this._emitters) if (v === s) this._emitters.delete(k);
    if (s === this._music)   { this._music = null; this._musicId = null; }
    if (s === this._ambient) { this._ambient = null; this._ambientId = null; }
  }

  private _disposeSound(s: AnyAudio): void {
    try { if (s.isPlaying) s.stop(); } catch { /* not started */ }
    s.onEnded = () => {};
    const holder = s.parent;
    s.removeFromParent();
    // A one-shot / static emitter parented to a throwaway holder — clean the holder too.
    if (holder && holder !== this._scene.scene && holder.userData.audioHolder) holder.removeFromParent();
  }

  private _fadeIn(s: AnyAudio, dur: number): void {
    this._fades.push({ s, from: 0, to: 1, t: 0, dur, stopAtEnd: false });
  }

  private _fadeOut(s: AnyAudio, dur: number): void {
    if (dur <= 0) { this._finish(s); return; }
    const meta = s.userData.audio as SoundMeta;
    this._fades.push({ s, from: meta.fade, to: 0, t: 0, dur, stopAtEnd: true });
  }

  // ── Scene lookups ────────────────────────────────────────────────────────────

  private _findObject(id: string): WorldObject | undefined {
    for (const zone of this._world.zones.values()) {
      const o = zone.objects.find(o => o.id === id);
      if (o) return o;
    }
    return undefined;
  }

  private _findObjectMesh(id: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    this._scene.scene.traverse(o => {
      if (found) return;
      const ud = o.userData as { editorId?: string; editorType?: string; _parentId?: string };
      if (ud.editorId === id && ud.editorType === "object" && !ud._parentId) found = o;
    });
    return found;
  }

  private _holderAt(p: Vec3): THREE.Object3D {
    const holder = new THREE.Object3D();
    holder.position.set(p.x, p.y, p.z);
    holder.userData.audioHolder = true;
    this._scene.scene.add(holder);
    return holder;
  }

  private _loadPlayerMix(): AudioMix {
    try {
      const raw = localStorage.getItem(PLAYER_MIX_KEY);
      if (raw) return { ...DEFAULT_MIX, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { ...DEFAULT_MIX };
  }

  dispose(): void {
    this.deactivate();
    this._offs.forEach(off => off());
    this._offs.length = 0;
  }
}
