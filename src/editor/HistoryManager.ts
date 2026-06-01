import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { SceneFile } from "@/types";

interface HistoryEntry {
  label:  string;
  before: SceneFile;
  after:  SceneFile;
}

const MAX = 50;

export class HistoryManager {
  private _undo:        HistoryEntry[] = [];
  private _redo:        HistoryEntry[] = [];
  private _batching     = false;
  private _batchLabel   = "";
  private _batchBefore: SceneFile | null = null;

  constructor(
    private readonly _world: WorldState,
    private readonly _bus:   EventBus,
  ) {}

  /** Wrap a single logical action — captures before/after automatically. */
  record(label: string, fn: () => void): void {
    if (this._batching) { fn(); return; }
    const before = this._snap();
    fn();
    this._push({ label, before, after: this._snap() });
  }

  /** Start a multi-step batch (e.g. wall tool: node + wall). */
  beginBatch(label: string): void {
    if (this._batching) return;
    this._batching    = true;
    this._batchLabel  = label;
    this._batchBefore = this._snap();
  }

  /** Commit the batch as a single undo step. */
  commitBatch(): void {
    if (!this._batching || !this._batchBefore) return;
    this._batching = false;
    this._push({ label: this._batchLabel, before: this._batchBefore, after: this._snap() });
    this._batchBefore = null;
  }

  /** Discard a started batch without recording (e.g. Escape during tool use). */
  cancelBatch(): void {
    this._batching    = false;
    this._batchBefore = null;
  }

  undo(): void {
    const e = this._undo.pop();
    if (!e) return;
    this._redo.push(e);
    this._restore(e.before);
  }

  redo(): void {
    const e = this._redo.pop();
    if (!e) return;
    this._undo.push(e);
    this._restore(e.after);
  }

  get canUndo(): boolean { return this._undo.length > 0; }
  get canRedo():  boolean { return this._redo.length > 0; }

  clear(): void { this._undo = []; this._redo = []; }

  private _snap(): SceneFile {
    return JSON.parse(JSON.stringify(this._world.toJSON())) as SceneFile;
  }

  private _push(e: HistoryEntry): void {
    if (this._undo.length >= MAX) this._undo.shift();
    this._undo.push(e);
    this._redo = [];
  }

  private _restore(snapshot: SceneFile): void {
    this._world.loadFromJSON(snapshot);
    this._bus.emit("object:deselected", {});
    this._bus.emit("history:restore", {});
  }
}
