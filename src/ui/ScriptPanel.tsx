import { useState, useEffect, useRef, Fragment } from "react";
import { gameState } from "@/scripting/GameState";
import type {
  ScriptDef,
  MoverDef,
  ScriptIfBlock,
  ScriptTrigger,
  ScriptAction,
  ScriptCondition,
  TriggerType,
  ActionType,
  ConditionType,
  CompareOp,
  JsonValue,
  StateSchema,
  TriggerVolume,
  WorldObject,
  PlatformDef,
  ShapeDef,
  StairDef,
  WallDef,
  FloorDef,
  CheckpointDef,
  LightDef,
  GroupDef,
  AssetDef,
  DialogueTreeDef,
  DialogueNode,
  DialogueOption,
  ItemDef,
  GraphicDef,
  UiElementDef,
  UiMenuOption,
  UiAnchor,
} from "@/types";
import { SoundPicker } from "@/ui/SoundPicker";
import { GraphicPickerPopover } from "@/ui/GraphicsBrowser";
import { assetManager } from "@/core/AssetManager";
import { HelpTooltip } from "@/ui/HelpTooltip";
import { DialogueFlowchart } from "@/ui/DialogueFlowchart";

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  } as const,
  tabs: {
    display: "flex",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    flexShrink: 0,
  } as const,
  tab: (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "7px 4px",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: active ? "#dde3f0" : "#8b94a8",
    fontSize: 11,
    fontFamily: "monospace",
    borderBottom: active ? "2px solid #80aaff" : "2px solid transparent",
  }),
  scroll: { flex: 1, overflowY: "auto", padding: "8px 0" } as const,
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    cursor: "pointer",
  } as const,
  label: { color: "#c0c0c0", fontSize: 12 } as const,
  sub: { color: "#8b94a8", fontSize: 11, marginTop: 2 } as const,
  badge: (enabled: boolean): React.CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: enabled ? "#44cc88" : "#555",
    flexShrink: 0,
    marginLeft: 8,
  }),
  btn: (primary?: boolean): React.CSSProperties => ({
    padding: primary ? "6px 12px" : "4px 8px",
    background: primary ? "rgba(80,140,255,0.25)" : "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 4,
    color: "#c0c0c0",
    fontSize: 11,
    cursor: "pointer",
  }),
  field: {
    width: "100%",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 6,
    color: "#dde3f0",
    fontSize: 12,
    padding: "6px 8px",
    fontFamily: "monospace",
    outline: "none",
  } as const,
  // Segmented picker, matching PropertiesPanel's MOVER_SEG_BTN (Slide/Spin, Loop/Once).
  seg: (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "4px 0",
    borderRadius: 4,
    cursor: active ? "default" : "pointer",
    fontFamily: "monospace",
    fontSize: 10,
    border: "none",
    background: active ? "rgba(80,140,255,0.18)" : "rgba(46,46,46,0.6)",
    color: active ? "#80aaff" : "#c2cadb",
    outline: active ? "1px solid rgba(80,140,255,0.4)" : "1px solid rgba(255,255,255,0.06)",
  }),
  select: {
    width: "100%",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 6,
    color: "#dde3f0",
    fontSize: 12,
    padding: "6px 6px",
    outline: "none",
  } as const,
  sectionLabel: {
    color: "#8b94a8",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    padding: "8px 12px 4px",
    textTransform: "uppercase",
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  } as const,
  // Phase 66 — field labels read as sentence-case prose beside their control.
  fieldLabel: {
    color: "#98a2b8",
    fontSize: 12,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  } as const,
  divider: {
    borderTop: "1px solid rgba(255,255,255,0.05)",
    margin: "8px 0",
  } as const,
};

// ── Constants ─────────────────────────────────────────────────────────────────

const TRIGGER_TYPES: TriggerType[] = [
  "on_player_enter",
  "on_player_exit",
  "on_interact",
  "on_timer",
  "on_state_changed",
  "on_state_equals",
  "on_level_load",
  "on_game_start",
  "on_health_zero",
  "on_dialogue_end",
  // Phase 61 — fired by the enemy AI on the owning enemy
  "on_player_detected",
  "on_player_lost",
  "on_enemy_attack",
];

// npc_alive/npc_dead removed from authoring (Phase 60) — never implemented;
// a compare_number scoped to the entity's health covers them. Old data
// evaluates as a tolerated no-op.
const CONDITION_TYPES: ConditionType[] = [
  "has_state",
  "state_equals",
  "compare_number",
  "has_item",
  "player_falling",
];

// Human labels for the dropdown — the raw type strings undersold what they do
// ("has_state" reads as the only state check; it's really just truthy).
const CONDITION_LABELS: Partial<Record<ConditionType, string>> = {
  has_state:      "state is set / true",
  state_equals:   "state equals value",
  compare_number: "number compare (< > =)",
  has_item:       "has item",
  player_falling: "player falling",
};

const ACTION_TYPES: ActionType[] = [
  "adjust_number",
  "change_material",
  "close_door",
  "delete_state",
  "despawn_object",
  "fade_screen",
  "flash_player",
  "fire_event",
  "give_item",
  "hide_ui",
  "light_off",
  "light_on",
  "load_scene",
  "move_object",
  "open_door",
  "play_animation",
  "play_music",
  "play_sound",
  "launch_player",
  "respawn_player",
  "run_script",
  "set_state",
  "show_dialogue",
  "show_ui",
  "spawn_object",
  "set_footstep",
  "start_mover",
  "stop_mover",
  "stop_music",
  "stop_sound",
  "store_position",
  "take_item",
  "transfer_item",
  "teleport_player",
  "toggle_light",
  "toggle_mover",
];

const COMPARE_OPS: CompareOp[] = [">=", "<=", ">", "<", "==", "!="];

