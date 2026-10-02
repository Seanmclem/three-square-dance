// 3D-print export (v4.107.0): save a 3MF / STL the editor built, and open it in the
// slicer. The file arrives base64-encoded (the API is JSON only).
import type { Workspace } from "./workspace.ts";

const SLICERS: Record<string, { mac: string; label: string }> = {
  bambu: { mac: "BambuStudio", label: "Bambu Studio" },
};

/** Where print files go: ~/Downloads when it exists, else <state>/exports/print. */
async function printDir(ws: Workspace): Promise<string> {
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
  if (home) {
    try { if ((await Deno.stat(`${home}/Downloads`)).isDirectory) return `${home}/Downloads`; } catch { /* no Downloads */ }
  }
  const dir = `${ws.stateDir}/exports/print`;
  await Deno.mkdir(dir, { recursive: true });
  return dir;
}

const written = new Set<string>();   // only files we wrote can be opened

/** Save `<name>.<ext>` (a name taken gets -2, -3 …). Returns the full path. */
export async function writePrintFile(ws: Workspace, name: string, ext: "3mf" | "stl", base64: string, dirOverride?: string): Promise<{ path: string }> {
  const safe = name.replace(/[^A-Za-z0-9 _.-]+/g, "_").replace(/^[ .]+|[ .]+$/g, "").slice(0, 80) || "model";
  const dir = dirOverride ?? await printDir(ws);
  if (dirOverride) await Deno.mkdir(dir, { recursive: true });
  let path = `${dir}/${safe}.${ext}`;
  for (let n = 2; ; n++) {
    try { await Deno.stat(path); path = `${dir}/${safe}-${n}.${ext}`; } catch { break; }
  }
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  await Deno.writeFile(path, bytes);
  written.add(path);
  return { path };
}

/** Open a print file this session wrote in the slicer (macOS: open -a). */
export async function openInSlicer(path: string, slicer: string): Promise<{ ok: boolean; error?: string }> {
  const s = SLICERS[slicer];
  if (!s) return { ok: false, error: `unknown slicer "${slicer}"` };
  if (!written.has(path)) return { ok: false, error: "only files exported in this session can be opened" };
  const cmd = Deno.build.os === "darwin"
    ? new Deno.Command("open", { args: ["-a", s.mac, path] })
    : Deno.build.os === "windows"
    ? new Deno.Command("explorer", { args: [path] })   // the app registered for .3mf
    : new Deno.Command("xdg-open", { args: [path] });
  const out = await cmd.output();
  return out.success ? { ok: true } : { ok: false, error: `${s.label} didn't open (${new TextDecoder().decode(out.stderr).trim() || "is it installed?"})` };
}
