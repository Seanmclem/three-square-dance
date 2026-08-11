// World Builder desktop shell (phase 55): CEF window + Deno backend.
// Serves the built editor/runtime from dist/, serves + persists workspace
// content (games, assets), and exposes the write API to the webview through
// bindings (JSON only — binary payloads use HTTP routes; see phase-54 spike).

import { resolveWorkspace } from "./workspace.ts";
import { registerProjectBindings } from "./projects.ts";
import { makeHandler, resolveDistDir } from "./serve.ts";

const APP_VERSION = "0.1.0";

const ws = await resolveWorkspace();
const distDir = await resolveDistDir();
console.log(`[desktop] content=${ws.contentDir} state=${ws.stateDir} dev=${ws.dev}`);
console.log(`[desktop] dist=${distDir}`);

const handler = makeHandler(distDir, ws);
const spikeResultsPath = `${ws.stateDir}/spike-results.json`;

// Dev diagnostics: WORLDBUILDER_BOOT=<page> serves desktop/<page>.html at the
// root (where the webview auto-navigates), e.g. spike or probe55.
const bootPage = Deno.env.get("WORLDBUILDER_BOOT");

Deno.serve(async (req: Request) => {
  const { pathname } = new URL(req.url);
  // Spike harness report sink (kept as a shell-regression tool, /spike.html)
  if (pathname === "/spike-report" && req.method === "POST") {
    await Deno.writeTextFile(spikeResultsPath, await req.text());
    return new Response("ok");
  }
  if (bootPage && pathname === "/") {
    return new Response(await Deno.readTextFile(`${Deno.cwd()}/desktop/${bootPage}.html`), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  // probe55 e2e helper: read-only fixture project from the repo checkout
  if (bootPage && pathname.startsWith("/probe-fixture/")) {
    const rel = pathname.slice("/probe-fixture/".length);
    if (rel.includes("..")) return new Response("nope", { status: 400 });
    try {
      return new Response(await Deno.readTextFile(`${Deno.cwd()}/public/games/pj-fixture/${rel}`), {
        headers: { "content-type": "application/json" },
      });
    } catch {
      return new Response("not found", { status: 404 });
    }
  }
  return handler(req);
});

const serveAddress = Deno.env.get("DENO_SERVE_ADDRESS") ?? "";
const serveOrigin = `http://127.0.0.1:${serveAddress.split(":").pop()}`;

// deno-lint-ignore no-explicit-any
const DenoAny = Deno as any;

const editorWin = new DenoAny.BrowserWindow({
  title: "World Builder",
  width: 1600,
  height: 1000,
});

// ── shell bindings ──────────────────────────────────────────────────────────

editorWin.bind("getAppInfo", () => ({
  version: APP_VERSION,
  platform: Deno.build.os,
  contentDir: ws.contentDir,
  stateDir: ws.stateDir,
  serveOrigin,
  dev: ws.dev,
}));

// deno-lint-ignore no-explicit-any
let runtimeWin: any = null;

editorWin.bind("openRuntimeWindow", (opts: { manifestUrl: string; title?: string }) => {
  const url = `${serveOrigin}/runtime.html?manifest=${encodeURIComponent(opts.manifestUrl)}`;
  if (runtimeWin === null) {
    runtimeWin = new DenoAny.BrowserWindow({
      title: opts.title ?? "World Builder — Runtime",
      width: 1280,
      height: 800,
    });
    runtimeWin.addEventListener("close", () => {
      runtimeWin = null;
    });
  }
  runtimeWin.navigate(url);
  return { url };
});

editorWin.bind("revealPath", async (path: string) => {
  const cmd = Deno.build.os === "darwin"
    ? new Deno.Command("open", { args: ["-R", path] })
    : Deno.build.os === "windows"
    ? new Deno.Command("explorer", { args: [`/select,${path}`] })
    : new Deno.Command("xdg-open", { args: [path.slice(0, path.lastIndexOf("/"))] });
  await cmd.output();
});

// spike diagnostics (documents the Uint8Array bindings bug per shell build)
editorWin.bind("spikePing", () => "pong");
// deno-lint-ignore no-explicit-any
editorWin.bind("spikeEchoBytes", (bytes: any) => ({ byteLength: bytes?.byteLength }));
// deno-lint-ignore no-explicit-any
editorWin.bind("spikeEchoJson", (arg: any) => ({ got: arg, type: typeof arg }));
// deno-lint-ignore no-explicit-any
editorWin.bind("spikeReport", async (results: any) => {
  await Deno.writeTextFile(spikeResultsPath, JSON.stringify(results, null, 2));
  return true;
});

registerProjectBindings(editorWin, ws);

console.log(`[desktop] editor window up at ${serveOrigin}`);
