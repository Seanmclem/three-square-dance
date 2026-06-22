import type { Attribution, LicenseId } from "@/types";

export const LICENSES: LicenseId[] = ["CC0", "CC BY", "CC BY-SA", "CC BY-ND", "CC BY-NC", "CC BY-NC-SA", "Other"];

const INPUT: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 4, color: "#c0c0c0", fontFamily: "monospace", fontSize: 11,
  padding: "5px 8px", outline: "none",
};
const LABEL: React.CSSProperties = { color: "#646464", fontSize: 9, letterSpacing: 1, marginBottom: 3 };

/** Controlled attribution form (author / patreon / source / license). Reused by both
 *  import modals and the edit dialog. `disabled` greys all inputs (used by bulk "apply" toggles). */
export function AttributionFields({ value, onChange, disabledKeys }: {
  value:    Attribution;
  onChange: (a: Attribution) => void;
  disabledKeys?: Partial<Record<keyof Attribution, boolean>>;  // when a field's "apply to all" is off (bulk)
}) {
  const set = (patch: Partial<Attribution>) => onChange({ ...value, ...patch });
  const dis = (k: keyof Attribution) => disabledKeys?.[k] ?? false;

  const field = (key: keyof Attribution, label: string, placeholder: string) => (
    <div>
      <div style={LABEL}>{label}</div>
      <input
        style={{ ...INPUT, opacity: dis(key) ? 0.4 : 1 }}
        disabled={dis(key)}
        placeholder={placeholder}
        value={(value[key] as string) ?? ""}
        onChange={e => set({ [key]: e.target.value || undefined } as Partial<Attribution>)}
      />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {field("author", "AUTHOR", "e.g. Quaternius")}
      {field("sourceName", "SOURCE / KIT NAME", "e.g. Ultimate Nature Pack")}
      {field("sourceUrl", "SOURCE / KIT URL", "https://…")}
      {field("patreonUrl", "PATREON URL", "https://patreon.com/…")}
      <div>
        <div style={LABEL}>LICENSE</div>
        <select
          style={{ ...INPUT, opacity: dis("license") ? 0.4 : 1 }}
          disabled={dis("license")}
          value={value.license ?? ""}
          onChange={e => set({ license: (e.target.value || undefined) as LicenseId | undefined })}
        >
          <option value="">—</option>
          {LICENSES.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        {value.license === "Other" && (
          <input
            style={{ ...INPUT, marginTop: 6, opacity: dis("license") ? 0.4 : 1 }}
            disabled={dis("license")}
            placeholder="License name / URL"
            value={value.licenseOther ?? ""}
            onChange={e => set({ licenseOther: e.target.value || undefined })}
          />
        )}
      </div>
    </div>
  );
}
