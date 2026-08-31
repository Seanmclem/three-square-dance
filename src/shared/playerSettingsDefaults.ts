import type { PlayerSettings } from "@/types";

/** The stock character (Phase 68) — the base layer under game defaults and
 *  scene overrides. Single source for the literal that was previously
 *  repeated in WorldState's seed blocks. */
export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  cameraMode: "fps", moveSpeed: 6, jumpHeight: 1.2, fov: 75,
  thirdPersonDistance: 4, thirdPersonHeight: 2, jumpAnimSpeed: 1, characterScale: 1,
};

/** Phase 68 — the per-PAGE override groups. A scene "overrides" a page iff any
 *  of that page's fields is present in its sparse playerSettings layer; the
 *  override switch copies the page's effective values in (ON) or deletes them
 *  (OFF). The Controls page is device-local and has no fields here. */
export const SETTINGS_PAGES = {
  movement:  ["moveSpeed", "jumpHeight", "climbSpeed"],
  camera:    ["cameraMode", "fov", "fpsEyeHeight", "thirdPersonDistance", "thirdPersonHeight", "thirdPersonPitch"],
  character: ["modelAssetId", "characterScale", "fpsCharacterScale", "jumpAnimSpeed", "animClips", "bagStyle"],
  sounds:    ["jumpSound", "landSound", "footstepSound", "footstepDistance", "jumpVolume", "landVolume", "footstepVolume"],
} as const satisfies Record<string, readonly (keyof PlayerSettings)[]>;

export type SettingsPage = keyof typeof SETTINGS_PAGES;

export function pageOverridden(overrides: Partial<PlayerSettings> | undefined, page: SettingsPage): boolean {
  if (!overrides) return false;
  return SETTINGS_PAGES[page].some(k => overrides[k] !== undefined);
}

/** defaults ← game defaults ← scene overrides, per field. */
export function resolvePlayerSettings(
  game: PlayerSettings | undefined,
  overrides: Partial<PlayerSettings> | undefined,
): PlayerSettings {
  return { ...DEFAULT_PLAYER_SETTINGS, ...game, ...overrides };
}
