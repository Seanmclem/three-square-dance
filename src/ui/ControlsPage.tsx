import { Fragment, useEffect, useState } from "react";
import { GAMEPAD_BUTTON_NAMES, prettyKey } from "@/input/bindings";
import {
  ACTION_NAMES, KBM_ACTIONS, PAD_ACTIONS, DEFAULT_TOUCH, gameFeel, gameKbm, gamePad, gameTouch,
  type ControlsFeel, type GameButton, type GameInputConfig, type KbmAction, type PadAction, type TouchSpot,
} from "@/input/gameControls";

/**
 * Phase 89: the game's Controls page (main menu, nothing selected). A compact list first
 * (every action, every device; click any chip to edit it there; + ADD BUTTON), EDIT for a
 * tab per device (KEYBOARD + MOUSE / GAMEPAD / TOUCH), a page per button of your own, the
 * touch arranger, and the game's "feel" defaults. Saved in game.json `input` (onChange).
 * Built from the prototype `plans/mockups/controls-prototype.html`.
 */

// ── names ──────────────────────────────────────────────────────────────────────
const PS = ["✕", "○", "□", "△", "L1", "R1", "L2", "R2", "Create", "Options", "L3", "R3", "D-pad ↑", "D-pad ↓", "D-pad ←", "D-pad →"];
const XB = (i: number) => GAMEPAD_BUTTON_NAMES[i] ?? `B${i}`;
const PSN = (i: number) => PS[i] ?? `B${i}`;
const both = (i: number) => `${XB(i)} / ${PSN(i)}`;
const RESERVED: Record<string, string> = { Escape: "Esc is kept for leaving Play" };

const CSS = `
.cc-k { display:inline-flex; align-items:center; justify-content:center; min-width:22px; height:20px; padding:0 6px; border-radius:4px; background:#30323a;
  border:1px solid rgba(255,255,255,.18); border-bottom-width:2px; color:#dde3f0; font:600 10px monospace; cursor:pointer; white-space:nowrap; box-sizing:border-box; }
.cc-k:hover { border-color: rgba(80,140,255,.5); }
.cc-xb { border-radius:10px; background:rgba(16,124,16,.14); border-color:#4cc24c; color:#d4f5d4; }
.cc-ps { border-radius:10px; background:rgba(0,112,209,.16); border-color:#4a9eff; color:#d6e8ff; }
.cc-both { border-radius:10px; background:#262b33; border-color:#4cc24c #4a9eff #4a9eff #4cc24c; }
.cc-touch { background:transparent; border-color:rgba(255,255,255,.4); border-bottom-width:1px; border-radius:6px; }
.cc-fixed { cursor: default; }
.cc-fixed:not(.cc-xb):not(.cc-ps):not(.cc-both):not(.cc-touch) { background:#26272d; color:#c2cadb; }
.cc-add { background:transparent; border-style:dashed; color:#98a2b8; }
.cc-cap { background:rgba(80,140,255,.16); border-color:#9dbdff; color:#9dbdff; animation: cc-blink 1.1s ease-in-out infinite; }
.cc-clash { border-color:#ffb86b !important; color:#ffb86b; }
.cc-pair { display:inline-flex; gap:2px; border-radius:12px; cursor:pointer; outline-offset:2px; }
.cc-pair:hover { outline:1px solid rgba(80,140,255,.5); }
.cc-pair.cc-clash .cc-k { box-shadow: 0 0 0 1px #ffb86b; }
.cc-go { cursor:pointer; } .cc-go:hover { border-color:#9dbdff; }
@keyframes cc-blink { 50% { opacity:.45; } }
@media (prefers-reduced-motion: reduce) { .cc-cap { animation:none; } }
`;
const C = { t1: "#dde3f0", t2: "#c2cadb", t3: "#98a2b8", blue: "#9dbdff", blueFill: "rgba(80,140,255,0.16)", blueLine: "rgba(80,140,255,0.5)", amber: "#ffb86b", red: "#ff9b8a", line: "rgba(255,255,255,0.08)" };
const SEC: React.CSSProperties = { padding: "10px 16px", borderTop: `1px solid ${C.line}`, display: "flex", flexDirection: "column", gap: 6 };
const ROW: React.CSSProperties = { display: "grid", gridTemplateColumns: "96px 1fr", alignItems: "center", gap: 6, minHeight: 26 };
const LBL: React.CSSProperties = { color: C.t3, fontSize: 10, letterSpacing: 1, fontFamily: "monospace", textTransform: "uppercase" };
const MINI: React.CSSProperties = { color: C.t3, fontSize: 10, lineHeight: 1.5, fontFamily: "monospace" };
const BTN = (on = false): React.CSSProperties => ({ padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 10, whiteSpace: "nowrap",
  border: `1px solid ${on ? C.blueLine : "rgba(255,255,255,0.14)"}`, background: on ? C.blueFill : "rgba(46,46,48,0.9)", color: on ? C.blue : C.t1 });
const FIELD: React.CSSProperties = { background: "#141416", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, padding: "4px 6px", color: C.t1, fontFamily: "monospace", fontSize: 11 };

