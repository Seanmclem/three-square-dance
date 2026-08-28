import { useEscapeClose } from "./useEscapeClose";
import { useEffect, useState, useRef } from "react";
import type { SoundDef, SoundCategory, SoundManifest, Attribution } from "@/types";
import { readManifest, writeManifest, writeAssetFile } from "@/assets/assetLibrary";
import { AttributionFields } from "@/ui/AttributionFields";
import { TagInput } from "@/ui/TagInput";

interface Props {
  existingTags:  string[];   // suggestions — the manifest isn't read until the import step
  existingAttributions: Attribution[];  // library attributions — autofill picker in AttributionFields
  existingCategories:   string[];       // categories already in the sound library (incl. custom ones)
  initialFiles?: File[];     // pre-supplied files (the sound recorder) — skips the pick phase
  onComplete:    (sounds: SoundDef[]) => void;
  onClose:       () => void;
}

type Phase = "pick" | "meta" | "importing" | "done";

const DEFAULT_CATEGORIES: SoundCategory[] = ["SFX", "Music", "Ambient"];
const AUDIO_EXTS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"]);

const getExt   = (n: string) => n.slice(n.lastIndexOf(".")).toLowerCase();
const slugify  = (s: string) => s.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
const autoLabel = (n: string) => n.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");

interface SoundEntry {
  id:         string;
  file:       File;
  label:      string;
  category:   string;
  showNewCat: boolean;
  loop:       boolean;
  spatial:    boolean;
}

const OVERLAY: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const MODAL: React.CSSProperties = {
  background: "rgba(28,28,28,0.98)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, width: 480, maxHeight: "85vh", display: "flex", flexDirection: "column",
  color: "#c0c0c0", fontFamily: "monospace", fontSize: 12,
};
const INPUT: React.CSSProperties = {
  background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 4, color: "#c0c0c0", fontFamily: "monospace", fontSize: 11,
  padding: "4px 7px", outline: "none", boxSizing: "border-box",
};
const BTN = (active = true): React.CSSProperties => ({
  padding: "7px 14px", borderRadius: 4, cursor: active ? "pointer" : "default",
  fontFamily: "monospace", fontSize: 11, border: "none",
  background: active ? "rgba(80,140,255,0.2)" : "rgba(55,55,55,0.7)",
  color: active ? "#80aaff" : "#646464",
});
const STEP_LABEL: React.CSSProperties = {
  color: "#8b94a8", fontSize: 10, letterSpacing: 1,
};