/** Coerce a free-text state value into boolean / number / string for set_state. */
function coerceStateValue(raw: string): JsonValue {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw.trim() !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

const newBlockId = (): string => `blk_${crypto.randomUUID().slice(0, 8)}`;

/** Phase 65 — legacy per-action ONLY IF guards become one-branch if-blocks
 *  (no else) tagged onto their action. Pure; returns the SAME object when
 *  there is nothing to migrate, so untouched scripts stay byte-identical —
 *  the new shape persists on the first edit. */
function migrateActionGuards(script: ScriptDef): ScriptDef {
  if (!script.actions.some(a => a.conditions?.length)) return script;
  const blocks = [...(script.blocks ?? [])];
  const actions = script.actions.map(a => {
    if (!a.conditions?.length) return a;
    const id = newBlockId();
    blocks.push({ id, branches: [{ conditions: a.conditions }] });
    const { conditions: _legacy, ...rest } = a;
    return { ...rest, block: { id, branch: 0 } } as ScriptAction;
  });
  return { ...script, actions, blocks };
}

function blankScript(zoneId: string): ScriptDef {
  return {
    id: `scr_${crypto.randomUUID().slice(0, 8)}`,
    label: "New Script",
    zoneId,
    enabled: true,
    trigger: { type: "on_game_start" },
    conditions: [],
    actions: [],
    oneShot: false,
  };
}

function blankDialogue(): DialogueTreeDef {
  return {
    id: `dlg_${crypto.randomUUID().slice(0, 8)}`,
    label: "New Dialogue",
    speaker: "",
    startNode: "n1",
    nodes: [{ id: "n1", lines: [""], options: [] }],
  };
}

function blankItem(): ItemDef {
  return {
    id: `itm_${crypto.randomUUID().slice(0, 8)}`,
    label: "New Item",
  };
}

const UI_KINDS = ["bar", "counter", "icons", "label", "image", "menu"] as const;
const UI_ANCHORS: UiAnchor[] = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"];

function blankUiElement(kind: (typeof UI_KINDS)[number]): UiElementDef {
  const base = { id: `ui_${crypto.randomUUID().slice(0, 8)}`, anchor: "top-left" as UiAnchor };
  switch (kind) {
    case "bar":     return { ...base, kind, label: "New Bar",     stateKey: "health" };
    case "counter": return { ...base, kind, label: "New Counter", stateKey: "" };
    case "icons":   return { ...base, kind, label: "New Hearts",  stateKey: "health", fullGraphicId: "" };
    case "label":   return { ...base, kind, label: "New Label",   text: "Text…" };
    case "image":   return { ...base, kind, label: "New Image",   graphicId: "" };
    case "menu":    return { ...base, kind, label: "New Menu", anchor: "bottom-center", options: [] };
  }
}

/** First free auto node id (n1, n2, …). */
function nextNodeId(nodes: DialogueNode[]): string {
  let k = 1;
  while (nodes.some((n) => n.id === `n${k}`)) k++;
  return `n${k}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ScriptPanelProps {
  zoneScripts: ScriptDef[];
  zoneDialogues: DialogueTreeDef[];
  objectScripts: ScriptDef[] | null;
  selectedObjectId: string | null;
  activeZoneId: string | null;
  triggerVolumes: TriggerVolume[];
  zoneObjects: WorldObject[];
  zonePlatforms: PlatformDef[];
  zoneShapes: ShapeDef[];
  zoneLights: LightDef[];
  zoneStairs: StairDef[];
  zoneWalls: WallDef[];
  zoneFloors: FloorDef[];
  zoneCheckpoints: CheckpointDef[];
  groups: GroupDef[];
  assets: AssetDef[];
  onZoneScriptsChange: (scripts: ScriptDef[]) => void;
  onZoneDialoguesChange: (dialogues: DialogueTreeDef[]) => void;
  onObjectScriptsChange: (objectId: string, scripts: ScriptDef[]) => void;
  stateSchema: Record<string, StateSchema>;
  onStateSchemaChange: (schema: Record<string, StateSchema>) => void;
  gameStateSchema?: Record<string, StateSchema>;
  onGameStateSchemaChange?: (schema: Record<string, StateSchema>) => void;
  /** True while editor preview/game is running — enables the live-values pane. */
  isPreviewing?: boolean;
  /** Jump straight into editing a script (row click on a properties-panel list).
   *  `n` is a nonce so re-clicking the same script re-opens it. */
  editRequest?: { scriptId: string; n: number } | null;
  worldItems: ItemDef[];
  onWorldItemsChange: (items: ItemDef[]) => void;
  projectSceneIds?: string[];
  graphics: GraphicDef[];
  uiElements: UiElementDef[];
  onUiElementsChange: (uiElements: UiElementDef[]) => void;
  // Avatar model asset id (player settings) — clip list for play_animation target "player".
  playerModelAssetId?: string;
}

type TabId = "level" | "object" | "dialogue" | "state" | "items" | "ui";

// ── ScriptPanel ───────────────────────────────────────────────────────────────

export function ScriptPanel({
  zoneScripts,
  zoneDialogues,
  objectScripts,
  selectedObjectId,
  activeZoneId,
  triggerVolumes,
  zoneObjects,
  zonePlatforms,
  zoneShapes,
  zoneLights,
  zoneStairs,
  zoneWalls,
  zoneFloors,
  zoneCheckpoints,
  groups,
  assets,
  onZoneScriptsChange,
  onZoneDialoguesChange,
  onObjectScriptsChange,
  stateSchema,
  onStateSchemaChange,
  gameStateSchema,
  onGameStateSchemaChange,
  isPreviewing,
  editRequest,
  worldItems,
  onWorldItemsChange,
  projectSceneIds,
  graphics,
  uiElements,
  onUiElementsChange,
  playerModelAssetId,
}: ScriptPanelProps) {
  const [tab, setTab] = useState<TabId>("level");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDialogueId, setEditingDialogueId] = useState<string | null>(null);
  // STATE tab scope (project open only): GAME = shared game.json schema, SCENE = this scene's.
  const [stateScope, setStateScope] = useState<"game" | "scene">("game");
  const hasGameScope = gameStateSchema !== undefined && !!onGameStateSchemaChange;

  // Live-values pane: refresh twice a second while a play session is running
  // and the STATE tab is visible (a watch pane, not a per-frame HUD).
  const [, setLiveRev] = useState(0);
  useEffect(() => {
    if (!isPreviewing || tab !== "state") return;
    const id = setInterval(() => setLiveRev((r) => r + 1), 500);
    return () => clearInterval(id);
  }, [isPreviewing, tab]);

  // Auto-switch to SELECTED tab when a trigger volume or object is selected
  useEffect(() => {
    if (selectedObjectId) {
      setTab("object");
      setEditingId(null);
    }
  }, [selectedObjectId]);

  // Row click on a properties-panel script list → jump straight into that
  // script's editor (SELECTED tab; entity scripts live there).
  useEffect(() => {
    if (!editRequest) return;
    setTab("object");
    setEditingId(editRequest.scriptId);
  }, [editRequest]);

  const currentScripts: ScriptDef[] =
    tab === "level" ? zoneScripts : (objectScripts ?? []);

  const currentZoneId = activeZoneId ?? "";

  function save(updated: ScriptDef[]): void {
    if (tab === "level") onZoneScriptsChange(updated);
    if (tab === "object" && selectedObjectId)
      onObjectScriptsChange(selectedObjectId, updated);
  }

  function addScript(): void {
    // Leave trigger.targetId unset — ScriptEngine.loadZone derives it per trigger type
    // (on_interact → this object; target-less triggers stay wildcard). Stamping the object id
    // onto the default on_game_start trigger here mis-keys it so it never fires.
    const s = blankScript(currentZoneId);
    const next = [...currentScripts, s];
    save(next);
    setEditingId(s.id);
  }

  function toggleEnabled(id: string): void {
    save(
      currentScripts.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s,
      ),
    );
  }

  function deleteScript(id: string): void {
    save(currentScripts.filter((s) => s.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function updateScript(updated: ScriptDef): void {
    save(currentScripts.map((s) => (s.id === updated.id ? updated : s)));
  }

  const editing = editingId
    ? (currentScripts.find((s) => s.id === editingId) ?? null)
    : null;

  // Shared suggestions for every state-key input in the panel (type-or-pick):
  // registered keys from both schema scopes, every key a script in this zone
  // reads or writes (so a store_position key like `checkpoint` is offered
  // everywhere even if it was never registered in the STATE tab), UI-widget
  // bindings, plus each item's counter shown by its label — so nobody has to
  // remember the inv.<id> convention.
  const scriptKeys: string[] = [];
  const harvestRefs = (conditions?: ScriptCondition[], actions?: ScriptAction[], blocks?: ScriptIfBlock[]) => {
    for (const c of conditions ?? []) if (c.stateKey) scriptKeys.push(c.stateKey);
    for (const a of actions ?? []) {
      for (const k of [a.stateKey, a.positionKey, a.facingKey]) if (k) scriptKeys.push(k);
      for (const c of a.conditions ?? []) if (c.stateKey) scriptKeys.push(c.stateKey);   // legacy per-action guards
    }
    for (const b of blocks ?? [])   // Phase 65 — if-block branch conditions
      for (const br of b.branches)
        for (const c of br.conditions) if (c.stateKey) scriptKeys.push(c.stateKey);
  };
  const harvest = (scripts?: ScriptDef[]) => {
    for (const s of scripts ?? []) {
      if (s.trigger.type === "on_state_equals" && s.trigger.targetId) scriptKeys.push(s.trigger.targetId);
      harvestRefs(s.conditions, s.actions, s.blocks);
    }
  };
  harvest(zoneScripts);
  for (const v of triggerVolumes) harvest(v.scripts);
  for (const o of zoneObjects) harvest(o.scripts);
  for (const d of zoneDialogues)
    for (const n of d.nodes)
      for (const opt of n.options) harvestRefs(opt.conditions, opt.actions);
  for (const el of uiElements)
    if ((el.kind === "bar" || el.kind === "counter") && el.stateKey) scriptKeys.push(el.stateKey);
  // key -> registered type (scene entries override the project's game entries);
  // lets the set_state Value field specialize (boolean -> true/false/toggle).
  const stateKeyTypes: Record<string, StateSchema["type"]> = Object.fromEntries(
    [...Object.entries(gameStateSchema ?? {}), ...Object.entries(stateSchema)].map(([k, v]) => [k, v.type]));

  const knownStateKeys = [...new Set([
    ...Object.keys(gameStateSchema ?? {}),
    ...Object.keys(stateSchema),
    ...scriptKeys,
  ])].filter((k) => !worldItems.some((it) => `inv.${it.id}` === k));

  // Per-tab description — shown on demand via a (?) in each view's header row.
  const tabHelp =
    tab === "level"
      ? "Level-wide scripts. Use on_game_start for one-time setup (spawn NPCs, set flags, play ambient audio). Use on_zone_enter for effects that replay each time the player loads in."
      : tab === "object"
        ? "Scripts on the selected trigger volume or object. on_player_enter / on_player_exit fire when the player crosses the volume boundary."
        : tab === "dialogue"
          ? "Branching conversations for this zone. Any script can play one with a show_dialogue action — picked by name. Each page node shows its lines, then its response options; options can be gated by conditions and run effects when picked."
          : tab === "state"
            ? !hasGameScope
              ? "Gameplay-state keys for this level. A registered key seeds its default on New Game and (numbers) clamps to min/max. Unregistered keys still work in scripts — registering just adds a default + clamp."
              : stateScope === "game"
                ? "GAME scope: shared defaults + clamps for every scene in the project (game.json). A scene's own entry for the same key overrides these. Saved with the project on Save."
                : "SCENE scope: this scene's own keys — they override the project's GAME entries for the same key while this scene is loaded."
            : tab === "items"
              ? "Things the player can collect, hold, and spend. Give or take them with the give_item / take_item actions, gate anything on ownership with the has_item condition, and the in-game bag (I / Tab, gamepad Y) shows what the player holds."
              : "Custom in-game UI — health bars, counters, labels, images, and simple menus. Elements start hidden unless 'visible at start' is on; scripts show/hide them with the show_ui / hide_ui actions. Bars and counters bind to a state key and update live; menu options run actions when picked.";

  return (
    <div style={S.root}>
      <datalist id="wb-state-keys">
        {knownStateKeys.map((k) => (
          <option key={k} value={k} />
        ))}
        {worldItems.map((it) => (
          <option key={it.id} value={`inv.${it.id}`} label={`${it.label} — item count`} />
        ))}
      </datalist>
      {/* Tabs */}
      <div style={S.tabs}>
        {(["level", "object", "dialogue", "state", "items", "ui"] as TabId[]).map((t) => (
          <button
            key={t}
            style={S.tab(tab === t)}
            onClick={() => {
              setTab(t);
              setEditingId(null);
              setEditingDialogueId(null);
            }}
          >
            {t === "level" ? "LEVEL" : t === "object" ? "SELECTED" : t === "dialogue" ? "DIALOGUE" : t === "state" ? "STATE" : t === "items" ? "ITEMS" : "UI"}
          </button>
        ))}
      </div>

      {tab === "state" ? (
        <>
          {isPreviewing && (
            <LiveValues worldItems={worldItems} />
          )}
          {hasGameScope && (
            <div style={{ display: "flex", gap: 6, padding: "8px 10px 0", flexShrink: 0 }}>
              {(["game", "scene"] as const).map((sc) => (
                <button
                  key={sc}
                  onClick={() => setStateScope(sc)}
                  style={{
                    flex: 1, padding: "5px 0", borderRadius: 4, cursor: "pointer",
                    fontFamily: "monospace", fontSize: 10, letterSpacing: 1,
                    border: "none",
                    background: stateScope === sc ? "rgba(80,140,255,0.2)" : "rgba(46,46,46,0.9)",
                    color: stateScope === sc ? "#80aaff" : "#646464",
                    outline: stateScope === sc ? "1px solid rgba(80,140,255,0.33)" : "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  {sc === "game" ? "GAME" : "THIS SCENE"}
                </button>
              ))}
            </div>
          )}
          {hasGameScope && stateScope === "game" ? (
            <SchemaEditor schema={gameStateSchema} help={tabHelp} onChange={onGameStateSchemaChange} />
          ) : (
            <SchemaEditor schema={stateSchema} help={tabHelp} onChange={onStateSchemaChange} />
          )}
        </>
      ) : tab === "items" ? (
        <ItemsEditor items={worldItems} help={tabHelp} onChange={onWorldItemsChange} graphics={graphics} />
      ) : tab === "ui" ? (
        <UiElementsEditor
          elements={uiElements}
          help={tabHelp}
          onChange={onUiElementsChange}
          graphics={graphics}
          zoneObjects={zoneObjects}
          zonePlatforms={zonePlatforms}
          zoneShapes={zoneShapes}
          zoneLights={zoneLights}
          zoneStairs={zoneStairs}
          zoneWalls={zoneWalls}
          zoneFloors={zoneFloors}
          zoneCheckpoints={zoneCheckpoints}
          triggerVolumes={triggerVolumes}
          groups={groups}
          assets={assets}
          zoneDialogues={zoneDialogues}
          worldItems={worldItems}
          uiElements={uiElements}
          projectSceneIds={projectSceneIds}
        />
      ) : tab === "dialogue" ? (
        (() => {
          const editingDialogue = editingDialogueId
            ? (zoneDialogues.find((d) => d.id === editingDialogueId) ?? null)
            : null;
          return editingDialogue ? (
            <DialogueEditor
              dialogue={editingDialogue}
              help={tabHelp}
              zoneObjects={zoneObjects}
              zonePlatforms={zonePlatforms}
              zoneShapes={zoneShapes}
              zoneLights={zoneLights}
              zoneStairs={zoneStairs}
              zoneWalls={zoneWalls}
              zoneFloors={zoneFloors}
              zoneCheckpoints={zoneCheckpoints}
              triggerVolumes={triggerVolumes}
              groups={groups}
              assets={assets}
              zoneDialogues={zoneDialogues}
              worldItems={worldItems}
              uiElements={uiElements}
              projectSceneIds={projectSceneIds}
              onBack={() => setEditingDialogueId(null)}
              onChange={(d) =>
                onZoneDialoguesChange(zoneDialogues.map((x) => (x.id === d.id ? d : x)))
              }
              onDelete={() => {
                onZoneDialoguesChange(zoneDialogues.filter((x) => x.id !== editingDialogue.id));
                setEditingDialogueId(null);
              }}
            />
          ) : (
            <DialogueList
              dialogues={zoneDialogues}
              help={tabHelp}
              onSelect={(id) => setEditingDialogueId(id)}
              onAdd={() => {
                const d = blankDialogue();
                onZoneDialoguesChange([...zoneDialogues, d]);
                setEditingDialogueId(d.id);
              }}
            />
          );
        })()
      ) : editing ? (
        <ScriptEditor
          stateKeyTypes={stateKeyTypes}
          script={editing}
          help={tabHelp}
          triggerVolumes={triggerVolumes}
          zoneObjects={zoneObjects}
          zonePlatforms={zonePlatforms}
          zoneShapes={zoneShapes}
          zoneLights={zoneLights}
          zoneStairs={zoneStairs}
          zoneWalls={zoneWalls}
          zoneFloors={zoneFloors}
          zoneCheckpoints={zoneCheckpoints}
          groups={groups}
          assets={assets}
          zoneDialogues={zoneDialogues}
          worldItems={worldItems}
          uiElements={uiElements}
          projectSceneIds={projectSceneIds}
          playerModelAssetId={playerModelAssetId}
          ownerIsEntity={tab === "object"}
          selectedObjectId={selectedObjectId}
          onBack={() => setEditingId(null)}
          onChange={updateScript}
          onDelete={() => deleteScript(editing.id)}
        />
      ) : tab === "object" && !selectedObjectId ? (
        <div
          style={{
            color: "#98a2b8",
            fontSize: 11,
            fontStyle: "italic",
            textAlign: "center",
            marginTop: 40,
            lineHeight: 1.6,
          }}
        >
          Select a trigger volume or object
          <br />
          to see its scripts here.
        </div>
      ) : (
        <ScriptList
          scripts={currentScripts}
          help={tabHelp}
          onSelect={(id) => setEditingId(id)}
          onToggle={(id) => toggleEnabled(id)}
          onAdd={addScript}
        />
      )}
    </div>
  );
}

// ── SchemaEditor (STATE tab) ────────────────────────────────────────────────────
// Edits the level's authored gameplay-state schema (WorldConfig.stateSchema): each
// key's default + (numbers) min/max clamp. Applied on play start via configureSchema.

function SchemaEditor({
  schema,
  help,
  onChange,
}: {
  schema: Record<string, StateSchema>;
  help?: string;
  onChange: (s: Record<string, StateSchema>) => void;
}) {
  const entries = Object.entries(schema);

  function replace(key: string, next: StateSchema): void {
    onChange({ ...schema, [key]: next });
  }
  function rename(oldKey: string, raw: string): void {
    const newKey = raw.trim();
    if (!newKey || newKey === oldKey || schema[newKey]) return; // ignore empty / unchanged / duplicate
    const next: Record<string, StateSchema> = {};
    for (const [k, v] of Object.entries(schema))
      next[k === oldKey ? newKey : k] = v;
    onChange(next);
  }
  function remove(key: string): void {
    const next = { ...schema };
    delete next[key];
    onChange(next);
  }
  function add(): void {
    let name = "new_key",
      i = 2;
    while (schema[name]) name = `new_key_${i++}`;
    onChange({ ...schema, [name]: { type: "number", default: 0 } });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 10,
          padding: "6px 10px",
          flexShrink: 0,
        }}
      >
        {help && <HelpTooltip side="below" align="right" text={help} />}
        <button style={S.btn(true)} onClick={add}>
          + Add key
        </button>
      </div>
      <div style={S.scroll}>
        {entries.length === 0 && (
          <div
            style={{
              color: "#98a2b8",
              fontSize: 11,
              padding: "16px 12px",
              textAlign: "center",
            }}
          >
            Nothing registered yet — scripts can use any key without registering
            it. Add a key here only to give it a New Game starting value or,
            for numbers, min/max limits.
          </div>
        )}
        {entries.map(([key, sch]) => (
          <SchemaKeyRow
            key={key}
            name={key}
            schema={sch}
            onRename={(n) => rename(key, n)}
            onReplace={(next) => replace(key, next)}
            onRemove={() => remove(key)}
          />
        ))}
      </div>
    </div>
  );
}

function SchemaKeyRow({
  name,
  schema,
  onRename,
  onReplace,
  onRemove,
}: {
  name: string;
  schema: StateSchema;
  onRename: (n: string) => void;
  onReplace: (next: StateSchema) => void;
  onRemove: () => void;
}) {
  const [nameStr, setNameStr] = useState(name);
  useEffect(() => setNameStr(name), [name]);
  const isNum = schema.type === "number";

  function commitDefault(raw: string): void {
    let val: JsonValue;
    if (schema.type === "number") val = parseFloat(raw) || 0;
    else if (schema.type === "boolean") val = raw === "true";
    else if (schema.type === "object") {
      try {
        val = JSON.parse(raw);
      } catch {
        return;
      }
    } else val = raw;
    onReplace({ ...schema, default: val });
  }
  function withBound(field: "min" | "max", raw: string): void {
    const next: StateSchema = { ...schema };
    if (raw === "") delete next[field];
    else next[field] = parseFloat(raw) || 0;
    onReplace(next);
  }

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        borderRadius: 4,
        padding: "6px 8px",
        margin: "0 10px 6px",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 4,
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <input
          style={{ ...S.field, flex: 1 }}
          placeholder="key name"
          value={nameStr}
          onChange={(e) => setNameStr(e.target.value)}
          onBlur={() => onRename(nameStr)}
        />
        <select
          style={{ ...S.select, flex: "0 0 84px" }}
          value={schema.type}
          onChange={(e) =>
            onReplace({
              ...schema,
              type: e.target.value as StateSchema["type"],
            })
          }
        >
          {(["number", "boolean", "string", "object"] as const).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          style={{ ...S.btn(), padding: "3px 6px", color: "#cc6666" }}
          onClick={onRemove}
        >
          ×
        </button>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {schema.type === "boolean" ? (
          <select
            style={{ ...S.select, flex: 1 }}
            value={String(schema.default ?? false)}
            onChange={(e) =>
              onReplace({ ...schema, default: e.target.value === "true" })
            }
          >
            <option value="false">default: false</option>
            <option value="true">default: true</option>
          </select>
        ) : (
          <input
            style={{ ...S.field, flex: 1 }}
            placeholder="default"
            type={isNum ? "number" : "text"}
            value={schema.default == null ? "" : String(schema.default)}
            onChange={(e) => commitDefault(e.target.value)}
          />
        )}
        {isNum && (
          <>
            <input
              type="number"
              style={{ ...S.field, flex: "0 0 56px" }}
              placeholder="min"
              value={schema.min ?? ""}
              onChange={(e) => withBound("min", e.target.value)}
            />
            <input
              type="number"
              style={{ ...S.field, flex: "0 0 56px" }}
              placeholder="max"
              value={schema.max ?? ""}
              onChange={(e) => withBound("max", e.target.value)}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── ScriptList ────────────────────────────────────────────────────────────────

function ScriptList({
  scripts,
  help,
  onSelect,
  onToggle,
  onAdd,
}: {
  scripts: ScriptDef[];
  help?: string;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 10,
          padding: "6px 10px",
          flexShrink: 0,
        }}
      >
        {help && <HelpTooltip side="below" align="right" text={help} />}
        <button style={S.btn(true)} onClick={onAdd}>
          + New
        </button>
      </div>
      <div style={S.scroll}>
        {scripts.length === 0 && (
          <div
            style={{
              color: "#98a2b8",
              fontSize: 11,
              padding: "16px 12px",
              textAlign: "center",
            }}
          >
            No scripts yet — hit + New. A script is a trigger (when it fires:
            interact, enter a volume, game start…) plus actions (what happens).
          </div>
        )}
        {scripts.map((s) => (
          <div key={s.id} style={{ ...S.row }} onClick={() => onSelect(s.id)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.label}>{s.label}</div>
              <div style={S.sub}>
                {s.trigger.type}
                {s.conditions.length > 0
                  ? ` · ${s.conditions.length} cond`
                  : ""}
                {(s.blocks?.length ?? 0) > 0 ? ` · ${s.blocks!.length} if` : ""}
                {` · ${s.actions.length} action${s.actions.length !== 1 ? "s" : ""}`}
              </div>
            </div>
            <div
              style={S.badge(s.enabled)}
              title={s.enabled ? "Enabled" : "Disabled"}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(s.id);
              }}
            />
            <span style={{ color: "#444", marginLeft: 8, fontSize: 13 }}>
              ›
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ScriptEditor ──────────────────────────────────────────────────────────────

function ScriptEditor({
  script,
  stateKeyTypes,
  triggerVolumes,
  zoneObjects,
  zonePlatforms,
  zoneShapes,
  zoneLights,
  zoneStairs,
  zoneWalls,
  zoneFloors,
  zoneCheckpoints,
  groups,
  assets,
  zoneDialogues,
  worldItems,
  uiElements,
  projectSceneIds,
  playerModelAssetId,
  ownerIsEntity,
  selectedObjectId,
  help,
  onBack,
  onChange,
  onDelete,
}: {
  script: ScriptDef;
  triggerVolumes: TriggerVolume[];
  zoneObjects: WorldObject[];
  zonePlatforms: PlatformDef[];
  zoneShapes: ShapeDef[];
  zoneLights: LightDef[];
  zoneStairs: StairDef[];
  zoneWalls: WallDef[];
  zoneFloors: FloorDef[];
  zoneCheckpoints: CheckpointDef[];
  groups: GroupDef[];
  assets: AssetDef[];
  zoneDialogues: DialogueTreeDef[];
  worldItems: ItemDef[];
  uiElements: UiElementDef[];
  projectSceneIds?: string[];
  playerModelAssetId?: string;
  ownerIsEntity: boolean;
  selectedObjectId: string | null;
  stateKeyTypes?: Record<string, StateSchema["type"]>;
  help?: string;
  onBack: () => void;
  onChange: (s: ScriptDef) => void;
  onDelete: () => void;
}) {
  // Phase 65 — legacy per-action guards are shown (and, on first edit, saved)
  // as if-blocks. Identity when there is nothing to migrate.
  script = migrateActionGuards(script);
  // Phase 66 — the trigger form hides behind the hero card; one action card open at a time.
  const [trigOpen, setTrigOpen] = useState(false);
  const [openAction, setOpenAction] = useState<number | null>(null);
  function set<K extends keyof ScriptDef>(key: K, val: ScriptDef[K]): void {
    onChange({ ...script, [key]: val });
  }

  function setTrigger(changes: Partial<ScriptTrigger>): void {
    onChange({ ...script, trigger: { ...script.trigger, ...changes } });
  }

  const needsTarget =
    script.trigger.type === "on_player_enter" ||
    script.trigger.type === "on_player_exit" ||
    script.trigger.type === "on_interact" ||
    script.trigger.type === "on_state_changed" ||
    script.trigger.type === "on_state_equals" ||
    script.trigger.type === "on_dialogue_end" ||
    script.trigger.type === "on_player_detected" ||
    script.trigger.type === "on_player_lost" ||
    script.trigger.type === "on_enemy_attack";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
        <button style={{ ...S.btn(), padding: "3px 8px" }} onClick={onBack}>
          ←
        </button>
        <input value={script.label} placeholder="Script name" title="Script name — click to rename"
          onChange={(e) => set("label", e.target.value)}
          style={{ flex: 1, minWidth: 0, background: "transparent", border: "1px solid transparent", borderRadius: 6,
            color: "#dde3f0", fontSize: 13, fontWeight: 600, fontFamily: SANS, padding: "3px 6px", outline: "none" }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(80,140,255,0.5)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "transparent"; }} />
        {help && <HelpTooltip side="below" align="right" text={help} />}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Phase 66 — trigger hero card: what fires this script, with its
            settings as chips; click the title for the full form. */}
        {(() => {
          const t = script.trigger;
          const ownerKind = selectedObjectId?.startsWith("vol_") ? "volume" : "object";
          const ctx: NameCtx = { zoneObjects, triggerVolumes, zoneDialogues,
            owner: ownerIsEntity && selectedObjectId ? { id: selectedObjectId, kind: ownerKind } : undefined };
          const scopeKey = (t.entityId ? `${nameOf(t.entityId, ctx)} › ` : "") + (t.targetId || "?");
          const title =
            t.type === "on_timer" ? `every ${t.interval ?? 5}s`
            : t.type === "on_player_enter" || t.type === "on_player_exit" || t.type === "on_interact"
              ? `${TRIGGER_LABELS[t.type]} ${ownerIsEntity ? `★ this ${ownerKind}` : nameOf(t.targetId, ctx) || "…"}`
            : t.type === "on_state_changed" ? `when ${scopeKey} changes`
            : t.type === "on_state_equals" ? `when ${scopeKey} becomes ${fmtVal(t.stateValue)}`
            : t.type === "on_dialogue_end" ? `when "${zoneDialogues.find(d => d.id === t.targetId)?.label ?? t.targetId ?? "…"}" ends`
            : TRIGGER_LABELS[t.type];
          const icon = t.type === "on_timer" ? "clock"
            : t.type === "on_player_enter" || t.type === "on_player_exit" || t.type === "on_interact" ? "enter"
            : t.type === "on_state_changed" || t.type === "on_state_equals" || t.type === "on_health_zero" ? "state"
            : t.type === "on_dialogue_end" ? "dialogue"
            : t.type === "on_player_detected" || t.type === "on_player_lost" || t.type === "on_enemy_attack" ? "player" : "play";
          return (
            <div style={{ margin: "10px 12px 6px", padding: 12, borderRadius: 10, display: "flex", gap: 10, alignItems: "flex-start",
              background: "linear-gradient(180deg, rgba(80,140,255,0.14), rgba(80,140,255,0.05))", border: "1px solid rgba(80,140,255,0.25)" }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(80,140,255,0.2)", color: "#80aaff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Ic name={icon} size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div onClick={() => setTrigOpen(o => !o)} title="Click to edit the trigger"
                  style={{ color: trigOpen ? "#80aaff" : "#dde3f0", fontSize: 15, fontWeight: 600, fontFamily: SANS, cursor: "pointer", lineHeight: 1.3 }}>
                  {title}
                </div>
                {ownerIsEntity && selectedObjectId && (
                  <div style={{ color: "#8b94a8", fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>on ★ {nameOf(selectedObjectId, ctx)}</div>
                )}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                  {t.type === "on_timer" && (
                    <span style={CHIP(!!t.repeat)} title="Does the timer keep firing? Click to toggle"
                      onClick={() => setTrigger({ repeat: t.repeat ? undefined : true })}>
                      {t.repeat ? `timer repeats every ${t.interval ?? 5}s` : "timer fires once"}
                    </span>
                  )}
                  <span style={CHIP(trigOpen)} title="Click to edit the trigger" onClick={() => setTrigOpen(o => !o)}>
                    {t.delay ? `after a ${t.delay}s delay` : "no delay"}
                  </span>
                  <span style={CHIP(script.oneShot)} title="One-shot: the script runs once, ever. Click to toggle"
                    onClick={() => set("oneShot", !script.oneShot)}>
                    {script.oneShot ? "one-shot · runs once, ever" : "runs each time it fires"}
                  </span>
                  <span style={CHIP(false)} title="Edit trigger type / target / interval" onClick={() => setTrigOpen(o => !o)}>⋯</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Trigger form (Phase 66: shown when the hero is open) */}
        {trigOpen && (
        <div style={{ margin: "0 12px 8px", padding: "0 10px 6px", borderRadius: 8, background: "rgba(80,140,255,0.06)", outline: "1px solid rgba(80,140,255,0.3)" }}>
          <F label="Trigger">
            <select
              style={S.select}
              value={script.trigger.type}
              onChange={(e) =>
                setTrigger({
                  type: e.target.value as TriggerType,
                  targetId: undefined,
                  stateValue: undefined,
                })
              }
            >
              {TRIGGER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TRIGGER_LABELS[t]}
                </option>
              ))}
            </select>
          </F>

          {/* State triggers' target is a state KEY, never "this entity" — the
              picker must render even on entity-owned scripts (else the key is
              unauthorable and the engine's targetId injection mis-keys it). */}
          {needsTarget && (!ownerIsEntity
            || script.trigger.type === "on_dialogue_end"
            || script.trigger.type === "on_state_changed"
            || script.trigger.type === "on_state_equals") && (
            <F
              style={{ marginTop: 4 }}
              label={
                script.trigger.type === "on_state_changed" || script.trigger.type === "on_state_equals"
                  ? "State key to watch"
                  : "Target"
              }
            >
              <TargetPicker
                triggerType={script.trigger.type}
                targetId={script.trigger.targetId ?? ""}
                triggerVolumes={triggerVolumes}
                zoneObjects={zoneObjects}
                zoneDialogues={zoneDialogues}
                stateKeySuggestions={entityStateKeys(script.trigger.entityId,
                  ownerIsEntity ? selectedObjectId ?? undefined : undefined, zoneObjects, triggerVolumes)}
                onChange={(id) => setTrigger({ targetId: id })}
              />
            </F>
          )}
          {/* Phase 60 — state triggers can watch an ENTITY's key instead of a
              global one. Single entities only (no groups). */}
          {(script.trigger.type === "on_state_changed" || script.trigger.type === "on_state_equals") && (
            <F style={{ marginTop: 4 }} label="Whose state">
              <StateScopePicker
                value={script.trigger.entityId ?? ""}
                zoneObjects={zoneObjects}
                triggerVolumes={triggerVolumes}
                allowSelf={ownerIsEntity && !!selectedObjectId}
                selfLabel={`★ this ${selectedObjectId?.startsWith("vol_") ? "volume" : "object"}`}
                ownerId={ownerIsEntity ? selectedObjectId ?? undefined : undefined}
                onChange={(id) => setTrigger({ entityId: id || undefined })}
              />
            </F>
          )}
          {needsTarget && ownerIsEntity
            && script.trigger.type !== "on_dialogue_end"
            && script.trigger.type !== "on_state_changed"
            && script.trigger.type !== "on_state_equals" && (
            <div
              style={{
                color: "#98a2b8",
                fontSize: 10,
                fontStyle: "italic",
                padding: "4px 0",
              }}
            >
              Target: this{" "}
              {selectedObjectId?.startsWith("vol_") ? "volume" : "object"}{" "}
              (implicit)
            </div>
          )}

          {script.trigger.type === "on_health_zero" && (
            <div style={{ color: "#98a2b8", fontSize: 10, fontStyle: "italic", padding: "4px 0" }}>
              Fires when the state key named exactly <span style={{ color: "#c8d2e8" }}>health</span> drops
              to 0. Using a different key for health? Use on_state_equals with that key and value 0 instead.
            </div>
          )}

          {script.trigger.type === "on_timer" && (
            <>
              <F label="Interval (seconds)" style={{ marginTop: 4 }}>
                <input
                  type="number"
                  style={S.field}
                  placeholder="Interval (seconds)"
                  value={script.trigger.interval ?? ""}
                  onChange={(e) =>
                    setTrigger({ interval: parseFloat(e.target.value) || 1 })
                  }
                />
              </F>
              {/* The engine always supported repeat (setInterval vs setTimeout) —
                  this checkbox was just never authorable. Damage-over-time
                  (HAZARDS_GUIDE lava recipe) depends on it. */}
              <F label="Repeat every interval (off = fire once)">
                <input
                  type="checkbox" className="wb-switch"
                  checked={script.trigger.repeat ?? false}
                  onChange={(e) => setTrigger({ repeat: e.target.checked || undefined })}
                />
              </F>
            </>
          )}

          {script.trigger.type === "on_state_equals" && (
            <F label="Fires when value equals" style={{ marginTop: 4 }}>
              <input
                style={S.field}
                placeholder="number / true / false / text"
                value={script.trigger.stateValue == null ? "" : String(script.trigger.stateValue)}
                onChange={(e) => setTrigger({ stateValue: coerceStateValue(e.target.value) })}
              />
            </F>
          )}

          <F label="Delay before the actions start">
            <RangeField value={script.trigger.delay} min={0} max={10} step={0.1} unit="s"
              onChange={(v) => setTrigger({ delay: v && v > 0 ? v : undefined })} />
          </F>
          <F label="One-shot (runs once, ever)" style={{ borderBottom: "none" }}>
            <input
              type="checkbox" className="wb-switch"
              checked={script.oneShot}
              onChange={(e) => set("oneShot", e.target.checked)}
            />
          </F>
        </div>
        )}

        {/* Conditions — Phase 66: an "only when …" sentence line */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px", padding: "2px 14px 8px" }}>
          <span style={{ color: "#8b94a8", fontSize: 11, fontFamily: SANS }}>only when</span>
          {script.conditions.length === 0 && <span style={{ color: "#8b94a8", fontSize: 12, fontFamily: "monospace" }}>— always</span>}
          {script.conditions.map((c, i) => (
            <Fragment key={i}>
            {i > 0 && <span style={{ color: "#8b94a8", fontSize: 11, fontFamily: SANS }}>and</span>}
            <ConditionRow
              key={i}
              condition={c}
              worldItems={worldItems}
              scope={{
                zoneObjects, triggerVolumes,
                allowSelf: ownerIsEntity && !!selectedObjectId,
                selfLabel: `★ this ${selectedObjectId?.startsWith("vol_") ? "volume" : "object"}`,
                ownerId: ownerIsEntity ? selectedObjectId ?? undefined : undefined,
                stateKeyTypes,
              }}
              onChange={(nc) =>
                set(
                  "conditions",
                  script.conditions.map((x, j) => (j === i ? nc : x)),
                )
              }
              onRemove={() =>
                set(
                  "conditions",
                  script.conditions.filter((_, j) => j !== i),
                )
              }
            />
            </Fragment>
          ))}
          <button style={LINK_BTN} title="Add a script-level condition (gates the whole script)"
            onClick={() => set("conditions", [...script.conditions, { type: "has_state" } as ScriptCondition])}>+ condition</button>
        </div>

        {/* Actions — cards; if-blocks are grouped cards (Phase 65 / 66) */}
        <div style={{ padding: "0 12px 10px" }}>
          <div style={{ ...S.sectionLabel, padding: "6px 0 6px" }}>Actions</div>
          {(() => {
            const blocks = script.blocks ?? [];
            const condScope = {
              zoneObjects, triggerVolumes,
              allowSelf: ownerIsEntity && !!selectedObjectId,
              selfLabel: `★ this ${selectedObjectId?.startsWith("vol_") ? "volume" : "object"}`,
              ownerId: ownerIsEntity ? selectedObjectId ?? undefined : undefined,
              stateKeyTypes,
            };
            const owner = ownerIsEntity && selectedObjectId
              ? { id: selectedObjectId, kind: (selectedObjectId.startsWith("vol_") ? "volume" : "object") as "object" | "volume" }
              : undefined;
            const patchAction = (i: number, na: ScriptAction) => set("actions", script.actions.map((x, j) => (j === i ? na : x)));
            const renderAction = (i: number) => {
              const a = script.actions[i]!;
              return (
                <ActionRow
                  key={i}
                  action={a}
                  blocks={blocks}
                  open={openAction === i}
                  onToggle={() => setOpenAction(openAction === i ? null : i)}
                  onDuplicate={() => {
                    const copy = structuredClone(a);
                    set("actions", [...script.actions.slice(0, i + 1), copy, ...script.actions.slice(i + 1)]);
                    setOpenAction(i + 1);
                  }}
                  stateKeyTypes={stateKeyTypes}
                  zoneObjects={zoneObjects}
                  zonePlatforms={zonePlatforms}
                  zoneShapes={zoneShapes}
                  zoneLights={zoneLights}
                  zoneStairs={zoneStairs}
                  zoneWalls={zoneWalls}
                  zoneFloors={zoneFloors}
                  zoneCheckpoints={zoneCheckpoints}
                  triggerVolumes={triggerVolumes}
                  groups={groups}
                  assets={assets}
                  zoneDialogues={zoneDialogues}
                  worldItems={worldItems}
                  uiElements={uiElements}
                  projectSceneIds={projectSceneIds}
                  playerModelAssetId={playerModelAssetId}
                  owner={owner}
                  onChange={(na) => patchAction(i, na)}
                  onRemove={() => { set("actions", script.actions.filter((_, j) => j !== i)); setOpenAction(null); }}
                  onWrap={a.block ? undefined : () => {
                    // Wrap this action in a fresh if-block with one blank condition.
                    const id = newBlockId();
                    onChange({
                      ...script,
                      blocks: [...blocks, { id, branches: [{ conditions: [{ type: "has_state" } as ScriptCondition] }] }],
                      actions: script.actions.map((x, j) => (j === i ? { ...x, block: { id, branch: 0 } } : x)),
                    });
                  }}
                  onMove={(tag) => {
                    const { block: _old, ...rest } = a;
                    patchAction(i, tag ? { ...rest, block: tag } : (rest as ScriptAction));
                  }}
                />
              );
            };
            // Groups in order of first appearance; blocks with no actions yet come last.
            const rows: Array<{ kind: "action"; index: number } | { kind: "block"; block: ScriptIfBlock }> = [];
            const seen = new Set<string>();
            script.actions.forEach((a, i) => {
              const blk = a.block ? blocks.find(b => b.id === a.block!.id) : undefined;
              if (blk) {
                if (!seen.has(blk.id)) { seen.add(blk.id); rows.push({ kind: "block", block: blk }); }
              } else {
                rows.push({ kind: "action", index: i });
              }
            });
            for (const blk of blocks) if (!seen.has(blk.id)) { seen.add(blk.id); rows.push({ kind: "block", block: blk }); }
            const addCards = (
              <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                <button style={ADD_CARD} title="Add a top-level action (always runs)"
                  onClick={() => { set("actions", [...script.actions, { type: "set_state" } as ScriptAction]); setOpenAction(script.actions.length); }}>
                  <Ic name="plus" size={12} /> action
                </button>
                <button style={{ ...ADD_CARD, color: "#e8c14b" }} title="Add an if-block: actions inside run only when its conditions pass; add else if / else branches"
                  onClick={() => set("blocks", [...(script.blocks ?? []), { id: newBlockId(), branches: [{ conditions: [{ type: "has_state" } as ScriptCondition] }] }])}>
                  <Ic name="branch" size={12} /> if-block
                </button>
              </div>
            );
            if (rows.length === 0) {
              return <>{addCards}</>;
            }
            return <>{rows.map(g => g.kind === "action" ? renderAction(g.index) : (
              <IfBlockCard
                key={g.block.id}
                block={g.block}
                number={blocks.indexOf(g.block) + 1}
                worldItems={worldItems}
                scope={condScope}
                renderActions={(branch) => script.actions.map((a, i) =>
                  a.block?.id === g.block.id && a.block.branch === branch ? renderAction(i) : null)}
                onChange={(nb) => set("blocks", blocks.map(b => (b.id === nb.id ? nb : b)))}
                onAddAction={(branch) => { set("actions", [...script.actions, { type: "set_state", block: { id: g.block.id, branch } } as ScriptAction]); setOpenAction(script.actions.length); }}
                onUnwrap={() => onChange({
                  ...script,
                  blocks: blocks.filter(b => b.id !== g.block.id),
                  actions: script.actions.map(a => {
                    if (a.block?.id !== g.block.id) return a;
                    const { block: _b, ...rest } = a;
                    return rest as ScriptAction;
                  }),
                })}
                onDelete={() => { setOpenAction(null); onChange({
                  ...script,
                  blocks: blocks.filter(b => b.id !== g.block.id),
                  actions: script.actions.filter(a => a.block?.id !== g.block.id),
                }); }}
              />
            ))}{addCards}</>;
          })()}
        </div>

        <div style={S.divider} />

        {/* Footer actions */}
        <div style={{ display: "flex", gap: 8, padding: "8px 12px" }}>
          <button
            style={{ ...S.btn(true), flex: 1 }}
            onClick={() => set("enabled", !script.enabled)}
          >
            {script.enabled ? "Disable" : "Enable"}
          </button>
          <button
            style={{ ...S.btn(), color: "#cc6666" }}
            onClick={() => {
              if (confirm("Delete this script?")) onDelete();
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Labeled field wrapper ─────────────────────────────────────────────────────
// A tiny caption above a field so its meaning survives once a value replaces
// the placeholder (a filled "checkpoint" input says nothing on its own).
/** Phase 66 — a property row: label on the left, control on the right, hairline
 *  under it. Every form in the panel (all 37 action types, conditions, the
 *  trigger) is built from these, so this one component is the "properties
 *  panel" look. `flex` is accepted for source compatibility and ignored — a
 *  row is always full width. */
function F({
  label,
  flex: _flex,
  style,
  children,
}: {
  label: string;
  flex?: React.CSSProperties["flex"];
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(150px, 60%)",
        alignItems: "center",
        gap: 10,
        width: "100%",
        minHeight: 36,
        padding: "2px 0",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        ...style,
      }}
    >
      <span style={S.fieldLabel}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** Phase 66 — a number that also has a slider (volume, blend, fade, delay). */
function RangeField({ value, min, max, step, unit, onChange }: {
  value: number | undefined; min: number; max: number; step: number; unit?: string;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <>
      <input type="range" className="wb-range" min={min} max={max} step={step} value={value ?? min}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
      <input type="number" min={min} step={step} style={{ ...S.field, width: 58, textAlign: "right" }}
        value={value ?? ""} placeholder="0"
        onChange={(e) => onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))} />
      {unit && <span style={{ color: "#8b94a8", fontSize: 11 }}>{unit}</span>}
    </>
  );
}

// ── TargetPicker ──────────────────────────────────────────────────────────────

function TargetPicker({
  triggerType,
  targetId,
  triggerVolumes,
  zoneObjects,
  zoneDialogues,
  stateKeySuggestions,
  onChange,
}: {
  triggerType: TriggerType;
  targetId: string;
  triggerVolumes: TriggerVolume[];
  zoneObjects: WorldObject[];
  zoneDialogues: DialogueTreeDef[];
  stateKeySuggestions?: string[];   // entity-scoped keys for the state-trigger key input
  onChange: (id: string) => void;
}) {

  if (triggerType === "on_dialogue_end") {
    return (
      <select
        style={S.select}
        value={targetId}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— any dialogue —</option>
        {zoneDialogues.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
        {targetId && !zoneDialogues.some((d) => d.id === targetId) && (
          <option value={targetId}>{targetId} (custom)</option>
        )}
      </select>
    );
  }
  if (triggerType === "on_player_enter" || triggerType === "on_player_exit") {
    return (
      <select
        style={S.select}
        value={targetId}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— pick trigger volume —</option>
        {triggerVolumes.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
    );
  }
  if (triggerType === "on_interact" || triggerType === "on_player_detected"
    || triggerType === "on_player_lost" || triggerType === "on_enemy_attack") {
    return (
      <select
        style={S.select}
        value={targetId}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{triggerType === "on_interact" ? "— pick object —" : "— pick enemy (AI-enabled object) —"}</option>
        {zoneObjects.map((o) => (
          <option key={o.id} value={o.id}>
            {o.assetId} ({o.id.slice(0, 8)})
          </option>
        ))}
      </select>
    );
  }
  // on_state_changed / on_state_equals: the target is the state key to watch
  return (
    <KeySuggestInput
      value={targetId}
      suggestions={stateKeySuggestions}
      placeholder={
        triggerType === "on_state_changed" || triggerType === "on_state_equals"
          ? "State key (e.g. health)"
          : "Target ID"
      }
      onChange={onChange}
    />
  );
}

// ── ActionTargetPicker ──────────────────────────────────────────────────────────
// Dropdown of the zone's groups + objects for action targets (despawn/move/etc).
// A group target fans out to all members at dispatch (ScriptEngine._resolveTargets).
// The optional entity lists (platforms/stairs/walls/floors/volumes) are opt-in per
// action: despawn_object supports every entity type at runtime (ZoneManager hides the
// mesh + disables its collider), so it passes them; move/change_material/play_animation
// only act on objects, so they omit them and the picker stays object-only.
function ActionTargetPicker({
  targetId,
  zoneObjects,
  groups,
  zonePlatforms = [],
  zoneShapes = [],
  zoneStairs = [],
  zoneWalls = [],
  zoneFloors = [],
  triggerVolumes = [],
  zoneLightDefs = [],
  owner,
  includePlayer,
  onChange,
}: {
  targetId: string;
  zoneObjects: WorldObject[];
  groups: GroupDef[];
  zonePlatforms?: PlatformDef[];
  zoneShapes?: ShapeDef[];
  zoneStairs?: StairDef[];
  zoneWalls?: WallDef[];
  zoneFloors?: FloorDef[];
  triggerVolumes?: TriggerVolume[];
  zoneLightDefs?: LightDef[];
  /** Entity this script rides on — offers the portable "★ this" self target. */
  owner?: { id: string; kind: "object" | "volume" };
  /** Offer the "★ the player" avatar target (play_animation only). */
  includePlayer?: boolean;
  onChange: (id: string) => void;
}) {
  // Prefab members (e.g. every tile of a tiled platform) are generated internals —
  // dozens per instance, and rebuilds churn their ids — so they're not offered.
  const noPrefab = <T,>(arr: T[]): T[] => arr.filter((e) => !(e as { prefab?: unknown }).prefab);
  const short = (id: string) => id.slice(0, 8);
  const opts: TargetOpt[] = [
    // "player" targets the avatar (character:play-animation channel), pinned first.
    ...(includePlayer ? [{ id: "player", text: "★ the player", group: "Player" }] : []),
    // "self" stays literal in the saved script and re-resolves to whatever entity
    // carries the script — survives duplicate/copy/prefab stamping.
    ...(owner ? [{ id: "self", text: `★ this ${owner.kind}`, group: "This" }] : []),
    ...groups.map((g) => ({ id: g.id, text: `▦ ${g.name}`, group: "Groups" })),
    ...noPrefab(zoneObjects).map((o) => ({ id: o.id, text: `${o.label || o.assetId} (${short(o.id)})`, group: "Objects" })),
    ...zonePlatforms.map((p) => ({ id: p.id, text: `${p.label || "Platform"} (${short(p.id)})`, group: "Platforms" })),
    ...noPrefab(zoneShapes).map((s) => ({ id: s.id, text: `${s.label || s.kind} (${short(s.id)})`, group: "Shapes" })),
    ...zoneLightDefs.map((l) => ({ id: l.id, text: `💡 ${l.label || l.kind} (${short(l.id)})`, group: "Lights" })),
    ...noPrefab(zoneStairs).map((s) => ({ id: s.id, text: `${s.label || "Stair"} (${short(s.id)})`, group: "Stairs" })),
    ...noPrefab(zoneWalls).map((w) => ({ id: w.id, text: `${w.label || "Wall"} (${short(w.id)})`, group: "Walls" })),
    ...zoneFloors.map((f) => ({ id: f.id, text: `${f.label || `Floor · level ${f.level}`} (${short(f.id)})`, group: "Floors" })),
    ...noPrefab(triggerVolumes).map((v) => ({ id: v.id, text: `${v.label || "Volume"} (${short(v.id)})`, group: "Trigger Volumes" })),
  ];
  return <TargetCombobox targetId={targetId} opts={opts} onChange={onChange} />;
}

// ── StateScopePicker (Phase 60) ───────────────────────────────────────────────
// "Whose state?" — Global (default) / ★ this entity / a specific object or
// trigger volume (the state-owning entity kinds). Groups only where the write
// fans out (actions). Writes "" for global — callers map that to undefined.
// The raw namespaced key is never shown anywhere; this picker IS the scope UI.
function StateScopePicker({
  value,
  zoneObjects,
  triggerVolumes,
  groups = [],
  allowGroups,
  allowSelf,
  selfLabel = "★ this entity",
  globalLabel = "🌐 Global",
  ownerId,
  onChange,
}: {
  value: string;
  zoneObjects: WorldObject[];
  triggerVolumes: TriggerVolume[];
  groups?: GroupDef[];
  allowGroups?: boolean;   // actions fan out per member; conditions/triggers stay single
  allowSelf?: boolean;     // owned scripts + dialogue options ("self" re-resolves at runtime)
  selfLabel?: string;
  globalLabel?: string;
  ownerId?: string;        // the owning entity — its prefab SIBLINGS become targetable
  onChange: (id: string) => void;
}) {
  // Prefab members are hidden — EXCEPT siblings of the owner's own instance:
  // member ids survive re-expansion (existingIds preserves them) and prefab
  // capture remaps intra-prefab references, so same-instance targeting is
  // stable. Other instances' members stay hidden (their ids aren't yours).
  const ownerInst = ownerId
    ? (zoneObjects.find(o => o.id === ownerId)?.prefab?.instanceId
       ?? triggerVolumes.find(v => v.id === ownerId)?.prefab?.instanceId)
    : undefined;
  const visible = <T extends { prefab?: { instanceId: string } }>(arr: T[]): T[] =>
    arr.filter(e => !e.prefab || (ownerInst != null && e.prefab.instanceId === ownerInst));
  const mark = (e: { prefab?: unknown }, text: string) => (e.prefab ? `⬡ ${text}` : text);
  const short = (id: string) => id.slice(0, 8);
  // Type-to-filter combobox (same widget as action targets) — every "Whose
  // state" list is searchable, which matters once entity lists get long.
  const opts: TargetOpt[] = [
    { id: "", text: globalLabel, group: "Scope" },
    ...(allowSelf ? [{ id: "self", text: selfLabel, group: "Scope" }] : []),
    ...(allowGroups ? groups.map(g => ({ id: g.id, text: `▦ ${g.name}`, group: "Groups (every member)" })) : []),
    ...visible(zoneObjects).map(o => ({ id: o.id, text: mark(o, `${o.label || o.assetId} (${short(o.id)})`), group: "Objects" })),
    ...visible(triggerVolumes).map(v => ({ id: v.id, text: mark(v, `${v.label || "Volume"} (${short(v.id)})`), group: "Trigger Volumes" })),
  ];
  if (!opts.some(o => o.id === value)) opts.push({ id: value, text: `${value} (missing)`, group: "Missing" });
  return <TargetCombobox targetId={value} opts={opts} onChange={onChange} />;
}

/** The entities a "Whose state" target resolves to: the entity itself, or — for
 *  a group id — every member entity (group scopes fan out per member). */
function resolveStateEntities(
  targetId: string | undefined, ownerId: string | undefined,
  zoneObjects: WorldObject[], triggerVolumes: TriggerVolume[],
): Array<{ stateSchema?: Record<string, StateSchema> }> {
  const rid = targetId === "self" ? ownerId : targetId;
  if (!rid) return [];
  const direct = zoneObjects.find(o => o.id === rid) ?? triggerVolumes.find(v => v.id === rid);
  if (direct) return [direct];
  const members = [...zoneObjects, ...triggerVolumes]
    .filter(e => ((e as { groupIds?: string[] }).groupIds ?? []).includes(rid));
  return members;
}

/** Registered per-entity state keys for a "Whose state" target ("self" resolves
 *  through ownerId; a group unions its members' keys). Returns UNDEFINED for the
 *  global scope (callers fall back to the global key list) and a possibly-EMPTY
 *  array for an entity scope — an entity's suggestions are exactly its own keys,
 *  never the global list (global "Hearts" on "★ this object" was a lie). */
function entityStateKeys(
  targetId: string | undefined, ownerId: string | undefined,
  zoneObjects: WorldObject[], triggerVolumes: TriggerVolume[],
): string[] | undefined {
  const rid = targetId === "self" ? ownerId : targetId;
  if (!rid) return undefined;   // global scope
  const keys = new Set<string>();
  for (const e of resolveStateEntities(targetId, ownerId, zoneObjects, triggerVolumes)) {
    for (const k of Object.keys(e.stateSchema ?? {})) keys.add(k);
  }
  return [...keys];
}

/** ConditionRow's optional entity-scope context (Phase 60). */
interface ConditionScope {
  zoneObjects:    WorldObject[];
  triggerVolumes: TriggerVolume[];
  allowSelf:      boolean;
  selfLabel?:     string;
  ownerId?:       string;   // owning entity — enables prefab-sibling targets + scoped key suggestions
  stateKeyTypes?: Record<string, StateSchema["type"]>;   // merged scene/game schema (boolean value pickers)
}

// ── TargetCombobox ────────────────────────────────────────────────────────────
// Type-to-filter replacement for the plain target <select>: a level with many
// entities makes an unfiltered dropdown unusable. Text input filters by label
// or id; the list opens on focus, mousedown picks (fires before blur), Enter
// picks the first match, Escape closes.

interface TargetOpt { id: string; text: string; group: string }

function TargetCombobox({
  targetId,
  opts,
  onChange,
}: {
  targetId: string;
  opts: TargetOpt[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [flipUp, setFlipUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Open upward when the space below can't fit the list — panels reach the
  // bottom of the screen and a downward popup would be clipped/offscreen.
  const measureFlip = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setFlipUp(window.innerHeight - r.bottom < 230);
  };
  const current = opts.find((o) => o.id === targetId);
  const display = open ? query : current?.text ?? (targetId ? `${targetId} (custom)` : "");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? opts.filter((o) => o.text.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))
    : opts;
  const pick = (id: string) => { onChange(id); setOpen(false); setQuery(""); };
  let lastGroup = "";
  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        style={S.field}
        placeholder="— pick target (type to filter) —"
        value={display}
        onFocus={() => { measureFlip(); setOpen(true); setQuery(""); }}
        onBlur={() => setOpen(false)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Enter" && filtered.length > 0) { pick(filtered[0]!.id); (e.target as HTMLInputElement).blur(); }
        }}
      />
      {open && (
        <div
          // Keep the input focused for ANY mouse-down inside the popup — including
          // its scrollbar — otherwise the input blurs and the list closes mid-scroll.
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "absolute", left: 0, right: 0, zIndex: 20,
            ...(flipUp ? { bottom: "100%", marginBottom: 2 } : { top: "100%", marginTop: 2 }),
            maxHeight: 220, overflowY: "auto",
            background: "rgba(24,26,33,0.98)", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 4, boxShadow: "0 6px 16px rgba(0,0,0,0.5)",
          }}
        >
          {targetId && !q && (
            <div
              style={{ padding: "5px 8px", fontSize: 11, color: "#8b94a8", cursor: "pointer" }}
              onMouseDown={(e) => { e.preventDefault(); pick(""); }}
            >
              — clear target —
            </div>
          )}
          {filtered.length === 0 && (
            <div style={{ padding: "5px 8px", fontSize: 11, color: "#98a2b8", fontStyle: "italic" }}>no matches</div>
          )}
          {filtered.map((o) => {
            const header = o.group !== lastGroup ? (lastGroup = o.group) : null;
            return (
              <Fragment key={o.id}>
                {header && <div style={{ ...S.fieldLabel, padding: "5px 8px 2px" }}>{header}</div>}
                <div
                  style={{
                    padding: "4px 8px 4px 14px", fontSize: 11, fontFamily: "monospace", cursor: "pointer",
                    color: o.id === targetId ? "#80aaff" : "#d4d8e2",
                    background: o.id === targetId ? "rgba(80,140,255,0.12)" : "transparent",
                  }}
                  onMouseDown={(e) => { e.preventDefault(); pick(o.id); }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.background = o.id === targetId ? "rgba(80,140,255,0.12)" : "transparent"; }}
                >
                  {o.text}
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── KeySuggestInput ───────────────────────────────────────────────────────────
// State-key field with a CUSTOM suggestion popup (replaces native <datalist>,
// whose browser-positioned dropdown can't flip and rendered offscreen when a
// row sits near the bottom of the panel). Typing filters; near the bottom the
// list opens ABOVE the input. No `suggestions` prop = the global key list
// (read from the #wb-state-keys datalist, so deep fields need no threading).
function KeySuggestInput({ value, suggestions, placeholder, onChange }: {
  value: string;
  suggestions?: string[];
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [flipUp, setFlipUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // undefined = global scope (read the global list); an ARRAY — even empty — is
  // the scope's exact key set and never falls back.
  const all = suggestions !== undefined
    ? suggestions
    : [...((document.getElementById("wb-state-keys") as HTMLDataListElement | null)?.options ?? [])].map(o => o.value);
  const q = value.trim().toLowerCase();
  const filtered = q ? all.filter(k => k.toLowerCase().includes(q)) : all;
  const openAt = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setFlipUp(window.innerHeight - r.bottom < 190);
    setOpen(true);
  };
  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", minWidth: 90 }}>
      <input style={S.field} placeholder={placeholder} value={value}
        onFocus={openAt}
        onBlur={() => setOpen(false)}
        onChange={e => { onChange(e.target.value); openAt(); }}
        onKeyDown={e => { if (e.key === "Escape" || e.key === "Enter") { setOpen(false); (e.target as HTMLInputElement).blur(); } }} />
      {open && filtered.length > 0 && (
        <div onMouseDown={(e) => e.preventDefault()} style={{ position: "absolute", left: 0, right: 0, zIndex: 20,
          ...(flipUp ? { bottom: "100%", marginBottom: 2 } : { top: "100%", marginTop: 2 }),
          maxHeight: 180, overflowY: "auto",
          background: "rgba(24,26,33,0.98)", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 4, boxShadow: "0 6px 16px rgba(0,0,0,0.5)" }}>
          {filtered.map(k => (
            <div key={k}
              style={{ padding: "4px 8px", fontSize: 11, fontFamily: "monospace", cursor: "pointer", color: "#d4d8e2" }}
              onMouseDown={e => { e.preventDefault(); onChange(k); setOpen(false); }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = "rgba(255,255,255,0.08)"; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = "transparent"; }}>
              {k}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PositionSourcePicker ──────────────────────────────────────────────────────────
// For store_position's "object position" source: lists every entity that has a real
// `position` (objects, platforms, trigger volumes) so a checkpoint/teleport target can
// be read from any of them — not just model objects. Stairs/walls/floors are node- or
// segment-based with no single position, so they're excluded. No groups (a pose comes
// from one entity, not a set).
function PositionSourcePicker({
  targetId,
  zoneObjects,
  zonePlatforms,
  zoneCheckpoints,
  triggerVolumes,
  onChange,
}: {
  targetId: string;
  zoneObjects: WorldObject[];
  zonePlatforms: PlatformDef[];
  zoneCheckpoints: CheckpointDef[];
  triggerVolumes: TriggerVolume[];
  onChange: (id: string) => void;
}) {
  // Prefab members (e.g. every tile of a tiled platform) are generated internals —
  // dozens per instance, and rebuilds churn their ids — so they're not offered.
  const objects = zoneObjects.filter((o) => !o.prefab);
  const known =
    objects.some((o) => o.id === targetId) ||
    zonePlatforms.some((p) => p.id === targetId) ||
    zoneCheckpoints.some((c) => c.id === targetId) ||
    triggerVolumes.some((v) => v.id === targetId);
  return (
    <select
      style={S.select}
      value={targetId}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— pick entity —</option>
      {zoneCheckpoints.length > 0 && (
        <optgroup label="Checkpoints">
          {zoneCheckpoints.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label || "Checkpoint"} ({c.id.slice(0, 8)})
            </option>
          ))}
        </optgroup>
      )}
      {objects.length > 0 && (
        <optgroup label="Objects">
          {objects.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label || o.assetId} ({o.id.slice(0, 8)})
            </option>
          ))}
        </optgroup>
      )}
      {zonePlatforms.length > 0 && (
        <optgroup label="Platforms">
          {zonePlatforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label || "Platform"} ({p.id.slice(0, 8)})
            </option>
          ))}
        </optgroup>
      )}
      {triggerVolumes.length > 0 && (
        <optgroup label="Trigger Volumes">
          {triggerVolumes.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label || "Volume"} ({v.id.slice(0, 8)})
            </option>
          ))}
        </optgroup>
      )}
      {targetId && !known && (
        <option value={targetId}>{targetId} (custom)</option>
      )}
    </select>
  );
}

// ── ConditionRow ──────────────────────────────────────────────────────────────


// ── Phase 66 — cards vocabulary ───────────────────────────────────────────────
const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';

const ACTION_LABELS: Record<ActionType, string> = {
  play_sound: "play sound", stop_sound: "stop sound", play_music: "play music", stop_music: "stop music",
  set_footstep: "set footstep sound", show_dialogue: "show dialogue", move_object: "move", play_animation: "play animation",
  spawn_npc: "spawn NPC", despawn_object: "despawn", spawn_object: "spawn", change_material: "change material",
  open_door: "open door", close_door: "close door", set_state: "set state", adjust_number: "adjust number",
  delete_state: "delete state", store_position: "store position", fire_event: "fire event", fade_screen: "fade screen",
  teleport_player: "teleport player", launch_player: "launch player", respawn_player: "respawn player",
  show_ui: "show UI", hide_ui: "hide UI", run_script: "run script", load_scene: "load scene",
  start_mover: "start mover", stop_mover: "stop mover", toggle_mover: "toggle mover", flash_player: "flash player",
  light_on: "light on", light_off: "light off", toggle_light: "toggle light",
  give_item: "give item", take_item: "take item", transfer_item: "transfer item",
};
const TRIGGER_LABELS: Record<TriggerType, string> = {
  on_player_enter: "when the player enters", on_player_exit: "when the player leaves", on_interact: "when the player interacts with",
  on_timer: "every N seconds", on_state_changed: "when a state changes", on_state_equals: "when a state becomes a value",
  on_level_load: "when the level loads", on_game_start: "on game start", on_health_zero: "when health reaches 0",
  on_dialogue_end: "when a dialogue ends", on_player_detected: "when this enemy spots the player",
  on_player_lost: "when this enemy loses the player", on_enemy_attack: "when this enemy attacks",
};

/** Small stroke icons, one style, so cards read at a glance. */
function Ic({ name, size = 16 }: { name: string; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "clock":   return <svg {...p}><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" /></svg>;
    case "enter":   return <svg {...p}><path d="M3 8h7M7 4.5 10.5 8 7 11.5" /><path d="M12.5 3v10" /></svg>;
    case "play":    return <svg {...p}><path d="M5 3.5v9l7-4.5z" /></svg>;
    case "sound":   return <svg {...p}><path d="M3 6.5v3h2.5L9 12V4L5.5 6.5z" /><path d="M11 6a3 3 0 0 1 0 4" /></svg>;
    case "despawn": return <svg {...p}><rect x="3" y="3" width="10" height="10" rx="2" /><path d="M6 6l4 4M10 6l-4 4" /></svg>;
    case "spawn":   return <svg {...p}><rect x="3" y="3" width="10" height="10" rx="2" /><path d="M8 5.5v5M5.5 8h5" /></svg>;
    case "state":   return <svg {...p}><rect x="2" y="5" width="12" height="6" rx="3" /><circle cx="10" cy="8" r="1.8" fill="currentColor" stroke="none" /></svg>;
    case "branch":  return <svg {...p}><path d="M8 2v4M8 6l-4 4M8 6l4 4M4 10v4M12 10v4" /></svg>;
    case "plus":    return <svg {...p}><path d="M8 3.5v9M3.5 8h9" /></svg>;
    case "dots":    return <svg {...p}><circle cx="4" cy="8" r="1.2" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" /><circle cx="12" cy="8" r="1.2" fill="currentColor" stroke="none" /></svg>;
    case "player":  return <svg {...p}><circle cx="8" cy="5" r="2.5" /><path d="M3.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" /></svg>;
    case "item":    return <svg {...p}><path d="M3 6h10l-1 7.5H4z" /><path d="M6 6V4.5a2 2 0 0 1 4 0V6" /></svg>;
    case "flow":    return <svg {...p}><path d="M2.5 8h6M8.5 8l-2.5-2.5M8.5 8 6 10.5" /><rect x="10" y="4" width="3.5" height="8" rx="1" /></svg>;
    case "light":   return <svg {...p}><path d="M5.5 10.5a4 4 0 1 1 5 0v1.5h-5z" /><path d="M6.5 14h3" /></svg>;
    case "move":    return <svg {...p}><path d="M8 2v12M2 8h12M8 2 6 4M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2" /></svg>;
    case "door":    return <svg {...p}><rect x="3.5" y="2.5" width="9" height="11" rx="1" /><circle cx="10" cy="8" r="0.9" fill="currentColor" stroke="none" /></svg>;
    case "mover":   return <svg {...p}><path d="M2.5 8h11M10.5 5l3 3-3 3" /><rect x="2.5" y="11.5" width="11" height="2" rx="1" /></svg>;
    case "material":return <svg {...p}><circle cx="8" cy="8" r="6" /><path d="M8 2a6 6 0 0 1 0 12" fill="currentColor" stroke="none" opacity="0.5" /></svg>;
    case "dialogue":return <svg {...p}><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" /></svg>;
    default:        return <svg {...p}><circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" /></svg>;
  }
}

function actionFamily(type: ActionType): { icon: string; tint: string } {
  switch (type) {
    case "play_sound": case "stop_sound": case "play_music": case "stop_music": case "set_footstep": return { icon: "sound", tint: "#44cc88" };
    case "set_state": case "adjust_number": case "delete_state": case "store_position": case "fire_event": return { icon: "state", tint: "#e8c14b" };
    case "teleport_player": case "launch_player": case "respawn_player": case "flash_player": case "fade_screen": return { icon: "player", tint: "#c48cff" };
    case "give_item": case "take_item": case "transfer_item": return { icon: "item", tint: "#e0a050" };
    case "show_dialogue": return { icon: "dialogue", tint: "#80aaff" };
    case "show_ui": case "hide_ui": case "run_script": case "load_scene": return { icon: "flow", tint: "#80aaff" };
    case "play_animation": return { icon: "play", tint: "#80aaff" };
    case "despawn_object": return { icon: "despawn", tint: "#cc6666" };
    case "spawn_object": case "spawn_npc": return { icon: "spawn", tint: "#44cc88" };
    case "light_on": case "light_off": case "toggle_light": return { icon: "light", tint: "#e8c14b" };
    case "start_mover": case "stop_mover": case "toggle_mover": return { icon: "mover", tint: "#80aaff" };
    case "open_door": case "close_door": return { icon: "door", tint: "#80aaff" };
    case "move_object": return { icon: "move", tint: "#80aaff" };
    case "change_material": return { icon: "material", tint: "#80aaff" };
    default: return { icon: "dot", tint: "#8b94a8" };
  }
}

interface NameCtx {
  zoneObjects: WorldObject[]; triggerVolumes: TriggerVolume[]; groups?: GroupDef[]; zoneLights?: LightDef[];
  zoneDialogues?: DialogueTreeDef[]; worldItems?: ItemDef[]; uiElements?: UiElementDef[];
  owner?: { id: string; kind: "object" | "volume" };
}
const nameOf = (id: string | undefined, ctx: NameCtx): string => {
  if (!id) return "";
  if (id === "self") return ctx.owner ? `★ this ${ctx.owner.kind}` : "★ this";
  if (id === "player" || id === "__player__") return "the player";
  const g = ctx.groups?.find(x => x.id === id); if (g) return `⊞ ${g.name}`;
  const o = ctx.zoneObjects.find(x => x.id === id); if (o) return o.label || id;
  const v = ctx.triggerVolumes.find(x => x.id === id); if (v) return v.label || id;
  const l = ctx.zoneLights?.find(x => x.id === id); if (l) return l.label || id;
  return id;
};
const soundName = (id: string | undefined): string => (id ? (assetManager.getSoundDef(id)?.label ?? id) : "");
const fmtVec = (v: { x: number; y: number; z: number } | undefined): string => v ? `${v.x} · ${v.y} · ${v.z}` : "";
const fmtVal = (v: unknown): string => v === "__toggle__" ? "toggle" : v == null ? "?" : typeof v === "string" ? v : JSON.stringify(v);

/** Card title/subtitle for an action, with ids resolved to names. */
function describeAction(a: ScriptAction, ctx: NameCtx): { title: string; sub: string } {
  const verb = ACTION_LABELS[a.type] ?? a.type;
  const tgt = nameOf(a.targetId, ctx);
  const scopeKey = (a.targetId ? `${tgt} › ` : "") + (a.stateKey ?? "?");
  let noun = ""; const tail: string[] = [];
  switch (a.type) {
    case "play_sound": noun = soundName(a.sound); if (a.volume != null) tail.push(`vol ${a.volume}`); if (tgt) tail.push(`at ${tgt}`); else if (a.position) tail.push(`at ${fmtVec(a.position)}`); if (a.loop) tail.push("loop"); break;
    case "stop_sound": case "set_footstep": noun = soundName(a.sound); break;
    case "play_music": noun = soundName(a.music ?? a.sound); if (a.volume != null) tail.push(`vol ${a.volume}`); if (a.loop === false) tail.push("no loop"); if (a.fadeSeconds) tail.push(`fade ${a.fadeSeconds}s`); break;
    case "stop_music": noun = "music"; if (a.fadeSeconds) tail.push(`fade ${a.fadeSeconds}s`); break;
    case "show_dialogue": noun = ctx.zoneDialogues?.find(d => d.id === a.dialogueId)?.label ?? a.dialogueId ?? ""; break;
    case "move_object": noun = tgt; if (a.position) tail.push(`to ${fmtVec(a.position)}`); break;
    case "play_animation": noun = a.animation ?? ""; if (tgt) tail.push(`on ${tgt}`); if (a.animationHold) tail.push("hold at end"); if (a.animationLoop) tail.push("loop"); break;
    case "despawn_object": case "spawn_object": noun = tgt; if (a.fadeSeconds) tail.push(`fade ${a.fadeSeconds}s`); break;
    case "change_material": noun = tgt; if (a.material) tail.push(a.material); break;
    case "set_state": noun = scopeKey; tail.push(`→ ${fmtVal(a.stateValue)}`); break;
    case "adjust_number": noun = scopeKey; if (a.numberDelta != null) tail.push(`${a.numberDelta >= 0 ? "+" : ""}${a.numberDelta}`); break;
    case "delete_state": noun = scopeKey; break;
    case "store_position": noun = a.positionKey ?? a.stateKey ?? ""; if (a.posSource === "object") tail.push(`of ${tgt}`); else if (a.posSource === "coords") tail.push(fmtVec(a.position)); else tail.push("of the player"); break;
    case "fire_event": noun = a.eventId ?? ""; break;
    case "fade_screen": noun = a.fadeColor ?? "black"; if (a.fadeDuration != null) tail.push(`${a.fadeDuration}s`); break;
    case "teleport_player": noun = a.positionKey ? `saved "${a.positionKey}"` : fmtVec(a.position); break;
    case "launch_player": noun = `${a.launchSpeed ?? 0} m/s up`; if (a.launchHSpeed) tail.push(`${a.launchHSpeed} m/s forward`); if (a.launchDirDeg != null) tail.push(`${a.launchDirDeg}°`); break;
    case "respawn_player": noun = a.positionKey ? `at "${a.positionKey}"` : "at the checkpoint"; if (a.restoreHealth) tail.push("restore health"); break;
    case "flash_player": noun = a.flashColor ?? ""; if (a.flashDuration != null) tail.push(`${a.flashDuration}s`); break;
    case "show_ui": case "hide_ui": noun = ctx.uiElements?.find(u => u.id === a.uiElementId)?.label ?? a.uiElementId ?? ""; break;
    case "run_script": noun = a.script ?? ""; break;
    case "load_scene": noun = a.sceneId ?? ""; if (a.fadeDuration != null) tail.push(`${a.fadeDuration}s fade`); break;
    case "give_item": case "take_item": case "transfer_item": {
      const item = ctx.worldItems?.find(i => i.id === a.itemId)?.label ?? a.itemId ?? "";
      noun = `${a.count ?? 1}× ${item}`;
      if (a.type === "transfer_item") tail.push(`${nameOf(a.fromId, ctx) || "?"} → ${nameOf(a.toId, ctx) || "?"}`); else if (tgt) tail.push(tgt);
      break;
    }
    default: noun = tgt;
  }
  if (a.delay) tail.push(`after ${a.delay}s`);
  const sub = [noun ? verb : "", ...tail].filter(Boolean).join(" · ");
  return { title: noun || verb, sub };
}

/** One condition as a sentence. */
function describeCondition(c: ScriptCondition, ctx: NameCtx, worldItems: ItemDef[]): string {
  const not = c.not ? "unless " : "";
  const scope = c.entityId ? `${nameOf(c.entityId, ctx)} › ` : "";
  const key = c.stateKey || "?";
  switch (c.type) {
    case "player_falling": return `${not}player is falling`;
    case "has_item": return `${not}has ${c.compareOp && c.compareOp !== ">=" ? c.compareOp + " " : ""}${c.count ?? 1}× ${worldItems.find(i => i.id === c.itemId)?.label ?? c.itemId ?? "?"}`;
    case "state_equals": return `${not}${scope}${key} = ${fmtVal(c.stateValue)}`;
    case "compare_number": return `${not}${scope}${key} ${c.compareOp ?? ">="} ${c.stateValue ?? "?"}`;
    default: return `${not}${scope}${key} is set`;
  }
}

const LINK_BTN: React.CSSProperties = { background: "none", border: "none", color: "#8b94a8", fontSize: 11, fontFamily: SANS, cursor: "pointer", padding: "2px 4px", opacity: 0.8 };
const ADD_CARD: React.CSSProperties = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: 8, borderRadius: 8,
  border: "1px dashed rgba(255,255,255,0.16)", background: "none", color: "#98a2b8", fontSize: 12, fontFamily: SANS, cursor: "pointer" };
const CHIP = (on: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", fontSize: 10, padding: "2px 8px", borderRadius: 10, cursor: "pointer", fontFamily: SANS,
  border: `1px solid ${on ? "rgba(80,140,255,0.5)" : "rgba(255,255,255,0.14)"}`, color: on ? "#80aaff" : "#98a2b8",
  background: on ? "rgba(80,140,255,0.1)" : "rgba(255,255,255,0.03)",
});

/** ⋯ menu shared by action cards. */
function CardMenu({ items, onClose }: { items: Array<{ label: string; onClick: () => void; danger?: boolean; heading?: boolean }>; onClose: () => void }) {
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <div className="wb-menu" onClick={(e) => e.stopPropagation()}
        style={{ position: "absolute", right: 6, top: 30, zIndex: 41, minWidth: 190, background: "rgba(28,28,28,0.99)",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, boxShadow: "0 6px 20px rgba(0,0,0,0.5)", padding: 3, display: "flex", flexDirection: "column" }}>
        {items.map((it, i) => it.heading
          ? <div key={i} style={{ ...S.fieldLabel, fontSize: 10, padding: "5px 8px 2px", color: "#6f7890" }}>{it.label}</div>
          : <button key={i} onClick={() => { onClose(); it.onClick(); }}
              style={{ textAlign: "left", background: "none", border: "none", padding: "6px 8px", borderRadius: 4, cursor: "pointer",
                color: it.danger ? "#cc6666" : "#c2cadb", fontSize: 11, fontFamily: SANS }}>{it.label}</button>)}
      </div>
    </>
  );
}

function ConditionRow({
  condition,
  worldItems,
  scope,
  onChange,
  onRemove,
}: {
  condition: ScriptCondition;
  worldItems: ItemDef[];
  /** Phase 60 — enables the "whose state" entity picker (single entities only). */
  scope?: ConditionScope;
  onChange: (c: ScriptCondition) => void;
  onRemove: () => void;
}) {
  // Phase 66 — a condition reads as a sentence; click it for its property rows.
  // A freshly added (blank) condition opens straight away.
  const blank = !condition.stateKey && !condition.itemId && condition.type === "has_state";
  const [open, setOpen] = useState(blank);
  const entKeys = scope ? entityStateKeys(condition.entityId, scope.ownerId, scope.zoneObjects, scope.triggerVolumes) : undefined;
  const ctx: NameCtx = { zoneObjects: scope?.zoneObjects ?? [], triggerVolumes: scope?.triggerVolumes ?? [],
    owner: scope?.ownerId ? { id: scope.ownerId, kind: scope.ownerId.startsWith("vol_") ? "volume" : "object" } : undefined };
  const text = describeCondition(condition, ctx, worldItems);
  const keyType = (() => {
    const targets = scope ? resolveStateEntities(condition.entityId, scope.ownerId, scope.zoneObjects, scope.triggerVolumes) : [];
    const t = targets.map(e => e.stateSchema?.[condition.stateKey ?? ""]?.type).find(Boolean);
    return t ?? (!targets.length ? scope?.stateKeyTypes?.[condition.stateKey ?? ""] : undefined);
  })();
  return (
    <>
      <span onClick={() => setOpen(o => !o)} title={open ? "Close" : "Edit this condition"}
        style={{ cursor: "pointer", fontFamily: "monospace", fontSize: 12, color: open ? "#80aaff" : "#dde3f0",
          borderBottom: `1px dotted ${open ? "#80aaff" : "rgba(221,227,240,0.35)"}`, lineHeight: 1.6 }}>
        {text}
      </span>
      {open && (
        <div onClick={(e) => e.stopPropagation()}
          style={{ flexBasis: "100%", width: "100%", margin: "4px 0 6px", padding: "0 10px 6px", borderRadius: 8,
            background: "rgba(80,140,255,0.06)", outline: "1px solid rgba(80,140,255,0.3)" }}>
          {scope && condition.type !== "player_falling" && condition.type !== "has_item" && (
            <F label="Whose state">
              <StateScopePicker
                value={condition.entityId ?? ""}
                zoneObjects={scope.zoneObjects}
                triggerVolumes={scope.triggerVolumes}
                allowSelf={scope.allowSelf}
                selfLabel={scope.selfLabel}
                ownerId={scope.ownerId}
                onChange={(id) => onChange({ ...condition, entityId: id || undefined })}
              />
            </F>
          )}
          {condition.type === "player_falling" && (
            <div style={{ color: "#98a2b8", fontSize: 11, fontFamily: SANS, padding: "8px 0" }}>
              Passes only while the player is airborne and moving downward — the goomba-stomp gate (walk-ins and rising jumps fail).
            </div>
          )}
          {(condition.type === "has_state" || condition.type === "state_equals" || condition.type === "compare_number") && (
            <F label="State key">
              <KeySuggestInput placeholder="state key" value={condition.stateKey ?? ""} suggestions={entKeys}
                onChange={(v) => onChange({ ...condition, stateKey: v })} />
            </F>
          )}
          <F label="Condition">
            <select style={S.select} value={condition.type}
              onChange={(e) => onChange({ ...condition, type: e.target.value as ConditionType })}>
              {CONDITION_TYPES.map((t) => <option key={t} value={t}>{CONDITION_LABELS[t] ?? t}</option>)}
            </select>
          </F>
          {condition.type === "state_equals" && (
            <F label="Equals">
              {keyType === "boolean" ? (
                <select style={S.select}
                  value={condition.stateValue === true ? "true" : condition.stateValue === false ? "false" : ""}
                  onChange={(e) => onChange({ ...condition,
                    stateValue: e.target.value === "true" ? true : e.target.value === "false" ? false : undefined })}>
                  <option value="">— pick —</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input style={S.field} placeholder="true / 3 / text"
                  value={condition.stateValue == null ? "" : String(condition.stateValue)}
                  onChange={(e) => onChange({ ...condition, stateValue: coerceStateValue(e.target.value) })} />
              )}
            </F>
          )}
          {condition.type === "compare_number" && (
            <F label="Compare">
              <select style={{ ...S.select, width: 64 }} value={condition.compareOp ?? ">="}
                onChange={(e) => onChange({ ...condition, compareOp: e.target.value as CompareOp })}>
                {COMPARE_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
              <input type="number" style={{ ...S.field, width: 80 }} placeholder="value"
                value={typeof condition.stateValue === "number" ? condition.stateValue : ""}
                onChange={(e) => onChange({ ...condition, stateValue: parseFloat(e.target.value) || 0 })} />
            </F>
          )}
          {condition.type === "has_item" && (
            <>
              <F label="Item">
                <ItemPicker style={S.select} itemId={condition.itemId ?? ""} worldItems={worldItems}
                  onChange={(id) => onChange({ ...condition, itemId: id || undefined })} />
              </F>
              <F label="Owned count">
                <select style={{ ...S.select, width: 64 }} title="owned count comparison (default: at least)"
                  value={condition.compareOp ?? ">="}
                  onChange={(e) => onChange({ ...condition, compareOp: e.target.value as CompareOp })}>
                  {COMPARE_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
                </select>
                <input type="number" min={0} style={{ ...S.field, width: 64 }} placeholder="1"
                  value={condition.count ?? ""}
                  onChange={(e) => onChange({ ...condition, count: parseInt(e.target.value, 10) || undefined })} />
              </F>
            </>
          )}
          <F label="Unless (invert)">
            <input type="checkbox" className="wb-switch" checked={condition.not ?? false}
              onChange={(e) => onChange({ ...condition, not: e.target.checked || undefined })} />
          </F>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, paddingTop: 6 }}>
            <button style={{ ...S.btn(), color: "#cc6666" }} onClick={onRemove}>remove condition</button>
            <button style={S.btn()} onClick={() => setOpen(false)}>done</button>
          </div>
        </div>
      )}
    </>
  );
}

// ── ItemPicker ────────────────────────────────────────────────────────────────
// Dropdown over the world's item registry, preserving a hand-entered id that
// isn't registered (the "(custom)" idiom shared with the dialogue picker).

function ItemPicker({
  itemId,
  worldItems,
  onChange,
  style,
}: {
  itemId: string;
  worldItems: ItemDef[];
  onChange: (id: string) => void;
  style?: React.CSSProperties;
}) {
  return (
    <select
      style={style ?? S.select}
      value={itemId}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— pick item —</option>
      {worldItems.map((it) => (
        <option key={it.id} value={it.id}>
          {it.label}
        </option>
      ))}
      {itemId && !worldItems.some((it) => it.id === itemId) && (
        <option value={itemId}>{itemId} (custom)</option>
      )}
    </select>
  );
}

// ── ActionRow ─────────────────────────────────────────────────────────────────

/** Phase 65/66 — one if-block as a grouped card: a header strip per branch
 *  (IF / ELSE IF / ELSE with its condition sentences), that branch's action
 *  cards beneath it, and a quiet footer for else-if / else / unwrap. */
function IfBlockCard({ block, number: _number, worldItems, scope, renderActions, onChange, onAddAction, onUnwrap, onDelete }: {
  block: ScriptIfBlock;
  number: number;
  worldItems: ItemDef[];
  scope: ConditionScope;
  renderActions: (branch: number) => React.ReactNode;
  onChange: (b: ScriptIfBlock) => void;
  onAddAction: (branch: number) => void;
  onUnwrap: () => void;
  onDelete: () => void;   // remove the block AND every action inside it
}) {
  const setBranch = (i: number, conditions: ScriptCondition[]) =>
    onChange({ ...block, branches: block.branches.map((br, j) => (j === i ? { conditions } : br)) });
  const head = (label: string, branch: number, conditions: ScriptCondition[] | null, onRemoveBranch?: () => void) => {
    const isElse = branch === -1;
    return (
      <div key={"h" + branch}
        style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px", padding: "8px 10px",
          background: isElse ? "rgba(255,255,255,0.04)" : "rgba(232,193,75,0.08)",
          borderTop: branch === 0 ? "none" : `1px solid ${isElse ? "rgba(255,255,255,0.08)" : "rgba(232,193,75,0.2)"}`,
          borderBottom: `1px solid ${isElse ? "rgba(255,255,255,0.08)" : "rgba(232,193,75,0.2)"}` }}>
        <span style={{ color: isElse ? "#8b94a8" : "#e8c14b", display: "flex" }}><Ic name="branch" size={14} /></span>
        <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: 1, color: isElse ? "#8b94a8" : "#e8c14b" }}>{label}</span>
        {conditions && conditions.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <span style={{ color: "#8b94a8", fontSize: 11, fontFamily: SANS }}>and</span>}
            <ConditionRow condition={c} worldItems={worldItems} scope={scope}
              onChange={(nc) => setBranch(branch, conditions.map((x, j) => (j === i ? nc : x)))}
              onRemove={() => setBranch(branch, conditions.filter((_, j) => j !== i))} />
          </Fragment>
        ))}
        {conditions && conditions.length === 0 && <span style={{ color: "#ccaa44", fontSize: 10, fontFamily: SANS }}>⚠ no conditions — always passes</span>}
        {conditions && <button style={LINK_BTN} title="Add a condition (all must pass)"
          onClick={() => setBranch(branch, [...conditions, { type: "has_state" } as ScriptCondition])}>+ and</button>}
        <span style={{ flex: 1 }} />
        {onRemoveBranch && <button style={LINK_BTN} title="Remove this branch — its actions move to the top level" onClick={onRemoveBranch}>×</button>}
      </div>
    );
  };
  const body = (branch: number) => (
    <div key={"b" + branch} style={{ padding: 6, display: "flex", flexDirection: "column", gap: 6 }}>
      {renderActions(branch)}
      <button style={ADD_CARD} onClick={() => onAddAction(branch)}><Ic name="plus" size={12} /> action</button>
    </div>
  );
  return (
    <div style={{ margin: "0 0 6px", borderRadius: 10, border: "1px solid rgba(232,193,75,0.3)", overflow: "hidden" }}>
      {block.branches.map((br, i) => (
        <div key={i}>
          {head(i === 0 ? "IF" : "ELSE IF", i, br.conditions, i === 0 ? undefined : () => onChange({ ...block, branches: block.branches.filter((_, j) => j !== i) }))}
          {body(i)}
        </div>
      ))}
      {block.else && <div>{head("ELSE", -1, null, () => onChange({ ...block, else: false }))}{body(-1)}</div>}
      <div style={{ display: "flex", gap: 8, padding: "4px 10px 8px", background: "rgba(255,255,255,0.02)" }}>
        <button style={LINK_BTN} title="Add an else-if branch (checked only when the branches above fail)"
          onClick={() => onChange({ ...block, branches: [...block.branches, { conditions: [{ type: "has_state" } as ScriptCondition] }] })}>+ else if</button>
        {!block.else && <button style={LINK_BTN} title="Add an else branch (runs when every branch above fails)"
          onClick={() => onChange({ ...block, else: true })}>+ else</button>}
        <span style={{ flex: 1 }} />
        <button style={LINK_BTN} title="Remove the block — its actions become top-level (nothing is deleted)" onClick={onUnwrap}>unwrap</button>
        <button style={{ ...LINK_BTN, color: "#cc6666" }} title="Delete the block and every action inside it" onClick={onDelete}>delete block</button>
      </div>
    </div>
  );
}

function ActionRow({
  action,
  stateKeyTypes,
  zoneObjects,
  zonePlatforms,
  zoneShapes,
  zoneLights,
  zoneStairs,
  zoneWalls,
  zoneFloors,
  zoneCheckpoints,
  triggerVolumes,
  groups,
  assets,
  zoneDialogues,
  worldItems,
  uiElements,
  projectSceneIds,
  playerModelAssetId,
  owner,
  blocks,
  open: openProp,
  onToggle,
  onWrap,
  onMove,
  onDuplicate,
  onChange,
  onRemove,
}: {
  action: ScriptAction;
  zoneObjects: WorldObject[];
  zonePlatforms: PlatformDef[];
  zoneShapes: ShapeDef[];
  zoneLights: LightDef[];
  zoneStairs: StairDef[];
  zoneWalls: WallDef[];
  zoneFloors: FloorDef[];
  zoneCheckpoints: CheckpointDef[];
  triggerVolumes: TriggerVolume[];
  groups: GroupDef[];
  assets: AssetDef[];
  zoneDialogues: DialogueTreeDef[];
  worldItems: ItemDef[];
  uiElements: UiElementDef[];
  projectSceneIds?: string[];
  playerModelAssetId?: string;
  owner?: { id: string; kind: "object" | "volume" };
  stateKeyTypes?: Record<string, StateSchema["type"]>;
  blocks?: ScriptIfBlock[];                               // Phase 65 — destinations for "move to"
  open?: boolean;                                          // Phase 66 — controlled open state (editor keeps one card open)
  onToggle?: () => void;
  onWrap?: () => void;                                     // wrap this (top-level) action in a new if-block
  onMove?: (tag: { id: string; branch: number } | undefined) => void;
  onDuplicate?: () => void;
  onChange: (a: ScriptAction) => void;
  onRemove: () => void;
}) {
  // Phase 66 — the action is a card: icon tile, title (the thing), subtitle
  // (verb · parameters), ⋯ menu; click to open its property rows.
  const [selfOpen, setSelfOpen] = useState(false);
  const open = openProp ?? selfOpen;
  const toggle = onToggle ?? (() => setSelfOpen(o => !o));
  const [menu, setMenu] = useState(false);
  const fam = actionFamily(action.type);
  const d = describeAction(action, { zoneObjects, triggerVolumes, groups, zoneLights, zoneDialogues, worldItems, uiElements, owner });
  const condText = (conds: ScriptCondition[]) => conds.map(c => describeCondition(c, { zoneObjects, triggerVolumes, owner }, worldItems)).join(" and ") || "(always)";
  const menuItems: Array<{ label: string; onClick: () => void; danger?: boolean; heading?: boolean }> = [];
  if (onWrap) menuItems.push({ label: "Wrap in an if-block", onClick: onWrap });
  if (onMove && blocks && blocks.length) {
    menuItems.push({ label: "Move to", onClick: () => {}, heading: true });
    if (action.block) menuItems.push({ label: "top level", onClick: () => onMove(undefined) });
    blocks.forEach((b) => {
      b.branches.forEach((br, j) => {
        if (action.block?.id === b.id && action.block.branch === j) return;
        menuItems.push({ label: `${j === 0 ? "if" : "else if"} ${condText(br.conditions)}`, onClick: () => onMove({ id: b.id, branch: j }) });
      });
      if (b.else && !(action.block?.id === b.id && action.block.branch === -1))
        menuItems.push({ label: `else (of if ${condText(b.branches[0]?.conditions ?? [])})`, onClick: () => onMove({ id: b.id, branch: -1 }) });
    });
  }
  if (onDuplicate) menuItems.push({ label: "Duplicate", onClick: onDuplicate });
  menuItems.push({ label: "Delete", onClick: onRemove, danger: true });
  return (
    <div style={{ marginBottom: 6 }}>
      <div onClick={toggle} title={open ? "Close" : "Edit this action"}
        style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, cursor: "pointer",
          background: open ? "rgba(80,140,255,0.08)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${open ? "rgba(80,140,255,0.5)" : "rgba(255,255,255,0.07)"}` }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          background: fam.tint + "22", color: fam.tint }}><Ic name={fam.icon} /></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: "#dde3f0", fontWeight: 600, fontSize: 13, fontFamily: SANS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</div>
          {d.sub && <div style={{ color: "#8b94a8", fontSize: 11, fontFamily: "monospace", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.sub}</div>}
        </div>
        <button title="More…" onClick={(e) => { e.stopPropagation(); setMenu(m => !m); }}
          style={{ background: "none", border: "none", color: "#8b94a8", cursor: "pointer", padding: "2px 4px", borderRadius: 4, display: "flex" }}>
          <Ic name="dots" />
        </button>
        {menu && <CardMenu items={menuItems} onClose={() => setMenu(false)} />}
      </div>
      {open && (
        <div style={{ padding: "2px 10px 6px" }} onClick={(e) => e.stopPropagation()}>
          <F label="Action">
            <select style={S.select} value={action.type}
              onChange={(e) => {
                const type = e.target.value as ActionType;
                onChange({ type, delay: action.delay, block: action.block,
                  ...(type === "launch_player" && owner ? { launchRelativeTo: "entity" as const } : {}) });
              }}>
              {[...ACTION_TYPES].sort((a, b) => ACTION_LABELS[a].localeCompare(ACTION_LABELS[b])).map((t) => (
                <option key={t} value={t}>{ACTION_LABELS[t]}</option>
              ))}
            </select>
          </F>
          <ActionFields
            stateKeyTypes={stateKeyTypes}
            action={action}
            zoneObjects={zoneObjects}
            zonePlatforms={zonePlatforms}
            zoneShapes={zoneShapes}
            zoneLights={zoneLights}
            zoneStairs={zoneStairs}
            zoneWalls={zoneWalls}
            zoneFloors={zoneFloors}
            zoneCheckpoints={zoneCheckpoints}
            triggerVolumes={triggerVolumes}
            groups={groups}
            assets={assets}
            zoneDialogues={zoneDialogues}
            worldItems={worldItems}
            uiElements={uiElements}
            projectSceneIds={projectSceneIds}
            playerModelAssetId={playerModelAssetId}
            owner={owner}
            onChange={onChange}
          />
          <F label="After (s)" style={{ borderBottom: "none" }}>
            <RangeField value={action.delay} min={0} max={10} step={0.1} unit="s"
              onChange={(v) => onChange({ ...action, delay: v && v > 0 ? v : undefined })} />
          </F>
        </div>
      )}
    </div>
  );
}

