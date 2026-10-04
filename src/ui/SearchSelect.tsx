import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface SearchOption {
  value: string;
  label: string;
  group?: string;   // a heading over consecutive options with the same group
  hint?: string;    // small text after the label (e.g. "120 clips")
}

/**
 * A searchable replacement for a long <select> (rule from the user, 2026-10-04: "all huge
 * dropdowns must be searchable"). The field shows the chosen option; focusing it opens a
 * list (grouped, with headings) and typing filters it by label, group, hint or value
 * (word by word, any order).
 * Arrow keys move, Enter picks (the highlighted option, else the first match), Escape
 * closes. The list floats above everything (a portal, fixed position) so a scrolling
 * panel can't clip it, and opens upward near the bottom of the window.
 * Pattern: ScriptPanel's TargetCombobox, made general.
 */
export function SearchSelect({ value, options, onChange, placeholder = "type to search…", ariaLabel, style, dataAttr }: {
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  style?: React.CSSProperties;
  dataAttr?: string;   // optional data-search-select value (tests, help)
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const current = options.find(o => o.value === value);
  // Every typed word must appear somewhere; "_" and "-" count as spaces, so "jog fwd" finds Jog_Fwd_Loop.
  const norm = (t: string) => t.toLowerCase().replace(/[_\-]+/g, " ");
  const words = norm(query).split(/\s+/).filter(Boolean);
  const filtered = words.length
    ? options.filter(o => { const t = norm(`${o.label} ${o.group ?? ""} ${o.hint ?? ""} ${o.value}`); return words.every(w => t.includes(w)); })
    : options;

  const place = () => {
    const r = inputRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 8, above = r.top - 8;
    const up = below < 220 && above > below;
    const maxHeight = Math.max(120, Math.min(340, up ? above : below));
    const width = Math.max(r.width, 220), left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));   // stay on screen
    setRect(up ? { left, width, bottom: window.innerHeight - r.top + 2, maxHeight }
               : { left, width, top: r.bottom + 2, maxHeight });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);
  // Close when anything around it scrolls or the window resizes (the fixed list would drift).
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!listRef.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);
  useEffect(() => { setActive(0); }, [query, open]);
  useEffect(() => {   // keep the highlighted option in view
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (v: string) => { onChange(v); setOpen(false); setQuery(""); inputRef.current?.blur(); };
  let lastGroup: string | undefined;
  return (
    <>
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        data-search-select={dataAttr}
        role="combobox"
        aria-expanded={open}
        style={{ background: "#141416", color: "#dde3f0", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, fontSize: 11, fontFamily: "monospace", padding: "3px 6px", minWidth: 0, ...style }}
        placeholder={current ? current.label : placeholder}
        value={open ? query : current ? `${current.label}${current.hint ? ` · ${current.hint}` : ""}` : ""}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onBlur={() => setOpen(false)}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={e => {
          if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
          else if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(filtered.length - 1, i + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
          else if (e.key === "Enter" && filtered.length) { e.preventDefault(); pick(filtered[Math.min(active, filtered.length - 1)]!.value); }
        }}
      />
      {open && rect && createPortal(
        <div ref={listRef} role="listbox" data-search-list={dataAttr}
          // Keep focus in the field for any mouse-down in the list (incl. its scrollbar).
          onMouseDown={e => e.preventDefault()}
          style={{
            position: "fixed", left: rect.left, width: rect.width, top: rect.top, bottom: rect.bottom, maxHeight: rect.maxHeight,
            overflowY: "auto", zIndex: 200, background: "rgba(24,26,33,0.98)", border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 5, boxShadow: "0 8px 20px rgba(0,0,0,0.55)", padding: "3px 0",
          }}>
          {filtered.length === 0 && <div style={{ padding: "6px 10px", fontSize: 11, color: "#98a2b8", fontFamily: "monospace" }}>no matches</div>}
          {filtered.map((o, i) => {
            const header = o.group !== undefined && o.group !== lastGroup ? (lastGroup = o.group) : null;
            const on = o.value === value, hi = i === active;
            return (
              <Fragment key={`${o.group ?? ""}::${o.value}`}>
                {header && <div style={{ padding: "6px 10px 2px", fontSize: 9, letterSpacing: 1, color: "#98a2b8", fontFamily: "monospace", textTransform: "uppercase" }}>{header}</div>}
                <div role="option" aria-selected={on} data-i={i} data-value={o.value}
                  onMouseDown={e => { e.preventDefault(); pick(o.value); }}
                  onMouseEnter={() => setActive(i)}
                  style={{
                    padding: "4px 10px 4px 16px", fontSize: 11, fontFamily: "monospace", cursor: "pointer", display: "flex", gap: 8,
                    color: on ? "#9dbdff" : "#dde3f0", background: hi ? "rgba(255,255,255,0.08)" : on ? "rgba(80,140,255,0.12)" : "transparent",
                  }}>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                  {o.hint && <span style={{ color: "#98a2b8", flexShrink: 0 }}>{o.hint}</span>}
                </div>
              </Fragment>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