export function AudioImporterModal({ existingTags, existingAttributions, existingCategories, initialFiles, onComplete, onClose }: Props) {
  useEscapeClose(onClose);
  const [phase,    setPhase]    = useState<Phase>("pick");
  const [entries,  setEntries]  = useState<SoundEntry[]>([]);
  const [bulkNewCat,  setBulkNewCat]  = useState<string | null>(null);
  const [attribution, setAttribution] = useState<Attribution>({});
  const [tags,     setTags]     = useState<string[]>([]);
  const [progress, setProgress] = useState("");
  const [skipped,  setSkipped]  = useState<string[]>([]);   // picked files that aren't a supported format
  const [results,  setResults]  = useState<SoundDef[]>([]);
  const [error,    setError]    = useState<string | null>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);

  // Default categories first, then any custom ones already in the library.
  const categories = [
    ...DEFAULT_CATEGORIES,
    ...[...new Set(existingCategories)].filter(c => !DEFAULT_CATEGORIES.includes(c as SoundCategory)).sort(),
  ];

  const update = (id: string, patch: Partial<SoundEntry>) =>
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));

  // Recorder handoff: land straight in the metadata phase with the given file(s).
  useEffect(() => {
    if (initialFiles?.length) onFilesChosen(initialFiles);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  function onFilesChosen(list: FileList | File[] | null): void {
    const all   = [...(list ?? [])];
    const audio = all.filter(f => AUDIO_EXTS.has(getExt(f.name)));
    // The dialog is deliberately wide open (audio/*) — the format check happens
    // HERE, and skips must be visible: a silent drop reads as a broken button.
    setSkipped(all.filter(f => !AUDIO_EXTS.has(getExt(f.name))).map(f => f.name));
    if (!audio.length) return;
    setEntries(audio.map(f => ({
      id: crypto.randomUUID(), file: f, label: autoLabel(f.name),
      category: "SFX", showNewCat: false, loop: false, spatial: false,
    })));
    setPhase("meta");
  }

  async function doImport(): Promise<void> {
    if (!entries.length) return;
    setPhase("importing");
    setError(null);

    const manifest = await readManifest<SoundManifest>("audio", { version: "1.0", sounds: [] });

    const imported: SoundDef[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      setProgress(`Importing ${i + 1} of ${entries.length}: ${e.file.name}`);
      try {
        const ext  = getExt(e.file.name);
        const base = slugify(e.label) || slugify(autoLabel(e.file.name));
        const dest = `${base}${ext}`;
        await writeAssetFile("audio", dest, await e.file.arrayBuffer());
        const resolvedCat = (e.category === "__new__" ? "SFX" : e.category) as SoundCategory;
        const sound: SoundDef = {
          id: base, label: e.label.trim() || base, category: resolvedCat,
          path: `/assets/audio/${dest}`, loop: e.loop, spatial: e.spatial,
          tags: [...tags], dateAdded: new Date().toISOString().slice(0, 10),
          ...(Object.keys(attribution).length ? { attribution } : {}),
        };
        manifest.sounds = manifest.sounds.filter(s => s.id !== sound.id);
        manifest.sounds.push(sound);
        imported.push(sound);
      } catch (err) {
        console.warn(`Import failed for ${e.file.name}:`, err);
      }
    }

    try {
      await writeManifest("audio", manifest);
    } catch (err) {
      setError(`Manifest write failed: ${String(err)}`);
    }

    setResults(imported);
    setPhase("done");
    onComplete(imported);
  }

  const skippedNote = skipped.length > 0 && (
    <div style={{ fontSize: 10, color: "#e8c14b", lineHeight: 1.6 }}>
      Skipped {skipped.length} file{skipped.length !== 1 ? "s" : ""} — not a supported
      audio format: {skipped.slice(0, 4).join(", ")}{skipped.length > 4 ? ", …" : ""}
    </div>
  );

  return (
    <div style={OVERLAY}>
      <div style={MODAL}>

        <input
          ref={filesInputRef} type="file" multiple style={{ display: "none" }}
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac"
          onChange={e => { onFilesChosen(e.currentTarget.files); e.currentTarget.value = ""; }}
        />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: "#d8d8d8", letterSpacing: 1 }}>IMPORT SOUNDS</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#585870", fontSize: 16 }}>✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Step 1 — Pick */}
          {phase === "pick" && (
            <>
              <p style={STEP_LABEL}>SELECT FILES</p>
              <div style={{ fontSize: 10, color: "#98a2b8", lineHeight: 1.7 }}>
                Supported: <span style={{ color: "#80aaff" }}>.mp3 .wav .ogg .m4a .flac .aac</span>
                — select multiple files at once. They'll be copied into your project's{" "}
                <code>assets/audio</code> folder and added to the sound manifest.
              </div>
              <button style={BTN()} onClick={() => filesInputRef.current?.click()}>Browse files…</button>
              {skippedNote}
            </>
          )}

          {/* Step 2 — Metadata list */}
          {(phase === "meta" || phase === "importing") && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={STEP_LABEL}>{entries.length} SOUND{entries.length !== 1 ? "S" : ""}</p>
                <button style={{ ...BTN(), padding: "3px 8px", fontSize: 10 }} onClick={() => setPhase("pick")}>← Change files</button>
              </div>
              {skippedNote}

              {/* Set all categories */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, color: "#98a2b8", whiteSpace: "nowrap" }}>Set all to</span>
                  <select
                    style={{ ...INPUT, flex: 1, cursor: "pointer" }}
                    defaultValue=""
                    onChange={e => {
                      const val = e.currentTarget.value;
                      if (!val) return;
                      if (val === "__new__") {
                        setBulkNewCat("");
                        setEntries(prev => prev.map(en => ({ ...en, category: "__new__", showNewCat: false })));
                      } else {
                        setBulkNewCat(null);
                        setEntries(prev => prev.map(en => ({ ...en, category: val, showNewCat: false })));
                      }
                      e.currentTarget.value = "";
                    }}
                  >
                    <option value="" disabled>Category…</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="__new__">New category…</option>
                  </select>
                </div>
                {bulkNewCat !== null && (
                  <input
                    style={{ ...INPUT, width: "100%", boxSizing: "border-box" }}
                    placeholder="New category name (applies to all)"
                    autoFocus
                    value={bulkNewCat}
                    onChange={e => {
                      const val = e.currentTarget.value;
                      setBulkNewCat(val);
                      setEntries(prev => prev.map(en => ({ ...en, category: val || "__new__" })));
                    }}
                  />
                )}
              </div>

              {/* Tags (optional) — applies to all imported sounds */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 10, color: "#98a2b8" }}>Tags (optional — applies to all)</span>
                <TagInput value={tags} onChange={setTags} suggestions={existingTags} />
              </div>

              {/* Attribution (optional) — applies to all imported sounds */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 10, color: "#98a2b8" }}>Attribution (optional — applies to all, shown in Credits)</span>
                <AttributionFields value={attribution} onChange={setAttribution} autofillFrom={existingAttributions} />
              </div>

              {/* Entry list */}
              {entries.map(entry => (
                <div key={entry.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 5, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
                  <div style={{ fontSize: 10, color: "#80aaff" }}>🔊 {entry.file.name}</div>

                  {/* Label + Category row */}
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      style={{ ...INPUT, flex: 1 }}
                      value={entry.label}
                      onChange={e => update(entry.id, { label: e.currentTarget.value })}
                      placeholder="Label"
                    />
                    <select
                      style={{ ...INPUT, width: 110, cursor: "pointer" }}
                      value={categories.includes(entry.category) ? entry.category : "__new__"}
                      onChange={e => {
                        setBulkNewCat(null);
                        update(entry.id, { category: e.currentTarget.value, showNewCat: e.currentTarget.value === "__new__" });
                      }}
                    >
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="__new__">
                        {!categories.includes(entry.category) && entry.category && entry.category !== "__new__"
                          ? entry.category
                          : "New…"}
                      </option>
                    </select>
                  </div>

                  {entry.showNewCat && bulkNewCat === null && (
                    <input
                      style={INPUT}
                      placeholder="Category name"
                      autoFocus
                      onChange={e => update(entry.id, { category: e.currentTarget.value || "__new__" })}
                    />
                  )}

                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#909090", cursor: "pointer" }}>
                      <input type="checkbox" checked={entry.loop} onChange={e => update(entry.id, { loop: e.currentTarget.checked })} /> loop
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#909090", cursor: "pointer" }}>
                      <input type="checkbox" checked={entry.spatial} onChange={e => update(entry.id, { spatial: e.currentTarget.checked })} /> spatial
                    </label>
                  </div>
                </div>
              ))}

              {error && <div style={{ color: "#c06060", fontSize: 10 }}>{error}</div>}
              {phase === "importing" && <div style={{ color: "#98a2b8", fontSize: 10 }}>{progress || "Importing…"}</div>}
            </>
          )}

          {/* Done */}
          {phase === "done" && (
            <>
              <p style={STEP_LABEL}>DONE</p>
              <div style={{ color: "#80cc90", fontSize: 11 }}>✓ &nbsp;{results.length} sound{results.length !== 1 ? "s" : ""} imported.</div>
              {results.map(s => (
                <div key={s.id} style={{ fontSize: 10, color: "#98a2b8" }}>
                  {s.label} — <span style={{ color: "#98a2b8" }}>{s.category}</span>
                </div>
              ))}
              {error && <div style={{ color: "#c06060", fontSize: 10 }}>{error}</div>}
            </>
          )}
        </div>

        {/* Footer */}
        {(phase === "meta" || phase === "done") && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {phase === "meta" && (
              <button
                style={BTN()}
                onClick={() => void doImport()}
              >
                Import {entries.length > 1 ? `all ${entries.length}` : ""}
              </button>
            )}
            {phase === "done" && <button style={BTN()} onClick={onClose}>Close</button>}
          </div>
        )}
      </div>
    </div>
  );
}
