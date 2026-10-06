import { useEffect, useMemo, useRef, useState } from "react";
import type { AssetDef, BodyPart, CharacterDef, CharacterMove, CharacterSounds, PlayerFeel, PlayerSettings } from "@/types";
import type { CharacterStage, StageClip, StagePlayback } from "@/characters/CharacterStage";
import { rigOfAsset } from "@/characters/CharacterStage";
import { rigOverlap } from "@/characters/rig";
import { BUILT_IN_MOVES, LOOPING_MOVES, guessClip } from "@/characters/autoFill";
import { CAPSULE_HEIGHT, swapCharacterModel, movesLostBySwap } from "@/characters/characterRuntime";
import { characterModelOptions } from "@/ui/CharacterPanel";
import { BODY_PARTS } from "@/characters/mix";
import type { SearchOption } from "@/ui/SearchSelect";
import { SearchSelect } from "@/ui/SearchSelect";
import { SoundPicker } from "@/ui/SoundPicker";

/** + ADD FILE: how a file's skeleton compares with the model's. */
interface FileFit { state: "checking" | "same" | "close" | "different" | "none"; missing?: string[]; why?: string }

/** How the built-in moves read in the editor. */
const MOVE_LABEL: Record<string, string> = { jump: "jump (takeoff)", jump_idle: "in air", jump_land: "land", fall: "fall (no jump)" };
const label = (m: string) => MOVE_LABEL[m] ?? m.replace(/_/g, " ");

const C = {
  panel: "rgba(26,27,31,0.97)", line: "rgba(255,255,255,0.08)", text: "#dde3f0", text2: "#c2cadb", muted: "#98a2b8",
  blue: "#9dbdff", blueFill: "rgba(80,140,255,0.16)", blueLine: "rgba(80,140,255,0.5)", green: "#7fe0b5", red: "#ff9b8a",
};
const LBL: React.CSSProperties = { color: C.muted, fontSize: 10, letterSpacing: 1, fontFamily: "monospace" };
const BTN = (on = false): React.CSSProperties => ({
  padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 10,
  border: `1px solid ${on ? C.blueLine : "rgba(255,255,255,0.14)"}`, background: on ? C.blueFill : "rgba(46,46,48,0.9)", color: on ? C.blue : C.text,
});
const INPUT: React.CSSProperties = { background: "#141416", color: C.text, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, fontSize: 11, fontFamily: "monospace", padding: "3px 5px" };

/** A move's SPEED box: its own text while typing ("0." / "1.") so partial numbers survive;
 *  a number above 0 is saved as you type, empty clears it (= 1). */
function SpeedField({ label: name, value, disabled, onChange }: { label: string; value?: number; disabled: boolean; onChange: (v: number | undefined) => void }) {
  const [text, setText] = useState(value != null ? String(value) : "");
  useEffect(() => { setText(t => (parseFloat(t) || undefined) === value ? t : value != null ? String(value) : ""); }, [value]);
  return (
    <input aria-label={`Speed for ${name}`} type="number" min={0.1} step={0.1} placeholder="1×" disabled={disabled}
      title="SPEED: how fast this move's clip plays (1 = as made; 1.5 = half again faster). Empty = 1."
      value={text}
      onChange={e => { setText(e.target.value); const v = parseFloat(e.target.value); if (e.target.value === "") onChange(undefined); else if (v > 0) onChange(v); }}
      style={{ ...INPUT, width: 40, minWidth: 0, padding: "3px 4px", opacity: disabled ? 0.35 : 1 }} />
  );
}

/**
 * Phase 86 part B: the character editor's panels, over the isolated stage. Left:
 * ANIMATIONS (every clip it can use, by file; click to preview; + ADD FILE for files with
 * the same skeleton). Right: CHARACTER (name, size, keep in place, colors) and MOVES (one
 * list; pick a clip per move, ▶ to preview, AUTO FILL for empty ones, + ADD MOVE).
 * Bottom: the player bar (play / pause, scrub, speed, loop, BLEND TEST).
 */
