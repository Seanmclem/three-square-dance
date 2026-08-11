// Phase 54 spike: minimal deno desktop shell for the world builder.
// Serves the built `dist/` tree + a spike harness page, opens one CEF window,
// and exposes two test bindings (byte echo, result reporting).
// No app (`src/`) code is touched in this phase.

import { serveDir } from "@std/http/file-server";

// Prefer on-disk paths (dev: run from the repo root); fall back to the
// compiled bundle's embedded VFS (where --include placed the files).
async function firstExisting(...paths: string[]): Promise<string> {
  for (const p of paths) {
    try {
      await Deno.stat(p);
      return p;
    } catch { /* try next */ }
  }
  return paths[paths.length - 1];
}

const here = new URL(".", import.meta.url);
const distDir = await firstExisting(
  `${Deno.cwd()}/dist`,
  new URL("../dist/", here).pathname,
);
const spikeHtml = await firstExisting(
  `${Deno.cwd()}/desktop/spike.html`,
  new URL("spike.html", here).pathname,
);
// Always write results to the real filesystem (the VFS is read-only). When
// launched as a compiled app from an arbitrary cwd, fall back to TMPDIR.
let resultsPath = `${Deno.cwd()}/desktop/spike-results.json`;
try {
  await Deno.stat(`${Deno.cwd()}/desktop`);
} catch {
  resultsPath = `${Deno.env.get("TMPDIR") ?? "/tmp"}/spike-results.json`;
}
console.log(`[spike] cwd=${Deno.cwd()} dist=${distDir}`);

Deno.serve(async (req: Request) => {
  const { pathname } = new URL(req.url);
  console.log(`[req] ${req.method} ${pathname}`);
  // HTTP fallback for the harness report (diagnoses bindings failures).
  if (pathname === "/spike-report" && req.method === "POST") {
    await Deno.writeTextFile(resultsPath, await req.text());
    console.log(`[spike] results written via HTTP to ${resultsPath}`);
    return new Response("ok");
  }
  // Root serves the harness during the spike phase so the implicit window's
  // auto-navigation lands on it; the editor stays reachable at /index.html.
  if (pathname === "/" || pathname === "/spike" || pathname === "/spike.html") {
    return new Response(await Deno.readTextFile(spikeHtml), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return serveDir(req, { fsRoot: distDir, quiet: true });
});

// deno-lint-ignore no-explicit-any
const DenoAny = Deno as any;

const win = new DenoAny.BrowserWindow({
  title: "World Builder — Phase 54 Spike",
  width: 1440,
  height: 900,
});

win.bind("spikePing", () => {
  console.log("[spike] ping received");
  return "pong";
});

// deno-lint-ignore no-explicit-any
win.bind("spikeEchoJson", (arg: any) => {
  console.log(`[spike] json received: ${JSON.stringify(arg)?.slice(0, 100)}`);
  return { got: arg, type: typeof arg };
});

// deno-lint-ignore no-explicit-any
win.bind("spikeEchoBytes", (bytes: any) => {
  const desc = {
    ctor: bytes?.constructor?.name ?? String(bytes),
    byteLength: bytes?.byteLength,
    length: bytes?.length,
  };
  console.log(`[spike] echo received: ${JSON.stringify(desc)}`);
  return desc;
});

win.bind("spikeReport", async (results: unknown) => {
  await Deno.writeTextFile(resultsPath, JSON.stringify(results, null, 2));
  console.log(`[spike] results written to ${resultsPath}`);
  return true;
});

const serveAddress = Deno.env.get("DENO_SERVE_ADDRESS") ?? "";
const port = serveAddress.split(":").pop();
console.log(`[spike] DENO_SERVE_ADDRESS=${serveAddress}`);
win.navigate(`http://127.0.0.1:${port}/spike.html`);
