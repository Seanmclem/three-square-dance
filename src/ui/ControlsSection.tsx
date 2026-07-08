import { useState } from "react";
import type { BindingsConfig } from "@/input/bindings";
import { loadBindings, saveBindings, resetBindings } from "@/input/bindings";

const LABEL: React.CSSProperties = {
  color: "#8888a0", fontSize: 9, fontFamily: "monospace", letterSpacing: 1,
};
const INPUT: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 4, background: "rgba(40,40,40,0.9)", color: "#c0c0c0",
  fontSize: 10, fontFamily: "monospace", padding: "3px 6px", outline: "none",
};

/**
 * Device-local control tuning (Phase 24). Writes localStorage bindings, NOT
 * world data — a world plays with each device's own sensitivities. Values are
 * read when preview starts, so edits apply on the next Play.
 */
export function ControlsSection() {
  const [bindings, setBindings] = useState<BindingsConfig>(loadBindings);

  function update(fn: (b: BindingsConfig) => void): void {
    const next = structuredClone(bindings);
    fn(next);
    saveBindings(next);
    setBindings(next);
  }

  const numField = (label: string, value: number, step: number, apply: (b: BindingsConfig, n: number) => void) => (
    <div key={label}>
      <div style={{ ...LABEL, marginBottom: 2 }}>{label}</div>
      <input
        type="number" step={step} defaultValue={value} key={value}
        onBlur={e => {
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n) && n > 0) update(b => apply(b, n));
        }}
        style={INPUT}
      />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
      <div style={{ ...LABEL, fontSize: 10 }}>CONTROLS (THIS DEVICE)</div>
      <div style={{ color: "#646464", fontSize: 10 }}>
        Saved on this device, not in the world. Applies next time Play starts.
      </div>
      {numField("MOUSE SENSITIVITY", bindings.kbm.lookSensitivity, 0.0005,
        (b, n) => { b.kbm.lookSensitivity = n; })}
      {numField("GAMEPAD LOOK RATE (RAD/S)", bindings.gamepad.lookRate, 0.25,
        (b, n) => { b.gamepad.lookRate = n; })}
      {numField("GAMEPAD DEADZONE", bindings.gamepad.deadzone, 0.01,
        (b, n) => { b.gamepad.deadzone = Math.min(0.9, n); })}
      <label style={{ ...LABEL, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
        <input
          type="checkbox" checked={bindings.gamepad.invertLookY}
          onChange={e => update(b => { b.gamepad.invertLookY = e.target.checked; })}
        />
        INVERT GAMEPAD LOOK Y
      </label>
      {numField("TOUCH LOOK SENSITIVITY", bindings.touch.lookSensitivity, 0.001,
        (b, n) => { b.touch.lookSensitivity = n; })}
      {numField("JOYSTICK RADIUS (PX)", bindings.touch.joystickRadius, 5,
        (b, n) => { b.touch.joystickRadius = n; })}
      <div>
        <div style={{ ...LABEL, marginBottom: 2 }}>TOUCH LAYOUT</div>
        <select
          value={bindings.touch.layout}
          onChange={e => update(b => { b.touch.layout = e.target.value as BindingsConfig["touch"]["layout"]; })}
          style={INPUT}
        >
          <option value="right-jump">Jump on right</option>
          <option value="left-jump">Jump on left</option>
        </select>
      </div>
      <button
        onClick={() => { resetBindings(); setBindings(loadBindings()); }}
        style={{
          padding: "4px 8px", borderRadius: 4, cursor: "pointer",
          fontSize: 10, fontFamily: "monospace",
          background: "rgba(40,40,40,0.9)", border: "1px solid rgba(255,255,255,0.15)",
          color: "#9090a0",
        }}
      >
        Reset to defaults
      </button>
    </div>
  );
}
