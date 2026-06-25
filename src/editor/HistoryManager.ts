import type { WorldState } from "@/world/WorldState";

/** Entity kinds tracked by the change journal. "spawn" is the world-level default spawn. */
export type ChangeKind =
  | "floor" | "wall" | "node" | "platform" | "stair"
  | "object" | "triggerVolume" | "group" | "spawn" | "transition";

/**
 * One entity's before/after for a single transaction. `null` = entity absent
 * (so before=null → an add, after=null → a remove, both set → an update).
 * `before`/`after` are deep clones of just that entity, not the whole world.
 */
export interface Change {
  kind:    ChangeKind;
  zoneId?: string;
  id?:     string;
  before:  unknown | null;
  after:   unknown | null;
}

export interface HistoryEntry {
  label:   string;
  changes: Change[];
}

const MAX = 100;

/**
 * Command-stack undo/redo. WorldState records one HistoryEntry per transaction
 * (a journal of the entities it touched); undo/redo replay those per-entity diffs
 * via WorldState._applyChanges — no whole-world snapshots.
 */
export class HistoryManager {
  private _undo: HistoryEntry[] = [];
  private _redo: HistoryEntry[] = [];

  constructor(private readonly _world: WorldState) {}

  /** Called by WorldState.commitTransaction. */
  push(entry: HistoryEntry): void {
    if (entry.changes.length === 0) return;
    if (this._undo.length >= MAX) this._undo.shift();
    this._undo.push(entry);
    this._redo = [];
  }

  undo(): void {
    const e = this._undo.pop();
    if (!e) return;
    this._redo.push(e);
    this._world._applyChanges(e.changes, "before");
  }

  redo(): void {
    const e = this._redo.pop();
    if (!e) return;
    this._undo.push(e);
    this._world._applyChanges(e.changes, "after");
  }

  get canUndo(): boolean { return this._undo.length > 0; }
  get canRedo(): boolean { return this._redo.length > 0; }

  clear(): void { this._undo = []; this._redo = []; }
}
