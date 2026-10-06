import { useEffect, useState } from "react";
import type { EventBus } from "@/core/EventBus";
import type { AudioMix } from "@/types";
import { prettyKey } from "@/input/bindings";
import { ACTION_NAMES, gameFeel, gameKbm, loadPlayerControls, savePlayerControls, type GameInputConfig, type KbmAction, type PlayerControls } from "@/input/gameControls";

const ITEMS = ["Resume", "Exit"] as const;

const DEFAULT_MIX: AudioMix = { master: 1, music: 1, sfx: 1, ambient: 1 };
const MIX_KEY = "audio_mix";

function loadMix(): AudioMix {
  try {
    const raw = localStorage.getItem(MIX_KEY);
    if (raw) return { ...DEFAULT_MIX, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_MIX };
}

interface Props {
  bus:      EventBus;
  onResume: () => void;
  onExit:   () => void;
  /** Phase 89: the game's controls (and its id, which keys the player's own changes). */
  game?:    GameInputConfig;
  gameId?:  string;
}

/**
 * Minimal pause menu (Phase 24b). Opened/closed by App via action:cancel
 * (gamepad Start, kbm Enter, touch ⚙). While open the ControlSchemeManager is
 * in menu mode: menu:nav (kbm arrows/W/S, d-pad, left-stick flick) moves the
 * highlight, confirm (A / E / Enter /
 * tap) activates. Mouse/touch can also click the buttons or the backdrop
 * (backdrop = resume). Esc keeps its direct exit-preview path.
 */
export function PauseMenu({ bus, onResume, onExit, game, gameId }: Props) {
  const [selected, setSelected] = useState(0);
  const [mix, setMix] = useState<AudioMix>(loadMix);

  const setBus = (key: keyof AudioMix, value: number) => {
    const next = { ...mix, [key]: value };
    setMix(next);
    try { localStorage.setItem(MIX_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    bus.emit("audio:player-mix", { mix: next });
  };

  // Re-subscribed whenever `selected` changes so the confirm closure is never
  // stale (updater-side effects would double-fire under StrictMode).
  useEffect(() => {
    const unsubs = [
      bus.on("menu:nav", ({ dir }) =>
        setSelected(s => (s + dir + ITEMS.length) % ITEMS.length)),
      bus.on("action:confirm", () => (selected === 0 ? onResume : onExit)()),
    ];
    return () => unsubs.forEach(u => u());
  }, [bus, onResume, onExit, selected]);

  return (
    <div
      onClick={onResume}
      style={{
        position: "absolute", inset: 0, zIndex: 110,
        background: "rgba(5,8,14,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "rgba(10,14,22,0.95)", border: "1px solid rgba(100,160,255,0.3)",
          borderRadius: 8, padding: "24px 40px", minWidth: 220,
          display: "flex", flexDirection: "column", gap: 10,
        }}
      >
        <div style={{
          color: "#c8d8ff", fontSize: 14, fontFamily: "monospace",
          letterSpacing: 2, textAlign: "center", marginBottom: 6,
        }}>
          PAUSED
        </div>

        {/* Player volume mixer (Phase 36) — persists to localStorage, multiplies over
            the scene's authored mix via audio:player-mix. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "2px 0 8px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          {(["master", "music", "sfx", "ambient"] as const).map(key => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 58, fontSize: 10, fontFamily: "monospace", color: "#8890a0", letterSpacing: 1, textTransform: "uppercase" }}>{key}</span>
              <input type="range" min={0} max={1} step={0.01} value={mix[key]}
                onChange={e => setBus(key, Number(e.target.value))}
                style={{ flex: 1, accentColor: "#80aaff" }} />
              <span style={{ width: 32, textAlign: "right", fontSize: 10, fontFamily: "monospace", color: "#8890a0" }}>{Math.round(mix[key] * 100)}%</span>
            </div>
          ))}
        </div>

        {game?.playersCanChange !== false && <PlayerControlsSection bus={bus} game={game} gameId={gameId} />}

        {ITEMS.map((label, i) => (
          <button
            key={label}
            onClick={i === 0 ? onResume : onExit}
            onMouseEnter={() => setSelected(i)}
            style={{
              padding: "8px 16px", borderRadius: 6, cursor: "pointer",
              fontSize: 12, fontFamily: "monospace", letterSpacing: 1,
              background: selected === i ? "rgba(80,140,255,0.25)" : "rgba(40,40,40,0.9)",
              border: `1px solid ${selected === i ? "rgba(80,140,255,0.6)" : "rgba(255,255,255,0.12)"}`,
              color: selected === i ? "#80aaff" : "#9090a0",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Phase 89: a player's own keys and mouse speed for this game (when the game allows it).
 * Saved on this device per game; win over the game's; take effect at once.
 */
function PlayerControlsSection({ bus, game, gameId }: { bus: EventBus; game?: GameInputConfig; gameId?: string }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<PlayerControls>(() => loadPlayerControls(gameId));
  const [capturing, setCapturing] = useState<string | null>(null);
  const save = (next: PlayerControls) => { setMine(next); savePlayerControls(gameId, next); bus.emit("input:player-controls", {}); };
  const rows: Array<{ id: string; name: string; game: string[] }> = [
    ...(["move_forward", "move_back", "move_left", "move_right", "jump", "run", "interact", "bag"] as KbmAction[]).map(a => ({ id: a, name: ACTION_NAMES[a], game: gameKbm(game, a) })),
    ...(game?.buttons ?? []).map(b => ({ id: b.id, name: b.name, game: b.kbm })),
  ];
  // The next key (or a mouse button in the box) becomes this action's key. Window-capture
  // phase, so the press never reaches the game (E would otherwise also confirm the menu).
  useEffect(() => {
    if (!capturing) return;
    const done = (code: string | null) => {
      setCapturing(null);
      if (code) save({ ...mine, kbm: { ...mine.kbm, [capturing]: [code] } });
    };
    const onKey = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); done(e.code === "Escape" ? null : e.code); };
    const onMouse = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("[data-pause-mousezone]")) { e.preventDefault(); e.stopPropagation(); done(`Mouse${e.button}`); }
    };
    window.addEventListener("keydown", onKey, true); window.addEventListener("mousedown", onMouse, true);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("mousedown", onMouse, true); };
  }, [capturing]);   // eslint-disable-line react-hooks/exhaustive-deps
  const keys = (r: { id: string; game: string[] }) => (mine.kbm?.[r.id] ?? r.game).map(prettyKey).join(", ") || "none";
  const speed = mine.feel?.mouseSpeed ?? gameFeel(game).mouseSpeed;
  const S: React.CSSProperties = { fontSize: 10, fontFamily: "monospace", color: "#c2cadb" };
  const B: React.CSSProperties = { padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "monospace", background: "rgba(40,40,40,0.9)", border: "1px solid rgba(255,255,255,0.15)", color: "#dde3f0" };
  return (
    <div data-pause-controls style={{ display: "flex", flexDirection: "column", gap: 6, padding: "2px 0 8px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
      <button style={{ ...B, alignSelf: "flex-start" }} onClick={() => setOpen(o => !o)}>{open ? "▾" : "▸"} CONTROLS</button>
      {open && <>
        {rows.map(r => (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "110px 1fr auto", gap: 6, alignItems: "center" }}>
            <span style={S}>{r.name}</span>
            <span style={{ ...S, color: mine.kbm?.[r.id] ? "#ffb86b" : "#dde3f0" }} title={mine.kbm?.[r.id] ? `yours (the game's: ${r.game.map(prettyKey).join(", ")})` : "the game's"}>{capturing === r.id ? "press a key…" : keys(r)}</span>
            <button style={B} aria-label={`Change ${r.name}`} onClick={() => setCapturing(r.id)}>CHANGE</button>
          </div>
        ))}
        {capturing && <div data-pause-mousezone style={{ ...S, border: "1px dashed rgba(80,140,255,0.5)", borderRadius: 6, padding: 6, textAlign: "center", color: "#9dbdff" }}>or click here with a mouse button · Esc cancels</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...S, width: 110 }}>Mouse speed</span>
          <input type="range" aria-label="Mouse speed" min={0.0005} max={0.008} step={0.0005} value={speed} style={{ flex: 1, accentColor: "#80aaff" }}
            onChange={e => save({ ...mine, feel: { ...mine.feel, mouseSpeed: Number(e.target.value) } })} />
          <span style={{ ...S, width: 44, textAlign: "right" }}>{speed}</span>
        </div>
        {(mine.kbm && Object.keys(mine.kbm).length > 0 || mine.feel) && <button style={{ ...B, alignSelf: "flex-start" }} onClick={() => save({})}>USE THE GAME'S CONTROLS</button>}
      </>}
    </div>
  );
}
