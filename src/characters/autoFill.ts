/**
 * Phase 86: AUTO FILL. Guess which clip plays each move from the clip names alone.
 *
 * The old guess (exact name, then the first name that CONTAINS the move word) picks
 * `Fish_Cast_Idle_Loop` for idle on UAL2. This scores whole words instead: a move's
 * words (or a synonym) must appear as whole words; loops are preferred for looping
 * moves; backward / sideways variants and clips tied to a prop or style (sword, zombie,
 * fish …) are pushed down; ties go to the shorter name.
 */

/** The moves the engine plays by itself (§3 of the Phase 86 plan). */
export const BUILT_IN_MOVES = ["idle", "walk", "run", "jump", "jump_idle", "jump_land", "fall", "climb", "attack", "hit", "death", "talk"] as const;
export type BuiltInMove = typeof BUILT_IN_MOVES[number];

/** Moves that loop (the rest are one-shots). */
export const LOOPING_MOVES = new Set<string>(["idle", "walk", "run", "jump_idle", "fall", "climb", "talk"]);

/** Word groups per move, best first; a clip matches a group when it has all its words. */
const GROUPS: Record<BuiltInMove, string[][]> = {
  idle:      [["idle"]],
  walk:      [["walk"]],
  run:       [["run"], ["jog"], ["sprint"], ["gallop"]],
  jump:      [["jump", "start"], ["jump"]],
  jump_idle: [["jump", "loop"], ["jump", "idle"], ["fall"], ["air"]],
  jump_land: [["jump", "land"], ["land"]],
  fall:      [["fall"], ["falling"]],
  climb:     [["climb", "up"], ["climb"]],
  attack:    [["attack"], ["bite"], ["punch"], ["slash"], ["kick"]],
  hit:       [["hit"]],
  death:     [["death"], ["die"], ["dead"]],
  talk:      [["talk"], ["talking"]],
};

/** Words that mark a sideways / backward variant of a move. */
const DIRECTIONAL = new Set(["bwd", "back", "backward", "l", "r", "left", "right", "lean", "leanl", "leanr", "strafe"]);
/** Words that tie a clip to a prop, a pose or a style: fine when asked for, not as a default. */
const STYLED = new Set([
  "sword", "shield", "bow", "gun", "pistol", "rifle", "carry", "lantern", "torch", "zombie", "fish", "farm",
  "spell", "crouch", "crawl", "swim", "sitting", "sit", "counter", "mining", "push", "driving", "fold", "folded",
  "arms", "phone", "rail", "ninja", "wall", "wallrun", "liftair", "melee", "tired", "formal", "talking", "look",
  "lookaround", "paper", "rock", "scissors", "shoot", "aim", "reload", "drink", "injured", "headlow",
  "no", "yes", "to", "flip", "double", "turn", "lift", "air",
]);

/** Split a clip name into lowercase words: `Jog_Fwd_LeanL_Loop` → jog, fwd, lean, l, loop. */
export function clipWords(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(w => w.toLowerCase());
}

/** The best clip for `move` among `clips`, or null when nothing fits. */
export function guessClip(move: string, clips: readonly string[]): string | null {
  const groups = (GROUPS as Record<string, string[][]>)[move] ?? [[move.toLowerCase()]];
  const asked = new Set(groups.flat());
  let best: { name: string; score: number } | null = null;
  for (const name of clips) {
    const words = clipWords(name);
    const set = new Set(words);
    const g = groups.findIndex(group => group.every(w => set.has(w)));
    if (g < 0) continue;
    let score = 100 - g * 10;
    if (LOOPING_MOVES.has(move) && set.has("loop")) score += 5;
    for (const w of set) {
      if (asked.has(w)) continue;
      if (DIRECTIONAL.has(w)) score -= 30;
      else if (STYLED.has(w)) score -= 30;
    }
    const extra = words.filter(w => !asked.has(w) && w !== "loop" && !/^\d+$/.test(w)).length;
    score -= extra * 2;
    if (!best || score > best.score || (score === best.score && name.length < best.name.length)
      || (score === best.score && name.length === best.name.length && name < best.name)) best = { name, score };
  }
  // A guess that only fits through prop / style words (UAL2's LiftAir_Fall_Air_Loop for
  // fall) is worse than none: leave the move empty for the user.
  return best && best.score >= MIN_SCORE ? best.name : null;
}

const MIN_SCORE = 50;

/** AUTO FILL: a guess for every built-in move (null where nothing fits). */
export function autoFillMoves(clips: readonly string[]): Record<BuiltInMove, string | null> {
  const out = {} as Record<BuiltInMove, string | null>;
  for (const m of BUILT_IN_MOVES) out[m] = guessClip(m, clips);
  return out;
}

/** The guess the engine used before Phase 86 (exact, then "contains"), kept so existing
 *  games keep their picks. */
export function legacyGuess(move: string, clips: readonly string[]): string | null {
  const lc = move.toLowerCase();
  return clips.find(c => c.toLowerCase() === lc) ?? clips.find(c => c.toLowerCase().includes(lc)) ?? null;
}
