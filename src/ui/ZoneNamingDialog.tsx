import { useState } from "react";
import type { ZoneType } from "@/types";

const TYPES: { id: ZoneType; label: string; color: string }[] = [
  { id: "outdoor", label: "Outdoor", color: "#7a9a7a" },
  { id: "indoor",  label: "Indoor",  color: "#80aaff" },
  { id: "dungeon", label: "Dungeon", color: "#cc8080" },
];

interface ZoneNamingDialogProps {
  onConfirm: (name: string, type: ZoneType) => void;
  onCancel:  () => void;
}

export function ZoneNamingDialog({ onConfirm, onCancel }: ZoneNamingDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ZoneType>("indoor");

  const confirm = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed, type);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.6)",
    }}>
      <div style={{
        background: "rgba(28,28,28,0.99)", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8, padding: "20px 24px", width: 280,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ color: "#c0c0c0", fontSize: 13, fontFamily: "monospace", letterSpacing: 1 }}>
          NEW ZONE
        </div>

        <div>
          <div style={{ color: "#646464", fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>NAME</div>
          <input
            autoFocus
            type="text"
            placeholder="Zone name…"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") confirm(); if (e.key === "Escape") onCancel(); }}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 4, color: "#d8d8d8", fontSize: 12, padding: "6px 8px",
              outline: "none", fontFamily: "monospace",
            }}
          />
        </div>

        <div>
          <div style={{ color: "#646464", fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>TYPE</div>
          <div style={{ display: "flex", gap: 6 }}>
            {TYPES.map(t => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                style={{
                  flex: 1, padding: "6px 0", borderRadius: 4, cursor: "pointer",
                  fontFamily: "monospace", fontSize: 10, letterSpacing: 0.5,
                  border: "none",
                  background: type === t.id ? `${t.color}33` : "rgba(46,46,46,0.9)",
                  color: type === t.id ? t.color : "#646464",
                  outline: type === t.id ? `1px solid ${t.color}55` : "1px solid rgba(255,255,255,0.07)",
                }}
              >{t.label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "6px 14px", borderRadius: 4, cursor: "pointer",
              background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
              color: "#646464", fontSize: 11, fontFamily: "monospace",
            }}
          >Cancel</button>
          <button
            onClick={confirm}
            disabled={!name.trim()}
            style={{
              padding: "6px 14px", borderRadius: 4, cursor: name.trim() ? "pointer" : "default",
              background: name.trim() ? "rgba(80,140,255,0.2)" : "rgba(46,46,46,0.5)",
              border: `1px solid ${name.trim() ? "rgba(80,140,255,0.4)" : "rgba(255,255,255,0.06)"}`,
              color: name.trim() ? "#80aaff" : "#404050",
              fontSize: 11, fontFamily: "monospace",
            }}
          >Create zone</button>
        </div>
      </div>
    </div>
  );
}
