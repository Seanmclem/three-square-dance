import { useState } from "react";
import type { Attribution } from "@/types";
import { AttributionFields } from "@/ui/AttributionFields";

export interface EditPatch {
  label?:       string;
  category?:    string;
  attribution?: Partial<Attribution>;
}

interface EditMetadataDialogProps {
  items:           { id: string; label: string }[];
  noun:            "model" | "material";
  categoryOptions: string[];
  initial:         { label: string; category: string; attribution: Attribution };
  needsFolderGrant: boolean;
  folderHint:      string;
  onCancel:        () => void;
  onSave:          (patch: EditPatch) => void;
}

const S = {
  overlay: { position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" } as React.CSSProperties,
  card: { background: "rgba(28,28,28,0.99)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "20px 24px", width: 360, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column", gap: 14 } as React.CSSProperties,
  title: { color: "#c0c0c0", fontSize: 13, fontFamily: "monospace", letterSpacing: 1 } as React.CSSProperties,
  label: { color: "#646464", fontSize: 9, letterSpacing: 1, marginBottom: 3 } as React.CSSProperties,
  input: { width: "100%", boxSizing: "border-box", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 4, color: "#c0c0c0", fontFamily: "monospace", fontSize: 11, padding: "5px 8px", outline: "none" } as React.CSSProperties,
  apply: { display: "flex", alignItems: "center", gap: 6, color: "#7a7a7a", fontSize: 9, cursor: "pointer", userSelect: "none" } as React.CSSProperties,
  hint: { color: "#6a7a90", fontSize: 10, fontFamily: "monospace", lineHeight: 1.4 } as React.CSSProperties,
  row: { display: "flex", gap: 8, justifyContent: "flex-end" } as React.CSSProperties,
  btn: (v: "ghost" | "primary"): React.CSSProperties => ({ padding: "6px 14px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 11, background: v === "primary" ? "rgba(80,140,255,0.2)" : "transparent", border: v === "primary" ? "1px solid rgba(80,140,255,0.4)" : "1px solid rgba(255,255,255,0.1)", color: v === "primary" ? "#80aaff" : "#606070" }),
};

const NEW = "__new__";

export function EditMetadataDialog({ items, noun, categoryOptions, initial, needsFolderGrant, folderHint, onCancel, onSave }: EditMetadataDialogProps) {
  const bulk = items.length > 1;

  const [label,    setLabel]    = useState(initial.label);
  const [knownCat] = useState(categoryOptions.includes(initial.category) || initial.category === "");
  const [catSel,   setCatSel]   = useState(knownCat ? initial.category : NEW);
  const [catNew,   setCatNew]   = useState(knownCat ? "" : initial.category);
  const [attr,     setAttr]     = useState<Attribution>(initial.attribution);

  // Bulk "apply to all" toggles
  const [applyCategory, setApplyCategory] = useState(false);
  const [applyAttr, setApplyAttr] = useState<Record<string, boolean>>({});
  const toggleAttr = (k: string) => setApplyAttr(p => ({ ...p, [k]: !p[k] }));

  const category = catSel === NEW ? catNew.trim() : catSel;

  const ApplyBox = ({ on, set, children }: { on: boolean; set: () => void; children: React.ReactNode }) => (
    <label style={S.apply}>
      <input type="checkbox" checked={on} onChange={set} /> {children}
    </label>
  );

  const handleSave = () => {
    if (!bulk) {
      onSave({ label: label.trim() || initial.label, category, attribution: attr });
      return;
    }
    const patch: EditPatch = {};
    if (applyCategory) patch.category = category;
    const a: Partial<Attribution> = {};
    if (applyAttr.author)     a.author     = attr.author;
    if (applyAttr.sourceName) a.sourceName = attr.sourceName;
    if (applyAttr.sourceUrl)  a.sourceUrl  = attr.sourceUrl;
    if (applyAttr.patreonUrl) a.patreonUrl = attr.patreonUrl;
    if (applyAttr.license)  { a.license = attr.license; a.licenseOther = attr.licenseOther; }
    if (Object.keys(a).length) patch.attribution = a;
    onSave(patch);
  };

  const disabledKeys = bulk ? {
    author: !applyAttr.author, sourceName: !applyAttr.sourceName, sourceUrl: !applyAttr.sourceUrl,
    patreonUrl: !applyAttr.patreonUrl, license: !applyAttr.license, licenseOther: !applyAttr.license,
  } : undefined;

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={S.card}>
        <div style={S.title}>EDIT {bulk ? `${items.length} ${noun.toUpperCase()}S` : noun.toUpperCase()}</div>
        {bulk && <div style={{ color: "#909090", fontSize: 11, fontFamily: "monospace" }}>
          Tick "apply" on the fields you want written to all {items.length} selected; the rest stay as-is.
        </div>}

        {!bulk && (
          <div>
            <div style={S.label}>LABEL</div>
            <input style={S.input} value={label} onChange={e => setLabel(e.target.value)} />
          </div>
        )}

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={S.label}>CATEGORY</div>
            {bulk && <ApplyBox on={applyCategory} set={() => setApplyCategory(v => !v)}>apply</ApplyBox>}
          </div>
          <select
            style={{ ...S.input, opacity: bulk && !applyCategory ? 0.4 : 1 }}
            disabled={bulk && !applyCategory}
            value={catSel}
            onChange={e => setCatSel(e.target.value)}
          >
            {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            <option value={NEW}>New…</option>
          </select>
          {catSel === NEW && (
            <input
              style={{ ...S.input, marginTop: 6, opacity: bulk && !applyCategory ? 0.4 : 1 }}
              disabled={bulk && !applyCategory}
              placeholder="New category name"
              value={catNew}
              onChange={e => setCatNew(e.target.value)}
            />
          )}
        </div>

        <div>
          <div style={S.label}>ATTRIBUTION</div>
          {bulk && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
              <ApplyBox on={!!applyAttr.author}     set={() => toggleAttr("author")}>author</ApplyBox>
              <ApplyBox on={!!applyAttr.sourceName} set={() => toggleAttr("sourceName")}>source name</ApplyBox>
              <ApplyBox on={!!applyAttr.sourceUrl}  set={() => toggleAttr("sourceUrl")}>source url</ApplyBox>
              <ApplyBox on={!!applyAttr.patreonUrl} set={() => toggleAttr("patreonUrl")}>patreon</ApplyBox>
              <ApplyBox on={!!applyAttr.license}    set={() => toggleAttr("license")}>license</ApplyBox>
            </div>
          )}
          <AttributionFields value={attr} onChange={setAttr} disabledKeys={disabledKeys} />
        </div>

        {needsFolderGrant && (
          <div style={S.hint}>
            Saving needs file access — the browser will ask for a folder; select{" "}
            <strong style={{ color: "#90a4c0" }}>{folderHint}</strong> and allow editing.
          </div>
        )}

        <div style={S.row}>
          <button style={S.btn("ghost")}   onClick={onCancel}>Cancel</button>
          <button style={S.btn("primary")} onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
