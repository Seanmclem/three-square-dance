import { useState } from "react";

const INPUT: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 4, color: "#c0c0c0", fontFamily: "monospace", fontSize: 11,
  padding: "5px 8px", outline: "none",
};
const CHIP: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  background: "rgba(80,140,255,0.14)", border: "1px solid rgba(80,140,255,0.28)",
  borderRadius: 3, color: "#80aaff", fontFamily: "monospace", fontSize: 10,
  padding: "2px 4px 2px 6px", letterSpacing: 0.3,
};
const X: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  color: "#80aaff", fontSize: 11, lineHeight: 1, padding: "0 1px",
};
const SUGGESTION: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 3, color: "#98a2b8", fontFamily: "monospace", fontSize: 10,
  padding: "2px 6px", letterSpacing: 0.3, cursor: "pointer",
};

/** trim → lowercase → spaces to dashes. Keeps `CC0`/`cc 0` from fragmenting the chip strip. */
export const normalizeTag = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, "-");

/** Controlled tag chip editor. Enter or comma commits, ✕ removes, Backspace on an
 *  empty input pops the last chip. Reused by the import modal and the edit dialog.
 *  `disabled` greys it out (used by bulk "apply" toggles). */
export function TagInput({ value, onChange, suggestions = [], disabled = false, placeholder = "Add a tag…" }: {
  value:        string[];
  onChange:     (tags: string[]) => void;
  suggestions?: string[];
  disabled?:    boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const tag = normalizeTag(raw);
    setDraft("");
    if (tag && !value.includes(tag)) onChange([...value, tag]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  // In-DOM suggestion chips instead of a <datalist>: the shell's native datalist
  // popup sets the input value without an event React can hear, so clicking a
  // suggestion looked dead (user report). Our own chips commit deterministically.
  const unused = suggestions.filter(s => !value.includes(s));
  const shown  = (draft ? unused.filter(s => s.includes(normalizeTag(draft))) : unused).slice(0, 8);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, opacity: disabled ? 0.4 : 1 }}>
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {value.map(tag => (
            <span key={tag} style={CHIP}>
              {tag}
              <button
                style={X}
                disabled={disabled}
                title={`Remove ${tag}`}
                onClick={() => onChange(value.filter(t => t !== tag))}
              >✕</button>
            </span>
          ))}
        </div>
      )}
      <input
        style={INPUT}
        disabled={disabled}
        placeholder={placeholder}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => commit(draft)}
      />
      {!disabled && shown.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, cursor: "pointer" }}>
          {shown.map(s => (
            <button
              key={s}
              style={SUGGESTION}
              title={`Add ${s}`}
              // mousedown (not click): commits before the input's blur fires, so a
              // half-typed draft can't blur-commit as a second, wrong tag.
              onMouseDown={e => { e.preventDefault(); commit(s); }}
            >{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}
