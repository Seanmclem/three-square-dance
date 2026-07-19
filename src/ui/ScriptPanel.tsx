import { useState, useEffect } from "react";
import { gameState } from "@/scripting/GameState";
import type {
  ScriptDef,
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
} from "@/types";
import { SoundPicker } from "@/ui/SoundPicker";

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
    color: active ? "#c0c0e0" : "#606070",
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
    background: "rgba(46,46,46,0.9)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 4,
    color: "#c0c0c0",
    fontSize: 11,
    padding: "4px 8px",
    fontFamily: "monospace",
    outline: "none",
  } as const,
  select: {
    width: "100%",
    background: "rgba(46,46,46,0.9)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 4,
    color: "#c0c0c0",
    fontSize: 11,
    padding: "4px 6px",
    outline: "none",
  } as const,
  sectionLabel: {
    color: "#8b94a8",
    fontSize: 10,
    letterSpacing: 1,
    padding: "8px 12px 4px",
    textTransform: "uppercase",
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
  "on_level_load",
  "on_game_start",
  "on_health_zero",
  "on_dialogue_end",
];

const CONDITION_TYPES: ConditionType[] = [
  "has_state",
  "compare_number",
  "has_item",
  "npc_alive",
  "npc_dead",
];

const ACTION_TYPES: ActionType[] = [
  "adjust_number",
  "change_material",
  "close_door",
  "delete_state",
  "despawn_object",
  "fade_screen",
  "fire_event",
  "give_item",
  "light_off",
  "light_on",
  "load_scene",
  "move_object",
  "open_door",
  "play_animation",
  "play_music",
  "play_sound",
  "run_script",
  "set_state",
  "show_dialogue",
  "show_ui",
  "spawn_npc",
  "set_footstep",
  "start_mover",
  "stop_mover",
  "stop_music",
  "stop_sound",
  "store_position",
  "take_item",
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
  worldItems: ItemDef[];
  onWorldItemsChange: (items: ItemDef[]) => void;
  projectSceneIds?: string[];
}

