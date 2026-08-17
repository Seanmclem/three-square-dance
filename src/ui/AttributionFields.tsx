import { useMemo } from "react";
import type { Attribution, LicenseId } from "@/types";

export const LICENSES: LicenseId[] = ["CC0", "CC BY", "CC BY-SA", "CC BY-ND", "CC BY-NC", "CC BY-NC-SA", "Other"];

const INPUT: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 4, color: "#c0c0c0", fontFamily: "monospace", fontSize: 11,
  padding: "5px 8px", outline: "none",
};
const LABEL: React.CSSProperties = { color: "#8b94a8", fontSize: 9, letterSpacing: 1, marginBottom: 3 };

/** Controlled attribution form (author / patreon / source / license). Reused by both
 *  import modals and the edit dialog. `disabled` greys all inputs (used by bulk "apply" toggles). */
export function AttributionFields({ value, onChange, disabledKeys, autofillFrom }: {
  value:    Attribution;
  onChange: (a: Attribution) => void;
  disabledKeys?: Partial<Record<keyof Attribution, boolean>>;  // when a field's "apply to all" is off (bulk)
  autofillFrom?: Attribution[];  // existing library attributions — offers a fill-from-existing picker
}) {
  // Distinct packs (full attribution) and authors (author-level fields only —
  // pack name/URL stay blank so a new pack from a known author is one pick + two fields).
  const presets = useMemo(() => {
    const packs   = new Map<string, Attribution>();
    const authors = new Map<string, Attribution>();
    for (const a of autofillFrom ?? []) {
      if (a.sourceName && !packs.has(a.sourceName)) packs.set(a.sourceName, { ...a });
      if (a.author && !authors.has(a.author)) {
        authors.set(a.author, {
          author: a.author,
          ...(a.patreonUrl   ? { patreonUrl:   a.patreonUrl   } : {}),
          ...(a.license      ? { license:      a.license      } : {}),
          ...(a.licenseOther ? { licenseOther: a.licenseOther } : {}),
        });
      }
    }
    return { packs: [...packs.values()], authors: [...authors.values()] };
  }, [autofillFrom]);
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
      {(presets.packs.length > 0 || presets.authors.length > 0) && (
        <div>
          <div style={LABEL}>AUTOFILL FROM LIBRARY</div>
          <select
            style={{ ...INPUT, cursor: "pointer" }}
            value=""
            onChange={e => {
              const v = e.currentTarget.value;
              if (!v) return;
              const preset = v.startsWith("p")
                ? presets.packs[Number(v.slice(1))]
                : presets.authors[Number(v.slice(1))];
              if (preset) onChange({ ...value, ...preset });
            }}
          >
            <option value="">Pick an existing pack / author…</option>
            {presets.packs.length > 0 && (
              <optgroup label="Packs">
                {presets.packs.map((p, i) => (
                  <option key={`p${i}`} value={`p${i}`}>
                    {p.sourceName}{p.author ? ` — ${p.author}` : ""}
                  </option>
                ))}
              </optgroup>
            )}
            {presets.authors.length > 0 && (
              <optgroup label="Authors">
                {presets.authors.map((a, i) => <option key={`a${i}`} value={`a${i}`}>{a.author}</option>)}
              </optgroup>
            )}
          </select>
        </div>
      )}
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
