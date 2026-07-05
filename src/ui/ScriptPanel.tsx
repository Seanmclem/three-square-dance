import { useState, useEffect } from "react";
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
  StairDef,
  WallDef,
  FloorDef,
  CheckpointDef,
  GroupDef,
  AssetDef,
} from "@/types";

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
  sub: { color: "#606070", fontSize: 10, marginTop: 2 } as const,
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
    color: "#606070",
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
];

const CONDITION_TYPES: ConditionType[] = [
  "has_state",
  "compare_number",
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
  "move_object",
  "open_door",
  "play_animation",
  "play_sound",
  "run_script",
  "set_state",
  "show_dialogue",
  "show_ui",
  "spawn_npc",
  "store_position",
  "teleport_player",
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

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ScriptPanelProps {
  zoneScripts: ScriptDef[];
  objectScripts: ScriptDef[] | null;
  selectedObjectId: string | null;
  activeZoneId: string | null;
  triggerVolumes: TriggerVolume[];
  zoneObjects: WorldObject[];
  zonePlatforms: PlatformDef[];
  zoneStairs: StairDef[];
  zoneWalls: WallDef[];
  zoneFloors: FloorDef[];
  zoneCheckpoints: CheckpointDef[];
  groups: GroupDef[];
  assets: AssetDef[];
  onZoneScriptsChange: (scripts: ScriptDef[]) => void;
  onObjectScriptsChange: (objectId: string, scripts: ScriptDef[]) => void;
  stateSchema: Record<string, StateSchema>;
  onStateSchemaChange: (schema: Record<string, StateSchema>) => void;
}

type TabId = "level" | "object" | "state";

// ── ScriptPanel ───────────────────────────────────────────────────────────────

export function ScriptPanel({
  zoneScripts,
  objectScripts,
  selectedObjectId,
  activeZoneId,
  triggerVolumes,
  zoneObjects,
  zonePlatforms,
  zoneStairs,
  zoneWalls,
  zoneFloors,
  zoneCheckpoints,
  groups,
  assets,
  onZoneScriptsChange,
  onObjectScriptsChange,
  stateSchema,
  onStateSchemaChange,
}: ScriptPanelProps) {
  const [tab, setTab] = useState<TabId>("level");
  const [editingId, setEditingId] = useState<string | null>(null);

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

  return (
    <div style={S.root}>
      {/* Tabs */}
      <div style={S.tabs}>
        {(["level", "object", "state"] as TabId[]).map((t) => (
          <button
            key={t}
            style={S.tab(tab === t)}
            onClick={() => {
              setTab(t);
              setEditingId(null);
            }}
          >
            {t === "level" ? "LEVEL" : t === "object" ? "SELECTED" : "STATE"}
          </button>
        ))}
      </div>

      {/* Per-tab description */}
      <div
        style={{
          color: "#555",
          fontSize: 10,
          fontStyle: "italic",
          padding: "5px 10px 0",
          lineHeight: 1.4,
        }}
      >
        {tab === "level" &&
          "Level-wide scripts. Use on_game_start for one-time setup (spawn NPCs, set flags, play ambient audio). Use on_zone_enter for effects that replay each time the player loads in."}
        {tab === "object" &&
          "Scripts on the selected trigger volume or object. on_player_enter / on_player_exit fire when the player crosses the volume boundary."}
        {tab === "state" &&
          "Gameplay-state keys for this level. A registered key seeds its default on New Game and (numbers) clamps to min/max. Unregistered keys still work in scripts — registering just adds a default + clamp."}
      </div>

      {tab === "state" ? (
        <SchemaEditor schema={stateSchema} onChange={onStateSchemaChange} />
      ) : editing ? (
        <ScriptEditor
          script={editing}
          triggerVolumes={triggerVolumes}
          zoneObjects={zoneObjects}
          zonePlatforms={zonePlatforms}
          zoneStairs={zoneStairs}
          zoneWalls={zoneWalls}
          zoneFloors={zoneFloors}
          zoneCheckpoints={zoneCheckpoints}
          groups={groups}
          assets={assets}
          ownerIsEntity={tab === "object"}
          selectedObjectId={selectedObjectId}
          onBack={() => setEditingId(null)}
          onChange={updateScript}
          onDelete={() => deleteScript(editing.id)}
        />
      ) : tab === "object" && !selectedObjectId ? (
        <div
          style={{
            color: "#555",
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
              color: "#555",
              fontSize: 11,
              padding: "16px 12px",
              textAlign: "center",
            }}
          >
            No state keys yet
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
              color: "#555",
              fontSize: 11,
              padding: "16px 12px",
              textAlign: "center",
            }}
          >
            No scripts yet
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
  zoneStairs,
  zoneWalls,
  zoneFloors,
  zoneCheckpoints,
  groups,
  assets,
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
  zoneStairs: StairDef[];
  zoneWalls: WallDef[];
  zoneFloors: FloorDef[];
  zoneCheckpoints: CheckpointDef[];
  groups: GroupDef[];
  assets: AssetDef[];
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
    script.trigger.type === "on_state_changed";

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

          {needsTarget && !ownerIsEntity && (
            <TargetPicker
              triggerType={script.trigger.type}
              targetId={script.trigger.targetId ?? ""}
              triggerVolumes={triggerVolumes}
              zoneObjects={zoneObjects}
              onChange={(id) => setTrigger({ targetId: id })}
            />
          )}
          {needsTarget && ownerIsEntity && (
            <div
              style={{
                color: "#555",
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
            <div style={{ color: "#555", fontSize: 10, padding: "4px 0" }}>
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
              zoneStairs={zoneStairs}
              zoneWalls={zoneWalls}
              zoneFloors={zoneFloors}
              zoneCheckpoints={zoneCheckpoints}
              triggerVolumes={triggerVolumes}
              groups={groups}
              assets={assets}
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
            <div style={{ color: "#555", fontSize: 10, padding: "4px 0" }}>
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
  onChange,
}: {
  triggerType: TriggerType;
  targetId: string;
  triggerVolumes: TriggerVolume[];
  zoneObjects: WorldObject[];
  onChange: (id: string) => void;
}) {
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
  zoneStairs = [],
  zoneWalls = [],
  zoneFloors = [],
  triggerVolumes = [],
  onChange,
}: {
  targetId: string;
  zoneObjects: WorldObject[];
  groups: GroupDef[];
  zonePlatforms?: PlatformDef[];
  zoneStairs?: StairDef[];
  zoneWalls?: WallDef[];
  zoneFloors?: FloorDef[];
  triggerVolumes?: TriggerVolume[];
  onChange: (id: string) => void;
}) {
  const known =
    groups.some((g) => g.id === targetId) ||
    zoneObjects.some((o) => o.id === targetId) ||
    zonePlatforms.some((p) => p.id === targetId) ||
    zoneStairs.some((s) => s.id === targetId) ||
    zoneWalls.some((w) => w.id === targetId) ||
    zoneFloors.some((f) => f.id === targetId) ||
    triggerVolumes.some((v) => v.id === targetId);
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
  onChange,
  onRemove,
}: {
  condition: ScriptCondition;
  onChange: (c: ScriptCondition) => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{ display: "flex", gap: 4, marginBottom: 4, alignItems: "center" }}
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
          placeholder="state key"
          value={condition.stateKey ?? ""}
          onChange={(e) => onChange({ ...condition, stateKey: e.target.value })}
        />
      )}
      {condition.type === "compare_number" && (
        <>
          <input
            style={{ ...S.field, flex: 1 }}
            placeholder="state key"
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
      <button
        style={{ ...S.btn(), padding: "3px 6px", color: "#cc6666" }}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}

// ── ActionRow ─────────────────────────────────────────────────────────────────

function ActionRow({
  action,
  zoneObjects,
  zonePlatforms,
  zoneStairs,
  zoneWalls,
  zoneFloors,
  zoneCheckpoints,
  triggerVolumes,
  groups,
  assets,
  onChange,
  onRemove,
}: {
  action: ScriptAction;
  zoneObjects: WorldObject[];
  zonePlatforms: PlatformDef[];
  zoneStairs: StairDef[];
  zoneWalls: WallDef[];
  zoneFloors: FloorDef[];
  zoneCheckpoints: CheckpointDef[];
  triggerVolumes: TriggerVolume[];
  groups: GroupDef[];
  assets: AssetDef[];
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
        zoneStairs={zoneStairs}
        zoneWalls={zoneWalls}
        zoneFloors={zoneFloors}
        zoneCheckpoints={zoneCheckpoints}
        triggerVolumes={triggerVolumes}
        groups={groups}
        assets={assets}
        onChange={onChange}
      />
    </div>
  );
}

function ActionFields({
  action,
  zoneObjects,
  zonePlatforms,
  zoneStairs,
  zoneWalls,
  zoneFloors,
  zoneCheckpoints,
  triggerVolumes,
  groups,
  assets,
  onChange,
}: {
  action: ScriptAction;
  zoneObjects: WorldObject[];
  zonePlatforms: PlatformDef[];
  zoneStairs: StairDef[];
  zoneWalls: WallDef[];
  zoneFloors: FloorDef[];
  zoneCheckpoints: CheckpointDef[];
  triggerVolumes: TriggerVolume[];
  groups: GroupDef[];
  assets: AssetDef[];
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
      zoneStairs={zoneStairs}
      zoneWalls={zoneWalls}
      zoneFloors={zoneFloors}
      triggerVolumes={triggerVolumes}
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
          <input
            style={{ ...S.field, marginBottom: 4 }}
            placeholder="Speaker name"
            value={action.dialogue?.speaker ?? ""}
            onChange={(e) =>
              set({
                dialogue: {
                  ...action.dialogue,
                  speaker: e.target.value,
                  lines: action.dialogue?.lines ?? [],
                },
              })
            }
          />
          <textarea
            style={{ ...S.field, height: 60, resize: "vertical" }}
            placeholder="Lines (one per line)"
            value={action.dialogue?.lines.join("\n") ?? ""}
            onChange={(e) =>
              set({
                dialogue: {
                  ...action.dialogue,
                  speaker: action.dialogue?.speaker ?? "",
                  lines: e.target.value.split("\n"),
                },
              })
            }
          />
        </>
      );

    case "play_sound":
      return (
        <input
          style={S.field}
          placeholder="Sound asset ID"
          value={action.sound ?? ""}
          onChange={(e) => set({ sound: e.target.value })}
        />
      );

    case "set_state":
      return (
        <div style={{ display: "flex", gap: 4 }}>
          <input
            style={{ ...S.field, flex: 1 }}
            placeholder="State key"
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
            placeholder="State key (e.g. health)"
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
          placeholder="State key"
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
            placeholder="State key (e.g. checkpoint)"
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

    case "despawn_object":
      return despawnTargetPicker;

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
              placeholder="State key (e.g. checkpoint)"
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
