import { useState } from "react";
import type { RuntimeManifest } from "../manifest";

interface Props {
  /** null when no ?manifest= param was given — show the URL input instead. */
  manifest:  RuntimeManifest | null;
  hasSave:   boolean;
  onStart:   () => void;
  onContinue: () => void;
}

const btnStyle: React.CSSProperties = {
  display: "block", width: 220, margin: "10px auto 0", padding: "10px 0",
  background: "rgba(60,110,200,0.25)", border: "1px solid rgba(100,160,255,0.5)",
  borderRadius: 6, color: "#dce8ff", fontSize: 15, cursor: "pointer",
  fontFamily: "inherit", letterSpacing: 1,
};

/**
 * The runtime's DOM main menu, built from manifest metadata. When the shell
 * was opened without a ?manifest= URL param, it renders a URL input instead —
 * v1's stand-in for the future launcher/library.
 */
export function MainMenu({ manifest, hasSave, onStart, onContinue }: Props) {
  const [url, setUrl] = useState("");

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "rgba(8,12,20,0.82)", border: "1px solid rgba(100,160,255,0.25)",
        borderRadius: 10, padding: "36px 48px", minWidth: 360, maxWidth: 460,
        textAlign: "center", color: "#dde6f5", boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
      }}>
        {manifest ? (
          <>
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: 1 }}>{manifest.name}</div>
            {manifest.description && (
              <div style={{ marginTop: 8, fontSize: 13, color: "#9fb0cc" }}>{manifest.description}</div>
            )}
            <div style={{ marginTop: 4, fontSize: 11, color: "#5f7090" }}>
              {[manifest.author, manifest.version && `v${manifest.version}`].filter(Boolean).join(" · ")}
            </div>
            <div style={{ marginTop: 24 }}>
              {hasSave && (
                <button style={btnStyle} onClick={onContinue}>Continue</button>
              )}
              <button style={btnStyle} onClick={onStart}>{hasSave ? "New Game" : "Start"}</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 20, fontWeight: 600 }}>Runtime</div>
            <div style={{ marginTop: 8, fontSize: 13, color: "#9fb0cc" }}>
              Enter a manifest URL to load an experience.
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              if (url.trim()) {
                window.location.href = `${window.location.pathname}?manifest=${encodeURIComponent(url.trim())}`;
              }
            }}>
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://example.com/game/manifest.json"
                style={{
                  marginTop: 16, width: "100%", padding: "8px 10px",
                  background: "rgba(20,28,44,0.9)", border: "1px solid rgba(100,160,255,0.35)",
                  borderRadius: 5, color: "#dde6f5", fontSize: 13, fontFamily: "inherit",
                }}
              />
              <button type="submit" style={btnStyle}>Load</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
