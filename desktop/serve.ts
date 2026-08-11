// Static serving: /games/* and /assets/* come from the workspace content dir
// (what the editor writes is what the runtime reads); everything else from the
// built dist/ (on disk in dev, embedded VFS in the compiled app).

import { serveDir } from "@std/http/file-server";
import type { Workspace } from "./workspace.ts";

async function firstExisting(...paths: string[]): Promise<string> {
  for (const p of paths) {
    try {
      await Deno.stat(p);
      return p;
    } catch { /* try next */ }
  }
  return paths[paths.length - 1];
}

export async function resolveDistDir(): Promise<string> {
  return await firstExisting(
    `${Deno.cwd()}/dist`,
    new URL("../dist/", import.meta.url).pathname,
  );
}

export function makeHandler(distDir: string, ws: Workspace): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const { pathname } = new URL(req.url);
    if (pathname === "/spike" || pathname === "/spike.html") {
      const spike = await firstExisting(
        `${Deno.cwd()}/desktop/spike.html`,
        new URL("spike.html", import.meta.url).pathname,
      );
      return new Response(await Deno.readTextFile(spike), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    if (pathname.startsWith("/games/") || pathname.startsWith("/assets/")) {
      const res = await serveDir(req, { fsRoot: ws.contentDir, quiet: true });
      if (res.status !== 404) {
        // The editor re-reads what it just wrote — never let the webview cache it.
        res.headers.set("cache-control", "no-store");
        return res;
      }
      // Vite emits the app's OWN hashed js/css chunks under /assets/ as well
      // (build.assetsDir default) — those exist only in dist, so fall through.
      // Shadowing them here is exactly what blanked the phase-55 window.
    }
    return serveDir(req, { fsRoot: distDir, quiet: true });
  };
}
