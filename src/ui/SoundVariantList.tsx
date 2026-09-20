import { SoundPicker } from "@/ui/SoundPicker";

/**
 * Extra sounds for a "one of these, at random" slot (Phase 73 footstep variation).
 * Sits under the slot's main SoundPicker: the main sound plus these form the pool,
 * and each play picks one — equal chance, never the same twice in a row. Used by
 * the character Sounds page (PlayerSettings.footstepVariants) and the set_footstep
 * script action (ScriptAction.soundVariants), so the two can't drift.
 */
export function SoundVariantList({ values, onChange, previewVolume, max = 3, disabled }: {
  values: string[] | undefined;
  /** `undefined` when the list becomes empty, so the field leaves the saved data. */
  onChange: (next: string[] | undefined) => void;
  previewVolume?: number;
  max?: number;
  /** No main sound picked yet — variations of nothing make no sense. */
  disabled?: boolean;
}) {
  const list = values ?? [];
  const commit = (next: string[]) => onChange(next.length ? next : undefined);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
      {list.map((id, i) => (
        <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ color: "#c2cadb", fontSize: 10, width: 12, textAlign: "right" }}>{i + 2}</span>
          <SoundPicker value={id || undefined} previewVolume={previewVolume} style={{ flex: 1, minWidth: 0 }}
            onChange={next => commit(list.map((v, j) => (j === i ? next : v)))} />
          <button title="Remove this variation" onClick={() => commit(list.filter((_, j) => j !== i))}
            style={{ background: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4,
                     color: "#dde3f0", cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "4px 6px" }}>✕</button>
        </div>
      ))}
      {list.length < max && (
        <button disabled={disabled} onClick={() => commit([...list, ""])}
          title={disabled ? "Pick the main sound first" : "Add another sound — each step plays one at random, never the same twice in a row"}
          style={{ alignSelf: "flex-start", background: "rgba(77,140,255,0.12)", border: "1px solid rgba(77,140,255,0.35)",
                   borderRadius: 4, color: "#dde3f0", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1,
                   fontSize: 10, padding: "4px 8px" }}>
          + Add variation
        </button>
      )}
    </div>
  );
}