export function CharacterEditor({ draft, onChange, stage, assets, onTryIt, playerSettings }: {
  onTryIt?: () => void;   // walk it around the level with the real controls (Esc returns)
  playerSettings: PlayerSettings;   // the game's walk / run speeds (feet checks)
  draft: CharacterDef;
  onChange: (next: CharacterDef) => void;
  stage: CharacterStage;
  assets: AssetDef[];
}) {
  const [clips, setClips] = useState<StageClip[]>([]);
  const [selected, setSelected] = useState<{ name: string; source: string } | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "loops" | "once" | "travels">("all");
  const [pb, setPb] = useState<StagePlayback | null>(null);
  // + ADD FILE: every imported file with clips, its skeleton checked against the model's.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fits, setFits] = useState<Record<string, FileFit>>({});
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [newMove, setNewMove] = useState("");
  const [blend, setBlend] = useState<{ from: string; to: string }>({ from: "walk", to: "run" });
  const [, setRev] = useState(0);
  // MODEL swap: a different skeleton asks first (it lists the moves that lose their clip).
  const [swap, setSwap] = useState<{ id: string; state: "checking" | "different"; lose?: string[] } | null>(null);
  const [swapNote, setSwapNote] = useState<string | null>(null);

  // The stage loads asynchronously (and reloads when files / size / colors change):
  // poll it for its clip list and the playback state.
  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const list = stage.clips();
      setClips(prev => (prev.length === list.length && prev.every((c, i) => c.name === list[i]!.name && c.source === list[i]!.source) ? prev : list));
      setPb(stage.playback());
      setRev(r => (r + 1) % 1000);
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => { alive = false; window.clearInterval(id); };
  }, [stage]);

  const assetLabel = (id: string) => assets.find(a => a.id === id)?.label ?? id;
  const sources = [draft.modelAssetId, ...draft.clipSources.filter(s => s !== draft.modelAssetId)];
  const shown = clips.filter(c =>
    (!query || c.name.toLowerCase().includes(query.toLowerCase()))
    && (filter === "all" || (filter === "loops" && c.loop) || (filter === "once" && !c.loop) || (filter === "travels" && c.travels)));
  const candidates = assets.filter(a => a.animations?.length && !sources.includes(a.id) && /\.(glb|gltf)$/i.test(a.path));

  // SOUNDS / FEEL: unset keys are dropped, an empty group is removed (the game's settings apply).
  const setSounds = (patch: Partial<CharacterSounds>) => {
    const next: Record<string, unknown> = { ...draft.sounds, ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    onChange({ ...draft, sounds: Object.keys(next).length ? next as CharacterSounds : undefined });
  };
  const setFeel = (patch: Partial<PlayerFeel>) => {
    const next: PlayerFeel = { ...draft.feel, ...patch };
    for (const k of Object.keys(next) as (keyof PlayerFeel)[]) if (next[k] !== false) delete next[k];   // absent = on
    onChange({ ...draft, feel: Object.keys(next).length ? next : undefined });
  };
  const setMove = (move: string, m: CharacterMove | null) => {
    const moves = { ...draft.moves };
    if (m) moves[move] = m; else delete moves[move];
    onChange({ ...draft, moves });
  };
  // A move without a source plays the first clip of that name (its own file first).
  const clipValue = (m?: CharacterMove) => {
    if (!m?.clip) return "";
    const src = m.source ?? clips.find(c => c.name === m.clip)?.source;
    return `${!src || src === draft.modelAssetId ? "" : src}::${m.clip}`;
  };
  const pickClip = (move: string, v: string) => {
    if (!v) { setMove(move, { ...draft.moves[move], clip: null }); return; }
    const [source, clip] = v.split("::") as [string, string];
    setMove(move, { ...draft.moves[move], clip, source: source || undefined });
    stage.playMove(move);
  };
  const autoFill = () => {
    const names = clips.map(c => c.name);
    const moves = { ...draft.moves };
    let n = 0;
    for (const m of BUILT_IN_MOVES) {
      if (moves[m]?.clip) continue;
      const g = guessClip(m, names);
      if (!g) continue;
      const src = clips.find(c => c.name === g)?.source;
      moves[m] = { clip: g, ...(src && src !== draft.modelAssetId ? { source: src } : {}) };
      n++;
    }
    onChange({ ...draft, moves });
    setFileNote(n ? `AUTO FILL set ${n} empty move${n === 1 ? "" : "s"}.` : "AUTO FILL: every move it could guess already has a clip.");
  };
  // Check every candidate's skeleton when the picker opens (each file loads once per
  // session; files imported since Phase 86 carry their skeleton in the manifest).
  useEffect(() => {
    if (!pickerOpen) return;
    let alive = true;
    void (async () => {
      const model = await rigOfAsset(draft.modelAssetId, assets.find(a => a.id === draft.modelAssetId)?.rig);
      const todo = candidates.filter(a => !fits[a.id] || fits[a.id]!.state === "checking");
      setFits(f => ({ ...f, ...Object.fromEntries(todo.map(a => [a.id, { state: "checking" } as FileFit])) }));
      let next = 0;
      const worker = async () => {
        while (alive && next < todo.length) {
          const a = todo[next++]!;
          const lib = await rigOfAsset(a.id, a.rig);
          if (!alive) return;
          let fit: FileFit;
          if (!model) fit = { state: "none", why: "this model has no skeleton" };
          else if (!lib) fit = { state: "none", why: "no skeleton" };
          else {
            const o = rigOverlap(model, lib);
            fit = o.share >= 1 ? { state: "same" } : o.share >= 0.9 ? { state: "close", missing: o.missing }
              : { state: "different", why: `different skeleton (${Math.round(o.share * 100)}% of its bones match)` };
          }
          setFits(f => ({ ...f, [a.id]: fit }));
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    })();
    return () => { alive = false; };
  }, [pickerOpen, draft.modelAssetId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setFits({}); }, [draft.modelAssetId]);   // skeleton checks are against the model
  const pickModel = async (id: string) => {
    if (!id || id === draft.modelAssetId) return;
    setSwapNote(null);
    setSwap({ id, state: "checking" });
    const oldA = assets.find(a => a.id === draft.modelAssetId), newA = assets.find(a => a.id === id);
    const [oldRig, newRig] = await Promise.all([rigOfAsset(draft.modelAssetId, oldA?.rig), rigOfAsset(id, newA?.rig)]);
    const sameSkeleton = !!oldRig && !!newRig && rigOverlap(oldRig, newRig).share >= 0.9;
    const newClips = newA?.animations ?? [];
    if (sameSkeleton) {
      onChange(swapCharacterModel(draft, id, { sameSkeleton, oldClips: oldA?.animations ?? [], newClips }));
      setSwap(null);
      setSwapNote(`Now ${assetLabel(id)}: same skeleton, every move kept${oldA?.animations?.length ? ` (${assetLabel(draft.modelAssetId)}'s clips are borrowed now)` : ""}.`);
    } else setSwap({ id, state: "different", lose: movesLostBySwap(draft, id, newClips) });
  };
  const confirmSwap = () => {
    if (!swap) return;
    const lose = swap.lose ?? [];
    onChange(swapCharacterModel(draft, swap.id, { sameSkeleton: false, oldClips: [], newClips: assets.find(a => a.id === swap.id)?.animations ?? [] }));
    setSwapNote(`Now ${assetLabel(swap.id)}.${lose.length ? ` AUTO FILL can pick clips for the ${lose.length} empty move${lose.length === 1 ? "" : "s"}.` : ""}`);
    setSwap(null);
  };
  const addFile = (id: string) => {
    const fit = fits[id];
    onChange({ ...draft, clipSources: [...draft.clipSources, id] });
    setFileNote(fit?.state === "close" && fit.missing?.length
      ? `Added ${assetLabel(id)} (missing bones: ${fit.missing.slice(0, 4).join(", ")}${fit.missing.length > 4 ? " …" : ""}).`
      : `Added ${assetLabel(id)}: same skeleton.`);
    setPickerOpen(false);
  };
  const removeFile = (id: string) => {
    const moves = Object.fromEntries(Object.entries(draft.moves).map(([k, m]) => [k, m.source === id ? { ...m, clip: null, source: undefined } : m]));
    onChange({ ...draft, clipSources: draft.clipSources.filter(s => s !== id), moves });
  };
  // Phase 87: the move whose timeline is open (click a move's name), and the ground speed the
  // game moves at for walk / run (what the feet have to keep up with).
  const [openMove, setOpenMove] = useState<string | null>(null);
  const gameSpeedFor = (m: string): number | null =>
    m === "walk" ? playerSettings.moveSpeed : m === "run" ? playerSettings.moveSpeed * (playerSettings.runMultiplier ?? 1) : null;
  const clipOptions: SearchOption[] = sources.flatMap(src => clips.filter(c => c.source === src).map(c => ({
    value: `${src === draft.modelAssetId ? "" : src}::${c.name}`, label: c.name, group: assetLabel(src), hint: c.loop ? "loop" : "once" })));
  const moveNames = useMemo(() => [...BUILT_IN_MOVES, ...Object.keys(draft.moves).filter(m => !(BUILT_IN_MOVES as readonly string[]).includes(m))], [draft.moves]);
  const fmt = (t: number) => t.toFixed(2);

  return (
    <>
      {/* ── Left: ANIMATIONS ─────────────────────────────────────────────── */}
      <div data-character-editor="animations" style={{ position: "absolute", left: 64, top: 48, bottom: 0, width: 270, background: C.panel, borderRight: `1px solid ${C.line}`, zIndex: 9, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.line}`, display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={LBL}>ANIMATIONS · {clips.length}</span>
          <input aria-label="Search clips" placeholder={`search ${clips.length} clips`} value={query} onChange={e => setQuery(e.target.value)} style={INPUT} />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {([["all", "all"], ["loops", "loops"], ["once", "one-shots"], ["travels", "moves the body"]] as const).map(([k, t]) => (
              <button key={k} style={BTN(filter === k)} onClick={() => setFilter(k)}>{t}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 6px" }}>
          {sources.map(src => {
            const list = shown.filter(c => c.source === src);
            const all = clips.filter(c => c.source === src).length;
            return (
              <div key={src} style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 4px 4px" }}>
                  <span style={{ flex: 1, color: C.text, fontSize: 11, fontFamily: "monospace", fontWeight: 600 }}>{assetLabel(src)}{src === draft.modelAssetId ? " (its own)" : ""}</span>
                  <span style={{ color: C.muted, fontSize: 10, fontFamily: "monospace" }}>{all}</span>
                  {src !== draft.modelAssetId && <button style={{ ...BTN(), padding: "1px 6px" }} title="Stop borrowing clips from this file" onClick={() => removeFile(src)}>✕</button>}
                </div>
                {list.map(c => {
                  const on = selected?.name === c.name && selected.source === c.source;
                  return (
                    <button key={c.name} data-clip={c.name} onClick={() => { setSelected({ name: c.name, source: c.source }); stage.playClip(c.name, c.source); }}
                      style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "3px 6px", borderRadius: 4, fontFamily: "monospace", fontSize: 11,
                        background: on ? C.blueFill : "transparent", color: on ? C.blue : C.text2 }}>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                      {c.travels && <span title="Moves the body sideways (kept in place unless KEEP IN PLACE is off)" style={{ color: "#ffc58a", fontSize: 9 }}>MOVES</span>}
                      <span style={{ color: C.muted, fontSize: 9 }}>{c.loop ? "LOOP" : "ONCE"}</span>
                    </button>
                  );
                })}
                {!list.length && all > 0 && <span style={{ color: C.muted, fontSize: 10, padding: "0 6px" }}>none match</span>}
                {all === 0 && <span style={{ color: C.muted, fontSize: 10, padding: "0 6px" }}>{src === draft.modelAssetId ? "no clips of its own: borrow them from a file below" : "loading…"}</span>}
              </div>
            );
          })}
        </div>
        <div style={{ padding: "8px 10px", borderTop: `1px solid ${C.line}`, display: "flex", flexDirection: "column", gap: 6 }}>
          <button style={{ ...BTN(pickerOpen), textAlign: "left" }} aria-expanded={pickerOpen} onClick={() => setPickerOpen(o => !o)}>
            {pickerOpen ? "▾" : "▸"} + ADD FILE: borrow clips from another file
          </button>
          {pickerOpen && (() => {
            const order: Record<FileFit["state"], number> = { same: 0, close: 1, checking: 2, different: 3, none: 4 };
            const rows = [...candidates].sort((a, b) => order[fits[a.id]?.state ?? "checking"] - order[fits[b.id]?.state ?? "checking"] || a.label.localeCompare(b.label));
            const ok = rows.filter(a => ["same", "close"].includes(fits[a.id]?.state ?? "")).length;
            const checking = rows.filter(a => (fits[a.id]?.state ?? "checking") === "checking").length;
            return (
              <div data-file-picker style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: "42vh", overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 5, padding: 4, background: "#18191d" }}>
                <span style={{ color: C.text2, fontSize: 10, padding: "2px 4px 4px", lineHeight: 1.4 }}>
                  {checking ? `Checking skeletons… ${rows.length - checking} of ${rows.length}` : `${ok} of ${rows.length} file${rows.length === 1 ? "" : "s"} with clips share this model's skeleton.`}
                  {" "}Clips only fit a model with the same bones.
                </span>
                {rows.length === 0 && <span style={{ color: C.muted, fontSize: 10, padding: 4 }}>No other imported files have clips.</span>}
                {rows.map(a => {
                  const f = fits[a.id] ?? { state: "checking" as const };
                  const usable = f.state === "same" || f.state === "close";
                  return (
                    <div key={a.id} data-file-row={a.id} title={f.why ?? (f.state === "close" ? `Missing bones: ${f.missing?.join(", ")}` : undefined)}
                      style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 6, padding: "4px 6px", borderRadius: 4,
                        background: usable ? "rgba(60,207,145,0.07)" : "transparent", opacity: usable || f.state === "checking" ? 1 : 0.75 }}>
                      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <span style={{ color: C.text, fontSize: 11, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label} · {a.animations!.length} clips</span>
                        <span style={{ color: usable ? C.green : f.state === "checking" ? C.muted : C.text2, fontSize: 9, fontFamily: "monospace" }}>
                          {f.state === "same" ? "same skeleton" : f.state === "close" ? `nearly the same (${f.missing?.length} bones missing)` : f.state === "checking" ? "checking…" : f.why}
                        </span>
                      </span>
                      {usable && <button style={{ ...BTN(true), padding: "3px 8px" }} onClick={() => addFile(a.id)}>ADD</button>}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {fileNote && <span style={{ color: C.text2, fontSize: 10, lineHeight: 1.4 }}>{fileNote}</span>}
        </div>
      </div>

      {/* ── Right: CHARACTER + MOVES ─────────────────────────────────────── */}
      <div data-character-editor="moves" style={{ position: "absolute", right: 0, top: 48, bottom: 0, width: 330, background: C.panel, borderLeft: `1px solid ${C.line}`, zIndex: 9, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, borderBottom: `1px solid ${C.line}` }}>
          <span style={LBL}>CHARACTER</span>
          <input aria-label="Character name" value={draft.name} onChange={e => onChange({ ...draft, name: e.target.value })} style={{ ...INPUT, fontSize: 13, fontWeight: 600 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ ...LBL, marginRight: 2 }}>MODEL</span>
            <SearchSelect ariaLabel="Character model" value={swap?.id ?? draft.modelAssetId} onChange={v => void pickModel(v)} placeholder="search models…"
              style={{ flex: 1 }} options={characterModelOptions(assets)} />
            {stage.rig && <span style={{ color: C.text2, fontSize: 10, fontFamily: "monospace", whiteSpace: "nowrap" }}>{stage.rig.bones.length} bones</span>}
          </div>
          {swap?.state === "checking" && <span style={{ color: C.text2, fontSize: 10 }}>Checking {assetLabel(swap.id)}'s skeleton…</span>}
          {swap?.state === "different" && (
            <div data-model-swap style={{ border: "1px solid rgba(255,184,107,0.45)", borderRadius: 5, padding: "6px 8px", display: "flex", flexDirection: "column", gap: 6, background: "rgba(255,184,107,0.07)" }}>
              <span style={{ color: C.text, fontSize: 11, lineHeight: 1.4 }}>
                {assetLabel(swap.id)} has a different skeleton, so clips borrowed from other files can't play on it{draft.clipSources.length ? ` (${draft.clipSources.map(assetLabel).join(", ")} will be removed)` : ""}.
                {swap.lose?.length ? <> These moves lose their clip: <b>{swap.lose.map(label).join(", ")}</b>.</> : " Every move keeps its clip (the new model has clips of the same names)."}
                {" "}Name, height, colors, sounds, FEEL and speeds stay.
              </span>
              <span style={{ display: "flex", gap: 6 }}>
                <button style={BTN(true)} onClick={confirmSwap}>CHANGE MODEL</button>
                <button style={BTN()} onClick={() => setSwap(null)}>CANCEL</button>
              </span>
            </div>
          )}
          {swapNote && <span style={{ color: C.green, fontSize: 10, lineHeight: 1.4 }}>{swapNote}</span>}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ ...LBL, marginRight: 2 }}>HEIGHT</span>
            <input aria-label="Height in meters" type="number" min={0.1} step={0.05} style={{ ...INPUT, width: 64 }}
              value={draft.height ?? +stage.modelHeight.toFixed(2)}
              onChange={e => { const v = parseFloat(e.target.value); if (v > 0) onChange({ ...draft, height: v }); }} />
            <span style={{ color: C.text2, fontSize: 11 }}>m</span>
            <button style={BTN(draft.height === CAPSULE_HEIGHT)} title="Make it as tall as the collision capsule (1.8 m at character scale 1)" onClick={() => onChange({ ...draft, height: CAPSULE_HEIGHT })}>FIT TO CAPSULE</button>
            {draft.height !== undefined && <button style={BTN()} title={`Back to the model's own height (${stage.modelHeight.toFixed(2)} m)`} onClick={() => { const { height: _h, ...rest } = draft; onChange(rest); }}>AS IMPORTED</button>}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: C.text, fontSize: 11 }}>
            <input type="checkbox" checked={draft.inPlace !== false} onChange={e => onChange({ ...draft, inPlace: e.target.checked })} />
            KEEP IN PLACE <span style={{ color: C.muted, fontSize: 10 }}>(clips that move the body stay under the character)</span>
          </label>
          {stage.materials.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={LBL}>COLORS</span>
              {stage.materials.map(m => {
                const v = draft.colors?.[m];
                return (
                  <div key={m} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="color" aria-label={`Color of ${m}`} value={v ?? stage.baseColors[m] ?? "#cccccc"}
                      onChange={e => onChange({ ...draft, colors: { ...draft.colors, [m]: e.target.value } })}
                      style={{ width: 30, height: 22, border: "none", background: "none", padding: 0 }} />
                    <span style={{ flex: 1, color: C.text2, fontSize: 11, fontFamily: "monospace" }}>{m}</span>
                    {v && <button style={BTN()} onClick={() => { const colors = { ...draft.colors }; delete colors[m]; onChange({ ...draft, colors }); }}>RESET</button>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ ...LBL, flex: 1 }}>MOVES</span>
            <button style={BTN()} onClick={autoFill} title="Guess a clip for every empty move from the clip names">AUTO FILL</button>
          </div>
          {moveNames.map(m => {
            const cur = draft.moves[m];
            const custom = !(BUILT_IN_MOVES as readonly string[]).includes(m);
            return (
              <div key={m} data-move={m} style={{ display: "grid", gridTemplateColumns: "96px 1fr 40px auto auto", alignItems: "center", gap: 4 }}>
                <button data-open-move={m} onClick={() => setOpenMove(openMove === m ? null : m)}
                  title={`${LOOPING_MOVES.has(m) ? "Loops" : "Plays once"}. Click: open its timeline (feet, footsteps, layers, handoffs).`}
                  style={{ all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", gap: 0, borderRadius: 4, padding: "2px 4px", margin: "-2px -4px",
                    background: openMove === m ? C.blueFill : "transparent", outline: openMove === m ? `1px solid ${C.blueLine}` : "none" }}>
                  <span style={{ color: custom ? "#ffc58a" : C.text, fontSize: 11, fontFamily: "monospace", fontWeight: 600 }}>{label(m)}{cur?.layers?.length ? <span style={{ color: "#ffb86b", fontWeight: 400 }}> · mix</span> : null}</span>
                  {(() => {   // walk / run: are the feet keeping up with the game's speed?
                    const v = gameSpeedFor(m), gs = cur?.clip && v ? stage.feetOfMove(m)?.groundSpeed : null;
                    if (!v || !gs) return null;
                    const slide = Math.abs(v - gs * (cur?.speed ?? 1)) / v;
                    return <span style={{ fontSize: 10, color: slide > 0.12 ? "#ffb86b" : C.green }}>{slide > 0.12 ? `feet slide ${Math.round(slide * 100)}%` : "feet planted"}</span>;
                  })()}
                </button>
                <SearchSelect ariaLabel={`Clip for ${label(m)}`} value={clipValue(cur)} onChange={v => pickClip(m, v)} placeholder="no clip · search…"
                  dataAttr={`clip-${m}`}
                  options={[
                    { value: "", label: "no clip" },
                    ...clipOptions,
                    ...(cur?.clip && !clips.some(c => c.name === cur.clip) ? [{ value: clipValue(cur), label: `${cur.clip} (missing)` }] : []),
                  ]} />
                <SpeedField label={label(m)} value={cur?.speed} disabled={!cur?.clip}
                  onChange={v => { const { speed: _s, ...rest } = cur ?? { clip: null }; setMove(m, v ? { ...rest, speed: v } : rest); }} />
                {selected
                  ? <button style={{ ...BTN(), padding: "3px 6px" }} title={`Use the clip picked on the left (${selected.name})`} onClick={() => setMove(m, { ...cur, clip: selected.name, source: selected.source === draft.modelAssetId ? undefined : selected.source })}>◀</button>
                  : <span />}
                <span style={{ display: "flex", gap: 2 }}>
                  <button style={{ ...BTN(), padding: "3px 6px", opacity: cur?.clip ? 1 : 0.35 }} disabled={!cur?.clip} title="Play this move" onClick={() => stage.playMove(m)}>▶</button>
                  {custom && <button style={{ ...BTN(), padding: "3px 6px" }} title="Remove this move" onClick={() => setMove(m, null)}>✕</button>}
                </span>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            <input aria-label="New move name" placeholder="new move (wave, sit…)" value={newMove} onChange={e => setNewMove(e.target.value.replace(/[^\w ]/g, ""))} style={{ ...INPUT, flex: 1, minWidth: 0 }} />
            <button style={BTN(!!newMove.trim())} disabled={!newMove.trim()} onClick={() => {
              const name = newMove.trim().toLowerCase().replace(/\s+/g, "_");
              if (!draft.moves[name]) setMove(name, { clip: selected?.name ?? null, ...(selected && selected.source !== draft.modelAssetId ? { source: selected.source } : {}) });
              setNewMove("");
            }}>+ ADD MOVE</button>
          </div>
          <span style={{ color: C.muted, fontSize: 10, lineHeight: 1.4 }}>
            Pick a clip on the left, then ◀ on a move to use it. The engine plays idle, walk, run, jump, in air, land and climb for the player by itself; scripts can play any move. The number is the move's SPEED (1 = as made).
          </span>
        </div>
        <div data-character-sounds style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${C.line}` }}>
          <span style={LBL}>SOUNDS</span>
          {([["FOOTSTEP", "footstepSound", "footstepVolume"], ["JUMP", "jumpSound", "jumpVolume"], ["LAND", "landSound", "landVolume"]] as const).map(([name, key, vol]) => (
            <div key={key} style={{ display: "grid", gridTemplateColumns: "64px 1fr 44px", alignItems: "center", gap: 4 }}>
              <span style={{ color: C.text, fontSize: 11, fontFamily: "monospace" }}>{name}</span>
              <SoundPicker value={draft.sounds?.[key]} allowNone noneLabel="game's" previewVolume={draft.sounds?.[vol]} style={{ minWidth: 0 }}
                onChange={id => setSounds(id ? { [key]: id } : { [key]: undefined, [vol]: undefined, ...(key === "footstepSound" ? { footstepPitchWobble: undefined } : {}) })} />
              <input aria-label={`${name} volume`} type="number" min={0} step={0.1} placeholder="1" title="Volume: 1 = the clip's own level, higher boosts (up to 4)"
                disabled={!draft.sounds?.[key]} value={draft.sounds?.[vol] ?? ""}
                onChange={e => setSounds({ [vol]: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })}
                style={{ ...INPUT, width: 44, minWidth: 0, opacity: draft.sounds?.[key] ? 1 : 0.35 }} />
            </div>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: C.text, fontSize: 11, opacity: draft.sounds?.footstepSound ? 1 : 0.4 }}>
            <input type="checkbox" disabled={!draft.sounds?.footstepSound} checked={!!draft.sounds?.footstepPitchWobble}
              onChange={e => setSounds({ footstepPitchWobble: e.target.checked || undefined })} />
            footstep pitch wobble
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: C.text, fontSize: 11, fontFamily: "monospace" }}>STRIDE</span>
            <input aria-label="Stride length" type="number" min={0.3} step={0.1} placeholder="game's" value={draft.sounds?.footstepDistance ?? ""}
              onChange={e => setSounds({ footstepDistance: e.target.value === "" ? undefined : Math.max(0.3, Number(e.target.value)) })}
              style={{ ...INPUT, width: 64 }} />
            <span style={{ color: C.text2, fontSize: 11 }}>m between footsteps</span>
          </div>
          <span style={{ color: C.muted, fontSize: 10, lineHeight: 1.4 }}>
            As the player, the character uses these; any left empty use the game's (player settings, Character Sounds).
          </span>
        </div>
        <div data-character-feel style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${C.line}` }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" className="wb-switch" aria-label="Feel (all)" checked={draft.feel?.enabled !== false} onChange={e => setFeel({ enabled: e.target.checked })} />
            <span style={LBL}>FEEL</span>
          </label>
          {([["squash", "squash and stretch"], ["speedLean", "lean with speed"], ["startStopLean", "lean on start / stop"], ["turnRoll", "roll into turns"], ["skid", "run skid"]] as const).map(([key, name]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: C.text, fontSize: 11, opacity: draft.feel?.enabled !== false ? 1 : 0.4 }}>
              <input type="checkbox" className="wb-switch" aria-label={`Feel: ${name}`} disabled={draft.feel?.enabled === false} checked={draft.feel?.[key] !== false} onChange={e => setFeel({ [key]: e.target.checked })} />
              {name}
            </label>
          ))}
          <span style={{ color: C.muted, fontSize: 10, lineHeight: 1.4 }}>
            As the player (third person). Off here = off for this character; the game's Feel page can turn more off. An effect plays only when both allow it.
          </span>
        </div>
        <AimSection draft={draft} onChange={onChange} stage={stage} clipOptions={clipOptions} clips={clips} />
      </div>

      {/* ── Bottom: PLAYER BAR ───────────────────────────────────────────── */}
      <div data-character-editor="player" style={{ position: "absolute", left: 334, right: 330, bottom: 0, zIndex: 9, background: "rgba(22,23,27,0.94)", borderTop: `1px solid ${C.line}`, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontFamily: "monospace", fontSize: 11, color: C.text2 }}>
        {openMove && draft.moves[openMove] && (
          <MoveTimeline move={openMove} draft={draft} onChange={onChange} stage={stage} pb={pb} clipOptions={clipOptions}
            moveNames={moveNames} gameSpeed={gameSpeedFor(openMove)} onClose={() => setOpenMove(null)} />
        )}
        <button style={BTN()} aria-label={pb?.playing ? "Pause" : "Play"} onClick={() => stage.setPaused(!!pb?.playing)}>{pb?.playing ? "❚❚" : "▶"}</button>
        <span style={{ minWidth: 0, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.blue }}>{pb?.label ?? "nothing playing"}</span>
        <input aria-label="Scrub" type="range" min={0} max={pb?.duration || 1} step={0.01} value={pb?.time ?? 0}
          onChange={e => stage.seek(parseFloat(e.target.value))} style={{ flex: 1, minWidth: 100 }} />
        <span>{fmt(pb?.time ?? 0)} / {fmt(pb?.duration ?? 0)} s</span>
        <select aria-label="Speed" value={pb?.speed ?? 1} onChange={e => stage.setSpeed(parseFloat(e.target.value))} style={INPUT}>
          {[0.25, 0.5, 1, 1.5, 2].map(s => <option key={s} value={s}>{s}×</option>)}
        </select>
        <button style={BTN(!!pb?.loop)} onClick={() => stage.setLoop(!pb?.loop)}>LOOP</button>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={LBL}>BLEND</span>
          <select aria-label="Blend from" value={blend.from} onChange={e => setBlend({ ...blend, from: e.target.value })} style={INPUT}>{moveNames.filter(m => draft.moves[m]?.clip).map(m => <option key={m} value={m}>{label(m)}</option>)}</select>
          →
          <select aria-label="Blend to" value={blend.to} onChange={e => setBlend({ ...blend, to: e.target.value })} style={INPUT}>{moveNames.filter(m => draft.moves[m]?.clip).map(m => <option key={m} value={m}>{label(m)}</option>)}</select>
          {pb?.testing
            ? <button style={BTN(true)} title="End the test (back to idle)" onClick={() => stage.stopTest()}>STOP</button>
            : <button style={BTN()} title="Play the first move, then blend into the second the way the game does" onClick={() => stage.blendTest(blend.from, blend.to)}>TEST</button>}
        </span>
        {onTryIt && <button style={{ ...BTN(true), borderColor: "rgba(60,207,145,0.6)", color: "#7fe0b5", background: "rgba(60,207,145,0.15)" }}
          title="Walk this character around the level with the real controls (unsaved changes included). Esc comes back here."
          onClick={onTryIt}>TRY IT ▸</button>}
      </div>
    </>
  );
}

// ── Phase 87: one move's timeline ───────────────────────────────────────────────

const HANDOFF_PRESETS: Array<[string, number]> = [["snap", 0], ["quick", 0.08], ["smooth", 0.15], ["slow", 0.3]];
const FIT_MIN = 0.8, FIT_MAX = 1.25;   // a clip "fits" when it needs this little speeding up / slowing down

/**
 * The open move, as rows over its loop: LAYERS (other clips on a body part), the move's
 * CLIP, FEET (when each foot is down), STEPS (footstep moments: from the feet, or your
 * own: drag, click the row to add, double-click to remove) and HANDOFFS (how fast other
 * moves blend into this one). For walk and run it also says whether the feet keep up with
 * the game's speed, with MATCH FEET and FIND A CLIP THAT FITS.
 */
function MoveTimeline({ move, draft, onChange, stage, pb, clipOptions, moveNames, gameSpeed, onClose }: {
  move: string; draft: CharacterDef; onChange: (next: CharacterDef) => void; stage: CharacterStage;
  pb: StagePlayback | null; clipOptions: SearchOption[]; moveNames: string[]; gameSpeed: number | null; onClose: () => void;
}) {
  const cur = draft.moves[move] ?? { clip: null };
  const setMove = (m: CharacterMove) => onChange({ ...draft, moves: { ...draft.moves, [move]: m } });
  const D = stage.moveDuration(move) || 1;
  const info = stage.feetOfMove(move);
  const rate = cur.speed ?? 1;
  const [fits, setFits] = useState<Array<{ name: string; source: string; rate: number }> | "checking" | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState("walk");   // Phase 88: the legs move an action previews over
  useEffect(() => { setFits(null); }, [move]);
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = (t: number) => `${Math.max(0, Math.min(100, (100 * t) / D))}%`;
  const playing = !!pb?.label && pb.label.startsWith(`${move} · `);

  // Feet vs the game's speed (walk / run only).
  const gs = info?.groundSpeed ?? null;
  const match = gameSpeed && gs ? Math.round((gameSpeed / gs) * 100) / 100 : null;
  const slide = gameSpeed && gs ? Math.abs(gameSpeed - gs * rate) / gameSpeed : null;
  const findFits = () => {
    setFits("checking");
    setTimeout(() => {
      const out: Array<{ name: string; source: string; rate: number }> = [];
      for (const c of stage.clips()) {
        if (!c.loop || !gameSpeed) continue;
        const g = stage.feetOfPoolClip(c.name, c.source)?.groundSpeed;
        if (!g) continue;
        const r = gameSpeed / g;
        if (r >= FIT_MIN && r <= FIT_MAX) out.push({ name: c.name, source: c.source, rate: Math.round(r * 100) / 100 });
      }
      out.sort((a, b) => Math.abs(Math.log(a.rate)) - Math.abs(Math.log(b.rate)));
      setFits(out.slice(0, 5));
    }, 0);
  };

  // Steps: your own (fractions of the loop) or each touchdown.
  const auto = !cur.steps;
  const steps = cur.steps ?? (info?.feet.flatMap(f => f.touchdowns).map(t => t / D).sort((a, b) => a - b) ?? []);
  const setSteps = (next: number[] | null) => {
    const { steps: _s, ...rest } = cur;
    setMove(next ? { ...rest, steps: [...next].map(f => Math.round(f * 1000) / 1000).sort((a, b) => a - b) } : rest);
  };
  const fracAt = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    return r ? Math.max(0, Math.min(0.999, (clientX - r.left) / r.width)) : 0;
  };

  // Layers.
  const layers = cur.layers ?? [];
  const setLayers = (next: typeof layers) => { const { layers: _l, ...rest } = cur; setMove(next.length ? { ...rest, layers: next } : rest); };
  const [, setTick] = useState(0);   // re-render after a preview switch (the stage holds it)
  const splitClip = (v: string) => { const [src, name] = v.split("::"); return { clip: name ?? "", ...(src ? { source: src } : {}) }; };

  // Handoffs into this move.
  const into = Object.entries(draft.handoffs ?? {}).filter(([k]) => k.endsWith(`>${move}`)).map(([k, v]) => ({ from: k.slice(0, -move.length - 1), secs: v }));
  const setHandoff = (from: string, secs: number | null) => {
    const h = { ...draft.handoffs };
    if (secs == null) delete h[`${from}>${move}`]; else h[`${from}>${move}`] = Math.max(0, Math.round(secs * 100) / 100);
    onChange({ ...draft, handoffs: Object.keys(h).length ? h : undefined });
  };

  const ROW: React.CSSProperties = { display: "grid", gridTemplateColumns: "104px 1fr", alignItems: "center", gap: 8, minHeight: 22 };
  const TRACK: React.CSSProperties = { position: "relative", height: 18, background: "#141416", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)" };
  const segs = (a: number, b: number): Array<[number, number]> => b >= a ? [[a, b]] : [[a, D], [0, b]];   // a contact that wraps past the loop end

  return (
    <div data-move-timeline={move} style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8, borderBottom: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: C.text, fontWeight: 600 }}>{label(move)}</span>
        <span>{cur.clip ?? "no clip"}{rate !== 1 ? ` · ${rate}×` : ""}{layers.length ? ` + ${layers.length} layer${layers.length > 1 ? "s" : ""}` : ""} · {D.toFixed(2)} s</span>
        <button style={BTN()} onClick={() => cur.part ? stage.previewAction(move, over) : stage.playMove(move)} disabled={!cur.clip}
          title={cur.part ? `Play it on the ${BODY_PARTS.find(p => p.id === cur.part)?.label} over ${label(over)}` : "Play it"}>▶ PLAY</button>
        <span>plays on</span>
        <select aria-label="Plays on" value={cur.part ?? ""} style={INPUT}
          title="Whole body: a script's play move takes over the character. A body part: it plays there only, while the rest keeps walking, running, jumping (e.g. shooting while walking)."
          onChange={e => { const { part: _p, aims: _a, ...rest } = cur; setMove(e.target.value ? { ...rest, part: e.target.value as BodyPart, ...(cur.aims ? { aims: true } : {}) } : rest); }}>
          <option value="">whole body</option>
          {BODY_PARTS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        {cur.part && <>
          <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }} title="Aim while this plays (the AIM section: where the camera looks up / down)">
            <input type="checkbox" aria-label="Aims while playing" checked={!!cur.aims} onChange={e => { const { aims: _a, ...rest } = cur; setMove(e.target.checked ? { ...rest, aims: true } : rest); }} />
            aims
          </label>
          <span>preview over</span>
          <select aria-label="Preview over" value={over} style={INPUT} onChange={e => setOver(e.target.value)}>
            {["idle", "walk", "run"].filter(m => draft.moves[m]?.clip).map(m => <option key={m} value={m}>{label(m)}</option>)}
          </select>
        </>}
        <span style={{ flex: 1 }} />
        {gameSpeed != null && gs != null && slide != null && (
          <span data-feet-status style={{ color: slide > 0.12 ? "#ffb86b" : C.green }} title={`The clip walks at ${gs.toFixed(2)} m/s; at ${rate}× that's ${(gs * rate).toFixed(2)} m/s. The game moves ${gameSpeed.toFixed(1)} m/s.`}>
            {slide > 0.12 ? `feet slide ${Math.round(slide * 100)}%` : "feet planted"}
          </span>
        )}
        {match != null && <button style={BTN(slide != null && slide > 0.12)} title={`Play the clip at ${match}× so a planted foot moves with the ground at ${gameSpeed} m/s`} onClick={() => setMove({ ...cur, speed: match })}>MATCH FEET ({match}×)</button>}
        {gameSpeed != null && <button style={BTN()} title="Look through every looping clip for ones that keep the feet planted at this speed without much speeding up or slowing down" onClick={findFits}>FIND A CLIP THAT FITS</button>}
        <button style={BTN()} onClick={onClose} title="Close the timeline">✕</button>
      </div>
      {match != null && (match < FIT_MIN * 0.85 || match > FIT_MAX * 1.2) && fits == null && (
        <span style={{ color: "#ffb86b", fontSize: 10 }}>At {match}× this clip will look {match > 1 ? "rushed" : "slow-motion"}: a clip made for {gameSpeed?.toFixed(1)} m/s fits better (FIND A CLIP THAT FITS).</span>
      )}
      {fits === "checking" && <span style={{ fontSize: 10 }}>Checking every looping clip's feet…</span>}
      {Array.isArray(fits) && (
        <div data-fits style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10 }}>{fits.length ? "Fits at this speed (click to use):" : `No clip keeps the feet planted at ${gameSpeed} m/s within ${FIT_MIN}× to ${FIT_MAX}×.`}</span>
          {fits.map(f => (
            <button key={`${f.source}::${f.name}`} style={BTN()} onClick={() => { setMove({ ...cur, clip: f.name, source: f.source === draft.modelAssetId ? undefined : f.source, speed: f.rate }); setFits(null); }}>
              {f.name} at {f.rate}×
            </button>
          ))}
        </div>
      )}

      {/* LAYERS */}
      {layers.map((l, i) => (
        <div key={i} data-layer={i} style={{ ...ROW, opacity: stage.layerOn(move, i) ? 1 : 0.5 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} title="Preview with or without this layer. Editor only: the game always plays every layer.">
            <input type="checkbox" className="wb-switch" aria-label={`Layer ${i + 1} on in the preview`} checked={stage.layerOn(move, i)}
              onChange={e => { stage.setLayerOn(move, i, e.target.checked); setTick(t => t + 1); }} />
            <span style={LBL}>LAYER {i + 1}</span>
          </label>
          <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
            <SearchSelect ariaLabel={`Layer ${i + 1} clip`} value={l.clip ? `${l.source ?? ""}::${l.clip}` : ""} placeholder="pick a clip…" style={{ flex: 1 }}
              options={clipOptions} onChange={v => setLayers(layers.map((x, j) => j === i ? { ...splitClip(v), part: x.part } : x))} />
            <span>on the</span>
            <select aria-label={`Layer ${i + 1} body part`} value={l.part} style={INPUT} onChange={e => setLayers(layers.map((x, j) => j === i ? { ...x, part: e.target.value as BodyPart } : x))}>
              {BODY_PARTS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <button style={BTN()} title="Remove this layer" onClick={() => { stage.resetLayerSwitches(move); setLayers(layers.filter((_, j) => j !== i)); }}>✕</button>
          </span>
        </div>
      ))}

      {/* CLIP */}
      <div style={ROW}>
        <span style={LBL}>CLIP</span>
        <div style={TRACK}>
          <div style={{ position: "absolute", inset: 1, borderRadius: 3, background: "rgba(80,140,255,0.25)", display: "flex", alignItems: "center", paddingLeft: 6, color: C.text, fontSize: 10, overflow: "hidden", whiteSpace: "nowrap" }}>
            {cur.clip ?? "no clip"}{layers.length ? `, with ${layers.map(l => `${l.clip || "?"} on the ${BODY_PARTS.find(p => p.id === l.part)?.label}`).join(", ")}` : ""}
          </div>
          {playing && <div style={{ position: "absolute", top: -3, bottom: -3, width: 2, background: "#ff9b8a", left: pct(pb!.time) }} />}
        </div>
      </div>

      {/* FEET */}
      <div style={ROW}>
        <span style={LBL}>FEET</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {info ? info.feet.map((f, k) => (
            <div key={k} style={{ ...TRACK, height: 8 }} title={`${f.name}: green = on the ground`}>
              {f.contacts.flatMap(([a, b]) => segs(a, b)).map(([a, b], j) => (
                <div key={j} style={{ position: "absolute", top: 1, bottom: 1, left: pct(a), width: `calc(${pct(b)} - ${pct(a)})`, background: "rgba(127,224,181,0.7)", borderRadius: 3 }} />
              ))}
            </div>
          )) : <span style={{ fontSize: 10 }}>No feet found on this skeleton (footsteps fall back to every STRIDE meters).</span>}
        </div>
      </div>

      {/* STEPS */}
      <div style={ROW}>
        <span style={LBL}>STEPS</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div ref={trackRef} data-steps-track style={{ ...TRACK, flex: 1, cursor: "copy" }}
            title="Click to add a footstep here; drag one to move it; double-click one to remove it"
            onClick={e => { if (e.target === e.currentTarget) setSteps([...steps, fracAt(e.clientX)]); }}>
            {steps.map((f, i) => (
              <div key={i} data-step={i}
                onPointerDown={e => { e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setDragging(i); }}
                onPointerMove={e => { if (dragging === i) setSteps(steps.map((x, j) => j === i ? fracAt(e.clientX) : x)); }}
                onPointerUp={() => setDragging(null)}
                onDoubleClick={e => { e.stopPropagation(); setSteps(steps.filter((_, j) => j !== i)); }}
                style={{ position: "absolute", top: 3, width: 10, height: 10, marginLeft: -5, left: `${f * 100}%`, transform: "rotate(45deg)", background: auto ? C.green : "#ffb86b", cursor: "ew-resize", borderRadius: 2 }} />
            ))}
          </div>
          <span style={{ fontSize: 10, color: auto ? C.green : "#ffb86b", whiteSpace: "nowrap" }}>{auto ? (steps.length ? "from the feet" : "none") : "your own"}</span>
          {!auto && <button style={BTN()} title="Go back to a step each time a foot touches down" onClick={() => setSteps(null)}>FROM THE FEET</button>}
        </div>
      </div>

      {/* HANDOFFS */}
      <div style={ROW}>
        <span style={LBL}>HANDOFFS</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10 }}>into {label(move)} from:</span>
          {into.map(h => {
            const preset = HANDOFF_PRESETS.find(([, v]) => v === h.secs)?.[0] ?? "custom";
            return (
              <span key={h.from} data-handoff={h.from} style={{ display: "flex", gap: 4, alignItems: "center", border: `1px solid ${C.line}`, borderRadius: 4, padding: "2px 4px" }}>
                <span style={{ color: C.text }}>{label(h.from)}</span>
                <select aria-label={`Handoff from ${label(h.from)}`} value={preset} style={INPUT}
                  onChange={e => { const p = HANDOFF_PRESETS.find(([n]) => n === e.target.value); if (p) setHandoff(h.from, p[1]); }}>
                  {HANDOFF_PRESETS.map(([n, v]) => <option key={n} value={n}>{n} {v} s</option>)}
                  {preset === "custom" && <option value="custom">custom</option>}
                </select>
                <input aria-label={`Handoff seconds from ${label(h.from)}`} type="number" min={0} step={0.01} value={h.secs} style={{ ...INPUT, width: 52 }}
                  onChange={e => { const v = parseFloat(e.target.value); if (v >= 0) setHandoff(h.from, v); }} />
                <span>s</span>
                <button style={BTN()} title={`Play ${label(h.from)}, then blend into ${label(move)}`} onClick={() => stage.blendTest(h.from, move)}>▶</button>
                <button style={BTN()} title="Back to the usual 0.15 s" onClick={() => setHandoff(h.from, null)}>✕</button>
              </span>
            );
          })}
          <select aria-label="Add a handoff from" value="" style={INPUT} onChange={e => { if (e.target.value) setHandoff(e.target.value, 0.15); }}>
            <option value="">+ from…</option>
            {moveNames.filter(m => m !== move && draft.moves[m]?.clip && !into.some(h => h.from === m)).map(m => <option key={m} value={m}>{label(m)}</option>)}
          </select>
          <span style={{ fontSize: 10 }}>others: 0.15 s</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button style={BTN()} title="Mix another clip in on a body part (legs, upper body, arms, head)"
          onClick={() => setLayers([...layers, { clip: "", part: "upper" }])}>+ LAYER</button>
        <span style={{ fontSize: 10, alignSelf: "center" }}>A layer plays another clip on one body part, e.g. Idle_Talking_Loop on the upper body while the legs walk.</span>
      </div>
    </div>
  );
}

// ── Phase 88: AIM ──────────────────────────────────────────────────────────────

/**
 * The character's aim poses: up / straight / down clips on a body part and how far up /
 * down they reach, with a preview slider. Without all three the spine turns instead.
 * Quick picks fill the three from a family of clips named *_Aim_Up / _Neutral / _Down.
 */
function AimSection({ draft, onChange, stage, clipOptions, clips }: {
  draft: CharacterDef; onChange: (next: CharacterDef) => void; stage: CharacterStage; clipOptions: SearchOption[]; clips: StageClip[];
}) {
  const aim = draft.aim ?? {};
  const [pv, setPv] = useState(stage.aimPreview);
  const setAim = (patch: Partial<NonNullable<CharacterDef["aim"]>>) => {
    const next: Record<string, unknown> = { ...aim, ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    onChange({ ...draft, aim: Object.keys(next).length ? next as CharacterDef["aim"] : undefined });
  };
  const ref = (v: string) => { const [src, name] = v.split("::"); return name ? { clip: name, ...(src ? { source: src } : {}) } : undefined; };
  const val = (r?: { clip: string; source?: string }) => r ? `${r.source ?? ""}::${r.clip}` : "";
  const families = [...new Set(clips.filter(c => /_aim_up$/i.test(c.name)).map(c => c.name.replace(/_aim_up$/i, "")))]
    .filter(f => ["Neutral", "Down"].every(s => clips.some(c => c.name.toLowerCase() === `${f}_aim_${s}`.toLowerCase())));
  const pick = (f: string) => {
    const r = (s: string) => { const c = clips.find(x => x.name.toLowerCase() === `${f}_aim_${s}`.toLowerCase())!; return { clip: c.name, ...(c.source !== draft.modelAssetId ? { source: c.source } : {}) }; };
    setAim({ up: r("up"), neutral: r("neutral"), down: r("down") });
  };
  const preview = (on: boolean, deg: number) => { setPv({ on, deg }); stage.setAimPreview(on, deg); };
  const full = !!(aim.up && aim.neutral && aim.down);
  return (
    <div data-character-aim style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ ...LBL, flex: 1 }}>AIM</span>
        {families.map(f => <button key={f} style={BTN()} title={`Use ${f}_Aim_Up / _Neutral / _Down`} onClick={() => pick(f)}>{f.toUpperCase()}</button>)}
      </div>
      {([["UP", "up"], ["STRAIGHT", "neutral"], ["DOWN", "down"]] as const).map(([name, k]) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "72px 1fr", alignItems: "center", gap: 4 }}>
          <span style={{ color: C.text, fontSize: 11, fontFamily: "monospace" }}>{name}</span>
          <SearchSelect ariaLabel={`Aim ${name.toLowerCase()} clip`} value={val(aim[k])} placeholder="pick a clip…" options={[{ value: "", label: "none" }, ...clipOptions]}
            onChange={v => setAim({ [k]: ref(v) })} />
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ color: C.text, fontSize: 11 }}>on the</span>
        <select aria-label="Aim body part" value={aim.part ?? "upper"} style={INPUT} onChange={e => setAim({ part: e.target.value as BodyPart })}>
          {BODY_PARTS.filter(p => p.id !== "legs").map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <span style={{ color: C.text, fontSize: 11 }}>reach up</span>
        <input aria-label="Aim reach up" type="number" min={5} max={90} step={5} value={aim.upDeg ?? 60} style={{ ...INPUT, width: 44 }} onChange={e => setAim({ upDeg: Number(e.target.value) || undefined })} />
        <span style={{ color: C.text, fontSize: 11 }}>down</span>
        <input aria-label="Aim reach down" type="number" min={5} max={90} step={5} value={aim.downDeg ?? 60} style={{ ...INPUT, width: 44 }} onChange={e => setAim({ downDeg: Number(e.target.value) || undefined })} />
        <span style={{ color: C.text2, fontSize: 11 }}>°</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: C.text, fontSize: 11 }}>
          <input type="checkbox" className="wb-switch" aria-label="Preview aiming" checked={pv.on} onChange={e => preview(e.target.checked, pv.deg)} />
          preview
        </label>
        <input aria-label="Aim angle" type="range" min={-90} max={90} step={1} value={pv.deg} disabled={!pv.on} style={{ flex: 1 }} onChange={e => preview(true, Number(e.target.value))} />
        <span style={{ color: C.text, fontSize: 11, width: 36, textAlign: "right" }}>{pv.deg}°</span>
      </div>
      <span style={{ color: C.muted, fontSize: 10, lineHeight: 1.4 }}>
        {full ? "While aiming, the " + (BODY_PARTS.find(p => p.id === (aim.part ?? "upper"))?.label ?? "upper body") + " takes the pose for the angle (straight between). " : "Without all three clips the spine and head turn toward the aim instead. "}
        In the game the angle is where the camera looks up or down. Aiming starts with a script (aim on / off) or a move set to aim while it plays (its timeline).
      </span>
    </div>
  );
}