type TabId = "level" | "object" | "dialogue" | "state" | "items";

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
  worldItems,
  onWorldItemsChange,
  projectSceneIds,
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
  // registered keys from both schema scopes, plus each item's counter shown by
  // its label — so nobody has to remember the inv.<id> convention.
  const knownStateKeys = [...new Set([
    ...Object.keys(gameStateSchema ?? {}),
    ...Object.keys(stateSchema),
  ])];

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
        {(["level", "object", "dialogue", "state", "items"] as TabId[]).map((t) => (
          <button
            key={t}
            style={S.tab(tab === t)}
            onClick={() => {
              setTab(t);
              setEditingId(null);
              setEditingDialogueId(null);
            }}
          >
            {t === "level" ? "LEVEL" : t === "object" ? "SELECTED" : t === "dialogue" ? "DIALOGUE" : t === "state" ? "STATE" : "ITEMS"}
          </button>
        ))}
      </div>

      {/* Per-tab description */}
      <div
        style={{
          color: "#a8b2c8",
          fontSize: 11.5,
          padding: "6px 10px 0",
          lineHeight: 1.45,
        }}
      >
        {tab === "level" &&
          "Level-wide scripts. Use on_game_start for one-time setup (spawn NPCs, set flags, play ambient audio). Use on_zone_enter for effects that replay each time the player loads in."}
        {tab === "object" &&
          "Scripts on the selected trigger volume or object. on_player_enter / on_player_exit fire when the player crosses the volume boundary."}
        {tab === "dialogue" &&
          "Branching dialogue trees for this zone. A show_dialogue action plays one by id. Nodes show lines, then response options; options can be gated by conditions and run effects (set flags, adjust counters) when picked."}
        {tab === "state" && !hasGameScope &&
          "Gameplay-state keys for this level. A registered key seeds its default on New Game and (numbers) clamps to min/max. Unregistered keys still work in scripts — registering just adds a default + clamp."}
        {tab === "state" && hasGameScope && (stateScope === "game"
          ? "GAME scope: shared defaults + clamps for every scene in the project (game.json). A scene's own entry for the same key overrides these. Saved with the project on Save."
          : "SCENE scope: this scene's own keys — they override the project's GAME entries for the same key while this scene is loaded.")}
        {tab === "items" &&
          "Things the player can collect, hold, and spend. Give or take them with the give_item / take_item actions, gate anything on ownership with the has_item condition, and the in-game bag (I / Tab, gamepad Y) shows what the player holds."}
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
            <SchemaEditor schema={gameStateSchema} onChange={onGameStateSchemaChange} />
          ) : (
            <SchemaEditor schema={stateSchema} onChange={onStateSchemaChange} />
          )}
        </>
      ) : tab === "items" ? (
        <ItemsEditor items={worldItems} onChange={onWorldItemsChange} />
      ) : tab === "dialogue" ? (
        (() => {
          const editingDialogue = editingDialogueId
            ? (zoneDialogues.find((d) => d.id === editingDialogueId) ?? null)
            : null;
          return editingDialogue ? (
            <DialogueEditor
              dialogue={editingDialogue}
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
          script={editing}
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
          projectSceneIds={projectSceneIds}
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
  onChange,
}: {
  schema: Record<string, StateSchema>;
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "6px 10px",
          flexShrink: 0,
        }}
      >
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
  onSelect,
  onToggle,
  onAdd,
}: {
  scripts: ScriptDef[];
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "6px 10px",
          flexShrink: 0,
        }}
      >
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
  projectSceneIds,
  ownerIsEntity,
  selectedObjectId,
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
  projectSceneIds?: string[];
  ownerIsEntity: boolean;
  selectedObjectId: string | null;
  onBack: () => void;
  onChange: (s: ScriptDef) => void;
  onDelete: () => void;
}) {
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
    script.trigger.type === "on_dialogue_end";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
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
          {script.label || "Script"}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Label */}
        <div style={{ padding: "8px 12px" }}>
          <div style={S.sectionLabel as React.CSSProperties}>Label</div>
          <input
            style={S.field}
            value={script.label}
            onChange={(e) => set("label", e.target.value)}
          />
        </div>

        {/* Trigger */}
        <div style={{ padding: "0 12px 8px" }}>
          <div style={S.sectionLabel as React.CSSProperties}>Trigger</div>
          <select
            style={{ ...S.select, marginBottom: 4 }}
            value={script.trigger.type}
            onChange={(e) =>
              setTrigger({
                type: e.target.value as TriggerType,
                targetId: undefined,
              })
            }
          >
            {TRIGGER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {needsTarget && (!ownerIsEntity || script.trigger.type === "on_dialogue_end") && (
            <TargetPicker
              triggerType={script.trigger.type}
              targetId={script.trigger.targetId ?? ""}
              triggerVolumes={triggerVolumes}
              zoneObjects={zoneObjects}
              zoneDialogues={zoneDialogues}
              onChange={(id) => setTrigger({ targetId: id })}
            />
          )}
          {needsTarget && ownerIsEntity && script.trigger.type !== "on_dialogue_end" && (
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

          {script.trigger.type === "on_timer" && (
            <input
              type="number"
              style={{ ...S.field, marginTop: 4 }}
              placeholder="Interval (seconds)"
              value={script.trigger.interval ?? ""}
              onChange={(e) =>
                setTrigger({ interval: parseFloat(e.target.value) || 1 })
              }
            />
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <label
              style={{
                color: "#888",
                fontSize: 11,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <input
                type="checkbox"
                checked={script.oneShot}
                onChange={(e) => set("oneShot", e.target.checked)}
              />
              One-shot
            </label>
            <div style={{ flex: 1 }} />
            <label
              style={{
                color: "#888",
                fontSize: 11,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              Delay (s)
              <input
                type="number"
                style={{ ...S.field, width: 52 }}
                value={script.trigger.delay ?? ""}
                placeholder="0"
                onChange={(e) =>
                  setTrigger({ delay: parseFloat(e.target.value) || undefined })
                }
              />
            </label>
          </div>
        </div>

        <div style={S.divider} />

        {/* Conditions */}
        <div style={{ padding: "0 12px 8px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={S.sectionLabel as React.CSSProperties}>
              Conditions
            </span>
            <button
              style={{ ...S.btn(), fontSize: 10 }}
              onClick={() =>
                set("conditions", [
                  ...script.conditions,
                  { type: "has_state" } as ScriptCondition,
                ])
              }
            >
              + Add
            </button>
          </div>
          {script.conditions.map((c, i) => (
            <ConditionRow
              key={i}
              condition={c}
              worldItems={worldItems}
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
          ))}
          {script.conditions.length === 0 && (
            <div style={{ color: "#98a2b8", fontSize: 11, padding: "4px 0" }}>
              (none)
            </div>
          )}
        </div>

        <div style={S.divider} />

        {/* Actions */}
        <div style={{ padding: "0 12px 8px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={S.sectionLabel as React.CSSProperties}>Actions</span>
            <button
              style={{ ...S.btn(), fontSize: 10 }}
              onClick={() =>
                set("actions", [
                  ...script.actions,
                  { type: "set_state" } as ScriptAction,
                ])
              }
            >
              + Add
            </button>
          </div>
          {script.actions.map((a, i) => (
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
              projectSceneIds={projectSceneIds}
              onChange={(na) =>
                set(
                  "actions",
                  script.actions.map((x, j) => (j === i ? na : x)),
                )
              }
              onRemove={() =>
                set(
                  "actions",
                  script.actions.filter((_, j) => j !== i),
                )
              }
            />
          ))}
          {script.actions.length === 0 && (
            <div style={{ color: "#98a2b8", fontSize: 11, padding: "4px 0" }}>
              (none)
            </div>
          )}
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

// ── TargetPicker ──────────────────────────────────────────────────────────────

function TargetPicker({
  triggerType,
  targetId,
  triggerVolumes,
  zoneObjects,
  zoneDialogues,
  onChange,
}: {
  triggerType: TriggerType;
  targetId: string;
  triggerVolumes: TriggerVolume[];
  zoneObjects: WorldObject[];
  zoneDialogues: DialogueTreeDef[];
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
            {d.label} ({d.id})
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
  if (triggerType === "on_interact") {
    return (
      <select
        style={S.select}
        value={targetId}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— pick object —</option>
        {zoneObjects.map((o) => (
          <option key={o.id} value={o.id}>
            {o.assetId} ({o.id.slice(0, 8)})
          </option>
        ))}
      </select>
    );
  }
  // on_state_changed: the target is the state key to watch
  return (
    <input
      list="wb-state-keys"
      style={S.field}
      placeholder={
        triggerType === "on_state_changed"
          ? "State key (e.g. health)"
          : "Target ID"
      }
      value={targetId}
      onChange={(e) => onChange(e.target.value)}
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
  onChange: (id: string) => void;
}) {
  const known =
    groups.some((g) => g.id === targetId) ||
    zoneObjects.some((o) => o.id === targetId) ||
    zoneShapes.some((s) => s.id === targetId) ||
    zonePlatforms.some((p) => p.id === targetId) ||
    zoneStairs.some((s) => s.id === targetId) ||
    zoneWalls.some((w) => w.id === targetId) ||
    zoneFloors.some((f) => f.id === targetId) ||
    triggerVolumes.some((v) => v.id === targetId) ||
    zoneLightDefs.some((l) => l.id === targetId);
  const short = (id: string) => id.slice(0, 8);
  return (
    <select
      style={S.select}
      value={targetId}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— pick target —</option>
      {groups.length > 0 && (
        <optgroup label="Groups">
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              ▦ {g.name}
            </option>
          ))}
        </optgroup>
      )}
      {zoneObjects.length > 0 && (
        <optgroup label="Objects">
          {zoneObjects.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label || o.assetId} ({short(o.id)})
            </option>
          ))}
        </optgroup>
      )}
      {zonePlatforms.length > 0 && (
        <optgroup label="Platforms">
          {zonePlatforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label || "Platform"} ({short(p.id)})
            </option>
          ))}
        </optgroup>
      )}
      {zoneShapes.length > 0 && (
        <optgroup label="Shapes">
          {zoneShapes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label || s.kind} ({short(s.id)})
            </option>
          ))}
        </optgroup>
      )}
      {zoneLightDefs.length > 0 && (
        <optgroup label="Lights">
          {zoneLightDefs.map((l) => (
            <option key={l.id} value={l.id}>
              💡 {l.label || l.kind} ({short(l.id)})
            </option>
          ))}
        </optgroup>
      )}
      {zoneStairs.length > 0 && (
        <optgroup label="Stairs">
          {zoneStairs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label || "Stair"} ({short(s.id)})
            </option>
          ))}
        </optgroup>
      )}
      {zoneWalls.length > 0 && (
        <optgroup label="Walls">
          {zoneWalls.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label || "Wall"} ({short(w.id)})
            </option>
          ))}
        </optgroup>
      )}
      {zoneFloors.length > 0 && (
        <optgroup label="Floors">
          {zoneFloors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label || `Floor · level ${f.level}`} ({short(f.id)})
            </option>
          ))}
        </optgroup>
      )}
      {triggerVolumes.length > 0 && (
        <optgroup label="Trigger Volumes">
          {triggerVolumes.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label || "Volume"} ({short(v.id)})
            </option>
          ))}
        </optgroup>
      )}
      {/* Preserve a hand-entered / cross-zone id that isn't in either list */}
      {targetId && !known && (
        <option value={targetId}>{targetId} (custom)</option>
      )}
    </select>
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
  const known =
    zoneObjects.some((o) => o.id === targetId) ||
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
      {zoneObjects.length > 0 && (
        <optgroup label="Objects">
          {zoneObjects.map((o) => (
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
      {zoneCheckpoints.length > 0 && (
        <optgroup label="Checkpoints">
          {zoneCheckpoints.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label || "Checkpoint"} ({c.id.slice(0, 8)})
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

function ConditionRow({
  condition,
  worldItems,
  onChange,
  onRemove,
}: {
  condition: ScriptCondition;
  worldItems: ItemDef[];
  onChange: (c: ScriptCondition) => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4, alignItems: "center" }}
    >
      <select
        style={{ ...S.select, flex: "0 0 120px" }}
        value={condition.type}
        onChange={(e) =>
          onChange({ ...condition, type: e.target.value as ConditionType })
        }
      >
        {CONDITION_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {condition.type === "has_state" && (
        <input
          style={{ ...S.field, flex: 1 }}
          list="wb-state-keys" placeholder="state key"
          value={condition.stateKey ?? ""}
          onChange={(e) => onChange({ ...condition, stateKey: e.target.value })}
        />
      )}
      {condition.type === "compare_number" && (
        <>
          <input
            style={{ ...S.field, flex: 1 }}
            list="wb-state-keys" placeholder="state key"
            value={condition.stateKey ?? ""}
            onChange={(e) =>
              onChange({ ...condition, stateKey: e.target.value })
            }
          />
          <select
            style={{ ...S.select, flex: "0 0 56px" }}
            value={condition.compareOp ?? ">="}
            onChange={(e) =>
              onChange({ ...condition, compareOp: e.target.value as CompareOp })
            }
          >
            {COMPARE_OPS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            type="number"
            style={{ ...S.field, flex: "0 0 64px" }}
            placeholder="value"
            value={
              typeof condition.stateValue === "number"
                ? condition.stateValue
                : ""
            }
            onChange={(e) =>
              onChange({
                ...condition,
                stateValue: parseFloat(e.target.value) || 0,
              })
            }
          />
        </>
      )}
      {condition.type === "has_item" && (
        <>
          {/* four controls don't fit one 280px row — item picker gets line 2 */}
          <div style={{ flexBasis: "100%", height: 0 }} />
          <ItemPicker
            style={{ ...S.select, flex: 1 }}
            itemId={condition.itemId ?? ""}
            worldItems={worldItems}
            onChange={(id) => onChange({ ...condition, itemId: id || undefined })}
          />
          <select
            style={{ ...S.select, flex: "0 0 56px" }}
            title="owned count comparison (default: at least)"
            value={condition.compareOp ?? ">="}
            onChange={(e) =>
              onChange({ ...condition, compareOp: e.target.value as CompareOp })
            }
          >
            {COMPARE_OPS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            style={{ ...S.field, flex: "0 0 52px" }}
            placeholder="1"
            title="count to compare the owned amount against"
            value={condition.count ?? ""}
            onChange={(e) =>
              onChange({ ...condition, count: parseInt(e.target.value, 10) || undefined })
            }
          />
        </>
      )}
      <button
        style={{ ...S.btn(), padding: "3px 6px", color: "#cc6666" }}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
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

function ActionRow({
  action,
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
  projectSceneIds,
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
  projectSceneIds?: string[];
  onChange: (a: ScriptAction) => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        borderRadius: 4,
        padding: "6px 8px",
        marginBottom: 6,
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
        <select
          style={{ ...S.select, flex: 1 }}
          value={action.type}
          onChange={(e) => onChange({ type: e.target.value as ActionType })}
        >
          {[...ACTION_TYPES].sort().map((t) => (
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
      <ActionFields
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
        projectSceneIds={projectSceneIds}
        onChange={onChange}
      />
    </div>
  );
}

function ActionFields({
  action,
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
  projectSceneIds,
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
  projectSceneIds?: string[];
  onChange: (a: ScriptAction) => void;
}) {
  function set(changes: Partial<ScriptAction>): void {
    onChange({ ...action, ...changes });
  }
  // move / change_material / play_animation only act on objects at runtime → object-only.
  const targetPicker = (
    <ActionTargetPicker
      targetId={action.targetId ?? ""}
      zoneObjects={zoneObjects}
      groups={groups}
      onChange={(id) => set({ targetId: id })}
    />
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
      onChange={(id) => set({ targetId: id })}
    />
  );
  // start/stop/toggle_mover targets the entity types that can carry a mover
  // (objects, platforms, shapes — Phase 31).
  const moverTargetPicker = (
    <ActionTargetPicker
      targetId={action.targetId ?? ""}
      zoneObjects={zoneObjects}
      groups={groups}
      zonePlatforms={zonePlatforms}
      zoneShapes={zoneShapes}
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
  const targetObj = zoneObjects.find((o) => o.id === action.targetId);
  const targetClips =
    assets.find((a) => a.id === targetObj?.assetId)?.animations ?? [];

  switch (action.type) {
    case "show_dialogue":
      return (
        <>
          <select
            style={S.select}
            value={action.dialogueId ?? ""}
            onChange={(e) => set({ dialogueId: e.target.value || undefined })}
          >
            <option value="">— pick dialogue —</option>
            {zoneDialogues.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} ({d.id})
              </option>
            ))}
            {/* Preserve a hand-entered / cross-zone id that isn't in this zone */}
            {action.dialogueId && !zoneDialogues.some((d) => d.id === action.dialogueId) && (
              <option value={action.dialogueId}>{action.dialogueId} (custom)</option>
            )}
          </select>
          <div style={{ color: "#98a2b8", fontSize: 11, fontStyle: "italic", padding: "4px 0 0" }}>
            Manage dialogues in the DIALOGUE tab.
          </div>
        </>
      );

    case "give_item":
    case "take_item":
      return (
        <>
          <div style={{ display: "flex", gap: 4 }}>
            <ItemPicker
              style={{ ...S.select, flex: 1 }}
              itemId={action.itemId ?? ""}
              worldItems={worldItems}
              onChange={(id) => set({ itemId: id || undefined })}
            />
            <input
              type="number"
              min={1}
              style={{ ...S.field, flex: "0 0 52px" }}
              placeholder="1"
              title="count"
              value={action.count ?? ""}
              onChange={(e) => set({ count: parseInt(e.target.value, 10) || undefined })}
            />
          </div>
          <div style={{ color: "#98a2b8", fontSize: 11, fontStyle: "italic", padding: "4px 0 0" }}>
            Manage items in the ITEMS tab.
          </div>
        </>
      );

    case "play_sound":
      return (
        <>
          <SoundPicker value={action.sound} onChange={(id) => set({ sound: id })} />
          <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4 }}>
            <label style={{ color: "#808090", fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}>
              <input type="checkbox" checked={action.loop ?? false} onChange={(e) => set({ loop: e.target.checked || undefined })} />
              loop
            </label>
            <input type="number" min={0} max={1} step={0.1} style={{ ...S.field, flex: "0 0 64px" }}
              placeholder="vol" title="volume 0..1"
              value={action.volume ?? ""} onChange={(e) => set({ volume: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </div>
          <div style={{ color: "#8b94a8", fontSize: 11, padding: "6px 0 2px" }}>Play at (optional — spatial):</div>
          {targetPicker}
        </>
      );

    case "stop_sound":
      return (
        <SoundPicker value={action.sound} onChange={(id) => set({ sound: id })} allowNone />
      );

    case "play_music":
      return (
        <>
          <SoundPicker value={action.music} onChange={(id) => set({ music: id })} />
          <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4 }}>
            <label style={{ color: "#808090", fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}>
              <input type="checkbox" checked={action.loop ?? true} onChange={(e) => set({ loop: e.target.checked })} />
              loop
            </label>
            <input type="number" min={0} max={1} step={0.1} style={{ ...S.field, flex: "0 0 64px" }}
              placeholder="vol" title="volume 0..1"
              value={action.volume ?? ""} onChange={(e) => set({ volume: e.target.value === "" ? undefined : Number(e.target.value) })} />
            <input type="number" min={0} step={0.5} style={{ ...S.field, flex: "0 0 64px" }}
              placeholder="fade s" title="crossfade seconds"
              value={action.fadeSeconds ?? ""} onChange={(e) => set({ fadeSeconds: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </div>
        </>
      );

    case "stop_music":
      return (
        <input type="number" min={0} step={0.5} style={S.field}
          placeholder="fade-out seconds (0 = instant)"
          value={action.fadeSeconds ?? ""} onChange={(e) => set({ fadeSeconds: e.target.value === "" ? undefined : Number(e.target.value) })} />
      );

    case "set_footstep":
      return (
        <>
          <SoundPicker value={action.sound} onChange={(id) => set({ sound: id })} allowNone />
          <div style={{ color: "#98a2b8", fontSize: 11, fontStyle: "italic", padding: "4px 0 0" }}>
            Overrides the player's walking sound (e.g. wood → gravel). Leave empty to revert
            to the default. Pair on_player_enter / on_player_exit on a trigger volume.
          </div>
        </>
      );

    case "set_state":
      return (
        <div style={{ display: "flex", gap: 4 }}>
          <input
            style={{ ...S.field, flex: 1 }}
            list="wb-state-keys" placeholder="State key"
            value={action.stateKey ?? ""}
            onChange={(e) => set({ stateKey: e.target.value })}
          />
          <input
            style={{ ...S.field, flex: 1 }}
            placeholder="value (true / 100 / text)"
            value={action.stateValue == null ? "" : String(action.stateValue)}
            onChange={(e) =>
              set({ stateValue: coerceStateValue(e.target.value) })
            }
          />
        </div>
      );

    case "adjust_number":
      return (
        <div style={{ display: "flex", gap: 4 }}>
          <input
            style={{ ...S.field, flex: 1 }}
            list="wb-state-keys" placeholder="State key (e.g. health)"
            value={action.stateKey ?? ""}
            onChange={(e) => set({ stateKey: e.target.value })}
          />
          <input
            type="number"
            style={{ ...S.field, flex: "0 0 72px" }}
            placeholder="±delta"
            value={action.numberDelta ?? ""}
            onChange={(e) =>
              set({ numberDelta: parseFloat(e.target.value) || 0 })
            }
          />
        </div>
      );

    case "delete_state":
      return (
        <input
          style={S.field}
          list="wb-state-keys" placeholder="State key"
          value={action.stateKey ?? ""}
          onChange={(e) => set({ stateKey: e.target.value })}
        />
      );

    case "store_position": {
      const src = action.posSource ?? "player";
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <input
            style={S.field}
            list="wb-state-keys" placeholder="State key (e.g. checkpoint)"
            value={action.stateKey ?? ""}
            onChange={(e) => set({ stateKey: e.target.value })}
          />
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
          {src === "object" && positionSourcePicker}
          {src === "coords" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
              <input
                type="number"
                style={{ ...S.field }}
                placeholder="facing° (optional)"
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
            </div>
          )}
        </div>
      );
    }

    case "fire_event":
      return (
        <input
          style={S.field}
          placeholder="Event ID"
          value={action.eventId ?? ""}
          onChange={(e) => set({ eventId: e.target.value })}
        />
      );

    case "load_scene":
      // Cross-scene routing for the runtime shell. With a project open the ids
      // are known (Phase 33) → dropdown; otherwise the classic free text.
      if (projectSceneIds?.length) {
        const cur = action.sceneId ?? "";
        const known = projectSceneIds.includes(cur);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
            <div style={{ fontSize: 10, color: "#5f7090" }}>
              Runtime only — routes between this project&apos;s scenes. No-op in editor preview.
            </div>
          </div>
        );
      }
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <input
            style={S.field}
            placeholder="Scene id (runtime manifest key)"
            value={action.sceneId ?? ""}
            onChange={(e) => set({ sceneId: e.target.value })}
          />
          <div style={{ fontSize: 10, color: "#5f7090" }}>
            Runtime only — must match a scene key in the game&apos;s manifest. Not validated here.
          </div>
        </div>
      );

    case "despawn_object":
      return despawnTargetPicker;

    case "start_mover":
    case "stop_mover":
    case "toggle_mover":
      return moverTargetPicker;

    case "light_on":
    case "light_off":
    case "toggle_light":
      return lightTargetPicker;

    case "open_door":
    case "close_door":
      return targetPicker;

    case "move_object":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {targetPicker}
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
        </div>
      );

    case "play_animation": {
      const clipKnown = targetClips.includes(action.animation ?? "");
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {targetPicker}
          {targetClips.length > 0 ? (
            <select
              style={S.select}
              value={action.animation ?? ""}
              onChange={(e) => set({ animation: e.target.value })}
            >
              <option value="">— pick clip —</option>
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
                targetObj
                  ? "Clip name (no clips found on asset)"
                  : "Clip name (pick an object target for a list)"
              }
              value={action.animation ?? ""}
              onChange={(e) => set({ animation: e.target.value })}
            />
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 2 }}>
            <label
              style={{
                color: "#888",
                fontSize: 11,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <input
                type="checkbox"
                checked={action.animationLoop ?? false}
                onChange={(e) => set({ animationLoop: e.target.checked })}
              />
              Loop
            </label>
            <label
              style={{
                color: action.animationLoop ? "#555" : "#888",
                fontSize: 11,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <input
                type="checkbox"
                disabled={action.animationLoop ?? false}
                checked={action.animationHold ?? false}
                onChange={(e) => set({ animationHold: e.target.checked })}
              />
              Hold at end
            </label>
            <div style={{ flex: 1 }} />
            <label
              style={{
                color: "#888",
                fontSize: 11,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              Blend (s)
              <input
                type="number"
                style={{ ...S.field, width: 52 }}
                placeholder="0.3"
                value={action.animationBlend ?? ""}
                onChange={(e) =>
                  set({
                    animationBlend: parseFloat(e.target.value) || undefined,
                  })
                }
              />
            </label>
          </div>
        </div>
      );
    }

    case "change_material":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {targetPicker}
          <input
            style={S.field}
            placeholder="Material ID"
            value={action.material ?? ""}
            onChange={(e) => set({ material: e.target.value })}
          />
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
            <input
              style={S.field}
              list="wb-state-keys" placeholder="State key (e.g. checkpoint)"
              value={action.positionKey ?? ""}
              onChange={(e) => set({ positionKey: e.target.value })}
            />
          ) : (
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
            <input
              type="number"
              style={S.field}
              placeholder="facing degrees"
              value={action.facing ?? ""}
              onChange={(e) => set({ facing: parseFloat(e.target.value) || 0 })}
            />
          )}
          {action.facingSource === "key" && (
            <input
              style={S.field}
              placeholder="facing state key (number, or a stored pose)"
              value={action.facingKey ?? ""}
              onChange={(e) => set({ facingKey: e.target.value })}
            />
          )}
        </div>
      );
    }

    case "fade_screen":
      return (
        <div style={{ display: "flex", gap: 4 }}>
          <input
            style={{ ...S.field, flex: 1 }}
            placeholder="Color (#000)"
            value={action.fadeColor ?? ""}
            onChange={(e) => set({ fadeColor: e.target.value })}
          />
          <input
            type="number"
            style={{ ...S.field, width: 60 }}
            placeholder="sec"
            value={action.fadeDuration ?? ""}
            onChange={(e) =>
              set({ fadeDuration: parseFloat(e.target.value) || 0.3 })
            }
          />
        </div>
      );

    case "show_ui":
      return (
        <input
          style={S.field}
          placeholder="UI element ID"
          value={action.uiElementId ?? ""}
          onChange={(e) => set({ uiElementId: e.target.value })}
        />
      );

    case "run_script":
      return (
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
      );

    case "spawn_npc":
      return (
        <div style={{ color: "#666", fontSize: 10 }}>spawn_npc — Phase 13</div>
      );

    default:
      return null;
  }
}

// ── DialogueList (DIALOGUE tab) ───────────────────────────────────────────────

function DialogueList({
  dialogues,
  onSelect,
  onAdd,
}: {
  dialogues: DialogueTreeDef[];
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "6px 10px",
          flexShrink: 0,
        }}
      >
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
                {` · ${d.nodes.length} node${d.nodes.length !== 1 ? "s" : ""}`}
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
  onBack,
  onChange,
  onDelete,
}: {
  dialogue: DialogueTreeDef;
  worldItems: ItemDef[];
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
  onBack: () => void;
  onChange: (d: DialogueTreeDef) => void;
  onDelete: () => void;
}) {
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
  const reachable = new Set<string>([dialogue.startNode]);
  for (const n of dialogue.nodes)
    for (const o of n.options) if (o.next) reachable.add(o.next);
  const unreachable = dialogue.nodes.filter((n) => !reachable.has(n.id)).map((n) => n.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
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
      </div>

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
          <div style={S.sectionLabel as React.CSSProperties}>Start node</div>
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
            <span style={S.sectionLabel as React.CSSProperties}>Nodes</span>
            <button style={{ ...S.btn(), fontSize: 10 }} onClick={addNode}>
              + Add node
            </button>
          </div>
          <div style={{ color: "#8b94a8", fontSize: 11, lineHeight: 1.4, padding: "0 0 6px" }}>
            A node is one "screen" of the conversation: its lines play in
            order, then its response options appear. Options jump to other
            nodes — that's how conversations branch.
          </div>
          {dialogue.nodes.map((node) => (
            <DialogueNodeCard
              key={node.id}
              node={node}
              dialogue={dialogue}
              worldItems={worldItems}
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
              onChange={updateNode}
              onDelete={() => deleteNode(node.id)}
            />
          ))}
        </div>

        {unreachable.length > 0 && (
          <div style={{ color: "#cc9944", fontSize: 10, padding: "0 12px 8px" }}>
            ⚠ Unreachable node{unreachable.length !== 1 ? "s" : ""}: {unreachable.join(", ")}
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

function DialogueNodeCard({
  node,
  dialogue,
  worldItems,
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
  onChange,
  onDelete,
}: {
  node: DialogueNode;
  dialogue: DialogueTreeDef;
  worldItems: ItemDef[];
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
  onChange: (n: DialogueNode) => void;
  onDelete: () => void;
}) {
  function set<K extends keyof DialogueNode>(key: K, val: DialogueNode[K]): void {
    onChange({ ...node, [key]: val });
  }

  function addOption(): void {
    set("options", [
      ...node.options,
      { id: `opt_${crypto.randomUUID().slice(0, 8)}`, text: "" },
    ]);
  }

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        borderRadius: 4,
        padding: "6px 8px",
        marginBottom: 6,
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
        <span
          title={isStart
            ? "This node's id — the conversation starts here; response options elsewhere can jump to it"
            : "This node's id — response options jump to nodes by these ids"}
          style={{
            color: "#80aaff",
            fontSize: 10,
            fontFamily: "monospace",
            background: "rgba(128,170,255,0.12)",
            borderRadius: 3,
            padding: "2px 6px",
          }}
        >
          {node.id}
          {isStart ? " · start" : ""}
        </span>
        <input
          style={{ ...S.field, flex: 1 }}
          placeholder="Speaker for this node (optional)" title="Overrides the dialogue's Speaker while this node is on screen"
          value={node.speaker ?? ""}
          onChange={(e) => set("speaker", e.target.value || undefined)}
        />
        <button
          style={{
            ...S.btn(),
            padding: "3px 6px",
            color: isStart ? "#555" : "#cc6666",
            cursor: isStart ? "not-allowed" : "pointer",
          }}
          disabled={isStart}
          title={isStart ? "Start node — pick another start node first" : "Delete node"}
          onClick={onDelete}
        >
          ×
        </button>
      </div>
      <textarea
        style={{ ...S.field, height: 48, resize: "vertical" }}
        placeholder="Lines (one per line)"
        value={node.lines.join("\n")}
        onChange={(e) => set("lines", e.target.value.split("\n"))}
      />

      {/* Response options */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 4,
        }}
      >
        <span
          title="What the player can say when this node's lines finish"
          style={{ color: "#8b94a8", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}
        >
          Response options
        </span>
        <button style={{ ...S.btn(), fontSize: 10 }} onClick={addOption}>
          + Add
        </button>
      </div>
      {node.options.length === 0 && (
        <div style={{ color: "#98a2b8", fontSize: 11, padding: "4px 0" }}>
          (no responses — the conversation ends after this node's last line)
        </div>
      )}
      {node.options.map((opt, i) => (
        <DialogueOptionRow
          key={opt.id}
          option={opt}
          dialogue={dialogue}
          worldItems={worldItems}
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
          onChange={(no) =>
            set("options", node.options.map((x, j) => (j === i ? no : x)))
          }
          onRemove={() =>
            set("options", node.options.filter((_, j) => j !== i))
          }
        />
      ))}
    </div>
  );
}

// ── DialogueOptionRow ─────────────────────────────────────────────────────────

function DialogueOptionRow({
  option,
  dialogue,
  worldItems,
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
  onChange,
  onRemove,
}: {
  option: DialogueOption;
  dialogue: DialogueTreeDef;
  worldItems: ItemDef[];
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
  onChange: (o: DialogueOption) => void;
  onRemove: () => void;
}) {
  function set(changes: Partial<DialogueOption>): void {
    onChange({ ...option, ...changes });
  }

  const conditions = option.conditions ?? [];
  const actions = option.actions ?? [];
  const dangling = !!option.next && !dialogue.nodes.some((n) => n.id === option.next);

  return (
    <div
      style={{
        background: "rgba(0,0,0,0.25)",
        borderRadius: 4,
        padding: "6px 8px",
        marginBottom: 4,
        border: `1px solid ${dangling ? "rgba(204,102,102,0.5)" : "rgba(255,255,255,0.05)"}`,
      }}
    >
      <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 4 }}>
        <input
          style={{ ...S.field, flex: 1 }}
          placeholder="Response text"
          value={option.text}
          onChange={(e) => set({ text: e.target.value })}
        />
        <button
          style={{ ...S.btn(), padding: "3px 6px", color: "#cc6666" }}
          onClick={onRemove}
        >
          ×
        </button>
      </div>
      <select
        title="Where this response leads — another node, or end the conversation"
        style={{ ...S.select, marginBottom: 4 }}
        value={option.next ?? ""}
        onChange={(e) => set({ next: e.target.value || undefined })}
      >
        <option value="">— end conversation —</option>
        {dialogue.nodes.map((n) => (
          <option key={n.id} value={n.id}>
            → {n.id} — {(n.lines[0] ?? "").slice(0, 30)}
          </option>
        ))}
        {dangling && (
          <option value={option.next}>→ {option.next} (missing!)</option>
        )}
      </select>
      {dangling && (
        <div style={{ color: "#cc6666", fontSize: 10, marginBottom: 4 }}>
          ⚠ next node "{option.next}" doesn't exist — plays as "end conversation"
        </div>
      )}

      {/* Conditions (option hidden unless ALL pass) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#8b94a8", fontSize: 11 }}>Show if</span>
        <button
          style={{ ...S.btn(), fontSize: 10 }}
          onClick={() =>
            set({ conditions: [...conditions, { type: "has_state" } as ScriptCondition] })
          }
        >
          + Add
        </button>
      </div>
      {conditions.map((c, i) => (
        <ConditionRow
          key={i}
          condition={c}
          worldItems={worldItems}
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
        <div style={{ color: "#98a2b8", fontSize: 11, padding: "2px 0" }}>
          (no conditions — option is always shown)
        </div>
      )}

      {/* Effects (run when picked) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#8b94a8", fontSize: 11 }}>On pick</span>
        <button
          style={{ ...S.btn(), fontSize: 10 }}
          onClick={() =>
            set({ actions: [...actions, { type: "set_state" } as ScriptAction] })
          }
        >
          + Add
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
        <div style={{ color: "#98a2b8", fontSize: 11, padding: "2px 0" }}>
          (nothing happens yet — add effects that run when picked)
        </div>
      )}
    </div>
  );
}

// ── ItemsEditor (ITEMS tab) ───────────────────────────────────────────────────
// Edits the world-level item registry (WorldConfig.items). Counts live at
// gameplay-state key `inv.<id>`; the registry is identity only (label/icon/
// description/stackSize), so deleting an item never touches player state.

function ItemsEditor({
  items,
  onChange,
}: {
  items: ItemDef[];
  onChange: (items: ItemDef[]) => void;
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "6px 10px",
          flexShrink: 0,
        }}
      >
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
  onReplace,
  onRemove,
}: {
  item: ItemDef;
  onReplace: (next: ItemDef) => void;
  onRemove: () => void;
}) {
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
          <img src={item.icon} alt="" style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 3, flexShrink: 0 }} />
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
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        <input
          style={{ ...S.field, flex: 1 }}
          placeholder="Icon URL (optional)"
          value={item.icon ?? ""}
          onChange={(e) => set("icon", e.target.value || undefined)}
        />
        <input
          type="number"
          min={1}
          style={{ ...S.field, flex: "0 0 72px" }}
          placeholder="max ∞"
          title="stack size (max count; blank = unlimited)"
          value={item.stackSize ?? ""}
          onChange={(e) => set("stackSize", parseInt(e.target.value, 10) || undefined)}
        />
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
        <span style={{ color: "#6a7488", fontSize: 10 }}>on New Game</span>
      </label>
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
