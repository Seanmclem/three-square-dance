import type { AssetDef, MaterialDef } from "@/types";

/**
 * Credits modal (opened from the PropertiesPanel empty state). Content is
 * derived entirely from the imported registries: every material/asset with an
 * `attribution` is grouped by author, then by content pack (`sourceName`),
 * with per-pack item counts, license badges, and source/patreon links.
 */

interface CreditsModalProps {
  materials: MaterialDef[];
  assets:    AssetDef[];
  onClose:   () => void;
}

interface PackEntry {
  sourceName: string;          // "" = items credited to the author without a pack
  sourceUrl?: string;
  licenses:   Set<string>;
  materials:  string[];        // labels
  assets:     string[];
}

interface AuthorEntry {
  author:     string;
  patreonUrl?: string;
  packs:      Map<string, PackEntry>;
}

function groupCredits(materials: MaterialDef[], assets: AssetDef[]): AuthorEntry[] {
  const authors = new Map<string, AuthorEntry>();

  const add = (label: string, kind: "materials" | "assets", at: NonNullable<MaterialDef["attribution"]>) => {
    const authorName = at.author?.trim() || "Unknown author";
    let author = authors.get(authorName);
    if (!author) { author = { author: authorName, packs: new Map() }; authors.set(authorName, author); }
    if (at.patreonUrl && !author.patreonUrl) author.patreonUrl = at.patreonUrl;

    const packName = at.sourceName?.trim() ?? "";
    let pack = author.packs.get(packName);
    if (!pack) { pack = { sourceName: packName, licenses: new Set(), materials: [], assets: [] }; author.packs.set(packName, pack); }
    if (at.sourceUrl && !pack.sourceUrl) pack.sourceUrl = at.sourceUrl;
    if (at.license) pack.licenses.add(at.license === "Other" ? (at.licenseOther?.trim() || "Other") : at.license);
    pack[kind].push(label);
  };

  for (const m of materials) if (m.attribution && (m.attribution.author || m.attribution.sourceName)) add(m.label, "materials", m.attribution);
  for (const a of assets)    if (a.attribution && (a.attribution.author || a.attribution.sourceName)) add(a.label, "assets", a.attribution);

  return [...authors.values()].sort((x, y) => x.author.localeCompare(y.author));
}

const counts = (p: PackEntry): string =>
  [p.materials.length && `${p.materials.length} material${p.materials.length > 1 ? "s" : ""}`,
   p.assets.length    && `${p.assets.length} asset${p.assets.length > 1 ? "s" : ""}`]
    .filter(Boolean).join(" · ");

const LINK: React.CSSProperties = { color: "#80aaff", textDecoration: "none" };

export function CreditsModal({ materials, assets, onClose }: CreditsModalProps) {
  const grouped = groupCredits(materials, assets);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)",
               display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: "rgba(28,28,28,0.98)", border: "1px solid rgba(255,255,255,0.1)",
                 borderRadius: 8, width: 480, maxHeight: "85vh",
                 display: "flex", flexDirection: "column",
                 color: "#c0c0c0", fontFamily: "monospace", fontSize: 12 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ letterSpacing: 2, color: "#e0e0e0" }}>CREDITS</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 14 }}
          >✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {grouped.length === 0 && (
            <div style={{ color: "#646464", fontSize: 11 }}>
              No attributed content yet — imported materials and assets with attribution
              (author / pack) will be credited here automatically.
            </div>
          )}

          {grouped.map(author => (
            <div key={author.author} style={{ marginBottom: 16 }}>
              <div style={{ color: "#e0e0e0", fontSize: 12, marginBottom: 6 }}>
                {author.author}
                {author.patreonUrl && (
                  <>
                    {"  "}
                    <a href={author.patreonUrl} target="_blank" rel="noreferrer" style={{ ...LINK, fontSize: 10 }}>
                      patreon ↗
                    </a>
                  </>
                )}
              </div>

              {[...author.packs.values()].map(pack => (
                <div key={pack.sourceName || "__nopack__"}
                     style={{ padding: "6px 10px", marginBottom: 6,
                              background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.06)",
                              borderRadius: 6 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ color: "#c0c0c0", fontSize: 11 }}>
                      {pack.sourceUrl
                        ? <a href={pack.sourceUrl} target="_blank" rel="noreferrer" style={LINK}>{pack.sourceName || "Source"} ↗</a>
                        : (pack.sourceName || "Individual items")}
                    </span>
                    {[...pack.licenses].map(l => (
                      <span key={l} style={{ fontSize: 9, color: "#8fbc8f", border: "1px solid rgba(143,188,143,0.35)",
                                             borderRadius: 3, padding: "0 4px" }}>{l}</span>
                    ))}
                  </div>
                  <div style={{ color: "#7a7a7a", fontSize: 10, marginTop: 3 }}>
                    {counts(pack)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
