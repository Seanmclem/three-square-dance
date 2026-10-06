import { DEFAULT_BINDINGS, type BindingsConfig } from "./bindings";

/**
 * Phase 89: a game's controls, in one place (the Controls page on the editor's main menu,
 * saved in game.json `input`). Every built-in action's keys and gamepad buttons, the
 * game's own buttons (Fire, Aim …), the touch layout, and the "feel" defaults (mouse speed,
 * deadzone …). A player's own changes (the pause menu, saved on their device per game)
 * win over the game's when the game allows it.
 *
 * `effectiveBindings` turns all of that into the BindingsConfig the input sources read.
 */

export type KbmAction = "move_forward" | "move_back" | "move_left" | "move_right" | "jump" | "run" | "interact" | "bag" | "pause";
export type PadAction = "jump" | "run" | "interact" | "bag" | "pause";
export const KBM_ACTIONS: KbmAction[] = ["move_forward", "move_back", "move_left", "move_right", "jump", "run", "interact", "bag", "pause"];
export const PAD_ACTIONS: PadAction[] = ["jump", "run", "interact", "bag", "pause"];
export const ACTION_NAMES: Record<KbmAction, string> = {
  move_forward: "Move forward", move_back: "Move back", move_left: "Move left", move_right: "Move right",
  jump: "Jump", run: "Run (hold)", interact: "Interact", bag: "Bag", pause: "Pause",
};

/** What a button does by itself (no script): play one of the player's moves, or aim. */
export type ButtonDoes = { type: "move"; move: string } | { type: "aim" };

export interface GameButton {
  id: string;
  name: string;
  kind: "press" | "hold";      // hold: its move plays from press to release; aim needs hold
  kbm: string[];               // KeyboardEvent.code, or "Mouse0" / "Mouse1" / "Mouse2" …
  gamepad: number[];           // standard-mapping button indices (RT 7, LT 6 …)
  does?: ButtonDoes | null;
}

export interface TouchSpot { x: number; y: number; size: number; on: boolean }   // % of the screen; size in px

export interface ControlsFeel {
  mouseSpeed: number; mouseInvertY: boolean;
  padLookRate: number; padDeadzone: number; padInvertY: boolean;
  touchLook: number; joystick: number;
}

export interface GameInputConfig {
  /** v4.79.78: the interact key / pad button only. Read as the "interact" binding. */
  interact?: { kbm?: string[]; gamepadButtons?: number[] };
  bindings?: { kbm?: Partial<Record<KbmAction, string[]>>; gamepad?: Partial<Record<PadAction, number[]>> };
  buttons?: GameButton[];
  touch?: Record<string, TouchSpot>;       // "jump", "bag", and button ids
  feel?: Partial<ControlsFeel>;
  playersCanChange?: boolean;              // default true
}

/** A player's own changes for one game (device-local). */
export interface PlayerControls { kbm?: Record<string, string[]>; feel?: Partial<ControlsFeel> }

export const DEFAULT_FEEL: ControlsFeel = {
  mouseSpeed: DEFAULT_BINDINGS.kbm.lookSensitivity, mouseInvertY: false,
  padLookRate: DEFAULT_BINDINGS.gamepad.lookRate, padDeadzone: DEFAULT_BINDINGS.gamepad.deadzone, padInvertY: DEFAULT_BINDINGS.gamepad.invertLookY,
  touchLook: DEFAULT_BINDINGS.touch.lookSensitivity, joystick: DEFAULT_BINDINGS.touch.joystickRadius,
};

export const DEFAULT_TOUCH: Record<string, TouchSpot> = {
  jump: { x: 88, y: 78, size: 72, on: true },
  bag:  { x: 94, y: 22, size: 48, on: true },
};

/** A new game starts with these (user, 2026-10-06): Fire and Aim, ready to wire up. */
export const NEW_GAME_INPUT: GameInputConfig = {
  buttons: [
    { id: "fire", name: "Fire", kind: "press", kbm: ["Mouse0"], gamepad: [7], does: { type: "move", move: "attack" } },
    { id: "aim",  name: "Aim",  kind: "hold",  kbm: ["Mouse2"], gamepad: [6], does: { type: "aim" } },
  ],
};

const DEFAULT_KBM: Record<KbmAction, string[]> = {
  move_forward: DEFAULT_BINDINGS.kbm.move.forward, move_back: DEFAULT_BINDINGS.kbm.move.back,
  move_left: DEFAULT_BINDINGS.kbm.move.left, move_right: DEFAULT_BINDINGS.kbm.move.right,
  jump: DEFAULT_BINDINGS.kbm.jump, run: DEFAULT_BINDINGS.kbm.run, interact: DEFAULT_BINDINGS.kbm.interact,
  bag: DEFAULT_BINDINGS.kbm.bag, pause: DEFAULT_BINDINGS.kbm.cancel,
};
const DEFAULT_PAD: Record<PadAction, number[]> = {
  jump: DEFAULT_BINDINGS.gamepad.buttons.jump, run: [], interact: DEFAULT_BINDINGS.gamepad.buttons.interact,
  bag: DEFAULT_BINDINGS.gamepad.buttons.bag, pause: DEFAULT_BINDINGS.gamepad.buttons.cancel,
};

