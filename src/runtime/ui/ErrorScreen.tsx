interface Props {
  message: string;
  /** Reload with no manifest param — back to the URL input. */
  onDismiss: () => void;
}

/**
 * Manifest/scene load failures. A fetch TypeError against a remote origin is
 * almost always CORS — the loader's error text names it (manifest.ts), and we
 * surface it verbatim here.
 */
export function ErrorScreen({ message, onDismiss }: Props) {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 150,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "rgba(30,10,14,0.92)", border: "1px solid rgba(255,110,110,0.4)",
        borderRadius: 10, padding: "28px 36px", maxWidth: 520,
        color: "#f5d7d7", textAlign: "center",
      }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: "#ff9d9d" }}>Failed to load</div>
        <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5, wordBreak: "break-word" }}>{message}</div>
        <button
          onClick={onDismiss}
          style={{
            marginTop: 20, padding: "8px 24px", background: "rgba(200,80,80,0.2)",
            border: "1px solid rgba(255,110,110,0.5)", borderRadius: 6,
            color: "#f5d7d7", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          }}
        >OK</button>
      </div>
    </div>
  );
}
