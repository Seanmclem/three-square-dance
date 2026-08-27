import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { SceneManager } from "@/core/SceneManager";
import { assetManager } from "@/core/AssetManager";
import type { AudioMix, AudioPlaylist, PlaylistEntry, SoundCategory, Vec3, AttachedSound } from "@/types";

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

/** The playlist a slot should PLAY, or undefined. Both representations can coexist
 *  (the editor's SINGLE ⇄ PLAYLIST switch retains the inactive one); `mode: "single"`
 *  parks the playlist, absent mode = legacy playlist-wins-when-present. */
function activePlaylist(slot?: { playlist?: AudioPlaylist; mode?: "single" | "playlist" }): AudioPlaylist | undefined {
  return slot?.mode !== "single" && slot?.playlist?.entries?.length ? slot.playlist : undefined;
}

/** Per-sound bookkeeping stashed on the AnyAudio's userData. */
interface SoundMeta { bus: Bus; base: number; fade: number }

interface Fade { s: AnyAudio; from: number; to: number; t: number; dur: number; stopAtEnd: boolean }

// Phase 64 — one running composed sequence on the music or ambient channel.
type PlaylistSlot = "music" | "ambient";
interface PlaylistState {
  slot:        PlaylistSlot;
  entries:     PlaylistEntry[];
  loop:        boolean;
  idx:         number;          // current entry (-1 before the first advance)
  silenceLeft: number;          // >0 while inside a silence entry (dt-counted)
  sound:       AnyAudio | null; // the live clip (mirrored into _music/_ambient)
  token:       number;          // generation counter — stale async starts bail
  done:        boolean;         // loop-off sequence finished (silent until scene reload)
  failStreak:  number;          // consecutive clip-load failures — a full ring of them parks the sequence
  json:        string;          // authored JSON, for live re-authoring change detection
}

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
  // Phase 64 — per-channel playlist sequencers (music / ambient). A slot runs
  // EITHER its single track or its playlist; the sequencer owns the channel's
  // _music/_ambient ref while active so mixer re-gains keep working.
  private readonly _playlists = new Map<PlaylistSlot, PlaylistState>();

  private readonly _emitters = new Map<string, THREE.PositionalAudio>();  // entityId → emitter
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
      // Script-driven music wins the channel: kill a running playlist first.
      _bus.on("music:play",    (p) => { this._stopPlaylist("music"); this._playMusic(p.soundId, p.volume, p.loop, p.fade); }),
      _bus.on("music:stop",    (p) => { this._stopPlaylist("music"); this._stopMusic(p.fade); }),
      _bus.on("world:audio",   () => this._reconcileAuthored()),
      _bus.on("audio:player-mix", ({ mix }) => this.setPlayerMix(mix)),
      // Attached emitters live on the movable entity types: object / platform / shape.
      _bus.on("object:updated",   ({ id, changes }) => { if (this._active && "sound" in changes) this._syncEmitter(id); }),
      _bus.on("object:added",     ({ object }) => { if (this._active) this._syncEmitter(object.id); }),
      _bus.on("object:removed",   ({ id }) => this._removeEmitter(id)),
      _bus.on("platform:updated", ({ id, changes }) => { if (this._active && "sound" in changes) this._syncEmitter(id); }),
      _bus.on("platform:added",   ({ platform }) => { if (this._active) this._syncEmitter(platform.id); }),
      _bus.on("platform:removed", ({ id }) => this._removeEmitter(id)),
      _bus.on("shape:updated",    ({ id, changes }) => { if (this._active && "sound" in changes) this._syncEmitter(id); }),
      _bus.on("shape:added",      ({ shape }) => { if (this._active) this._syncEmitter(shape.id); }),
      _bus.on("shape:removed",    ({ id }) => this._removeEmitter(id)),
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
    // A slot runs its playlist when one is authored AND selected, else its single track.
    const ambientPl = activePlaylist(authored?.ambient);
    const musicPl   = activePlaylist(authored?.music);
    if (ambientPl) this._startPlaylist("ambient", ambientPl);
    else if (authored?.ambient?.soundId) this._playAmbient(authored.ambient.soundId, authored.ambient.volume);
    if (musicPl) this._startPlaylist("music", musicPl);
    else if (authored?.music?.soundId)   this._playMusic(authored.music.soundId, authored.music.volume, authored.music.loop ?? true);

    // Attach positional emitters for every placed entity that carries one
    // (object / platform / shape — the movable types).
    for (const zone of this._world.zones.values()) {
      for (const o of zone.objects)          if (o.sound) this._syncEmitter(o.id);
      for (const p of zone.platforms)        if (p.sound) this._syncEmitter(p.id);
      for (const s of (zone.shapes ?? []))   if (s.sound) this._syncEmitter(s.id);
    }
  }

  deactivate(): void {
    if (!this._active) return;
    this._active = false;
    this._fades.length = 0;

    for (const s of this._all) this._disposeSound(s);
    this._all.clear();
    this._emitters.clear();
    this._keyed.clear();
    this._playlists.clear();   // scene re-entry restarts sequences from the top
    this._music = this._ambient = null;
    this._musicId = this._ambientId = null;

    if (this._camera) { this._camera.remove(this._listener); this._camera = null; }
  }

  /** Drive fades + playlist silence gaps — sound transforms follow their parent matrices. */
  update(dt: number): void {
    // Playlist tick: only silence gaps need per-frame time — clip advances ride
    // onEnded, and a clip mid-load is (sound null, silenceLeft 0), untouched here.
    for (const st of this._playlists.values()) {
      if (st.done || st.sound || st.silenceLeft <= 0) continue;
      st.silenceLeft -= dt;
      if (st.silenceLeft <= 0) { st.silenceLeft = 0; this._advancePlaylist(st); }
    }
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
    // Playlist slots reconcile by JSON: changed → restart the sequence; removed OR
    // mode-flipped to single → fall through to the single-track logic below. Slots
    // running a playlist skip the soundId diff (the sequencer rotates _musicId/_ambientId).
    for (const slot of ["music", "ambient"] as const) {
      const pl = activePlaylist(authored?.[slot]);
      const st = this._playlists.get(slot);
      if (pl) {
        if (!st || st.json !== JSON.stringify(pl)) {
          // Take over the channel: stop the single track if one is playing.
          if (slot === "music" && this._music)     { this._finish(this._music); }
          if (slot === "ambient" && this._ambient) { this._finish(this._ambient); }
          this._startPlaylist(slot, pl);
        }
      } else if (st) {
        this._stopPlaylist(slot);
      }
    }
    // Swap scene ambient/music if the authored track changed while playing.
    if (!this._playlists.has("ambient") && (authored?.ambient?.soundId ?? null) !== this._ambientId) {
      if (this._ambient) { this._finish(this._ambient); this._ambient = null; this._ambientId = null; }
      if (authored?.ambient?.soundId) this._playAmbient(authored.ambient.soundId, authored.ambient.volume);
    }
    if (!this._playlists.has("music") && (authored?.music?.soundId ?? null) !== this._musicId) {
      if (this._music) { this._finish(this._music); this._music = null; this._musicId = null; }
      if (authored?.music?.soundId) this._playMusic(authored.music.soundId, authored.music.volume, authored.music.loop ?? true);
    }
  }

  private _applyMaster(): void {
    this._listener.setMasterVolume(clamp01(this._authoredMix.master * this._playerMix.master));
  }

  private _applyGain(s: AnyAudio, immediate = false): void {
    const m = s.userData.audio as SoundMeta;
    // Base gain may exceed 1 (authored boost — e.g. a quiet source clip on a spatial
    // emitter that distance-attenuation makes quieter still); WebAudio applies >1
    // gain fine. Capped at 4 so a typo can't blast ears; mixes/fade stay 0..1.
    const v = Math.max(0, Math.min(4, m.base * m.fade * this._authoredMix[m.bus] * this._playerMix[m.bus]));
    if (immediate) {
      // A fresh gain node starts at 1 and THREE's setVolume only RAMPS toward the
      // target (setTargetAtTime, ~30ms to converge) — a short percussive one-shot
      // plays its whole attack transient before the ramp lands, so a footstep at
      // VOL 0.1 sounded nearly full volume. New sounds set the param directly;
      // later changes (fades, mixer slides) keep the smooth ramp.
      s.gain.gain.value = v;
    } else {
      s.setVolume(v);
    }
  }

  // ── Event handlers ───────────────────────────────────────────────────────────

  private _onPlay(p: { id: string; position?: Vec3; entityId?: string; volume?: number; loop?: boolean; key?: string }): void {
    if (!this._active || !p.id) return;
    const def = assetManager.getSoundDef(p.id);
    const bus = catToBus(def?.category ?? "SFX");
    const base = p.volume ?? def?.volume ?? 1;
    const loop = p.loop ?? def?.loop ?? false;

    // entityId: parent the positional sound to the entity's MESH so it follows a
    // moving source (enemy AI sounds) — same falloff as attached emitters.
    if (p.entityId) {
      const mesh = this._findEntityMesh(p.entityId);
      if (mesh) {
        void this._makeSound(p.id, true, bus, base, loop, mesh, false, { ref: 1, max: 20 }).then(s => {
          if (s && p.key) this._keyed.set(p.key, s);
        });
        return;
      }
      // mesh not built (yet) — fall through to position / non-positional
    }

    if (p.position) {
      const holder = new THREE.Object3D();
      holder.position.set(p.position.x, p.position.y, p.position.z);
      this._scene.scene.add(holder);
      // Same falloff as attached emitters (linear, full volume inside 1m, silent at
      // 20m). Without this, THREE's PannerNode defaults apply — the INVERSE model,
      // which is ~1/distance: already 4× quieter at the 3rd-person camera's ~4m,
      // so positional play_sound actions sounded far quieter than emitters or the
      // editor preview at the same authored volume.
      void this._makeSound(p.id, true, bus, base, loop, holder, false, { ref: 1, max: 20 }).then(s => {
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

  // ── Playlists (Phase 64) — composed clip sequences on the music/ambient channel ──

  private _startPlaylist(slot: PlaylistSlot, pl: AudioPlaylist): void {
    if (!this._active) return;
    this._stopPlaylist(slot);
    // Preload every clip buffer up front (permanently cached by AssetManager) —
    // gameplay never fetches or decodes mid-sequence.
    for (const e of pl.entries) if (e.soundId) void assetManager.loadSound(e.soundId).catch(() => { /* skipped at play time */ });
    const st: PlaylistState = {
      slot, entries: pl.entries, loop: pl.loop ?? true,
      idx: -1, silenceLeft: 0, sound: null, token: 0, done: false, failStreak: 0,
      json: JSON.stringify(pl),
    };
    this._playlists.set(slot, st);
    this._advancePlaylist(st);
  }

  private _stopPlaylist(slot: PlaylistSlot): void {
    const st = this._playlists.get(slot);
    if (!st) return;
    st.token++;                                  // orphan any in-flight clip start
    if (st.sound) this._finish(st.sound);        // also nulls _music/_ambient
    this._playlists.delete(slot);
  }

  /** Move to the next startable entry: enter a silence gap, or start a clip.
   *  Missing sound defs are skipped synchronously; async load failures re-enter
   *  here, with a full ring of consecutive failures parking the sequence. */
  private _advancePlaylist(st: PlaylistState): void {
    if (!this._active || st.done) return;
    for (let hops = 0; hops < st.entries.length; hops++) {
      st.idx++;
      if (st.idx >= st.entries.length) {
        if (!st.loop) { st.done = true; return; }   // played once — silent until scene reload
        st.idx = 0;
      }
      const entry = st.entries[st.idx]!;
      if (entry.silence != null && !entry.soundId) {
        if (entry.silence <= 0) continue;           // zero-length gap = skip
        st.silenceLeft = entry.silence;             // update(dt) counts it down
        return;
      }
      if (!entry.soundId) continue;                 // malformed entry
      const def = assetManager.getSoundDef(entry.soundId);
      if (!def) {
        console.warn(`[AudioSystem] playlist (${st.slot}) skipping missing sound "${entry.soundId}"`);
        continue;
      }
      this._startPlaylistClip(st, entry.soundId, entry.volume ?? def.volume ?? 1);
      return;
    }
    // A full pass found nothing playable (all-silence-zero / all-missing): park.
    st.done = true;
    console.warn(`[AudioSystem] playlist (${st.slot}) has no playable entries — stopping`);
  }

  private _startPlaylistClip(st: PlaylistState, soundId: string, volume: number): void {
    const token = ++st.token;
    // The advance callback rides INTO _makeSound so it's wired before play() —
    // the source captures onEnded at play time; post-play reassignment is inert.
    const onDone = () => {
      if (token !== st.token) return;               // sequence was stopped/replaced
      st.sound = null;
      this._advancePlaylist(st);
    };
    void this._makeSound(soundId, false, st.slot, volume, false, null, false, undefined, onDone).then(s => {
      if (token !== st.token || !this._playlists.has(st.slot)) { if (s) this._finish(s); return; }
      if (!s) {   // load failed (warned in _makeSound) — skip, but never spin forever
        if (++st.failStreak >= st.entries.length) {
          st.done = true;
          console.warn(`[AudioSystem] playlist (${st.slot}) stopping — every clip failed to load`);
        } else {
          this._advancePlaylist(st);
        }
        return;
      }
      st.failStreak = 0;
      st.sound = s;
      if (st.slot === "music") { this._music = s; this._musicId = soundId; }
      else                     { this._ambient = s; this._ambientId = soundId; }
    });
  }

  // ── Positional object emitters ───────────────────────────────────────────────

  private _syncEmitter(entityId: string): void {
    const ent = this._findEntity(entityId);
    if (!ent?.sound) { this._removeEmitter(entityId); return; }
    this._removeEmitter(entityId);   // rebuild from scratch on any change

    const parent = this._findEntityMesh(entityId) ?? this._holderAt(ent.position);
    const s = ent.sound;
    const def = assetManager.getSoundDef(s.soundId);
    void this._makeSound(s.soundId, true, catToBus(def?.category ?? "Ambient"),
      s.volume ?? def?.volume ?? 1, s.loop ?? true, parent, false, {
        ref: s.refDistance ?? 1, max: s.maxDistance ?? 20,
      }).then(emitter => {
        if (emitter && emitter instanceof THREE.PositionalAudio) this._emitters.set(entityId, emitter);
      });
  }

  private _removeEmitter(entityId: string): void {
    const e = this._emitters.get(entityId);
    if (!e) return;
    this._emitters.delete(entityId);
    this._finish(e);
  }

  // ── Sound construction / teardown ────────────────────────────────────────────

  private async _makeSound(
    soundId: string, positional: boolean, bus: Bus, base: number, loop: boolean,
    parent: THREE.Object3D | null, startSilent = false,
    dist?: { ref: number; max: number },
    onDone?: () => void,   // fired when a non-looping sound finishes (AFTER its disposal)
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
    this._applyGain(sound, true);   // direct set — no creation ramp from gain 1 (see _applyGain)

    if (parent) parent.add(sound); else this._scene.scene.add(sound);
    this._all.add(sound);

    // MUST be assigned before play(): THREE binds onEnded onto the buffer source
    // AT play() time — reassigning `.onEnded` afterwards never reaches the source
    // (the playlist's first shipped bug: clip 2 never played because the advance
    // callback was attached post-play and the original self-destruct ran instead).
    if (!loop) sound.onEnded = () => { sound.isPlaying = false; this._finish(sound); onDone?.(); };
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

  /** Find a sound-carrying entity (object / platform / shape) by id, with its rest position. */
  private _findEntity(id: string): { position: Vec3; sound?: AttachedSound } | undefined {
    for (const zone of this._world.zones.values()) {
      const o = zone.objects.find(o => o.id === id);
      if (o) return o;
      const p = zone.platforms.find(p => p.id === id);
      if (p) return p;
      const s = zone.shapes?.find(s => s.id === id);
      if (s) return s;
    }
    return undefined;
  }

  /** The entity's root mesh (any editorType) — parenting the emitter here makes it follow movers. */
  private _findEntityMesh(id: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    this._scene.scene.traverse(o => {
      if (found) return;
      const ud = o.userData as { editorId?: string; _parentId?: string };
      if (ud.editorId === id && !ud._parentId) found = o;
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