function ActionFields({
  action,
  stateKeyTypes,
  zoneObjects,
  zonePlatforms,
  zoneShapes,
  zoneLights,
  zoneStairs,
  zoneWalls,
  zoneFloors,
  zoneCheckpoints,
  triggerVolumes,
  groups,
  assets,
  zoneDialogues,
  worldItems,
  uiElements,
  projectSceneIds,
  playerModelAssetId,
  owner,
  onChange,
}: {
  action: ScriptAction;
  zoneObjects: WorldObject[];
  zonePlatforms: PlatformDef[];
  zoneShapes: ShapeDef[];
  zoneLights: LightDef[];
  zoneStairs: StairDef[];
  zoneWalls: WallDef[];
  zoneFloors: FloorDef[];
  zoneCheckpoints: CheckpointDef[];
  triggerVolumes: TriggerVolume[];
  groups: GroupDef[];
  assets: AssetDef[];
  zoneDialogues: DialogueTreeDef[];
  worldItems: ItemDef[];
  uiElements: UiElementDef[];
  projectSceneIds?: string[];
  playerModelAssetId?: string;
  owner?: { id: string; kind: "object" | "volume" };
  stateKeyTypes?: Record<string, StateSchema["type"]>;
  onChange: (a: ScriptAction) => void;
}) {
  function set(changes: Partial<ScriptAction>): void {
    onChange({ ...action, ...changes });
  }
  // move / change_material / play_animation only act on objects at runtime → object-only.
  // A volume owner is omitted: "★ this volume" would save a self target these actions
  // silently no-op on (a volume has no mesh/clips/door) — the trap a user hit with
  // play_animation on a bite-trigger volume, where the CLIP list stayed empty.
  const targetPicker = (
    <ActionTargetPicker
      targetId={action.targetId ?? ""}
      zoneObjects={zoneObjects}
      groups={groups}
      owner={owner?.kind === "object" ? owner : undefined}
      onChange={(id) => set({ targetId: id })}
    />
  );
  // play_animation can also target the PLAYER avatar (CharacterController override).
  const animTargetPicker = (
    <ActionTargetPicker
      targetId={action.targetId ?? ""}
      zoneObjects={zoneObjects}
      groups={groups}
      includePlayer
      owner={owner?.kind === "object" ? owner : undefined}
      onChange={(id) => set({ targetId: id })}
    />
  );
  // Phase 60 — "whose state" scope for the state/item actions (targetId doubles
  // as the entity scope there; groups fan out per member at dispatch).
  // Scope-aware key suggestions for set_state / adjust_number: an entity scope
  // suggests THAT entity's registered state keys instead of the global list.
  const scopedStateKeys = entityStateKeys(action.targetId, owner?.id, zoneObjects, triggerVolumes);
  // The current key's registered type (entity schema for entity scopes, else the
  // merged scene/game schema) — boolean keys get a true/false/toggle picker.
  const resolvedKeyType = (() => {
    const targets = resolveStateEntities(action.targetId, owner?.id, zoneObjects, triggerVolumes);
    for (const e of targets) {
      const t = e.stateSchema?.[action.stateKey ?? ""]?.type;
      if (t) return t;   // group scope: first member schema carrying the key wins
    }
    // Entity scopes never fall back to the global schema (entity keys are their own
    // namespace); only the global scope reads the merged scene/game map.
    return targets.length ? undefined : stateKeyTypes?.[action.stateKey ?? ""];
  })();

  const stateScopePicker = (
    <F label="Whose state" flex="0 0 128px">
      <StateScopePicker
        value={action.targetId ?? ""}
        zoneObjects={zoneObjects}
        triggerVolumes={triggerVolumes}
        groups={groups}
        allowGroups
        allowSelf={!!owner}
        selfLabel={owner ? `★ this ${owner.kind}` : undefined}
        ownerId={owner?.id}
        onChange={(id) => set({ targetId: id || undefined })}
      />
    </F>
  );
  // despawn_object works on every entity type at runtime → offer them all.
  const despawnTargetPicker = (
    <ActionTargetPicker
      targetId={action.targetId ?? ""}
      zoneObjects={zoneObjects}
      groups={groups}
      zonePlatforms={zonePlatforms}
      zoneShapes={zoneShapes}
      zoneStairs={zoneStairs}
      zoneWalls={zoneWalls}
      zoneFloors={zoneFloors}
      triggerVolumes={triggerVolumes}
      owner={owner}
      onChange={(id) => set({ targetId: id })}
    />
  );
  // start/stop/toggle_mover targets the entity types that can carry a mover
  // (objects, platforms, shapes — Phase 31). Volumes can't, so a volume owner
  // is omitted like the object-only picker above.
  const moverTargetPicker = (
    <ActionTargetPicker
      targetId={action.targetId ?? ""}
      zoneObjects={zoneObjects}
      groups={groups}
      zonePlatforms={zonePlatforms}
      zoneShapes={zoneShapes}
      owner={owner?.kind === "object" ? owner : undefined}
      onChange={(id) => set({ targetId: id })}
    />
  );
  // light_on/light_off/toggle_light target placed lights (groups pass through for
  // future group fan-out; lights carry no groupIds today).
  const lightTargetPicker = (
    <ActionTargetPicker
      targetId={action.targetId ?? ""}
      zoneObjects={[]}
      groups={groups}
      zoneLightDefs={zoneLights}
      onChange={(id) => set({ targetId: id })}
    />
  );
  // store_position (object source) can read a position from ANY positioned entity,
  // not just objects — objects, platforms, and trigger volumes all have `position`.
  const positionSourcePicker = (
    <PositionSourcePicker
      targetId={action.targetId ?? ""}
      zoneObjects={zoneObjects}
      zonePlatforms={zonePlatforms}
      zoneCheckpoints={zoneCheckpoints}
      triggerVolumes={triggerVolumes}
      onChange={(id) => set({ targetId: id })}
    />
  );
  // Clips available on the action's target object (empty for groups / unknown / no-anim assets).
  // "self" stays literal in the saved action (see ActionTargetPicker) — resolve it to the
  // owning entity here or the clip list stays empty for "★ this object".
  const resolvedTargetId = action.targetId === "self" ? owner?.id : action.targetId;
  const targetObj = zoneObjects.find((o) => o.id === resolvedTargetId);
  const targetClips =
    action.targetId === "player"
      ? (assets.find((a) => a.id === playerModelAssetId)?.animations ?? [])
      : (assets.find((a) => a.id === targetObj?.assetId)?.animations ?? []);

  switch (action.type) {
    case "show_dialogue":
      return (
        <>
          <F label="Dialogue">
          <select
            style={S.select}
            value={action.dialogueId ?? ""}
            onChange={(e) => set({ dialogueId: e.target.value || undefined })}
          >
            <option value="">— pick dialogue —</option>
            {zoneDialogues.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
            {/* Preserve a hand-entered / cross-zone id that isn't in this zone */}
            {action.dialogueId && !zoneDialogues.some((d) => d.id === action.dialogueId) && (
              <option value={action.dialogueId}>{action.dialogueId} (custom)</option>
            )}
          </select>
          </F>
          <div style={{ color: "#98a2b8", fontSize: 11, fontStyle: "italic", padding: "4px 0 0" }}>
            Manage dialogues in the DIALOGUE tab.
          </div>
        </>
      );

    case "give_item":
    case "take_item":
      return (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "flex-end" }}>
            <F label="Whose inventory" flex="0 0 128px">
              <StateScopePicker
                value={action.targetId ?? ""}
                zoneObjects={zoneObjects}
                triggerVolumes={triggerVolumes}
                groups={groups}
                allowGroups
                allowSelf={!!owner}
                selfLabel={owner ? `★ this ${owner.kind}` : undefined}
                globalLabel="★ the player"
                ownerId={owner?.id}
                onChange={(id) => set({ targetId: id || undefined })}
              />
            </F>
            <F label="Item" flex={1}>
              <ItemPicker
                style={S.select}
                itemId={action.itemId ?? ""}
                worldItems={worldItems}
                onChange={(id) => set({ itemId: id || undefined })}
              />
            </F>
            <F label="Count" flex="0 0 52px">
              <input
                type="number"
                min={1}
                style={S.field}
                placeholder="1"
                title="count"
                value={action.count ?? ""}
                onChange={(e) => set({ count: parseInt(e.target.value, 10) || undefined })}
              />
            </F>
          </div>
          <div style={{ color: "#98a2b8", fontSize: 11, fontStyle: "italic", padding: "4px 0 0" }}>
            {action.type === "give_item" ? "Creates items from nothing" : "Destroys items"} — to
            MOVE items between holders, use transfer_item. Manage items in the ITEMS tab.
          </div>
        </>
      );

    // Phase 60 — atomic conserving move between two inventories: moves
    // min(count, source balance, destination stack space); an empty source
    // moves nothing (no duplication possible).
    case "transfer_item": {
      const endpointPicker = (field: "fromId" | "toId") => (
        <StateScopePicker
          value={action[field] ?? ""}
          zoneObjects={zoneObjects}
          triggerVolumes={triggerVolumes}
          allowSelf={!!owner}
          selfLabel={owner ? `★ this ${owner.kind}` : undefined}
          globalLabel="★ the player"
          ownerId={owner?.id}
          onChange={(id) => set({ [field]: id || undefined })}
        />
      );
      return (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "flex-end" }}>
            <F label="Item" flex={1}>
              <ItemPicker
                style={S.select}
                itemId={action.itemId ?? ""}
                worldItems={worldItems}
                onChange={(id) => set({ itemId: id || undefined })}
              />
            </F>
            <F label="Count" flex="0 0 52px">
              <input
                type="number"
                min={1}
                style={S.field}
                placeholder="1"
                title="count"
                value={action.count ?? ""}
                onChange={(e) => set({ count: parseInt(e.target.value, 10) || undefined })}
              />
            </F>
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            <F label="From" flex={1}>{endpointPicker("fromId")}</F>
            <F label="To" flex={1}>{endpointPicker("toId")}</F>
          </div>
        </>
      );
    }

    case "play_sound":
      return (
        <>
          <F label="Sound">
            <SoundPicker value={action.sound} previewVolume={action.volume} onChange={(id) => set({ sound: id })} />
          </F>
          <div style={{ display: "flex", gap: 4, alignItems: "flex-end", marginTop: 4 }}>
            <label style={{ color: "#808090", fontSize: 10, display: "flex", alignItems: "center", gap: 3, paddingBottom: 7 }}>
              <input type="checkbox" className="wb-switch" checked={action.loop ?? false} onChange={(e) => set({ loop: e.target.checked || undefined })} />
              loop
            </label>
            <F label="Volume" flex="0 0 64px">
              <input type="number" min={0} step={0.1} style={S.field}
                placeholder="1" title="1 = the clip's own level, higher boosts (up to 4)"
                value={action.volume ?? ""} onChange={(e) => set({ volume: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })} />
            </F>
          </div>
          <div style={{ color: "#8b94a8", fontSize: 11, padding: "6px 0 2px" }}>Play at (optional — spatial):</div>
          {targetPicker}
        </>
      );

    case "stop_sound":
      return (
        <F label="Sound">
          <SoundPicker value={action.sound} onChange={(id) => set({ sound: id })} allowNone />
        </F>
      );

    case "play_music":
      return (
        <>
          <F label="Music">
            <SoundPicker value={action.music} previewVolume={action.volume} onChange={(id) => set({ music: id })} />
          </F>
          <div style={{ display: "flex", gap: 4, alignItems: "flex-end", marginTop: 4 }}>
            <label style={{ color: "#808090", fontSize: 10, display: "flex", alignItems: "center", gap: 3, paddingBottom: 7 }}>
              <input type="checkbox" className="wb-switch" checked={action.loop ?? true} onChange={(e) => set({ loop: e.target.checked })} />
              loop
            </label>
            <F label="Volume" flex="0 0 64px">
              <input type="number" min={0} step={0.1} style={S.field}
                placeholder="1" title="1 = the clip's own level, higher boosts (up to 4)"
                value={action.volume ?? ""} onChange={(e) => set({ volume: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })} />
            </F>
            <F label="Fade (s)" flex="0 0 64px">
              <input type="number" min={0} step={0.5} style={S.field}
                placeholder="fade s" title="crossfade seconds"
                value={action.fadeSeconds ?? ""} onChange={(e) => set({ fadeSeconds: e.target.value === "" ? undefined : Number(e.target.value) })} />
            </F>
          </div>
        </>
      );

    case "stop_music":
      return (
        <F label="Fade-out seconds (0 = instant)">
          <input type="number" min={0} step={0.5} style={S.field}
            placeholder="0"
            value={action.fadeSeconds ?? ""} onChange={(e) => set({ fadeSeconds: e.target.value === "" ? undefined : Number(e.target.value) })} />
        </F>
      );

    case "set_footstep":
      return (
        <>
          <F label="Footstep sound">
            <SoundPicker value={action.sound} onChange={(id) => set({ sound: id })} allowNone />
          </F>
          <div style={{ color: "#98a2b8", fontSize: 11, fontStyle: "italic", padding: "4px 0 0" }}>
            Overrides the player's walking sound (e.g. wood → gravel). Leave empty to revert
            to the default. Pair on_player_enter / on_player_exit on a trigger volume.
          </div>
        </>
      );

    case "set_state":
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {stateScopePicker}
          <F label="State key" flex={1}>
            <KeySuggestInput placeholder="State key"
              value={action.stateKey ?? ""}
              suggestions={scopedStateKeys}
              onChange={(v) => set({ stateKey: v })}
            />
          </F>
          <F label="Value" flex="1 1 100%">
            {resolvedKeyType === "boolean" ? (
              <select style={S.select}
                value={action.stateValue === true ? "true" : action.stateValue === false ? "false"
                     : action.stateValue === "__toggle__" ? "__toggle__"
                     : action.stateValue != null ? "__legacy__" : ""}
                onChange={(e) => set({ stateValue: e.target.value === "true" ? true
                  : e.target.value === "false" ? false
                  : e.target.value === "__toggle__" ? "__toggle__" : undefined })}>
                <option value="">— pick —</option>
                {/* A value typed before the key was registered boolean: surface it
                    (still what the action sets) instead of a lying "— pick —". */}
                {action.stateValue != null && typeof action.stateValue !== "boolean" && action.stateValue !== "__toggle__" && (
                  <option value="__legacy__" disabled>{String(action.stateValue)} (not a boolean — pick below)</option>
                )}
                <option value="true">true</option>
                <option value="false">false</option>
                <option value="__toggle__">toggle (flip current)</option>
              </select>
            ) : (
              <input
                style={S.field}
                placeholder="true / 100 / text"
                value={action.stateValue == null ? "" : String(action.stateValue)}
                onChange={(e) =>
                  set({ stateValue: coerceStateValue(e.target.value) })
                }
              />
            )}
          </F>
        </div>
      );

    case "adjust_number":
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {stateScopePicker}
          <F label="State key" flex={1}>
            <KeySuggestInput placeholder="State key (e.g. health)"
              value={action.stateKey ?? ""}
              suggestions={scopedStateKeys}
              onChange={(v) => set({ stateKey: v })}
            />
          </F>
          <F label="± Change" flex="0 0 72px">
            <input
              type="number"
              style={S.field}
              placeholder="±delta"
              value={action.numberDelta ?? ""}
              onChange={(e) =>
                set({ numberDelta: parseFloat(e.target.value) || 0 })
              }
            />
          </F>
        </div>
      );

    case "delete_state":
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {stateScopePicker}
          <F label="State key" flex={1}>
            <KeySuggestInput placeholder="State key"
              value={action.stateKey ?? ""}
              suggestions={scopedStateKeys}
              onChange={(v) => set({ stateKey: v })}
            />
          </F>
        </div>
      );

    case "store_position": {
      const src = action.posSource ?? "player";
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <F label="Save to state key">
            <KeySuggestInput
              placeholder={"State key (e.g. checkpoint)"}
              value={action.stateKey ?? ""}
              onChange={(v) => set({ stateKey: v })}
            />
          </F>
          <select
            style={S.select}
            value={src}
            onChange={(e) =>
              set({
                posSource: e.target.value as "player" | "object" | "coords",
              })
            }
          >
            <option value="player">Source: player position</option>
            <option value="object">Source: object position</option>
            <option value="coords">Source: specific coordinates</option>
          </select>
          {src === "object" && <F label="Read position of">{positionSourcePicker}</F>}
          {src === "coords" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <F label="Position (x · y · z)">
                <div style={{ display: "flex", gap: 4 }}>
                  {(["x", "y", "z"] as const).map((ax) => (
                    <input
                      key={ax}
                      type="number"
                      style={{ ...S.field, flex: 1, minWidth: 0 }}
                      placeholder={ax}
                      value={action.position?.[ax] ?? ""}
                      onChange={(e) =>
                        set({
                          position: {
                            x: 0,
                            y: 0,
                            z: 0,
                            ...action.position,
                            [ax]: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                    />
                  ))}
                </div>
              </F>
              <F label="Facing ° (optional)">
                <input
                  type="number"
                  style={{ ...S.field }}
                  placeholder="degrees"
                  value={action.facing ?? ""}
                  onChange={(e) =>
                    set({
                      facing:
                        e.target.value === ""
                          ? undefined
                          : parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </F>
            </div>
          )}
        </div>
      );
    }

    case "fire_event":
      return (
        <F label="Event id">
          <input
            style={S.field}
            placeholder="Event ID"
            value={action.eventId ?? ""}
            onChange={(e) => set({ eventId: e.target.value })}
          />
        </F>
      );

    case "load_scene":
      // Cross-scene routing for the runtime shell. With a project open the ids
      // are known (Phase 33) → dropdown; otherwise the classic free text.
      if (projectSceneIds?.length) {
        const cur = action.sceneId ?? "";
        const known = projectSceneIds.includes(cur);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <F label="Scene">
              <select
                style={S.select}
                value={cur}
                onChange={(e) => set({ sceneId: e.target.value || undefined })}
              >
                <option value="">— pick scene —</option>
                {projectSceneIds.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
                {cur && !known && (
                  <option value={cur}>{cur} (not in project)</option>
                )}
              </select>
            </F>
            <div style={{ display: "flex", gap: 4 }}>
              <F label="Fade color" flex={1}>
                <input
                  style={S.field}
                  placeholder="#000"
                  title="Fade-through color for the transition (blank = black)"
                  value={action.fadeColor ?? ""}
                  onChange={(e) => set({ fadeColor: e.target.value || undefined })}
                />
              </F>
              <F label="Seconds" flex="0 0 60px">
                <input
                  type="number" min={0} step={0.1}
                  style={S.field}
                  placeholder="0.3"
                  title="Fade in/out duration (blank = 0.3s)"
                  value={action.fadeDuration ?? ""}
                  onChange={(e) => set({ fadeDuration: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </F>
            </div>
            <div style={{ fontSize: 10, color: "#98a2b8" }}>
              Runtime only — routes between this project&apos;s scenes. No-op in editor preview.
            </div>
          </div>
        );
      }
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <F label="Scene id">
            <input
              style={S.field}
              placeholder="Scene id (runtime manifest key)"
              value={action.sceneId ?? ""}
              onChange={(e) => set({ sceneId: e.target.value })}
            />
          </F>
          <div style={{ display: "flex", gap: 4 }}>
            <F label="Fade color" flex={1}>
              <input
                style={S.field}
                placeholder="#000"
                title="Fade-through color for the transition (blank = black)"
                value={action.fadeColor ?? ""}
                onChange={(e) => set({ fadeColor: e.target.value || undefined })}
              />
            </F>
            <F label="Seconds" flex="0 0 60px">
              <input
                type="number" min={0} step={0.1}
                style={S.field}
                placeholder="0.3"
                title="Fade in/out duration (blank = 0.3s)"
                value={action.fadeDuration ?? ""}
                onChange={(e) => set({ fadeDuration: e.target.value === "" ? undefined : Number(e.target.value) })}
              />
            </F>
          </div>
          <div style={{ fontSize: 10, color: "#98a2b8" }}>
            Runtime only — must match a scene key in the game&apos;s manifest. Not validated here.
          </div>
        </div>
      );

    case "despawn_object":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <F label="Target">{despawnTargetPicker}</F>
          <F label="Fade out (s) — blank = instant" flex="0 0 auto">
            <input
              type="number" min={0} step={0.1}
              style={{ ...S.field, width: 100 }}
              placeholder="0"
              title="Fade the target's materials to invisible over this many seconds. Its collider turns off when the fade completes."
              value={action.fadeDuration ?? ""}
              onChange={(e) => set({ fadeDuration: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </F>
        </div>
      );

    case "spawn_object":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <F label="Target">{despawnTargetPicker}</F>
          <F label="Fade in (s) — blank = instant" flex="0 0 auto">
            <input
              type="number" min={0} step={0.1}
              style={{ ...S.field, width: 100 }}
              placeholder="0"
              value={action.fadeDuration ?? ""}
              onChange={(e) => set({ fadeDuration: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </F>
          <div style={{ color: "#98a2b8", fontSize: 11, fontStyle: "italic", padding: "4px 0 0" }}>
            Re-shows a despawned entity (collider comes back instantly). For a
            &quot;hidden by default&quot; object, despawn it in an on_level_load script first.
          </div>
        </div>
      );

    case "start_mover":
    case "stop_mover":
    case "toggle_mover": {
      // Phase 67 — a target with several movers can be steered per mover.
      const tid = action.targetId === "self" ? owner?.id : action.targetId;
      const host = zoneObjects.find(o => o.id === tid) ?? zonePlatforms.find(x => x.id === tid) ?? zoneShapes.find(x => x.id === tid);
      const hostMovers = host
        ? ((host as { movers?: MoverDef[]; mover?: MoverDef }).movers
            ?? ((host as { mover?: MoverDef }).mover ? [(host as { mover?: MoverDef }).mover!] : [])).filter(m => m.enabled)
        : [];
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <F label="Target">{moverTargetPicker}</F>
          {hostMovers.length > 1 && (
            <F label="Which mover">
              <select style={S.select} value={action.moverId ?? ""}
                onChange={(e) => set({ moverId: e.target.value || undefined })}>
                <option value="">all movers</option>
                {hostMovers.map((m, i) => (
                  <option key={m.id ?? i} value={m.id ?? ""} disabled={!m.id}>
                    {`${m.kind} ${m.axis.toUpperCase()} #${i + 1}`}{m.id ? "" : " (open its Motion section once to enable)"}
                  </option>
                ))}
              </select>
            </F>
          )}
        </div>
      );
    }

    case "light_on":
    case "light_off":
    case "toggle_light":
      return <F label="Light">{lightTargetPicker}</F>;

    case "open_door":
    case "close_door":
      return <F label="Target">{targetPicker}</F>;

    case "move_object":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <F label="Target">{targetPicker}</F>
          <F label="Move to (x · y · z)">
            <div style={{ display: "flex", gap: 4 }}>
              {(["x", "y", "z"] as const).map((ax) => (
                <input
                  key={ax}
                  type="number"
                  style={{ ...S.field, flex: 1 }}
                  placeholder={ax}
                  value={action.position?.[ax] ?? ""}
                  onChange={(e) =>
                    set({
                      position: {
                        x: 0,
                        y: 0,
                        z: 0,
                        ...action.position,
                        [ax]: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                />
              ))}
            </div>
          </F>
        </div>
      );

    case "play_animation": {
      const clipKnown = action.animation === "__auto__" || targetClips.includes(action.animation ?? "");
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <F label="Target">{animTargetPicker}</F>
          <F label="Clip">
          {targetClips.length > 0 ? (
            <select
              style={S.select}
              value={action.animation ?? ""}
              onChange={(e) => set({ animation: e.target.value })}
            >
              <option value="">— pick clip —</option>
              {/* Pinned like the target picker's "★ this" — resolves at runtime to the
                  target's auto-play resting clip, which also STOPS a looping clip. */}
              <option value="__auto__">↩ auto-play (resting) clip</option>
              {targetClips.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {action.animation && !clipKnown && (
                <option value={action.animation}>
                  {action.animation} (custom)
                </option>
              )}
            </select>
          ) : (
            <input
              style={S.field}
              placeholder={
                targetObj || action.targetId === "player"
                  ? "Clip name (no clips found on asset)"
                  : "Clip name (pick an object target for a list)"
              }
              value={action.animation ?? ""}
              onChange={(e) => set({ animation: e.target.value })}
            />
          )}
          </F>
          {/* Loop/hold/blend don't apply to the resting-clip sentinel (it always
              crossfades to the auto-play loop) — hide the row to say so. */}
          {action.animation !== "__auto__" && (
          <>
            <F label="Loop">
              <input type="checkbox" className="wb-switch"
                checked={action.animationLoop ?? false}
                onChange={(e) => set({ animationLoop: e.target.checked })} />
            </F>
            <F label="Hold at end" style={action.animationLoop ? { opacity: 0.45 } : undefined}>
              <input type="checkbox" className="wb-switch"
                disabled={action.animationLoop ?? false}
                checked={action.animationHold ?? false}
                onChange={(e) => set({ animationHold: e.target.checked })} />
            </F>
            <F label="Blend (s)">
              <RangeField value={action.animationBlend} min={0} max={2} step={0.05} unit="s"
                onChange={(v) => set({ animationBlend: v && v > 0 ? v : undefined })} />
            </F>
          </>
          )}
        </div>
      );
    }

    case "change_material":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <F label="Target">{targetPicker}</F>
          <F label="Material id">
            <input
              style={S.field}
              placeholder="Material ID"
              value={action.material ?? ""}
              onChange={(e) => set({ material: e.target.value })}
            />
          </F>
        </div>
      );

    case "teleport_player": {
      const fromKey = action.positionKey != null;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <select
            style={S.select}
            value={fromKey ? "key" : "literal"}
            onChange={(e) =>
              e.target.value === "key"
                ? set({
                    positionKey: action.positionKey ?? "",
                    position: undefined,
                  })
                : set({ positionKey: undefined })
            }
          >
            <option value="literal">Destination: literal x/y/z</option>
            <option value="key">Destination: from state key</option>
          </select>
          {fromKey ? (
            <F label="State key">
              <KeySuggestInput
                placeholder={"State key (e.g. checkpoint)"}
                value={action.positionKey ?? ""}
                onChange={(v) => set({ positionKey: v })}
              />
            </F>
          ) : (
            <F label="Destination (x · y · z)">
              <div style={{ display: "flex", gap: 4 }}>
                {(["x", "y", "z"] as const).map((ax) => (
                  <input
                    key={ax}
                    type="number"
                    style={{ ...S.field, flex: 1 }}
                    placeholder={ax}
                    value={action.position?.[ax] ?? ""}
                    onChange={(e) =>
                      set({
                        position: {
                          x: 0,
                          y: 0,
                          z: 0,
                          ...action.position,
                          [ax]: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                  />
                ))}
              </div>
            </F>
          )}
          <select
            style={S.select}
            value={action.facingSource ?? "keep"}
            onChange={(e) =>
              set({
                facingSource: e.target.value as "keep" | "literal" | "key",
              })
            }
          >
            <option value="keep">Facing: keep current</option>
            <option value="literal">Facing: set to (deg)</option>
            <option value="key">Facing: from state key</option>
          </select>
          {action.facingSource === "literal" && (
            <F label="Facing °">
              <input
                type="number"
                style={S.field}
                placeholder="degrees"
                value={action.facing ?? ""}
                onChange={(e) => set({ facing: parseFloat(e.target.value) || 0 })}
              />
            </F>
          )}
          {action.facingSource === "key" && (
            <F label="Facing state key">
              <KeySuggestInput
                placeholder={"a number key, or a stored pose"}
                value={action.facingKey ?? ""}
                onChange={(v) => set({ facingKey: v })}
              />
            </F>
          )}
        </div>
      );
    }

    case "flash_player":
      return (
        <>
          <div style={{ display: "flex", gap: 4 }}>
            <F label="Color" flex={1}>
              <input
                style={S.field}
                placeholder="#ff0000"
                value={action.flashColor ?? ""}
                onChange={(e) => set({ flashColor: e.target.value })}
              />
            </F>
            <F label="Seconds" flex="0 0 60px">
              <input
                type="number" min={0} step={0.1}
                style={S.field}
                placeholder="1"
                value={action.flashDuration ?? ""}
                onChange={(e) =>
                  set({ flashDuration: e.target.value === "" ? undefined : Number(e.target.value) })
                }
              />
            </F>
          </div>
          <div style={{ color: "#98a2b8", fontSize: 11, fontStyle: "italic", padding: "4px 0 0" }}>
            Damage feedback — pulses the player twice, then fades out. In third-person
            the avatar itself flashes; in FPS the avatar is hidden, so it tints the
            screen edges instead. Works with any player model (and the plain capsule),
            so changing the model later needs no edits here. Pair with adjust_number
            on a hazard volume. Unlike fade_screen this never covers the screen or
            takes the controls away.
          </div>
        </>
      );

    case "fade_screen":
      return (
        <div style={{ display: "flex", gap: 4 }}>
          <F label="Color" flex={1}>
            <input
              style={S.field}
              placeholder="#000"
              value={action.fadeColor ?? ""}
              onChange={(e) => set({ fadeColor: e.target.value })}
            />
          </F>
          <F label="Seconds" flex="0 0 60px">
            <input
              type="number" min={0} step={0.1}
              style={S.field}
              placeholder="0.3"
              value={action.fadeDuration ?? ""}
              onChange={(e) =>
                set({ fadeDuration: e.target.value === "" ? undefined : Number(e.target.value) })
              }
            />
          </F>
        </div>
      );

    case "respawn_player": {
      // Destination priority at runtime: stored key → checkpoint → default spawn.
      // targetId "" = checkpoint mode with no pick yet — must be != null, not truthy,
      // or selecting "a checkpoint" snaps straight back to "spawn".
      const dest = action.positionKey != null ? "key" : action.targetId != null ? "checkpoint" : "spawn";
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <select
            style={S.select}
            value={dest}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "key")        set({ positionKey: action.positionKey ?? "checkpoint", targetId: undefined });
              else if (v === "checkpoint") set({ positionKey: undefined, targetId: action.targetId ?? "" });
              else                    set({ positionKey: undefined, targetId: undefined });
            }}
          >
            <option value="key">Respawn at: stored position key</option>
            <option value="checkpoint">Respawn at: a checkpoint</option>
            <option value="spawn">Respawn at: world default spawn</option>
          </select>
          {dest === "key" && (
            <F label="State key">
              <KeySuggestInput
                placeholder={"State key (e.g. checkpoint)"}
                value={action.positionKey ?? ""}
                onChange={(v) => set({ positionKey: v })}
              />
            </F>
          )}
          {dest === "checkpoint" && (
            <F label="Checkpoint">
              <select
                style={S.select}
                value={action.targetId ?? ""}
                onChange={(e) => set({ targetId: e.target.value })}
              >
                <option value="">— pick a checkpoint —</option>
                {zoneCheckpoints.map((cp) => (
                  <option key={cp.id} value={cp.id}>
                    {cp.label || cp.id}
                  </option>
                ))}
              </select>
            </F>
          )}
          <div style={{ display: "flex", gap: 4 }}>
            <F label="Fade color" flex={1}>
              <input
                style={S.field}
                placeholder="#000"
                value={action.fadeColor ?? ""}
                onChange={(e) => set({ fadeColor: e.target.value })}
              />
            </F>
            <F label="Seconds" flex="0 0 60px">
              <input
                type="number" min={0} step={0.1}
                style={S.field}
                placeholder="0.4"
                value={action.fadeDuration ?? ""}
                onChange={(e) => set({ fadeDuration: e.target.value === "" ? undefined : Number(e.target.value) })}
              />
            </F>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#98a2b8", cursor: "pointer" }}>
            <input
              type="checkbox" className="wb-switch"
              checked={action.restoreHealth ?? false}
              onChange={(e) => set({ restoreHealth: e.target.checked || undefined })}
            />
            Restore health to its default
          </label>
        </div>
      );
    }

    case "launch_player": {
      const saved = action.launchRelativeTo ?? (action.launchRelative ? "entity" : "world");
      // The engine only applies "entity" when there's an owner to read a rotation from,
      // so an owner-less script shows World rather than highlighting a button it can't offer.
      const relativeTo = saved === "entity" && !owner ? "world" : saved;
      return (
        <>
          <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
            <F label="Upward speed (m/s)" flex={1}>
              <input
                type="number" min={0} step={0.5}
                style={S.field}
                placeholder="12"
                value={action.launchSpeed ?? ""}
                onChange={(e) => set({ launchSpeed: e.target.value === "" ? undefined : Number(e.target.value) })}
              />
            </F>
            <F label="Sideways speed (m/s)" flex={1}>
              <input
                type="number" min={0} step={0.5}
                style={S.field}
                placeholder="0"
                value={action.launchHSpeed ?? ""}
                onChange={(e) => set({ launchHSpeed: e.target.value === "" ? undefined : Number(e.target.value) })}
              />
            </F>
            <F label="Direction (deg)" flex={1}>
              <input
                type="number" step={15}
                style={S.field}
                placeholder="0"
                title="World compass, same as spawn facing: 0 launches the way a fresh spawn faces; 90/180/270 rotate around"
                value={action.launchDirDeg ?? ""}
                onChange={(e) => set({ launchDirDeg: e.target.value === "" ? undefined : Number(e.target.value) })}
              />
            </F>
          </div>
          {/* What Direction is measured FROM. Pre-v4.63.3 actions only stored the
              boolean, so fall back to it (true = the owning entity). */}
          <div style={{ paddingTop: 4 }}>
            <div style={{ ...S.fieldLabel, marginBottom: 2 }}>Direction is measured from</div>
            <div style={{ display: "flex", gap: 4 }}>
              {([
                ["world",  "World", "Fixed compass — 0 is the way a fresh spawn faces, regardless of the player or this entity"],
                ...(owner ? [["entity", `This ${owner.kind}`, `0 launches out of the ${owner.kind}'s front (its −Z face before rotating); turning its ROTATION (Y°) turns the launch with it`] as const] : []),
                ["player", "Player", "0 shoves them the way they're looking; 180 always knocks them backwards, whichever way they came in"],
              ] as const).map(([k, lbl, tip]) => {
                const active = relativeTo === k;
                return (
                  <button
                    key={k}
                    disabled={active}
                    title={tip}
                    style={S.seg(active)}
                    onClick={() => set({ launchRelativeTo: k, launchRelative: undefined })}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ color: "#98a2b8", fontSize: 11, fontStyle: "italic", padding: "4px 0 0" }}>
            Springs the player upward — a normal jump is ~5, 12 is a strong bouncer.
            Sideways speed adds a horizontal shove in the given direction (dash pads,
            angled boosters); it fades fast once the player lands. Set Upward to 0
            for a pure sideways dash. Pair with on_player_enter on a volume over the pad.
            {relativeTo === "player" && " Measured from the player: Direction 180 always knocks them backwards, 0 shoves them the way they're looking."}
          </div>
        </>
      );
    }

    case "show_ui":
    case "hide_ui":
      return (
        <F label="UI element">
        <select
          style={S.select}
          value={action.uiElementId ?? ""}
          onChange={(e) => set({ uiElementId: e.target.value || undefined })}
        >
          <option value="">— UI element (SCRIPTS → UI tab) —</option>
          {uiElements.map((el) => (
            <option key={el.id} value={el.id}>
              {el.label} ({el.kind})
            </option>
          ))}
          {action.uiElementId && !uiElements.some((el) => el.id === action.uiElementId) && (
            <option value={action.uiElementId}>{action.uiElementId} (custom)</option>
          )}
        </select>
        </F>
      );

    case "run_script":
      return (
        <F label="JavaScript">
          <textarea
            style={{
              ...S.field,
              height: 80,
              resize: "vertical",
              fontFamily: "monospace",
              fontSize: 10,
            }}
            placeholder="// JS — ctx.get('k'), ctx.set('k',v), ctx.has('k'), ctx.adjust('k',n)"
            value={action.script ?? ""}
            onChange={(e) => set({ script: e.target.value })}
          />
        </F>
      );

    // spawn_npc: removed from the dropdown in Phase 61 (never implemented);
    // old data renders this tolerated stub row.
    case "spawn_npc":
      return (
        <div style={{ color: "#98a2b8", fontSize: 10 }}>spawn_npc — not implemented (does nothing)</div>
      );

    default:
      return null;
  }
}

// ── DialogueList (DIALOGUE tab) ───────────────────────────────────────────────

function DialogueList({
  dialogues,
  help,
  onSelect,
  onAdd,
}: {
  dialogues: DialogueTreeDef[];
  help?: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 10,
          padding: "6px 10px",
          flexShrink: 0,
        }}
      >
        {help && <HelpTooltip side="below" align="right" text={help} />}
        <button style={S.btn(true)} onClick={onAdd}>
          + New
        </button>
      </div>
      <div style={S.scroll}>
        {dialogues.length === 0 && (
          <div
            style={{
              color: "#98a2b8",
              fontSize: 11,
              padding: "16px 12px",
              textAlign: "center",
            }}
          >
            No dialogues yet — + New starts a conversation tree: nodes of lines
            the NPC says, with response options that can branch, check
            conditions, and run effects. Play one with a show_dialogue action.
          </div>
        )}
        {dialogues.map((d) => (
          <div key={d.id} style={{ ...S.row }} onClick={() => onSelect(d.id)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.label}>{d.label}</div>
              <div style={S.sub}>
                {d.speaker || "(no speaker)"}
                {` · ${d.nodes.length} page node${d.nodes.length !== 1 ? "s" : ""}`}
              </div>
            </div>
            <span style={{ color: "#444", marginLeft: 8, fontSize: 13 }}>
              ›
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DialogueEditor ────────────────────────────────────────────────────────────

function DialogueEditor({
  dialogue,
  worldItems,
  uiElements,
  projectSceneIds,
  zoneObjects,
  zonePlatforms,
  zoneShapes,
  zoneLights,
  zoneStairs,
  zoneWalls,
  zoneFloors,
  zoneCheckpoints,
  triggerVolumes,
  groups,
  assets,
  zoneDialogues,
  help,
  onBack,
  onChange,
  onDelete,
}: {
  dialogue: DialogueTreeDef;
  worldItems: ItemDef[];
  uiElements: UiElementDef[];
  projectSceneIds?: string[];
  zoneObjects: WorldObject[];
  zonePlatforms: PlatformDef[];
  zoneShapes: ShapeDef[];
  zoneLights: LightDef[];
  zoneStairs: StairDef[];
  zoneWalls: WallDef[];
  zoneFloors: FloorDef[];
  zoneCheckpoints: CheckpointDef[];
  triggerVolumes: TriggerVolume[];
  groups: GroupDef[];
  assets: AssetDef[];
  zoneDialogues: DialogueTreeDef[];
  help?: string;
  onBack: () => void;
  onChange: (d: DialogueTreeDef) => void;
  onDelete: () => void;
}) {
  const [showFlowchart, setShowFlowchart] = useState(false);

  function set<K extends keyof DialogueTreeDef>(key: K, val: DialogueTreeDef[K]): void {
    onChange({ ...dialogue, [key]: val });
  }

  function updateNode(updated: DialogueNode): void {
    set("nodes", dialogue.nodes.map((n) => (n.id === updated.id ? updated : n)));
  }

  function addNode(): void {
    set("nodes", [...dialogue.nodes, { id: nextNodeId(dialogue.nodes), lines: [""], options: [] }]);
  }

  function deleteNode(id: string): void {
    set("nodes", dialogue.nodes.filter((n) => n.id !== id));
  }

  // Light render-time validation — runtime degrades gracefully, so never block saves.
  const nodeIds = new Set(dialogue.nodes.map((n) => n.id));
  const byId = new Map(dialogue.nodes.map((n) => [n.id, n]));

  // Nested-tree layout (pure precompute, StrictMode-safe): depth-first from the
  // start page-node, each option "hosts" the full card of the node it leads to —
  // but a node is hosted only once (first encounter). Later references render as
  // jump chips. Orphan roots (nothing leads to them) walk their own subtrees so
  // wired chains under an unreachable node still nest.
  const hosted = new Map<string, string>(); // option.id -> node id it hosts
  const seen = new Set<string>();
  function walk(id: string): void {
    const n = byId.get(id);
    if (!n) return;
    for (const o of n.options) {
      if (o.next && byId.has(o.next) && !seen.has(o.next)) {
        seen.add(o.next);
        hosted.set(o.id, o.next);
        walk(o.next);
      }
    }
  }
  if (byId.has(dialogue.startNode)) seen.add(dialogue.startNode);
  walk(dialogue.startNode);
  const orphanRoots: string[] = [];
  for (const n of dialogue.nodes) {
    if (!seen.has(n.id)) {
      seen.add(n.id);
      orphanRoots.push(n.id);
      walk(n.id);
    }
  }

  function createNodeForOption(hostNodeId: string, optionId: string): void {
    const newId = nextNodeId(dialogue.nodes);
    onChange({
      ...dialogue,
      nodes: dialogue.nodes
        .map((n) =>
          n.id !== hostNodeId
            ? n
            : { ...n, options: n.options.map((o) => (o.id === optionId ? { ...o, next: newId } : o)) },
        )
        .concat({ id: newId, lines: [""], options: [] }),
    });
  }

  function jumpToNode(id: string): void {
    const el = document.getElementById(`wb-dlgnode-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.animate(
      [
        { boxShadow: "0 0 0 2px rgba(128,170,255,0.9)" },
        { boxShadow: "0 0 0 2px rgba(128,170,255,0)" },
      ],
      { duration: 1400 },
    );
  }

  function renderNodeById(nodeId: string, depth: number): React.ReactNode {
    const node = byId.get(nodeId);
    if (!node) return null;
    return (
      <DialogueNodeCard
        key={node.id}
        node={node}
        depth={depth}
        dialogue={dialogue}
        worldItems={worldItems}
        uiElements={uiElements}
        projectSceneIds={projectSceneIds}
        isStart={node.id === dialogue.startNode}
        zoneObjects={zoneObjects}
        zonePlatforms={zonePlatforms}
        zoneShapes={zoneShapes}
        zoneLights={zoneLights}
        zoneStairs={zoneStairs}
        zoneWalls={zoneWalls}
        zoneFloors={zoneFloors}
        zoneCheckpoints={zoneCheckpoints}
        triggerVolumes={triggerVolumes}
        groups={groups}
        assets={assets}
        zoneDialogues={zoneDialogues}
        renderNested={renderNested}
        onCreateNext={(optionId) => createNodeForOption(node.id, optionId)}
        onChange={updateNode}
        onDelete={() => deleteNode(node.id)}
      />
    );
  }

  function renderNested(opt: DialogueOption, childDepth: number): NestedRender | null {
    if (!opt.next || !byId.has(opt.next)) return null; // ends / dangling — row handles both
    const hostedId = hosted.get(opt.id);
    if (hostedId === opt.next) {
      return { kind: "hosted", el: renderNodeById(hostedId, childDepth) };
    }
    const targetId = opt.next;
    return {
      kind: "jump",
      el: (
        <button
          style={{
            ...S.btn(),
            fontSize: 10,
            color: "#80aaff",
            marginTop: 4,
            width: "100%",
            textAlign: "left",
          }}
          title="This page node's full card is nested under the first response that leads to it — click to jump there"
          onClick={() => jumpToNode(targetId)}
        >
          ↩ continues at {targetId} — {(byId.get(targetId)?.lines[0] ?? "").slice(0, 24)} (click to view)
        </button>
      ),
    };
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
        <button style={{ ...S.btn(), padding: "3px 8px" }} onClick={onBack}>
          ←
        </button>
        <span
          style={{
            color: "#c0c0c0",
            fontSize: 12,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {dialogue.label || "Dialogue"}
        </span>
        <button
          title="Open the flowchart view — the whole conversation as a node-and-arrow chart beside this panel. Click a box there to jump to its card here."
          style={{ ...S.btn(showFlowchart), fontSize: 10, color: showFlowchart ? "#80aaff" : "#c0c0c0" }}
          onClick={() => setShowFlowchart((v) => !v)}
        >
          Flowchart
        </button>
        {help && <HelpTooltip side="below" align="right" text={help} />}
      </div>

      {showFlowchart && (
        <DialogueFlowchart
          dialogue={dialogue}
          onChange={onChange}
          onJumpToNode={jumpToNode}
          onClose={() => setShowFlowchart(false)}
        />
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: "8px 12px" }}>
          <div style={S.sectionLabel as React.CSSProperties}>Label</div>
          <input
            style={S.field}
            value={dialogue.label}
            onChange={(e) => set("label", e.target.value)}
          />
        </div>
        <div style={{ padding: "0 12px 8px", display: "flex", gap: 4 }}>
          <input
            style={{ ...S.field, flex: 1 }}
            placeholder="Speaker"
            value={dialogue.speaker}
            onChange={(e) => set("speaker", e.target.value)}
          />
          <input
            style={{ ...S.field, flex: 1 }}
            placeholder="Portrait URL (optional)"
            value={dialogue.portrait ?? ""}
            onChange={(e) => set("portrait", e.target.value || undefined)}
          />
        </div>
        <div style={{ padding: "0 12px 8px" }}>
          <div style={S.sectionLabel as React.CSSProperties}>Start page-node</div>
          <select
            style={S.select}
            value={dialogue.startNode}
            onChange={(e) => set("startNode", e.target.value)}
          >
            {dialogue.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.id} — {(n.lines[0] ?? "").slice(0, 30)}
              </option>
            ))}
            {!nodeIds.has(dialogue.startNode) && (
              <option value={dialogue.startNode}>{dialogue.startNode} (missing!)</option>
            )}
          </select>
        </div>

        <div style={S.divider} />

        {/* Nodes */}
        <div style={{ padding: "0 12px 8px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={S.sectionLabel as React.CSSProperties}>Page nodes</span>
            <button
              style={{ ...S.btn(), fontSize: 10 }}
              title="Adds an unwired page node (it lands in the Unreachable section until a response leads to it). Tip: '+ new page node…' inside a response's Leads to creates and wires one in place."
              onClick={addNode}
            >
              + Add page node
            </button>
          </div>
          <div style={{ color: "#8b94a8", fontSize: 11, lineHeight: 1.4, padding: "0 0 6px" }}>
            A page node is one "page" of the conversation: its lines play in
            order, then its response options appear. Each response nests the
            page node it leads to right inside it — that's the branching,
            shown as actual nesting.
          </div>
          {byId.has(dialogue.startNode) ? (
            renderNodeById(dialogue.startNode, 0)
          ) : (
            <div style={{ color: "#cc6666", fontSize: 11, padding: "4px 0" }}>
              ⚠ Start page-node "{dialogue.startNode}" doesn't exist — pick one above.
            </div>
          )}
        </div>

        {orphanRoots.length > 0 && (
          <div style={{ padding: "0 12px 8px" }}>
            <div
              title="Nothing leads to these page nodes — wire one up via any response's Leads to dropdown, or delete it"
              style={{ color: "#cc9944", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", padding: "4px 0 6px" }}
            >
              ⚠ Unreachable page nodes (nothing leads here)
            </div>
            {orphanRoots.map((id) => renderNodeById(id, 0))}
          </div>
        )}

        <div style={S.divider} />

        <div style={{ display: "flex", gap: 8, padding: "8px 12px" }}>
          <div style={{ flex: 1 }} />
          <button
            style={{ ...S.btn(), color: "#cc6666" }}
            onClick={() => {
              if (confirm("Delete this dialogue?")) onDelete();
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DialogueNodeCard ──────────────────────────────────────────────────────────

/** What a response option nests under it: the target node's full card, or a
 *  jump chip when that node is already rendered elsewhere (2nd parent / loop). */
type NestedRender = { kind: "hosted" | "jump"; el: React.ReactNode };

// Depth rails — cycle 3 muted hues so adjacent nesting levels stay readable
// even after the indent stops growing (see NEST_BREAKOUT).
const NEST_RAILS = [
  "rgba(128,170,255,0.4)",
  "rgba(170,128,255,0.4)",
  "rgba(96,192,160,0.4)",
];

function DialogueNodeCard({
  node,
  depth,
  dialogue,
  worldItems,
  uiElements,
  projectSceneIds,
  isStart,
  zoneObjects,
  zonePlatforms,
  zoneShapes,
  zoneLights,
  zoneStairs,
  zoneWalls,
  zoneFloors,
  zoneCheckpoints,
  triggerVolumes,
  groups,
  assets,
  zoneDialogues,
  renderNested,
  onCreateNext,
  onChange,
  onDelete,
}: {
  node: DialogueNode;
  depth: number;
  dialogue: DialogueTreeDef;
  worldItems: ItemDef[];
  uiElements: UiElementDef[];
  projectSceneIds?: string[];
  isStart: boolean;
  zoneObjects: WorldObject[];
  zonePlatforms: PlatformDef[];
  zoneShapes: ShapeDef[];
  zoneLights: LightDef[];
  zoneStairs: StairDef[];
  zoneWalls: WallDef[];
  zoneFloors: FloorDef[];
  zoneCheckpoints: CheckpointDef[];
  triggerVolumes: TriggerVolume[];
  groups: GroupDef[];
  assets: AssetDef[];
  zoneDialogues: DialogueTreeDef[];
  renderNested: (opt: DialogueOption, childDepth: number) => NestedRender | null;
  onCreateNext: (optionId: string) => void;
  onChange: (n: DialogueNode) => void;
  onDelete: () => void;
}) {
  function set<K extends keyof DialogueNode>(key: K, val: DialogueNode[K]): void {
    onChange({ ...node, [key]: val });
  }

  function addOption(): void {
    const id = `opt_${crypto.randomUUID().slice(0, 8)}`;
    set("options", [...node.options, { id, text: "" }]);
    // Take the author straight to the new response (it belongs at the end of
    // the list, which can sit below a long nested subtree).
    requestAnimationFrame(() => {
      const el = document.getElementById(`wb-dlgopt-${id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector("input")?.focus();
    });
  }

  // Accordion state for the response wells, lifted here so each nested
  // subtree can render right after its well while "+ Add" stays reachable.
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  // The per-page speaker override stays hidden behind ✎ unless set — as a
  // bare header input it kept catching dialogue lines typed into it.
  const [speakerEdit, setSpeakerEdit] = useState(false);
  // The default open state is evaluated ONCE per option id and then frozen —
  // deriving it live would slam an option shut the moment "empty" stops
  // being true (i.e. on the first character typed into it).
  const seedOpen = useRef<Record<string, boolean>>({});
  const optionMeta = node.options.map((opt) => {
    const nested = renderNested(opt, depth + 1);
    if (!(opt.id in seedOpen.current)) {
      // Hosted options open near the top of the tree; untouched (empty)
      // options open so a fresh "+ Add" is ready to type.
      seedOpen.current[opt.id] =
        (nested?.kind === "hosted" && depth < 2) ||
        (!opt.text && !opt.next && !opt.conditions?.length && !opt.actions?.length);
    }
    const open = openIds[opt.id] ?? seedOpen.current[opt.id];
    return { opt, nested, open };
  });

  return (
    <div
      id={`wb-dlgnode-${node.id}`}
      style={{
        background: "rgba(255,255,255,0.04)",
        borderRadius: 6,
        padding: depth > 0 ? "10px 6px 10px 12px" : "8px 8px",
        marginBottom: depth > 0 ? 0 : 8,
        border: "1px solid rgba(255,255,255,0.05)",
        borderLeft: depth > 0 ? `2px solid ${NEST_RAILS[(depth - 1) % 3]}` : "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 4,
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <span
          title={isStart
            ? "This page node's id — the conversation starts here; response options elsewhere can jump to it"
            : "This page node's id — response options jump to page nodes by these ids"}
          style={{
            color: "#80aaff",
            fontSize: 10,
            fontFamily: "monospace",
            background: "rgba(128,170,255,0.12)",
            borderRadius: 3,
            padding: "2px 8px",
          }}
        >
          {node.id}
          {isStart ? " · start" : ""}
        </span>
        <span
          title={
            node.speaker
              ? `"${node.speaker}" speaks this page (overrides the dialogue's Speaker) — ✎ to change`
              : "Who speaks this page's lines (the dialogue's Speaker) — ✎ to override for this page only"
          }
          style={{
            flex: 1,
            minWidth: 0,
            color: "#dde3f0",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {node.speaker || dialogue.speaker || "NPC"} says
        </span>
        <button
          style={{ background: "none", border: "none", cursor: "pointer", color: "#8b94a8", fontSize: 11, padding: "2px 4px", flexShrink: 0 }}
          title="Change who speaks on this page only (overrides the dialogue's Speaker)"
          onClick={() => setSpeakerEdit((v) => !v)}
        >
          ✎
        </button>
        <button
          style={{
            ...S.btn(),
            padding: "3px 6px",
            color: isStart ? "#555" : "#cc6666",
            cursor: isStart ? "not-allowed" : "pointer",
          }}
          disabled={isStart}
          title={isStart ? "This is the start page-node — pick a different start page-node first" : "Delete this page node"}
          onClick={onDelete}
        >
          ×
        </button>
      </div>
      {(speakerEdit || !!node.speaker) && (
        <input
          style={{ ...S.field, marginBottom: 4 }}
          placeholder={`Speaker for this page only (blank = ${dialogue.speaker || "the dialogue's Speaker"})`}
          title="Overrides the dialogue's Speaker while this page is on screen"
          value={node.speaker ?? ""}
          onChange={(e) => set("speaker", e.target.value || undefined)}
        />
      )}
      <textarea
        style={{ ...S.field, height: 56, resize: "vertical" }}
        placeholder={`What ${node.speaker || dialogue.speaker || "the NPC"} says — one line per row`}
        value={node.lines.join("\n")}
        onChange={(e) => set("lines", e.target.value.split("\n"))}
      />

      {/* Response options */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          margin: "8px 0 4px",
        }}
      >
        <span
          title="What the player can say when this page's lines finish"
          style={{ color: "#8b94a8", fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap" }}
        >
          Player responses
        </span>
        <button
          style={{ background: "none", border: "none", cursor: "pointer", color: "#80aaff", fontSize: 11, padding: "1px 3px" }}
          title="Add a response the player can pick"
          onClick={addOption}
        >
          + Add
        </button>
      </div>
      {node.options.length === 0 && (
        <div style={{ color: "#98a2b8", fontSize: 11, padding: "4px 4px 8px" }}>
          (no responses — the conversation ends after this page's last line)
        </div>
      )}
      {optionMeta.map(({ opt, nested, open }, i) => {
        const row = (
          <DialogueOptionRow
            option={opt}
            depth={depth}
            nested={nested}
            open={open}
            onToggleOpen={(v) => setOpenIds((m) => ({ ...m, [opt.id]: v }))}
            dialogue={dialogue}
            worldItems={worldItems}
            uiElements={uiElements}
            projectSceneIds={projectSceneIds}
            zoneObjects={zoneObjects}
            zonePlatforms={zonePlatforms}
            zoneShapes={zoneShapes}
            zoneLights={zoneLights}
            zoneStairs={zoneStairs}
            zoneWalls={zoneWalls}
            zoneFloors={zoneFloors}
            zoneCheckpoints={zoneCheckpoints}
            triggerVolumes={triggerVolumes}
            groups={groups}
            assets={assets}
            zoneDialogues={zoneDialogues}
            onCreateNext={() => onCreateNext(opt.id)}
            onChange={(no) =>
              set("options", node.options.map((x, j) => (j === i ? no : x)))
            }
            onRemove={() =>
              set("options", node.options.filter((_, j) => j !== i))
            }
          />
        );
        // Deep levels break the child card out to the LEFT of its response
        // well (anti-runaway-indent), which loses the visual relation — the
        // child's rail extends up along the well so one continuous colored
        // line ties response → page. First level keeps its plain inset; it
        // already reads as nested.
        const deepHosted = open && nested?.kind === "hosted" && depth + 1 > 1;
        const hue = NEST_RAILS[depth % 3];
        return (
          <Fragment key={opt.id}>
            {deepHosted ? (
              <div style={{ borderLeft: `2px solid ${hue}`, marginLeft: -4, paddingLeft: 2 }}>
                {row}
              </div>
            ) : (
              row
            )}
            {/* The page this response leads to, directly below it — a slight
                per-level inset; rail hues carry the rest of the depth signal. */}
            {open && nested?.kind === "hosted" && (
              <div
                style={{
                  position: "relative",
                  margin: depth + 1 > 1 ? "6px 0 10px -16px" : "6px 0 10px 0",
                  paddingLeft: 12,
                }}
              >
                {deepHosted && (
                  <div
                    style={{
                      position: "absolute",
                      left: 12,
                      top: -7,
                      width: 2,
                      height: 9,
                      background: hue,
                    }}
                  />
                )}
                {nested.el}
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// ── DialogueOptionRow ─────────────────────────────────────────────────────────

function DialogueOptionRow({
  option,
  depth,
  nested,
  open,
  onToggleOpen,
  dialogue,
  worldItems,
  uiElements,
  projectSceneIds,
  zoneObjects,
  zonePlatforms,
  zoneShapes,
  zoneLights,
  zoneStairs,
  zoneWalls,
  zoneFloors,
  zoneCheckpoints,
  triggerVolumes,
  groups,
  assets,
  zoneDialogues,
  onCreateNext,
  onChange,
  onRemove,
}: {
  option: DialogueOption;
  depth: number;
  nested: NestedRender | null;
  open: boolean;
  onToggleOpen: (open: boolean) => void;
  dialogue: DialogueTreeDef;
  worldItems: ItemDef[];
  uiElements: UiElementDef[];
  projectSceneIds?: string[];
  zoneObjects: WorldObject[];
  zonePlatforms: PlatformDef[];
  zoneShapes: ShapeDef[];
  zoneLights: LightDef[];
  zoneStairs: StairDef[];
  zoneWalls: WallDef[];
  zoneFloors: FloorDef[];
  zoneCheckpoints: CheckpointDef[];
  triggerVolumes: TriggerVolume[];
  groups: GroupDef[];
  assets: AssetDef[];
  zoneDialogues: DialogueTreeDef[];
  onCreateNext: () => void;
  onChange: (o: DialogueOption) => void;
  onRemove: () => void;
}) {
  function set(changes: Partial<DialogueOption>): void {
    onChange({ ...option, ...changes });
  }

  const conditions = option.conditions ?? [];
  const actions = option.actions ?? [];
  const dangling = !!option.next && !dialogue.nodes.some((n) => n.id === option.next);

  const routeTag = dangling
    ? `⚠ ${option.next}`
    : option.next
      ? nested?.kind === "jump"
        ? `↩ ${option.next}`
        : `→ ${option.next}`
      : "⏹ ends";
  const chipStyle: React.CSSProperties = {
    flexShrink: 0,
    fontSize: 10,
    fontFamily: "monospace",
    padding: "2px 8px",
    borderRadius: 999,
    background: dangling
      ? "rgba(204,102,102,0.15)"
      : option.next
        ? "rgba(128,170,255,0.14)"
        : "rgba(255,255,255,0.06)",
    color: dangling ? "#e08585" : option.next ? "#8fb3ff" : "#98a2b8",
  };

  return (
    <div
      id={`wb-dlgopt-${option.id}`}
      style={{
        background: "rgba(0,0,0,0.28)",
        borderRadius: 4,
        padding: "4px 8px 8px",
        marginBottom: nested?.kind === "hosted" && open ? 0 : 8,
        border: dangling ? "1px solid rgba(204,102,102,0.5)" : "1px solid transparent",
      }}
    >
      {/* Accordion header */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", minHeight: 28 }}>
        <button
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#8b94a8",
            fontSize: 10,
            padding: "2px 2px",
            flexShrink: 0,
          }}
          title={open ? "Collapse this response" : "Expand this response"}
          onClick={() => onToggleOpen(!open)}
        >
          {open ? "▾" : "▸"}
        </button>
        <input
          style={{
            flex: 1,
            minWidth: 0,
            background: "none",
            border: "none",
            outline: "none",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            color: "#d4d8e2",
            fontSize: 12,
            fontFamily: "monospace",
            padding: "4px 4px",
          }}
          placeholder="Player response…"
          title="What the player can say — edit right here"
          value={option.text}
          onChange={(e) => set({ text: e.target.value })}
        />
        <span
          style={chipStyle}
          title={
            dangling
              ? `The target page node "${option.next}" was deleted — in-game this response just ends the conversation`
              : option.next
                ? nested?.kind === "jump"
                  ? `Continues at ${option.next} — its card is nested under the first response that leads to it`
                  : `Continues at ${option.next} — nested below`
                : "Picking this response ends the conversation"
          }
        >
          {routeTag}
        </span>
        <button
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#8a5a5a",
            fontSize: 12,
            padding: "0 3px",
            flexShrink: 0,
            lineHeight: 1,
          }}
          title="Delete this response option"
          onClick={onRemove}
        >
          ×
        </button>
      </div>

      {open && (
        <>
      {/* Conditions (option hidden unless ALL pass) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "8px 4px 4px" }}>
        <span
          title="This response is hidden unless ALL of these pass"
          style={{ color: "#b6bfd0", fontSize: 12, fontWeight: 600 }}
        >
          Show if
        </span>
        <button
          style={{ background: "none", border: "none", cursor: "pointer", color: "#8b94a8", fontSize: 11, padding: "2px 4px" }}
          onClick={() =>
            set({ conditions: [...conditions, { type: "has_state" } as ScriptCondition] })
          }
        >
          + Add condition
        </button>
      </div>
      {conditions.map((c, i) => (
        <ConditionRow
          key={i}
          condition={c}
          worldItems={worldItems}
          scope={{
            zoneObjects, triggerVolumes,
            allowSelf: true,   // "self" = whichever entity launched this dialogue (the NPC)
            selfLabel: "★ this NPC (dialogue owner)",
          }}
          onChange={(nc) =>
            set({ conditions: conditions.map((x, j) => (j === i ? nc : x)) })
          }
          onRemove={() => {
            const next = conditions.filter((_, j) => j !== i);
            set({ conditions: next.length ? next : undefined });
          }}
        />
      ))}
      {conditions.length === 0 && (
        <div style={{ color: "#98a2b8", fontSize: 11, padding: "4px 4px 8px" }}>
          Always shown
        </div>
      )}

      {/* Effects (run when picked) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "8px 4px 4px" }}>
        <span
          title="Effects that run the moment the player picks this response"
          style={{ color: "#b6bfd0", fontSize: 12, fontWeight: 600 }}
        >
          On pick
        </span>
        <button
          style={{ background: "none", border: "none", cursor: "pointer", color: "#8b94a8", fontSize: 11, padding: "2px 4px" }}
          onClick={() =>
            set({ actions: [...actions, { type: "set_state" } as ScriptAction] })
          }
        >
          + Add effect
        </button>
      </div>
      {actions.map((a, i) => (
        <ActionRow
          key={i}
          action={a}
          zoneObjects={zoneObjects}
          zonePlatforms={zonePlatforms}
          zoneShapes={zoneShapes}
          zoneLights={zoneLights}
          zoneStairs={zoneStairs}
          zoneWalls={zoneWalls}
          zoneFloors={zoneFloors}
          zoneCheckpoints={zoneCheckpoints}
          triggerVolumes={triggerVolumes}
          groups={groups}
          assets={assets}
          zoneDialogues={zoneDialogues}
          worldItems={worldItems}
          uiElements={uiElements}
          projectSceneIds={projectSceneIds}
          onChange={(na) =>
            set({ actions: actions.map((x, j) => (j === i ? na : x)) })
          }
          onRemove={() => {
            const next = actions.filter((_, j) => j !== i);
            set({ actions: next.length ? next : undefined });
          }}
        />
      ))}
      {actions.length === 0 && (
        <div style={{ color: "#98a2b8", fontSize: 11, padding: "4px 4px 8px" }}>
          No effects
        </div>
      )}

      {/* Routing lives at the BOTTOM of the response, so the nested page
          follows it directly. One click creates the next page; the dropdown
          is only for ending or linking back to an earlier page (loops). */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "8px 0" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 4px 4px" }}>
        <span
          style={{ color: "#8b94a8", fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0 }}
          title="What happens after this response"
        >
          Then
        </span>
        {!option.next && (
          <button
            style={{
              background: "rgba(128,170,255,0.12)",
              border: "1px solid rgba(128,170,255,0.25)",
              borderRadius: 4,
              cursor: "pointer",
              color: "#8fb3ff",
              fontSize: 12,
              padding: "4px 12px",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
            title="Create the next page of the conversation, nested right below this response"
            onClick={() => {
              onToggleOpen(true);
              onCreateNext();
            }}
          >
            ＋ Next page
          </button>
        )}
        <select
          title="Where this response goes — a fresh next page, an existing page (loop back), or end the conversation"
          style={{ ...S.select, flex: 1, minWidth: 0 }}
          value={option.next ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__new__") {
              onToggleOpen(true);
              onCreateNext();
              return;
            }
            if (v) onToggleOpen(true);
            set({ next: v || undefined });
          }}
        >
          <option value="">— ends the conversation —</option>
          {dialogue.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              → {n.id} — {(n.lines[0] ?? "").slice(0, 30)}
            </option>
          ))}
          {dangling && (
            <option value={option.next}>→ {option.next} (missing!)</option>
          )}
          <option value="__new__">＋ new page…</option>
        </select>
      </div>
      {dangling && (
        <div style={{ color: "#cc6666", fontSize: 11, margin: "0 4px 8px" }}>
          ⚠ next page "{option.next}" doesn't exist — plays as "end conversation"
        </div>
      )}
      </>
      )}

      {/* Jump chip lives in the well (it's a field-sized control) */}
      {open && nested?.kind === "jump" && nested.el}
    </div>
  );
}

// ── ItemsEditor (ITEMS tab) ───────────────────────────────────────────────────
// Edits the world-level item registry (WorldConfig.items). Counts live at
// gameplay-state key `inv.<id>`; the registry is identity only (label/icon/
// description/stackSize), so deleting an item never touches player state.

function ItemsEditor({
  items,
  help,
  onChange,
  graphics,
}: {
  items: ItemDef[];
  help?: string;
  onChange: (items: ItemDef[]) => void;
  graphics: GraphicDef[];
}) {
  function replace(id: string, next: ItemDef): void {
    onChange(items.map((it) => (it.id === id ? next : it)));
  }
  function remove(id: string): void {
    if (confirm("Delete this item? Scripts referencing it keep the raw id.")) {
      onChange(items.filter((it) => it.id !== id));
    }
  }
  function add(): void {
    onChange([...items, blankItem()]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 10,
          padding: "6px 10px",
          flexShrink: 0,
        }}
      >
        {help && <HelpTooltip side="below" align="right" text={help} />}
        <button style={S.btn(true)} onClick={add}>
          + New
        </button>
      </div>
      <div style={S.scroll}>
        {items.length === 0 && (
          <div
            style={{
              color: "#98a2b8",
              fontSize: 11,
              padding: "16px 12px",
              textAlign: "center",
            }}
          >
            No items yet — items are things the player collects, sees in their
            bag (I / Tab in game), and spends. + New creates one; scripts then
            give, take, and check them by name.
          </div>
        )}
        {items.map((it) => (
          <ItemRow
            key={it.id}
            item={it}
            graphics={graphics}
            onReplace={(next) => replace(it.id, next)}
            onRemove={() => remove(it.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ItemRow({
  item,
  graphics,
  onReplace,
  onRemove,
}: {
  item: ItemDef;
  graphics: GraphicDef[];
  onReplace: (next: ItemDef) => void;
  onRemove: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  function set<K extends keyof ItemDef>(key: K, val: ItemDef[K]): void {
    onReplace({ ...item, [key]: val });
  }

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        borderRadius: 4,
        padding: "6px 8px",
        margin: "0 10px 6px",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 4,
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        {item.icon ? (
          <img src={assetManager.resolveUrl(item.icon)} alt="" style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 3, flexShrink: 0 }} />
        ) : (
          <div style={{ width: 24, height: 24, borderRadius: 3, flexShrink: 0, background: "rgba(255,255,255,0.08)" }} />
        )}
        <input
          style={{ ...S.field, flex: 1 }}
          placeholder="Label"
          value={item.label}
          onChange={(e) => set("label", e.target.value)}
        />
        <button
          style={{ ...S.btn(), padding: "3px 6px", color: "#cc6666" }}
          onClick={onRemove}
        >
          ×
        </button>
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 4, position: "relative" }}>
        <input
          style={{ ...S.field, flex: 1 }}
          placeholder="Icon URL (optional)"
          value={item.icon ?? ""}
          onChange={(e) => set("icon", e.target.value || undefined)}
        />
        <button
          style={{ ...S.btn(), padding: "3px 8px" }}
          title="Pick from the graphics library (Assets → Graphics)"
          onClick={() => setPickerOpen((v) => !v)}
        >
          Pick
        </button>
        <input
          type="number"
          min={1}
          style={{ ...S.field, flex: "0 0 72px" }}
          placeholder="max ∞"
          title="stack size (max count; blank = unlimited)"
          value={item.stackSize ?? ""}
          onChange={(e) => set("stackSize", parseInt(e.target.value, 10) || undefined)}
        />
        {pickerOpen && (
          <GraphicPickerPopover
            graphics={graphics}
            onPick={(g) => set("icon", g.path)}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
      <input
        style={{ ...S.field, marginBottom: 4 }}
        placeholder="Description (shown in the bag)"
        value={item.description ?? ""}
        onChange={(e) => set("description", e.target.value || undefined)}
      />
      <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#8b94a8", fontSize: 11 }}>
        Starting count
        <input
          type="number"
          min={0}
          style={{ ...S.field, width: 64 }}
          placeholder="0"
          title="How many the player holds at the start of a New Game"
          value={item.startCount ?? ""}
          onChange={(e) => set("startCount", parseInt(e.target.value, 10) || undefined)}
        />
        <span style={{ color: "#8b94a8", fontSize: 10 }}>on New Game</span>
      </label>
    </div>
  );
}

// ── UiElementsEditor (UI tab, Phase 49) ───────────────────────────────────────
// Edits the custom-GUI registry (WorldConfig.uiElements / game.json). Rendered
// by GameGuiOverlay while playing; visibility is scripted via show_ui/hide_ui.

interface UiZoneBag {
  zoneObjects: WorldObject[];
  zonePlatforms: PlatformDef[];
  zoneShapes: ShapeDef[];
  zoneLights: LightDef[];
  zoneStairs: StairDef[];
  zoneWalls: WallDef[];
  zoneFloors: FloorDef[];
  zoneCheckpoints: CheckpointDef[];
  triggerVolumes: TriggerVolume[];
  groups: GroupDef[];
  assets: AssetDef[];
  zoneDialogues: DialogueTreeDef[];
  worldItems: ItemDef[];
  uiElements: UiElementDef[];
  projectSceneIds?: string[];
}

function UiElementsEditor({
  elements,
  help,
  onChange,
  graphics,
  ...zoneBag
}: {
  elements: UiElementDef[];
  help?: string;
  onChange: (elements: UiElementDef[]) => void;
  graphics: GraphicDef[];
} & UiZoneBag) {
  const [newKind, setNewKind] = useState<(typeof UI_KINDS)[number]>("bar");
  // Cards start collapsed; a freshly added element opens for editing.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  function toggleExpanded(id: string): void {
    setExpandedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function replace(id: string, next: UiElementDef): void {
    onChange(elements.map((el) => (el.id === id ? next : el)));
  }
  function remove(id: string): void {
    if (confirm("Delete this UI element? Scripts referencing it keep the raw id.")) {
      onChange(elements.filter((el) => el.id !== id));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, padding: "6px 10px", flexShrink: 0 }}>
        <select
          style={{ ...S.select, width: 110, flex: "0 0 auto" }}
          value={newKind}
          onChange={(e) => setNewKind(e.target.value as (typeof UI_KINDS)[number])}
        >
          {UI_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        {/* (?) sits beside + New so its right-aligned popover stays on-screen */}
        {help && <HelpTooltip side="below" align="right" text={help} />}
        <button
          style={{ ...S.btn(true), whiteSpace: "nowrap", flexShrink: 0 }}
          onClick={() => {
            const el = blankUiElement(newKind);
            setExpandedIds((s) => new Set(s).add(el.id));
            onChange([...elements, el]);
          }}
        >
          + New
        </button>
      </div>
      <div style={S.scroll}>
        {elements.length === 0 && (
          <div style={{ color: "#98a2b8", fontSize: 11, padding: "16px 12px", textAlign: "center" }}>
            No UI elements yet — pick a kind and hit + New. Bars, counters and
            icons (hearts/stars meters) bind to a state key; menus list options
            that run actions. Show them in-game with the show_ui action (or
            "visible at start").
          </div>
        )}
        {elements.map((el) => (
          <UiElementRow
            key={el.id}
            element={el}
            graphics={graphics}
            zoneBag={zoneBag}
            expanded={expandedIds.has(el.id)}
            onToggleExpanded={() => toggleExpanded(el.id)}
            onReplace={(next) => replace(el.id, next)}
            onRemove={() => remove(el.id)}
          />
        ))}
      </div>
    </div>
  );
}

// Small graphic-id field: readonly id text + Pick button + popover.
function GraphicIdField({
  value,
  graphics,
  placeholder,
  onChange,
}: {
  value: string | undefined;
  graphics: GraphicDef[];
  placeholder: string;
  onChange: (id: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const def = value ? graphics.find((g) => g.id === value) : undefined;
  return (
    <div style={{ display: "flex", gap: 4, flex: 1, position: "relative", alignItems: "center" }}>
      {def && (
        <img src={assetManager.resolveUrl(def.path)} alt="" style={{ width: 20, height: 20, objectFit: "contain", flexShrink: 0 }} />
      )}
      <input
        style={{ ...S.field, flex: 1 }}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
      <button style={{ ...S.btn(), padding: "3px 8px" }} title="Pick from the graphics library" onClick={() => setOpen((v) => !v)}>
        Pick
      </button>
      {open && (
        <GraphicPickerPopover
          graphics={graphics}
          onPick={(g) => onChange(g.id)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// Tiny uppercase section header inside a UI-element card (option B of the
// plans/mockups/ui-elements-prototype.html directions).
function UiSectionHead({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 9, letterSpacing: 2, color: "#7a86a0", fontFamily: "monospace", textTransform: "uppercase", margin: "10px 0 2px" }}>
      {label}
    </div>
  );
}

// Clickable 3×2 grid mirroring the six screen anchors — replaces the dropdown.
function UiAnchorGrid({ value, onChange }: { value: UiAnchor; onChange: (a: UiAnchor) => void }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, width: 118, flexShrink: 0,
      background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: 6,
    }}>
      {UI_ANCHORS.map((a) => (
        <button
          key={a}
          title={a}
          onClick={() => onChange(a)}
          style={{
            height: 20, borderRadius: 4, cursor: "pointer", padding: 0, fontSize: 7,
            background: value === a ? "rgba(80,140,255,0.14)" : "rgba(255,255,255,0.05)",
            border: value === a ? "1px solid rgba(80,140,255,0.3)" : "1px solid transparent",
            color: value === a ? "#9dbdff" : "transparent",
          }}
        >●</button>
      ))}
    </div>
  );
}

function UiElementRow({
  element,
  graphics,
  zoneBag,
  expanded,
  onToggleExpanded,
  onReplace,
  onRemove,
}: {
  element: UiElementDef;
  graphics: GraphicDef[];
  zoneBag: UiZoneBag;
  expanded: boolean;
  onToggleExpanded: () => void;
  onReplace: (next: UiElementDef) => void;
  onRemove: () => void;
}) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  function set(changes: Partial<UiElementDef>): void {
    onReplace({ ...element, ...changes } as UiElementDef);
  }

  const numField = (label: string, val: number | undefined, ph: string, title: string, onVal: (n: number | undefined) => void) => (
    <F label={label}>
      <input
        type="number"
        style={S.field}
        placeholder={ph}
        title={title}
        value={val ?? ""}
        onChange={(e) => onVal(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    </F>
  );

  const offsetPair = (label: string, key: "offsetX" | "offsetY", val: number | undefined) => (
    <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, color: "#8b94a8", fontSize: 10, minWidth: 0 }}>
      {label}
      <input
        type="number"
        style={S.field}
        placeholder="16"
        title="offset from the anchored edge (px)"
        value={val ?? ""}
        onChange={(e) => set({ [key]: e.target.value === "" ? undefined : Number(e.target.value) })}
      />
    </label>
  );

  // Collapsed cards show a one-line summary beside the name.
  const summary = [element.anchor, "stateKey" in element && element.stateKey ? element.stateKey : null]
    .filter(Boolean).join(" · ");

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", borderRadius: 4, padding: "0 8px",
      margin: "0 10px 6px", border: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, cursor: "pointer", userSelect: "none", padding: "7px 0" }}
        onClick={onToggleExpanded}
        title={expanded ? "Collapse" : "Expand"}
      >
        <span style={{ color: "#7a7a7a", fontSize: 10, width: 10, flexShrink: 0 }}>{expanded ? "▾" : "▸"}</span>
        <span style={{
          fontSize: 11, color: "#9dbdff", background: "rgba(80,140,255,0.14)",
          border: "1px solid rgba(80,140,255,0.3)", borderRadius: 3,
          padding: "2px 8px", letterSpacing: 1, textTransform: "uppercase", flexShrink: 0,
        }}>{element.kind}</span>
        <span style={{ color: "#dde3f0", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {element.label || "(unnamed)"}
        </span>
        {!expanded && (
          <span style={{ color: "#8b94a8", fontSize: 10, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {summary}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button style={{ ...S.btn(), padding: "3px 6px", color: "#cc6666", flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>
      </div>
      {expanded && (<div style={{ paddingBottom: 8 }}>
      <F label="Element name">
        <input
          style={S.field}
          placeholder="Label"
          value={element.label}
          onChange={(e) => set({ label: e.target.value })}
        />
      </F>

      <UiSectionHead label="Placement" />
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", padding: "4px 0" }}>
        <UiAnchorGrid value={element.anchor} onChange={(a) => set({ anchor: a })} />
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {offsetPair("X offset", "offsetX", element.offsetX)}
            {offsetPair("Y offset", "offsetY", element.offsetY)}
          </div>
          <div style={{ color: "#7a7a7a", fontSize: 9, marginTop: 4 }}>{element.anchor}</div>
        </div>
      </div>

      <UiSectionHead label="Visibility" />
      <F label="Visible at start">
        <input
          type="checkbox" className="wb-switch"
          title="Shown without needing a show_ui action"
          checked={!!element.startVisible}
          onChange={(e) => set({ startVisible: e.target.checked || undefined })}
        />
      </F>
      {element.kind !== "menu" && (
        <F label="Backdrop behind element">
          <input
            type="checkbox" className="wb-switch"
            title="Translucent grey box behind the element — keeps it readable on bright skies"
            checked={!!element.backdrop}
            onChange={(e) => set({ backdrop: e.target.checked || undefined })}
          />
        </F>
      )}

      {element.kind === "bar" && (
        <>
          <UiSectionHead label="Binding" />
          <F label="State key">
            <KeySuggestInput
              placeholder={"e.g. health"}
              value={element.stateKey}
              onChange={(v) => set({ stateKey: v })}
            />
          </F>
          {numField("Full at", element.max, "100", "value at which the bar is full", (n) => set({ max: n }))}
          {numField("Bar width px", element.width, "160", "bar width (px)", (n) => set({ width: n }))}
          {numField("Bar height px", element.height, "14", "bar height (px)", (n) => set({ height: n }))}
          <UiSectionHead label="Graphics" />
          <F label="Fill color">
            <input
              type="color"
              style={{ width: 28, height: 22, padding: 0, border: "none", background: "none", cursor: "pointer", flexShrink: 0 }}
              title="fill color"
              value={element.color ?? "#e05555"}
              onChange={(e) => set({ color: e.target.value })}
            />
          </F>
          <F label="Icon (optional)">
            <GraphicIdField value={element.graphicId} graphics={graphics} placeholder="icon" onChange={(id) => set({ graphicId: id })} />
          </F>
        </>
      )}

      {element.kind === "counter" && (
        <>
          <UiSectionHead label="Binding" />
          <F label="State key">
            <KeySuggestInput
              placeholder={"e.g. coins"}
              value={element.stateKey}
              onChange={(v) => set({ stateKey: v })}
            />
          </F>
          <F label="Prefix">
            <input
              style={S.field}
              placeholder="×"
              title="text before the number"
              value={element.prefix ?? ""}
              onChange={(e) => set({ prefix: e.target.value || undefined })}
            />
          </F>
          {numField("Icon size px", element.size, "24", "icon size (px)", (n) => set({ size: n }))}
          <UiSectionHead label="Graphics" />
          <F label="Icon (optional)">
            <GraphicIdField value={element.graphicId} graphics={graphics} placeholder="icon" onChange={(id) => set({ graphicId: id })} />
          </F>
        </>
      )}

      {element.kind === "icons" && (
        <>
          <UiSectionHead label="Binding" />
          <F label="State key">
            <KeySuggestInput
              placeholder={"e.g. health"}
              value={element.stateKey}
              onChange={(v) => set({ stateKey: v })}
            />
          </F>
          {numField("Icon count", element.count, "3", "how many icons to draw", (n) => set({ count: n }))}
          {numField("Full at", element.max, "= count", "state value when every icon is full (blank = 1 per icon)", (n) => set({ max: n }))}
          {numField("Icon size px", element.size, "24", "icon size (px)", (n) => set({ size: n }))}
          <UiSectionHead label="Graphics" />
          <F label="Full icon">
            <GraphicIdField value={element.fullGraphicId} graphics={graphics} placeholder="full icon" onChange={(id) => set({ fullGraphicId: id ?? "" })} />
          </F>
          <F label="Half (optional)">
            <GraphicIdField value={element.halfGraphicId} graphics={graphics} placeholder="half icon" onChange={(id) => set({ halfGraphicId: id })} />
          </F>
          <F label="Empty (optional)">
            <GraphicIdField value={element.emptyGraphicId} graphics={graphics} placeholder="empty icon" onChange={(id) => set({ emptyGraphicId: id })} />
          </F>
        </>
      )}

      {element.kind === "label" && (
        <>
          <UiSectionHead label="Text" />
          <F label="Text shown on screen">
            <input
              style={S.field}
              placeholder="Text"
              value={element.text}
              onChange={(e) => set({ text: e.target.value })}
            />
          </F>
          {numField("Font size px", element.fontSize, "13", "font size", (n) => set({ fontSize: n }))}
          <F label="Color">
            <input
              type="color"
              style={{ width: 28, height: 22, padding: 0, border: "none", background: "none", cursor: "pointer", flexShrink: 0 }}
              title="text color"
              value={element.color ?? "#dde3f0"}
              onChange={(e) => set({ color: e.target.value })}
            />
          </F>
        </>
      )}

      {element.kind === "image" && (
        <>
          <UiSectionHead label="Image" />
          <F label="Graphic">
            <GraphicIdField value={element.graphicId} graphics={graphics} placeholder="graphic" onChange={(id) => set({ graphicId: id ?? "" })} />
          </F>
          {numField("Width px", element.width, "auto", "width (px; blank = image size)", (n) => set({ width: n }))}
          {numField("Height px", element.height, "auto", "height (px)", (n) => set({ height: n }))}
        </>
      )}

      {element.kind === "menu" && (
        <>
          <UiSectionHead label="Menu" />
          <F label="Menu title (optional)">
            <input
              style={S.field}
              placeholder="Title"
              value={element.title ?? ""}
              onChange={(e) => set({ title: e.target.value || undefined })}
            />
          </F>
          <div style={{ padding: "6px 0 2px" }}>
            <button style={{ ...S.btn(), fontSize: 10 }} onClick={() => setOptionsOpen((v) => !v)}>
              {optionsOpen ? "▾" : "▸"} {element.options.length} option{element.options.length !== 1 ? "s" : ""}
            </button>
          </div>
          {optionsOpen && (
            <div style={{ paddingLeft: 6, borderLeft: "2px solid rgba(80,140,255,0.2)" }}>
              {element.options.map((opt, i) => (
                <UiMenuOptionRow
                  key={opt.id}
                  option={opt}
                  graphics={graphics}
                  zoneBag={zoneBag}
                  onChange={(next) => set({ options: element.options.map((o, j) => (j === i ? next : o)) })}
                  onRemove={() => set({ options: element.options.filter((_, j) => j !== i) })}
                />
              ))}
              <button
                style={{ ...S.btn(), fontSize: 10, marginBottom: 4 }}
                onClick={() => set({ options: [...element.options, { id: `opt_${crypto.randomUUID().slice(0, 8)}`, text: "" }] })}
              >
                + Add option
              </button>
            </div>
          )}
        </>
      )}
      </div>)}
    </div>
  );
}

function UiMenuOptionRow({
  option,
  zoneBag,
  onChange,
  onRemove,
}: {
  option: UiMenuOption;
  graphics: GraphicDef[];
  zoneBag: UiZoneBag;
  onChange: (next: UiMenuOption) => void;
  onRemove: () => void;
}) {
  function set(changes: Partial<UiMenuOption>): void {
    onChange({ ...option, ...changes });
  }
  const conditions = option.conditions ?? [];
  const actions = option.actions ?? [];

  return (
    <div style={{
      background: "rgba(255,255,255,0.02)", borderRadius: 4, padding: "5px 6px",
      marginBottom: 4, border: "1px solid rgba(255,255,255,0.05)",
    }}>
      <div style={{ display: "flex", gap: 4, alignItems: "flex-end", marginBottom: 4 }}>
        <F label="Option text" flex={1}>
          <input
            style={S.field}
            placeholder="Option text"
            value={option.text}
            onChange={(e) => set({ text: e.target.value })}
          />
        </F>
        <label style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#8b94a8", flexShrink: 0, marginBottom: 3 }} title="Hide the menu after this option is picked">
          <input
            type="checkbox" className="wb-switch"
            checked={option.closeOnPick !== false}
            onChange={(e) => set({ closeOnPick: e.target.checked ? undefined : false })}
          />
          close
        </label>
        <button style={{ ...S.btn(), padding: "3px 6px", color: "#cc6666" }} onClick={onRemove}>×</button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 9, color: "#8b94a8", letterSpacing: 0.5 }}>CONDITIONS (all must pass)</span>
        <button
          style={{ ...S.btn(), fontSize: 10 }}
          onClick={() => set({ conditions: [...conditions, { type: "has_state" } as ScriptCondition] })}
        >
          + Add
        </button>
      </div>
      {conditions.map((c, i) => (
        <ConditionRow
          key={i}
          condition={c}
          worldItems={zoneBag.worldItems}
          scope={{
            zoneObjects: zoneBag.zoneObjects, triggerVolumes: zoneBag.triggerVolumes,
            allowSelf: false,   // menus are global HUD — no owning entity
          }}
          onChange={(nc) => set({ conditions: conditions.map((x, j) => (j === i ? nc : x)) })}
          onRemove={() => set({ conditions: conditions.filter((_, j) => j !== i) })}
        />
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
        <span style={{ fontSize: 9, color: "#8b94a8", letterSpacing: 0.5 }}>ACTIONS (run on pick)</span>
        <button
          style={{ ...S.btn(), fontSize: 10 }}
          onClick={() => set({ actions: [...actions, { type: "set_state" } as ScriptAction] })}
        >
          + Add
        </button>
      </div>
      {actions.map((a, i) => (
        <ActionRow
          key={i}
          action={a}
          zoneObjects={zoneBag.zoneObjects}
          zonePlatforms={zoneBag.zonePlatforms}
          zoneShapes={zoneBag.zoneShapes}
          zoneLights={zoneBag.zoneLights}
          zoneStairs={zoneBag.zoneStairs}
          zoneWalls={zoneBag.zoneWalls}
          zoneFloors={zoneBag.zoneFloors}
          zoneCheckpoints={zoneBag.zoneCheckpoints}
          triggerVolumes={zoneBag.triggerVolumes}
          groups={zoneBag.groups}
          assets={zoneBag.assets}
          zoneDialogues={zoneBag.zoneDialogues}
          worldItems={zoneBag.worldItems}
          uiElements={zoneBag.uiElements}
          projectSceneIds={zoneBag.projectSceneIds}
          onChange={(na) => set({ actions: actions.map((x, j) => (j === i ? na : x)) })}
          onRemove={() => set({ actions: actions.filter((_, j) => j !== i) })}
        />
      ))}
    </div>
  );
}

// ── LiveValues (STATE tab, while playing) ─────────────────────────────────────
// Read-only watch pane over the live gameState store: every current key and
// its value, refreshed by the panel's tick while a preview/game session runs.
// Item counters are shown by their item label; engine-internal __keys hidden.

function LiveValues({ worldItems }: { worldItems: ItemDef[] }) {
  const snapshot = gameState.snapshot();
  const rows = Object.entries(snapshot)
    .filter(([k]) => !k.startsWith("__"))
    .map(([k, v]) => {
      const item = k.startsWith("inv.") ? worldItems.find((it) => `inv.${it.id}` === k) : undefined;
      return { key: k, display: item ? `🎒 ${item.label}` : k, value: v, isItem: !!item };
    })
    .sort((a, b) => Number(a.isItem) - Number(b.isItem) || a.display.localeCompare(b.display));

  return (
    <div style={{
      margin: "8px 10px 0", padding: "8px 10px", flexShrink: 0,
      background: "rgba(80,200,120,0.06)", border: "1px solid rgba(80,200,120,0.25)",
      borderRadius: 6, maxHeight: 180, overflowY: "auto",
    }}>
      <div style={{ color: "#50c878", fontSize: 10, letterSpacing: 1, marginBottom: 6, fontFamily: "monospace" }}>
        ● LIVE VALUES — playing now
      </div>
      {rows.length === 0 && (
        <div style={{ color: "#98a2b8", fontSize: 11 }}>
          Nothing set yet — values appear here the moment a script or pickup
          writes one.
        </div>
      )}
      {rows.map((r) => (
        <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "1px 0" }}>
          <span style={{ color: "#a8b2c8", fontSize: 11, fontFamily: "monospace",
                         overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.display}
          </span>
          <span style={{ color: "#c8d8ff", fontSize: 11, fontFamily: "monospace", flexShrink: 0 }}>
            {JSON.stringify(r.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
