import type { EventBus } from "@/core/EventBus";
import type { DialogueTreeDef, DialogueOption } from "@/types";
import type { ScriptEngine } from "./ScriptEngine";

/**
 * Owns the walk through a DialogueTreeDef during preview/game. The overlay is a
 * per-node renderer: the runner emits `dialogue:show` for each node (options
 * pre-filtered by their conditions), the overlay emits `dialogue:choose` when the
 * player picks one; the runner dispatches the option's actions through the
 * ScriptEngine and advances. Close ownership stays with the overlay/shells —
 * their `dialogue:closed` tells the runner to fire `on_dialogue_end`.
 */
export class DialogueRunner {
  private _tree: DialogueTreeDef | null = null;
  private _visible: DialogueOption[] = [];
  // Option ids picked earlier in THIS conversation run — looping back to a node
  // re-shows them de-emphasized (still selectable). Reset per conversation.
  private _picked = new Set<string>();
  private _unsubscribers: (() => void)[] = [];

  constructor(
    private readonly _bus:    EventBus,
    private readonly _engine: ScriptEngine,
  ) {}

  attach(): void {
    const onChoose = ({ index }: { index: number }) => this._choose(index);
    const onClosed = () => this._end();
    this._bus.on("dialogue:choose", onChoose);
    this._bus.on("dialogue:closed", onClosed);
    this._unsubscribers.push(
      () => this._bus.off("dialogue:choose", onChoose),
      () => this._bus.off("dialogue:closed", onClosed),
    );
  }

  detach(): void {
    for (const unsub of this._unsubscribers) unsub();
    this._unsubscribers = [];
    this._tree = null;
    this._visible = [];
    this._picked.clear();
  }

  start(tree: DialogueTreeDef): void {
    this._tree = tree;
    this._picked.clear();
    this._showNode(tree.startNode);
  }

  private _showNode(id: string): void {
    const tree = this._tree;
    if (!tree) return;
    const node = tree.nodes.find(n => n.id === id);
    if (!node) {
      console.warn(`[DialogueRunner] node '${id}' not found in dialogue '${tree.id}'`);
      this._tree = null;
      this._visible = [];
      return;
    }
    // Conditions re-checked on every node display, so an option effect (set flag)
    // immediately gates later options in the same conversation.
    this._visible = node.options.filter(o => this._engine.checkConditions(o.conditions ?? []));
    this._bus.emit("dialogue:show", {
      speaker:  node.speaker ?? tree.speaker,
      lines:    node.lines.length ? node.lines : [""],
      portrait: node.portrait ?? tree.portrait,
      // hasNext computed against existing nodes ⇒ a dangling `next` degrades to "end"
      options: this._visible.map(o => ({
        text:    o.text,
        hasNext: !!o.next && tree.nodes.some(n => n.id === o.next),
        picked:  this._picked.has(o.id),
      })),
    });
  }

  private _choose(index: number): void {
    const tree = this._tree;
    const opt  = this._visible[index];
    if (!tree || !opt) return;
    this._picked.add(opt.id);
    this._engine.runActions(opt.actions ?? []);
    // An effect may itself show_dialogue → runner restarted on a new tree; don't
    // step the old one. Otherwise advance if the next node exists; a missing/absent
    // next means the overlay saw hasNext:false and closes itself (→ dialogue:closed).
    if (this._tree !== tree) return;
    if (opt.next && tree.nodes.some(n => n.id === opt.next)) this._showNode(opt.next);
  }

  private _end(): void {
    const tree = this._tree;
    if (!tree) return;
    this._tree = null;
    this._visible = [];
    this._picked.clear();
    this._engine.fire("on_dialogue_end", tree.id);
  }
}
