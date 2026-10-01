/**
 * Headless test backend: the real desktop api (projects / assets / workspace /
 * autosave) on a THROWAWAY copy of one game, serving the repo's current `dist/`.
 * Point Playwright or a Chrome tab at it instead of the user's shell: nothing it
 * writes reaches `public/games/**` or the shell's shared autosave. See TESTING.md §12.
 *
 * Run: `deno task test:harness [project] [scene] [port]`
 *      (defaults platfrom-obby level_2 7411; `npm run build` first if dist/ is stale)
 * The temp workspace path is printed; its autosave is `<tmp>/state/autosave/latest.json`.
 */
import { makeHandler } from "../desktop/serve.ts";
import * as P from "../desktop/projects.ts";
import * as A from "../desktop/assets.ts";
import { getLastSession, getPref, setLastSession, setPref } from "../desktop/workspace.ts";

const [project = "platfrom-obby", scene = "level_2", portArg = "7411"] = Deno.args;
const port = Number(portArg);
const repo = new URL("..", import.meta.url).pathname;

const tmp = await Deno.makeTempDir({ prefix: "wb-harness-" });
await Deno.mkdir(`${tmp}/content/games`, { recursive: true });
await Deno.mkdir(`${tmp}/state`, { recursive: true });
await new Deno.Command("cp", { args: ["-R", `${repo}public/games/${project}`, `${tmp}/content/games/`] }).output();
await Deno.symlink(`${repo}public/assets`, `${tmp}/content/assets`);   // read-only use; asset imports would write through

const ws = { contentDir: `${tmp}/content`, stateDir: `${tmp}/state`, dev: true };
await setLastSession(ws, { projectId: project, sceneId: scene });
const handler = makeHandler(`${repo}dist`, ws);
const appInfo = () => ({ version: "harness", platform: Deno.build.os, contentDir: ws.contentDir, stateDir: ws.stateDir, serveOrigin: `http://127.0.0.1:${port}`, dev: true });

// deno-lint-ignore no-explicit-any
const api: Record<string, (...a: any[]) => unknown> = {
  getAppInfo: appInfo, getPref: (k: string) => getPref(ws, k), setPref: (k: string, v: string | null) => setPref(ws, k, v),
  listProjects: () => P.listProjects(ws), saveScene: (p: string, s: string, j: string) => P.saveScene(ws, p, s, j),
  writeGameFile: (p: string, j: string) => P.writeGameFile(ws, p, j), writeProjectManifest: (p: string, j: string) => P.writeProjectManifest(ws, p, j),
  getLastSession: () => getLastSession(ws), setLastSession: (s: { projectId: string; sceneId: string } | null) => setLastSession(ws, s),
  writeAutosave: (m: { projectId: string | null; sceneId: string | null }, j: string) => P.writeAutosave(ws, m, j),
  readAutosave: () => P.readAutosave(ws), clearAutosave: () => P.clearAutosave(ws),
  writeAssetManifest: (k: string, j: string) => A.writeAssetManifest(ws, k, j),
  openExternal: () => null, revealPath: () => null,
};

console.log(`harness: ${project}/${scene} on http://127.0.0.1:${port}/  workspace ${tmp}`);
Deno.serve({ port, hostname: "127.0.0.1", onListen: () => {} }, async (req) => {
  const { pathname } = new URL(req.url);
  if (pathname.startsWith("/api/")) {
    const name = pathname.slice(5);
    if (name === "getAppInfo" && req.method === "GET") return Response.json(appInfo());
    const fn = api[name];
    if (!fn || req.method !== "POST") return new Response("unknown api method", { status: 404 });
    try { return Response.json((await fn(...(await req.json() as unknown[]))) ?? null); }
    catch (e) { return Response.json({ error: (e as Error).message }, { status: 500 }); }
  }
  return handler(req);
});