const Phone = () => <svg width="8" height="11" viewBox="0 0 8 11" aria-hidden="true" style={{ marginRight: 4, flexShrink: 0 }}>
  <rect x="0.6" y="0.6" width="6.8" height="9.8" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" /><circle cx="4" cy="8.4" r="0.7" fill="currentColor" /></svg>;
const PadPair = ({ i }: { i: number }) => <><span className="cc-k cc-xb">{XB(i)}</span><span className="cc-k cc-ps">{PSN(i)}</span></>;

type Device = "kbm" | "gamepad";
interface Capture { device: Device; action: string; index: number }

export function ControlsPage({ input, onChange, moveNames }: {
  input: GameInputConfig | undefined;
  onChange: (next: GameInputConfig) => void;
  moveNames: string[];   // the player character's moves, for "play a move"
}) {
  const [view, setView] = useState<string>("compact");    // compact | edit | button:<id>
  const [tab, setTab] = useState<"kbm" | "gamepad" | "touch">("kbm");
  const [capturing, setCapturing] = useState<Capture | null>(null);
  const [padStyle, setPadStyle] = useState<"xbox" | "ps">("xbox");
  const [touchSel, setTouchSel] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const game = input ?? {};
  const buttons = game.buttons ?? [];
  const isBuiltKbm = (a: string): a is KbmAction => (KBM_ACTIONS as string[]).includes(a);
  const isBuiltPad = (a: string): a is PadAction => (PAD_ACTIONS as string[]).includes(a);

  // ── reading / writing ──
  const codesKbm = (a: string): string[] => isBuiltKbm(a) ? gameKbm(game, a) : buttons.find(b => b.id === a)?.kbm ?? [];
  const codesPad = (a: string): number[] => isBuiltPad(a) ? gamePad(game, a) : buttons.find(b => b.id === a)?.gamepad ?? [];
  const write = (patch: Partial<GameInputConfig>) => onChange({ ...game, ...patch });
  const setKbm = (a: string, codes: string[]) => isBuiltKbm(a)
    ? write({ bindings: { ...game.bindings, kbm: { ...game.bindings?.kbm, [a]: codes } } })
    : write({ buttons: buttons.map(b => b.id === a ? { ...b, kbm: codes } : b) });
  const setPad = (a: string, codes: number[]) => isBuiltPad(a)
    ? write({ bindings: { ...game.bindings, gamepad: { ...game.bindings?.gamepad, [a]: codes } } })
    : write({ buttons: buttons.map(b => b.id === a ? { ...b, gamepad: codes } : b) });
  const setTouch = (id: string, patch: Partial<TouchSpot>) => {
    const cur = gameTouch(game, id) ?? { x: 70, y: 50, size: 56, on: false };
    write({ touch: { ...game.touch, [id]: { ...cur, ...patch } } });
  };
  const feel = gameFeel(game);
  const setFeel = (patch: Partial<ControlsFeel>) => write({ feel: { ...game.feel, ...patch } });
  const nameOf = (id: string) => isBuiltKbm(id) ? ACTION_NAMES[id] : buttons.find(b => b.id === id)?.name ?? id;
  const clash = (device: Device, action: string, code: string | number): string[] => {
    const out: string[] = [];
    const ids = [...(device === "kbm" ? KBM_ACTIONS : PAD_ACTIONS), ...buttons.map(b => b.id)];
    for (const id of ids) if (id !== action && (device === "kbm" ? codesKbm(id) : codesPad(id) as Array<string | number>).includes(code)) out.push(nameOf(id));
    return out;
  };

  // ── changing a binding ──
  useEffect(() => {
    if (!capturing) return;
    let done = false;
    const finish = (v: string | null | undefined) => {
      if (done) return; done = true; setCapturing(null);
      if (v === undefined) return;
      const codes = [...codesKbm(capturing.action)];
      if (v === null) codes.splice(capturing.index, 1);
      else if (RESERVED[v]) { setNote(RESERVED[v]!); setTimeout(() => setNote(null), 2500); return; }
      else if (!(codes.includes(v) && codes.indexOf(v) !== capturing.index)) codes[capturing.index] = v;
      setKbm(capturing.action, codes);
    };
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (capturing.device === "gamepad") { if (e.code === "Escape") finish(undefined); return; }
      if (e.code === "Escape") return finish(undefined);
      if (e.code === "Delete" || e.code === "Backspace") return finish(null);
      finish(e.code);
    };
    // Mouse buttons bind only in the "click here" box; a click anywhere else cancels.
    const onMouse = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (capturing.device === "kbm" && t?.closest?.("[data-mousezone]")) { e.preventDefault(); e.stopPropagation(); finish(`Mouse${e.button}`); return; }
      if (!t?.closest?.("[data-nocapture]")) { done = true; setCapturing(null); }
    };
    const onCtx = (e: MouseEvent) => { if ((e.target as HTMLElement | null)?.closest?.("[data-mousezone]")) e.preventDefault(); };
    window.addEventListener("keydown", onKey, true); window.addEventListener("mousedown", onMouse, true); window.addEventListener("contextmenu", onCtx, true);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("mousedown", onMouse, true); window.removeEventListener("contextmenu", onCtx, true); };
  }, [capturing]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Compact view → that action, highlighted for a moment.
  useEffect(() => {
    if (!focus) return;
    document.querySelector(`[data-ctl-row="${focus}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const t = setTimeout(() => setFocus(null), 2000);
    return () => clearTimeout(t);
  }, [focus, tab, view]);
  const hl = (id: string): React.CSSProperties => focus && (focus === id || (focus === "move" && id.startsWith("move")))
    ? { ...ROW, background: "rgba(80,140,255,.12)", outline: `1px solid ${C.blueLine}`, outlineOffset: 2, borderRadius: 4 } : ROW;
  const openAction = (device: "kbm" | "gamepad" | "touch", id: string) => {
    if (buttons.some(b => b.id === id)) { setView("button:" + id); return; }
    setTab(device); setView("edit"); setFocus(id);
    if (device === "touch" && (id === "jump" || id === "bag")) setTouchSel(id);
  };
  const addButton = () => {
    let n = 1; while (buttons.some(b => b.name === `Button ${n}`)) n++;
    const id = "btn_" + Math.random().toString(36).slice(2, 8);
    write({ buttons: [...buttons, { id, name: `Button ${n}`, kind: "press", kbm: [], gamepad: [], does: null }] });
    setView("button:" + id);
  };

  // A device's caps for one action (click: change; + add another).
  const caps = (device: Device, action: string) => {
    const codes: Array<string | number> = device === "kbm" ? codesKbm(action) : codesPad(action);
    const isCap = (i: number) => capturing?.device === device && capturing.action === action && capturing.index === i;
    const clashes = codes.map(c => clash(device, action, c));
    return (
      <span style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        {codes.map((c, i) => {
          const title = clashes[i]!.length ? `${device === "kbm" ? prettyKey(c as string) : both(c as number)} is also ${clashes[i]!.join(", ")}` : "Click to change or remove";
          if (isCap(i)) return <span key={i} className="cc-k cc-cap">{device === "kbm" ? "press…" : "picking…"}</span>;
          return device === "gamepad"
            ? <span key={i} data-ctl-cap className={"cc-pair" + (clashes[i]!.length ? " cc-clash" : "")} role="button" tabIndex={0} title={title} onClick={() => setCapturing({ device, action, index: i })}><PadPair i={c as number} /></span>
            : <span key={i} data-ctl-cap className={"cc-k" + (clashes[i]!.length ? " cc-clash" : "")} role="button" tabIndex={0} title={title} onClick={() => setCapturing({ device, action, index: i })}>{prettyKey(c as string)}</span>;
        })}
        {isCap(codes.length) ? <span className="cc-k cc-cap">{device === "kbm" ? "press…" : "picking…"}</span>
          : <span className="cc-k cc-add" role="button" tabIndex={0} title="Add another" onClick={() => setCapturing({ device, action, index: codes.length })}>+</span>}
        {clashes.flat().length > 0 && <span style={{ color: C.amber, fontSize: 10 }}>{[...new Set(codes.flatMap((c, i) => clashes[i]!.map(n => `${device === "kbm" ? prettyKey(c as string) : both(c as number)} is also ${n}`)))].join(" · ")}</span>}
      </span>
    );
  };

  // While changing a binding: what to do, the mouse-button box or the controller picker, REMOVE / CANCEL.
  const capCodes: Array<string | number> = capturing ? (capturing.device === "kbm" ? codesKbm(capturing.action) : codesPad(capturing.action)) : [];
  const replacing = !!capturing && capturing.index < capCodes.length;
  const removeCap = () => {
    if (!capturing) return;
    if (capturing.device === "kbm") { const c = [...codesKbm(capturing.action)]; c.splice(capturing.index, 1); setKbm(capturing.action, c); }
    else { const c = [...codesPad(capturing.action)]; c.splice(capturing.index, 1); setPad(capturing.action, c); }
    setCapturing(null);
  };
  const pickPad = (i: number) => {
    if (!capturing) return;
    const c = [...codesPad(capturing.action)];
    if (!(c.includes(i) && c.indexOf(i) !== capturing.index)) c[capturing.index] = i;
    setPad(capturing.action, c); setCapturing(null);
  };
  const captureHint = capturing && (
    <div style={{ ...SEC, borderTop: "none", paddingTop: 0 }} data-nocapture>
      <span style={{ ...MINI, color: C.blue }}>{capturing.device === "kbm" ? "Press the new key, or click in the box with a mouse button." : "Pick a button."} Esc or a click elsewhere cancels.</span>
      {capturing.device === "kbm" && <div data-mousezone role="button" aria-label="Mouse button zone" style={{ border: `1px dashed ${C.blueLine}`, borderRadius: 6, padding: "10px 8px", textAlign: "center", color: C.blue, cursor: "crosshair", fontFamily: "monospace", fontSize: 10 }}>click here with the mouse button you want (left, right, middle)</div>}
      {capturing.device === "gamepad" && <PadPicker ps={padStyle === "ps"} setPs={ps => setPadStyle(ps ? "ps" : "xbox")} current={replacing ? capCodes[capturing.index] as number : null}
        mine={capCodes as number[]} usedBy={i => clash("gamepad", capturing.action, i)} onPick={pickPad} />}
      <span style={{ display: "flex", gap: 6 }}>
        {replacing && <button style={{ ...BTN(), color: C.red }} data-remove onClick={removeCap}>REMOVE {capturing.device === "kbm" ? prettyKey(capCodes[capturing.index] as string) : both(capCodes[capturing.index] as number)}</button>}
        <button style={BTN()} onClick={() => setCapturing(null)}>CANCEL</button>
      </span>
    </div>
  );

  const btn = view.startsWith("button:") ? buttons.find(b => b.id === view.slice(7)) : undefined;
  useEffect(() => { if (view.startsWith("button:") && !btn) setView("edit"); }, [view, btn]);
  const setBtn = (patch: Partial<GameButton>) => write({ buttons: buttons.map(b => b.id === btn?.id ? { ...b, ...patch } : b) });

  // ── compact (every action, every device; click any chip) ──
  if (view === "compact") {
    const go = (device: "kbm" | "gamepad" | "touch", id: string) => ({ role: "button", tabIndex: 0, onClick: () => openAction(device, id), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") openAction(device, id); } });
    const row = (name: string, id: string, kb: string[], pad: Array<string | number>, touch: string | null, color?: string) => (
      <Fragment key={id}>
        <span style={{ color: color ?? C.t1, fontFamily: "monospace", fontSize: 11 }}>{name}</span>
        <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }} data-compact-row={id}>
          {kb.map((c, i) => <span key={"k" + i} className="cc-k cc-fixed cc-go" title="Edit (keyboard + mouse)" {...go("kbm", id)}>{c}</span>)}
          {pad.map((c, i) => typeof c === "string" ? <span key={"p" + i} className="cc-k cc-both cc-fixed cc-go" title="Edit (gamepad)" {...go("gamepad", id)}>{c}</span>
            : <span key={"p" + i} className="cc-pair" title="Edit (gamepad)" {...go("gamepad", id)}><PadPair i={c} /></span>)}
          {touch && <span className="cc-k cc-touch cc-fixed cc-go" title="Edit (touch: phones, tablets)" {...go("touch", id)}><Phone />{touch}</span>}
        </span>
      </Fragment>
    );
    const kb = (a: KbmAction) => gameKbm(game, a).slice(0, 2).map(prettyKey);
    const pd = (a: PadAction) => gamePad(game, a);
    const on = (id: string) => gameTouch(game, id)?.on;
    return (
      <div data-ctl-view="compact">
        <style>{CSS}</style>
        <div style={{ ...SEC, borderTop: "none" }}>
          <div style={{ display: "flex", alignItems: "center" }}><span style={{ ...LBL, flex: 1 }}>Every action, every device</span>
            <button style={BTN(true)} data-ctl-edit onClick={() => { setTab("kbm"); setView("edit"); }}>EDIT</button></div>
          <div style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: "6px 8px", alignItems: "center" }}>
            {row("Move", "move", ["WASD"], ["L stick"], "joystick")}
            {row("Look", "look", ["mouse"], ["R stick"], "drag")}
            {row("Jump", "jump", kb("jump"), pd("jump"), on("jump") ? "jump" : null)}
            {row("Run", "run", kb("run").slice(0, 1), ["stick far", ...pd("run")], "stick far")}
            {row("Interact", "interact", kb("interact"), pd("interact"), "tap")}
            {row("Bag", "bag", kb("bag"), pd("bag"), on("bag") ? "bag" : null)}
            {row("Pause", "pause", kb("pause"), pd("pause"), "menu")}
            {buttons.map(b => row(b.name + (b.kind === "hold" ? " (hold)" : ""), b.id, b.kbm.slice(0, 2).map(prettyKey), b.gamepad, on(b.id) ? b.name.toLowerCase() : null, C.amber))}
          </div>
        </div>
        <div style={SEC}>
          <span style={MINI}>Click any chip to change it.</span>
          <button style={{ ...BTN(), alignSelf: "flex-start" }} data-add-button onClick={addButton}>+ ADD BUTTON</button>
          <span style={MINI}>Mouse speed {feel.mouseSpeed} · deadzone {feel.padDeadzone} · {game.playersCanChange === false ? "players can't change them" : "players can change keys and feel in the pause menu"}</span>
          <span style={MINI}>Grey = keyboard and mouse. Gamepad buttons by both names: <span className="cc-k cc-xb cc-fixed">RB</span> Xbox, <span className="cc-k cc-ps cc-fixed">R1</span> PlayStation; <span className="cc-k cc-both cc-fixed">stick</span> = same on both. <span className="cc-k cc-touch cc-fixed"><Phone />jump</span> = touch (phones, tablets).</span>
        </div>
      </div>
    );
  }

  // ── a button's page ──
  if (btn) {
    const t = gameTouch(game, btn.id) ?? { x: 70, y: 50, size: 56, on: false };
    const moves = [...new Set([...moveNames, ...(btn.does?.type === "move" ? [btn.does.move] : [])])];
    // A sensible first pick: attack, else the first move the game doesn't play by itself.
    const LOCO = ["idle", "walk", "run", "jump", "jump_idle", "jump_land", "fall", "climb"];
    const defaultMove = moves.includes("attack") ? "attack" : moves.find(m => !LOCO.includes(m)) ?? moves[0] ?? "attack";
    return (
      <div data-ctl-view={view}>
        <style>{CSS}</style>
        <div style={{ ...SEC, borderTop: "none" }}>
          <button style={{ ...BTN(), alignSelf: "flex-start" }} onClick={() => { setView("edit"); setConfirmDel(false); }}>← CONTROLS</button>
          <div style={ROW}><span style={LBL}>Name</span><input style={FIELD} aria-label="Button name" value={btn.name} onChange={e => setBtn({ name: e.target.value })} /></div>
          <div style={ROW}><span style={LBL}>Kind</span><span style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <button style={BTN(btn.kind === "press")} onClick={() => setBtn({ kind: "press", ...(btn.does?.type === "aim" ? { does: null } : {}) })}>PRESS</button>
            <button style={BTN(btn.kind === "hold")} onClick={() => setBtn({ kind: "hold" })}>HOLD</button>
            <span style={MINI}>{btn.kind === "hold" ? "on while held" : "once per press"}</span></span></div>
        </div>
        {captureHint}
        <div style={SEC}><span style={LBL}>Buttons</span>
          <div style={ROW}><span style={{ color: C.t2, fontSize: 11 }}>Keyboard, mouse</span>{caps("kbm", btn.id)}</div>
          <div style={ROW}><span style={{ color: C.t2, fontSize: 11 }}>Gamepad</span>{caps("gamepad", btn.id)}</div>
          <div style={ROW}><span style={{ color: C.t2, fontSize: 11 }}>Touch</span><span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <label style={{ display: "flex", gap: 4, alignItems: "center", cursor: "pointer", color: C.t1, fontSize: 11 }}><input type="checkbox" aria-label="On screen" checked={t.on} onChange={e => setTouch(btn.id, { on: e.target.checked })} />on screen</label>
            <button style={BTN()} onClick={() => { setTab("touch"); setTouchSel(btn.id); setView("edit"); }}>PLACE…</button></span></div>
          {btn.kbm.includes("Mouse0") && <span style={MINI}>Left click: in Play the first click captures the mouse; after that it's {btn.name}.</span>}
        </div>
        <div style={SEC}><span style={LBL}>{btn.kind === "hold" ? "While held" : "When pressed"} (no script needed)</span>
          <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button style={BTN(!btn.does)} onClick={() => setBtn({ does: null })}>nothing</button>
            <button style={BTN(btn.does?.type === "move")} onClick={() => setBtn({ does: { type: "move", move: btn.does?.type === "move" ? btn.does.move : defaultMove } })}>play a move</button>
            <button style={{ ...BTN(btn.does?.type === "aim"), opacity: btn.kind === "hold" ? 1 : 0.4 }} disabled={btn.kind !== "hold"} title={btn.kind !== "hold" ? "Aiming needs a HOLD button" : ""} onClick={() => setBtn({ does: { type: "aim" } })}>aim</button>
          </span>
          {btn.does?.type === "move" && <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", color: C.t1, fontSize: 11 }}>
            <span>the player plays</span>
            <select style={FIELD} aria-label="Move" value={btn.does.move} onChange={e => setBtn({ does: { type: "move", move: e.target.value } })}>{moves.map(m => <option key={m} value={m}>{m}</option>)}</select>
            <span style={MINI}>{btn.kind === "hold" ? "from press to release" : "once"}</span></span>}
          {btn.does?.type === "move" && <span style={MINI}>A move set to play on the upper body (its timeline, PLAYS ON) plays over walking, running and jumping.</span>}
          {btn.does?.type === "aim" && <span style={MINI}>The player aims where the camera looks while it's held (the character's AIM poses, or the spine turns).</span>}
        </div>
        <div style={SEC}><span style={LBL}>Scripts</span>
          <span style={MINI}>Trigger: "when the player presses a button" → {btn.name} (pressed, released, or while held).</span>
        </div>
        <div style={SEC}>
          {confirmDel ? <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><span style={{ color: C.amber, fontSize: 10 }}>Delete {btn.name}? Scripts that use it stop firing.</span>
            <button style={{ ...BTN(), color: C.red }} data-confirm-delete onClick={() => { const touch = { ...game.touch }; delete touch[btn.id]; write({ buttons: buttons.filter(b => b.id !== btn.id), touch }); setView("edit"); setConfirmDel(false); }}>DELETE</button>
            <button style={BTN()} onClick={() => setConfirmDel(false)}>KEEP</button></span>
            : <button style={{ ...BTN(), color: C.red, alignSelf: "flex-start" }} onClick={() => setConfirmDel(true)}>DELETE BUTTON</button>}
        </div>
      </div>
    );
  }

  // ── edit: a tab per device ──
  const tabBtn = (id: "kbm" | "gamepad" | "touch", label: string) => <button key={id} style={{ ...BTN(tab === id), flex: 1, textAlign: "center" }} onClick={() => { setTab(id); setCapturing(null); }}>{label}</button>;
  const yours = (
    <div style={SEC}><span style={LBL}>Your buttons</span>
      {buttons.length === 0 && <span style={MINI}>None yet. A button of your own (Fire, Aim, Reload…) can play a move or aim, and scripts can listen to it.</span>}
      {buttons.map(b => (
        <div key={b.id} data-ctl-row={b.id} style={{ ...hl(b.id), gridTemplateColumns: "96px 1fr auto" }}>
          <span style={{ color: C.amber, fontSize: 11 }}>{b.name}{b.kind === "hold" ? " (hold)" : ""}</span>
          {tab === "touch" ? touchChip(b.id, b.name.toLowerCase()) : caps(tab, b.id)}
          <button style={BTN()} aria-label={`Open ${b.name}`} onClick={() => setView("button:" + b.id)}>›</button>
        </div>
      ))}
      <button style={{ ...BTN(), alignSelf: "flex-start" }} data-add-button onClick={addButton}>+ ADD BUTTON</button>
    </div>
  );
  const feelNum = (label: string, key: keyof ControlsFeel, step: number) => (
    <div style={ROW} key={key}><span style={{ color: C.t1, fontSize: 11 }}>{label}</span><input style={{ ...FIELD, width: 90 }} type="number" step={step} aria-label={label} value={feel[key] as number}
      onChange={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0) setFeel({ [key]: v } as Partial<ControlsFeel>); }} /></div>
  );
  const feelBool = (label: string, key: keyof ControlsFeel) => (
    <label key={key} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", color: C.t1, fontSize: 11 }}><input type="checkbox" aria-label={label} checked={feel[key] as boolean} onChange={e => setFeel({ [key]: e.target.checked } as Partial<ControlsFeel>)} />{label}</label>
  );
  const name = (s: string) => <span style={{ color: C.t1, fontSize: 11 }}>{s}</span>;
  function touchChip(id: string, label: string) {
    const v = gameTouch(game, id);
    return v?.on
      ? <span style={{ display: "flex", gap: 6, alignItems: "center" }}><span className="cc-k cc-touch cc-go" data-touch-chip={id} role="button" tabIndex={0} title="Select it on the phone"
          onClick={() => setTouchSel(id)} style={{ outline: touchSel === id ? "2px solid #fff" : "none", outlineOffset: 1 }}><Phone />{label}</span><span style={MINI}>on screen</span></span>
      : <span style={{ display: "flex", gap: 6, alignItems: "center" }}><span className="cc-k cc-add" data-touch-add={id} role="button" tabIndex={0} title="Put it on screen"
          onClick={() => { setTouch(id, { on: true }); setTouchSel(id); }}>+</span><span style={MINI}>not on screen</span></span>;
  }
  const fixedTouch = (label: string) => <span className="cc-k cc-touch cc-fixed" title="Always there"><Phone />{label}</span>;
  return (
    <div data-ctl-view="edit">
      <style>{CSS}</style>
      <div style={{ display: "flex", alignItems: "center", padding: "0 16px 8px" }}>
        <span style={{ ...LBL, flex: 1 }}>Edit controls</span>
        <button style={BTN()} data-ctl-done onClick={() => { setView("compact"); setCapturing(null); }}>DONE</button>
      </div>
      <div style={{ display: "flex", gap: 4, padding: "0 16px 10px" }}>
        {tabBtn("kbm", "KEYBOARD + MOUSE")}{tabBtn("gamepad", "GAMEPAD")}{tabBtn("touch", "TOUCH")}
      </div>
      {note && <div style={{ ...SEC, borderTop: "none", paddingTop: 0 }}><span style={{ color: C.amber, fontSize: 10 }}>{note}</span></div>}
      {captureHint}

      {tab === "kbm" && <>
        <div style={SEC}><span style={LBL}>Moving</span>
          {(["move_forward", "move_back", "move_left", "move_right", "jump", "run"] as KbmAction[]).map(a => <div key={a} data-ctl-row={a} style={hl(a)}>{name(ACTION_NAMES[a])}{caps("kbm", a)}</div>)}
          <div data-ctl-row="look" style={hl("look")}>{name("Look")}<span><span className="cc-k cc-fixed">mouse</span></span></div>
        </div>
        <div style={SEC}><span style={LBL}>Game</span>
          {(["interact", "bag", "pause"] as KbmAction[]).map(a => <div key={a} data-ctl-row={a} style={hl(a)}>{name(ACTION_NAMES[a])}{caps("kbm", a)}</div>)}
          <span style={MINI}>Esc always leaves Play.</span>
        </div>
        {yours}
        <div style={SEC}><span style={LBL}>Feel (the game's defaults)</span>
          {feelNum("Mouse speed", "mouseSpeed", 0.0005)}
          {feelBool("Invert mouse up / down", "mouseInvertY")}
        </div>
      </>}

      {tab === "gamepad" && <>
        <div style={SEC}><span style={LBL}>Moving</span>
          <div data-ctl-row="move" style={hl("move")}>{name("Move")}<span><span className="cc-k cc-both cc-fixed">left stick</span></span></div>
          <div data-ctl-row="look" style={hl("look")}>{name("Look")}<span><span className="cc-k cc-both cc-fixed">right stick</span></span></div>
          {(["jump", "run"] as PadAction[]).map(a => <div key={a} data-ctl-row={a} style={hl(a)}>{name(ACTION_NAMES[a])}{caps("gamepad", a)}</div>)}
          <span style={MINI}>Run also happens with the left stick pushed nearly all the way.</span>
        </div>
        <div style={SEC}><span style={LBL}>Game</span>
          {(["interact", "bag", "pause"] as PadAction[]).map(a => <div key={a} data-ctl-row={a} style={hl(a)}>{name(ACTION_NAMES[a])}{caps("gamepad", a)}</div>)}
        </div>
        {yours}
        <div style={SEC}><span style={LBL}>Feel (the game's defaults)</span>
          {feelNum("Look speed", "padLookRate", 0.25)}
          {feelNum("Deadzone (0 to 0.9)", "padDeadzone", 0.01)}
          {feelBool("Invert look up / down", "padInvertY")}
        </div>
      </>}

      {tab === "touch" && <>
        <TouchArranger game={game} buttons={buttons} sel={touchSel} setSel={setTouchSel} setTouch={setTouch} joystick={feel.joystick} />
        <div style={SEC}><span style={LBL}>Moving</span>
          <div data-ctl-row="move" style={hl("move")}>{name("Move")}<span>{fixedTouch("joystick")}</span></div>
          <div data-ctl-row="look" style={hl("look")}>{name("Look")}<span>{fixedTouch("drag the screen")}</span></div>
          <div data-ctl-row="jump" style={hl("jump")}>{name("Jump")}{touchChip("jump", "jump")}</div>
          <div data-ctl-row="run" style={hl("run")}>{name("Run (hold)")}<span>{fixedTouch("joystick pushed far")}</span></div>
        </div>
        <div style={SEC}><span style={LBL}>Game</span>
          <div data-ctl-row="interact" style={hl("interact")}>{name("Interact")}<span>{fixedTouch("tap anywhere")}</span></div>
          <div data-ctl-row="bag" style={hl("bag")}>{name("Bag")}{touchChip("bag", "bag")}</div>
          <div data-ctl-row="pause" style={hl("pause")}>{name("Pause")}<span>{fixedTouch("⚙ menu")}</span></div>
          <span style={MINI}>Joystick, drag, tap and the menu button are always there.</span>
        </div>
        {yours}
        <div style={SEC}><span style={LBL}>Feel (the game's defaults)</span>
          {feelNum("Look speed", "touchLook", 0.001)}
          {feelNum("Joystick size (px)", "joystick", 5)}
        </div>
      </>}

      <div style={SEC}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", color: C.t1, fontSize: 11 }}>
          <input type="checkbox" aria-label="Players can change" checked={game.playersCanChange !== false} onChange={e => write({ playersCanChange: e.target.checked ? undefined : false })} />
          Players can change keys and feel in the pause menu</label>
        <span style={MINI}>Their changes are saved on their own device and win over these. Prompts like "Press {"{interact}"}" show the key they use.</span>
        <button style={{ ...BTN(), alignSelf: "flex-start" }} onClick={() => onChange({ buttons, playersCanChange: game.playersCanChange })}>RESET KEYS, TOUCH AND FEEL</button>
      </div>
    </div>
  );
}

// ── gamepad picker ─────────────────────────────────────────────────────────────
/** Pick a gamepad button from a controller layout (no controller needed). XBOX /
 *  PLAYSTATION only changes the names: both pads report the same buttons. */
function PadPicker({ ps, setPs, current, mine, usedBy, onPick }: {
  ps: boolean; setPs: (ps: boolean) => void; current: number | null; mine: number[]; usedBy: (i: number) => string[]; onPick: (i: number) => void;
}) {
  const b = (i: number, wide = false) => {
    const others = usedBy(i), own = mine.includes(i) && i !== current;
    return <button key={i} data-pad-index={i} className={"cc-k " + (ps ? "cc-ps" : "cc-xb")} onClick={() => onPick(i)}
      title={`${both(i)}${others.length ? ` · also ${others.join(", ")}` : ""}${own ? " · already on this action" : ""}`}
      style={{ minWidth: wide ? 44 : 26, height: 24, outline: i === current ? "2px solid #fff" : others.length ? `1px solid ${C.amber}` : "none", outlineOffset: 1, opacity: own ? 0.55 : 1 }}>
      {ps ? PSN(i) : XB(i)}{own ? " ✓" : ""}</button>;
  };
  const col: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 };
  return (
    <div data-pad-picker style={{ display: "flex", flexDirection: "column", gap: 8, border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, background: "#1b1c21" }}>
      <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <button style={BTN(!ps)} onClick={() => setPs(false)}>XBOX</button>
        <button style={BTN(ps)} onClick={() => setPs(true)}>PLAYSTATION</button>
        <span style={MINI}>same buttons, its names shown</span>
      </span>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ display: "flex", gap: 3 }}>{b(6, true)}{b(4, true)}</span>
        <span style={{ display: "flex", gap: 3 }}>{b(5, true)}{b(7, true)}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 6 }}>
        <div style={col}>{b(12)}<span style={{ display: "flex", gap: 3 }}>{b(14)}{b(15)}</span>{b(13)}</div>
        <div style={col}>{b(8, true)}{b(9, true)}</div>
        <div style={col}>{b(3)}<span style={{ display: "flex", gap: 3 }}>{b(2)}{b(1)}</span>{b(0)}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ display: "flex", gap: 3, alignItems: "center" }}>{b(10, true)}<span style={MINI}>press left stick</span></span>
        <span style={{ display: "flex", gap: 3, alignItems: "center" }}><span style={MINI}>press right stick</span>{b(11, true)}</span>
      </div>
      <span style={MINI}>White ring: the one you're changing. Amber: another action uses it (both would fire).</span>
    </div>
  );
}

// ── touch arranger ─────────────────────────────────────────────────────────────
/** A phone screen: drag jump, bag and your on-screen buttons where thumbs go; the selected
 *  one gets a size slider and on / off. */
function TouchArranger({ game, buttons, sel, setSel, setTouch, joystick }: {
  game: GameInputConfig; buttons: GameButton[]; sel: string | null; setSel: (id: string) => void;
  setTouch: (id: string, patch: Partial<TouchSpot>) => void; joystick: number;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const items = [{ id: "jump", name: "JUMP", color: "#9dbdff" }, { id: "bag", name: "BAG", color: "#9dbdff" },
    ...buttons.map(b => ({ id: b.id, name: b.name.toUpperCase(), color: "#ffb86b" }))];
  const t = (id: string) => gameTouch(game, id) ?? DEFAULT_TOUCH[id] ?? { x: 70, y: 50, size: 56, on: false };
  const move = (e: React.PointerEvent) => {
    if (!drag || !box) return;
    const r = box.getBoundingClientRect();
    setTouch(drag, { x: Math.round(Math.max(4, Math.min(96, ((e.clientX - r.left) / r.width) * 100))), y: Math.round(Math.max(8, Math.min(92, ((e.clientY - r.top) / r.height) * 100))) });
  };
  const s = sel ? t(sel) : null;
  return (
    <div style={SEC}><span style={LBL}>Drag the buttons where thumbs go</span>
      <div ref={setBox} data-phone onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}
        style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", background: "#1d1f26", border: "2px solid #3a3f4a", borderRadius: 12, touchAction: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: "6%", bottom: "8%", width: joystick * 0.9, height: joystick * 0.9, maxWidth: "30%", borderRadius: "50%", border: "2px solid #98a2b8", opacity: .7 }} title="Move joystick (always there)" />
        <div style={{ position: "absolute", right: "3%", top: "6%", padding: "0 6px", border: "1px solid #98a2b8", borderRadius: 4, color: "#98a2b8", fontSize: 10 }}>⚙</div>
        <div style={{ ...MINI, position: "absolute", left: 0, right: 0, top: "40%", textAlign: "center" }}>tap anywhere = Interact · drag = look</div>
        {items.filter(it => t(it.id).on).map(it => {
          const v = t(it.id), size = v.size * 0.45;
          return <div key={it.id} data-touch={it.id} onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); setDrag(it.id); setSel(it.id); }}
            style={{ position: "absolute", left: `${v.x}%`, top: `${v.y}%`, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#dde3f0", cursor: "grab", userSelect: "none", fontFamily: "monospace",
              background: it.color + "33", border: `2px solid ${it.color}`, outline: sel === it.id ? "2px solid #fff" : "none", outlineOffset: 2 }}>{it.name}</div>;
        })}
      </div>
      {s && sel && <div style={{ display: "flex", flexDirection: "column", gap: 6, border: `1px solid ${C.line}`, borderRadius: 6, padding: 8 }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", color: C.t1, fontSize: 11 }}><input type="checkbox" aria-label="Show on screen" checked={s.on} onChange={e => setTouch(sel, { on: e.target.checked })} />show {items.find(i => i.id === sel)?.name} on screen</label>
        <div style={ROW}><span style={{ color: C.t1, fontSize: 11 }}>Size</span><input type="range" aria-label="Button size" min={36} max={110} value={s.size} onChange={e => setTouch(sel, { size: Number(e.target.value) })} /></div>
        <span style={MINI}>x {s.x}% · y {s.y}% of the screen</span>
      </div>}
    </div>
  );
}
