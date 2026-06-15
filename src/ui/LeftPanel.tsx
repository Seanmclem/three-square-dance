import type { LeftPanelId, AssetDef, GroupDef, ScriptDef, TriggerVolume, WorldObject } from "@/types";
import { AssetBrowser } from "@/ui/AssetBrowser";
import { GroupPanel } from "@/ui/GroupPanel";
import { ScriptPanel } from "@/ui/ScriptPanel";

interface LeftPanelProps {
  panelId:         LeftPanelId;
  assets:          AssetDef[];
  selectedAssetId: string | null;
  onAssetSelect:   (id: string | null) => void;
  onImport:        () => void;
  onClose:         () => void;
  groups:          GroupDef[];
  onGroupAdd:      () => void;
  onGroupRemove:   (id: string) => void;
  onGroupRename:   (id: string, name: string) => void;
  activeZoneId:    string | null;
  // scripts panel
  zoneScripts:          ScriptDef[];
  objectScripts:        ScriptDef[] | null;
  selectedObjectId:     string | null;
  triggerVolumes:       TriggerVolume[];
  zoneObjects:          WorldObject[];
  onZoneScriptsChange:  (scripts: ScriptDef[]) => void;
  onObjectScriptsChange:(objectId: string, scripts: ScriptDef[]) => void;
}

export function LeftPanel({
  panelId, assets, selectedAssetId, onAssetSelect, onImport, onClose,
  groups, onGroupAdd, onGroupRemove, onGroupRename,
  zoneScripts, objectScripts, selectedObjectId,
  activeZoneId, triggerVolumes, zoneObjects,
  onZoneScriptsChange, onObjectScriptsChange,
}: LeftPanelProps) {
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
      background: "rgba(28,28,28,0.97)",
      borderRight: open ? "1px solid rgba(255,255,255,0.08)" : "none",
      zIndex: 9,
      display: "flex",
      flexDirection: "column",
    }}>
      {open && (
        <>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 8px 6px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, color: "#808080", letterSpacing: 1, fontFamily: "monospace", textTransform: "uppercase" }}>
              {panelId}
            </span>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#585870", fontSize: 14, padding: "0 2px", lineHeight: 1,
              }}
              title="Close panel"
            >
              ✕
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {panelId === "assets" && (
              <AssetBrowser
                assets={assets}
                selectedAssetId={selectedAssetId}
                onSelect={onAssetSelect}
                onImport={onImport}
              />
            )}
            {panelId === "groups" && (
              <GroupPanel
                groups={groups}
                onAdd={onGroupAdd}
                onRemove={onGroupRemove}
                onRename={onGroupRename}
              />
            )}
            {panelId === "scripts" && (
              <ScriptPanel
                zoneScripts={zoneScripts}
                objectScripts={objectScripts}
                selectedObjectId={selectedObjectId}
                activeZoneId={activeZoneId}
                triggerVolumes={triggerVolumes}
                zoneObjects={zoneObjects}
                onZoneScriptsChange={onZoneScriptsChange}
                onObjectScriptsChange={onObjectScriptsChange}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
