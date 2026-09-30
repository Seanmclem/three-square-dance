import { createPortal } from "react-dom";
import { useEscapeClose } from "./useEscapeClose";
import { desktop } from "@/shared/desktopApi";

/** An in-app HTML guide from public/docs/ (see public/docs/README.md). */
export interface DocGuide {
  title:        string;
  src:          string;   // served path, e.g. "/docs/brush-editing.html"
  externalUrl?: string;   // the editable claude.ai copy (https)
}

/**
 * Shows a public/docs guide in a frame over the editor. A frame, not a new window:
 * window.open is a no-op in the desktop webview, and openExternal only takes https.
 * Portaled to <body> so the top bar's stacking context can't sit on top of it.
 */
export function DocViewerModal({ guide, onClose }: { guide: DocGuide; onClose: () => void }) {
  useEscapeClose(onClose);
  const openExternal = () => {
    if (!guide.externalUrl) return;
    const d = desktop();
    if (d) void d.openExternal(guide.externalUrl);
    else window.open(guide.externalUrl, "_blank", "noreferrer");
  };
  const btn: React.CSSProperties = {
    padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 11,
    border: "1px solid rgba(255,255,255,0.12)", background: "rgba(46,46,46,0.9)", color: "#dde3f0",
  };
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        width: "min(960px, 92vw)", height: "90vh", display: "flex", flexDirection: "column",
        background: "#1c1c1e", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, overflow: "hidden",
        boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ color: "#80aaff", fontFamily: "monospace", fontSize: 12, letterSpacing: 1, flex: 1 }}>{guide.title.toUpperCase()}</span>
          {guide.externalUrl && <button style={btn} onClick={openExternal} title="The editable copy, with comments">Open on claude.ai ↗</button>}
          <button style={{ ...btn, padding: "2px 8px", fontSize: 14 }} onClick={onClose}>✕</button>
        </div>
        <iframe src={guide.src} title={guide.title} style={{ flex: 1, border: "none", background: "#1c1c1e" }} />
      </div>
    </div>,
    document.body,
  );
}
