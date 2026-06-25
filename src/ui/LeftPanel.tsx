import type { LeftPanelId, AssetDef, MaterialDef, GroupDef, ScriptDef, TriggerVolume, WorldObject } from "@/types";
import { AssetBrowser } from "@/ui/AssetBrowser";
import { MaterialBrowser } from "@/ui/MaterialBrowser";
import { GroupPanel } from "@/ui/GroupPanel";
import { ScriptPanel } from "@/ui/ScriptPanel";

interface LeftPanelProps {
  panelId:         LeftPanelId;
  assets:          AssetDef[];
  selectedAssetId: string | null;
  onAssetSelect:   (id: string | null) => void;
  onImport:        () => void;
  onDeleteAssets:  (ids: string[]) => void;
  onEditAssets:    (ids: string[]) => void;
  materials:        MaterialDef[];
  onMaterialImport: () => void;
  onDeleteMaterials:(ids: string[]) => void;
  onEditMaterials:  (ids: string[]) => void;
  onClose:         () => void;
  groups:          GroupDef[];
  hiddenGroupIds:  Set<string>;
  onGroupAdd:      () => void;
  onGroupRemove:   (id: string) => void;
  onGroupRename:   (id: string, name: string) => void;
  onGroupToggleVisibility: (id: string) => void;
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
  panelId, assets, selectedAssetId, onAssetSelect, onImport, onDeleteAssets, onEditAssets, onClose,
  materials, onMaterialImport, onDeleteMaterials, onEditMaterials,
  groups, hiddenGroupIds, onGroupAdd, onGroupRemove, onGroupRename, onGroupToggleVisibility,
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
                onDeleteAssets={onDeleteAssets}
                onEdit={onEditAssets}
              />
            )}
            {panelId === "materials" && (
              <MaterialBrowser
                materials={materials}
                onImport={onMaterialImport}
                onDeleteMaterials={onDeleteMaterials}
                onEdit={onEditMaterials}
              />
            )}
            {panelId === "groups" && (
              <GroupPanel
                groups={groups}
                hiddenGroupIds={hiddenGroupIds}
                onAdd={onGroupAdd}
                onRemove={onGroupRemove}
                onRename={onGroupRename}
                onToggleVisibility={onGroupToggleVisibility}
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
                groups={groups}
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
