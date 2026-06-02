import type { LeftPanelId, AssetDef } from "@/types";
import type { AssetManager } from "@/core/AssetManager";
import { AssetBrowser } from "@/ui/AssetBrowser";

interface LeftPanelProps {
  panelId:         LeftPanelId;
  assets:          AssetDef[];
  selectedAssetId: string | null;
  onAssetSelect:   (id: string | null) => void;
  onImport:        () => void;
  onClose:         () => void;
  assetManager?:   AssetManager;
}

export function LeftPanel({ panelId, assets, selectedAssetId, onAssetSelect, onImport, onClose, assetManager }: LeftPanelProps) {
  const open = panelId !== null;

  return (
    <div style={{
      position: "absolute",
      left: 64,
      top: 48,
      bottom: 0,
      width: open ? 240 : 0,
      overflow: "hidden",
      transition: "width 0.2s ease",
      background: "rgba(10,14,22,0.97)",
      borderRight: open ? "1px solid rgba(80,120,180,0.2)" : "none",
      zIndex: 9,
      display: "flex",
      flexDirection: "column",
    }}>
      {open && (
        <>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 8px 6px",
            borderBottom: "1px solid rgba(80,120,180,0.15)",
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, color: "#6080a0", letterSpacing: 1, fontFamily: "monospace", textTransform: "uppercase" }}>
              {panelId}
            </span>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#4060a0", fontSize: 14, padding: "0 2px", lineHeight: 1,
              }}
              title="Close panel"
            >
              ✕
            </button>
          </div>

          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {panelId === "assets" && (
              <AssetBrowser
                assets={assets}
                selectedAssetId={selectedAssetId}
                onSelect={onAssetSelect}
                onImport={onImport}
                assetManager={assetManager}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
