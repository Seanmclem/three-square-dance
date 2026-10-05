import { useEffect, useMemo, useState } from "react";
import type { AssetDef, CharacterDef, CharacterMove, CharacterSounds, PlayerFeel } from "@/types";
import type { CharacterStage, StageClip, StagePlayback } from "@/characters/CharacterStage";
import { rigOfAsset } from "@/characters/CharacterStage";
import { rigOverlap } from "@/characters/rig";
import { BUILT_IN_MOVES, LOOPING_MOVES, guessClip } from "@/characters/autoFill";
import { CAPSULE_HEIGHT, swapCharacterModel, movesLostBySwap } from "@/characters/characterRuntime";
import { characterModelOptions } from "@/ui/CharacterPanel";
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
export function CharacterEditor({ draft, onChange, stage, assets, onTryIt }: {
  onTryIt?: () => void;   // walk it around the level with the real controls (Esc returns)
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
                <span style={{ color: custom ? "#ffc58a" : C.text, fontSize: 11, fontFamily: "monospace", fontWeight: 600 }} title={LOOPING_MOVES.has(m) ? "loops" : "plays once"}>{label(m)}</span>
                <SearchSelect ariaLabel={`Clip for ${label(m)}`} value={clipValue(cur)} onChange={v => pickClip(m, v)} placeholder="no clip · search…"
                  dataAttr={`clip-${m}`}
                  options={[
                    { value: "", label: "no clip" },
                    ...sources.flatMap(src => clips.filter(c => c.source === src).map(c => ({
                      value: `${src === draft.modelAssetId ? "" : src}::${c.name}`, label: c.name, group: assetLabel(src),
                      hint: c.loop ? "loop" : "once" }))),
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
      </div>

      {/* ── Bottom: PLAYER BAR ───────────────────────────────────────────── */}
      <div data-character-editor="player" style={{ position: "absolute", left: 334, right: 330, bottom: 0, zIndex: 9, background: "rgba(22,23,27,0.94)", borderTop: `1px solid ${C.line}`, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontFamily: "monospace", fontSize: 11, color: C.text2 }}>
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
