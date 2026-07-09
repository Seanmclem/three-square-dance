/** Shown during router transitions (scene fetch + zone build). */
export function LoadingScreen() {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 150,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(5,8,14,0.85)", color: "#9fb0cc",
      fontSize: 15, letterSpacing: 3,
    }}>
      LOADING…
    </div>
  );
}
