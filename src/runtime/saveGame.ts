import type { JsonValue } from "@/types";

/**
 * Runtime game save — namespaced per manifest id so two different games on
 * the same origin never clobber each other, and neither touches the editor's
 * keys (`worldeditor_autosave`, `worldeditor_gamesave`).
 */
export interface RuntimeSave {
  version:       1;
  ts:            number;
  sceneId:       string;
  state:         Record<string, JsonValue>;
  firedOneShots: string[];
  pose?:         { x: number; y: number; z: number; facing: number };
}

const key = (manifestId: string) => `runtime_gamesave:${manifestId}`;

export function writeRuntimeSave(manifestId: string, save: Omit<RuntimeSave, "version" | "ts">): void {
  const blob: RuntimeSave = { version: 1, ts: Date.now(), ...save };
  localStorage.setItem(key(manifestId), JSON.stringify(blob));
}

export function loadRuntimeSave(manifestId: string): RuntimeSave | null {
  const raw = localStorage.getItem(key(manifestId));
  if (!raw) return null;
  try {
    const blob = JSON.parse(raw) as RuntimeSave;
    if (blob.version !== 1 || typeof blob.sceneId !== "string") return null;
    return blob;
  } catch {
    return null;
  }
}

export function clearRuntimeSave(manifestId: string): void {
  localStorage.removeItem(key(manifestId));
}