/** The game's keys for an action (its own, else today's interact field, else the default). */
export function gameKbm(game: GameInputConfig | null | undefined, a: KbmAction): string[] {
  return game?.bindings?.kbm?.[a] ?? (a === "interact" ? game?.interact?.kbm : undefined) ?? DEFAULT_KBM[a];
}
export function gamePad(game: GameInputConfig | null | undefined, a: PadAction): number[] {
  return game?.bindings?.gamepad?.[a] ?? (a === "interact" ? game?.interact?.gamepadButtons : undefined) ?? DEFAULT_PAD[a];
}
export const gameFeel = (game: GameInputConfig | null | undefined): ControlsFeel => ({ ...DEFAULT_FEEL, ...game?.feel });
export const gameTouch = (game: GameInputConfig | null | undefined, id: string): TouchSpot | undefined => game?.touch?.[id] ?? DEFAULT_TOUCH[id];

/**
 * The bindings a session plays with: defaults ← the game's ← the player's own (when the
 * game lets players change them). Menu keys (confirm, menu navigation) stay as they were.
 */
export function effectiveBindings(game: GameInputConfig | null | undefined, player?: PlayerControls | null): BindingsConfig {
  const mine = game?.playersCanChange === false ? null : player ?? null;
  const k = (a: KbmAction) => mine?.kbm?.[a] ?? gameKbm(game, a);
  const feel = { ...gameFeel(game), ...mine?.feel };
  const b = structuredClone(DEFAULT_BINDINGS);
  b.kbm.move = { forward: k("move_forward"), back: k("move_back"), left: k("move_left"), right: k("move_right") };
  b.kbm.jump = k("jump"); b.kbm.run = k("run"); b.kbm.interact = k("interact"); b.kbm.bag = k("bag"); b.kbm.cancel = k("pause");
  b.kbm.lookSensitivity = feel.mouseSpeed;
  b.kbm.invertLookY = feel.mouseInvertY;
  b.gamepad.buttons = { ...b.gamepad.buttons, jump: gamePad(game, "jump"), run: gamePad(game, "run"), interact: gamePad(game, "interact"), bag: gamePad(game, "bag"), cancel: gamePad(game, "pause") };
  b.gamepad.lookRate = feel.padLookRate; b.gamepad.deadzone = feel.padDeadzone; b.gamepad.invertLookY = feel.padInvertY;
  b.touch.lookSensitivity = feel.touchLook; b.touch.joystickRadius = feel.joystick;
  b.buttons = (game?.buttons ?? []).map(x => ({ id: x.id, name: x.name, kind: x.kind, kbm: mine?.kbm?.[x.id] ?? x.kbm, gamepad: x.gamepad, does: x.does ?? null }));
  b.touch.spots = Object.fromEntries(["jump", "bag", ...(game?.buttons ?? []).map(x => x.id)].map(id => [id, gameTouch(game, id) ?? { x: 70, y: 50, size: 56, on: false }]));
  return b;
}

// ── the editor's list of buttons (the Script panel's "when the player presses …") ──
let uiButtons: Array<{ id: string; name: string }> = [];
/** The game's buttons plus the built-ins a script can listen to. App updates it. */
export function setUiGameButtons(game: GameInputConfig | null | undefined): void {
  uiButtons = [...(game?.buttons ?? []).map(b => ({ id: b.id, name: b.name })), { id: "jump", name: "Jump" }, { id: "run", name: "Run" }, { id: "interact", name: "Interact" }];
}
export const uiGameButtons = (): Array<{ id: string; name: string }> => uiButtons.length ? uiButtons : [{ id: "jump", name: "Jump" }, { id: "run", name: "Run" }, { id: "interact", name: "Interact" }];

// ── a player's own changes (device-local, per game) ───────────────────────────
const PLAYER_KEY = "worldbuilder.playerControls.v1";
export function loadPlayerControls(gameId: string | null | undefined): PlayerControls {
  if (!gameId) return {};
  try { return (JSON.parse(localStorage.getItem(PLAYER_KEY) ?? "{}") as Record<string, PlayerControls>)[gameId] ?? {}; } catch { return {}; }
}
export function savePlayerControls(gameId: string | null | undefined, pc: PlayerControls): void {
  if (!gameId) return;
  try {
    const all = JSON.parse(localStorage.getItem(PLAYER_KEY) ?? "{}") as Record<string, PlayerControls>;
    all[gameId] = pc;
    localStorage.setItem(PLAYER_KEY, JSON.stringify(all));
  } catch { /* storage blocked: the change lasts this session only */ }
}
