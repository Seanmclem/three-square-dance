// World Builder desktop shell (phase 55): CEF window + Deno backend.
// Serves the built editor/runtime from dist/, serves + persists workspace
// content (games, assets), and exposes the write API to the webview through
// bindings (JSON only — binary payloads use HTTP routes; see phase-54 spike).

import { resolveWorkspace } from "./workspace.ts";
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

// ── HTTP API ────────────────────────────────────────────────────────────────
// The DesktopApi transport. Bindings looked ideal (in-process, 1MB string in
// 28ms) but the bridge intermittently deadlocks at launch (seen in phase 54,
// reproduced in 55: first call never resolves → the editor boot hangs on
// readAutosave → blank window). HTTP against Deno.serve has been solid in
// every run, so ALL app traffic goes over POST /api/<method> with a JSON
// array of args; bindings remain registered for spike diagnostics only.
import * as P from "./projects.ts";
import * as A from "./assets.ts";
import { getLastSession, getPref, setLastSession, setPref } from "./workspace.ts";

// deno-lint-ignore no-explicit-any
const apiMethods: Record<string, (...args: any[]) => unknown> = {
  getAppInfo: () => appInfo(),
  openRuntimeWindow: (opts: { manifestUrl: string; title?: string }) => openRuntimeWindow(opts),
  revealPath: (path: string) => revealPath(path),
  getPref: (key: string) => getPref(ws, key),
  setPref: (key: string, value: string | null) => setPref(ws, key, value),
  listProjects: () => P.listProjects(ws),
  createProject: (id: string) => P.createProject(ws, id),
  saveScene: (projectId: string, sceneId: string, json: string) => P.saveScene(ws, projectId, sceneId, json),
  deleteScene: (projectId: string, sceneId: string) => P.deleteScene(ws, projectId, sceneId),
  writeGameFile: (projectId: string, json: string) => P.writeGameFile(ws, projectId, json),
  writeProjectManifest: (projectId: string, json: string) => P.writeProjectManifest(ws, projectId, json),
  getLastSession: () => getLastSession(ws),
  setLastSession: (s: { projectId: string; sceneId: string } | null) => setLastSession(ws, s),
  writeAutosave: (meta: { projectId: string | null; sceneId: string | null }, json: string) => P.writeAutosave(ws, meta, json),
  readAutosave: () => P.readAutosave(ws),
  clearAutosave: () => P.clearAutosave(ws),
  writeExportFile: (name: string, text: string) => P.writeExportFile(ws, name, text),
  writeAssetManifest: (kind: string, json: string) => A.writeAssetManifest(ws, kind, json),
  deleteAssetFiles: (kind: string, rels: string[]) => A.deleteAssetFiles(ws, kind, rels),
};

async function handleApi(req: Request, pathname: string): Promise<Response> {
  const name = pathname.slice("/api/".length);
  if (name === "getAppInfo" && req.method === "GET") return Response.json(appInfo());
  const fn = apiMethods[name];
  if (!fn || req.method !== "POST") return new Response("unknown api method", { status: 404 });
  try {
    const args = await req.json() as unknown[];
    const result = await fn(...args);
    return Response.json(result ?? null);
  } catch (e) {
    console.error(`[api] ${name} failed:`, (e as Error).message);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

Deno.serve(async (req: Request) => {
  const { pathname } = new URL(req.url);
  if (pathname.startsWith("/api/")) return handleApi(req, pathname);
  // Binary asset upload: POST /api-file/<kind>/<rel…>, raw bytes as the body.
  if (pathname.startsWith("/api-file/") && req.method === "POST") {
    const [kind, ...relParts] = pathname.slice("/api-file/".length).split("/");
    try {
      const bytes = new Uint8Array(await req.arrayBuffer());
      return Response.json(await A.writeAssetFile(ws, kind, relParts.map(decodeURIComponent).join("/"), bytes));
    } catch (e) {
      console.error(`[api-file] ${pathname} failed:`, (e as Error).message);
      return Response.json({ error: (e as Error).message }, { status: 500 });
    }
  }
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

// ── shell operations (served via the HTTP API dispatch above) ───────────────

function appInfo() {
  return {
    version: APP_VERSION,
    platform: Deno.build.os,
    contentDir: ws.contentDir,
    stateDir: ws.stateDir,
    serveOrigin,
    dev: ws.dev,
  };
}

// deno-lint-ignore no-explicit-any
let runtimeWin: any = null;

function openRuntimeWindow(opts: { manifestUrl: string; title?: string }): { url: string } {
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
}

async function revealPath(path: string): Promise<void> {
  const cmd = Deno.build.os === "darwin"
    ? new Deno.Command("open", { args: ["-R", path] })
    : Deno.build.os === "windows"
    ? new Deno.Command("explorer", { args: [`/select,${path}`] })
    : new Deno.Command("xdg-open", { args: [path.slice(0, path.lastIndexOf("/"))] });
  await cmd.output();
}

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

console.log(`[desktop] editor window up at ${serveOrigin}`);
