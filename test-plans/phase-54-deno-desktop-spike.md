# Phase 54 test plan — Deno desktop spike (executed 2026-08-11)

Environment: Deno 2.9.5, macOS (Apple M1 Pro), `deno desktop` CEF backend
(laufey 0.6.1, Chromium 149). Harness: `desktop/spike.html` served by
`desktop/main.ts`, auto-reporting via bindings + HTTP fallback.

## Automated results (all runs reproducible via `deno task desktop:hmr`)

| Check | Result | Detail |
|---|---|---|
| CEF engine | PASS | UA Chrome/149 — full Chromium, not WKWebView |
| WebGL2 | PASS | ANGLE Metal Renderer (Apple M1 Pro) |
| WebAssembly | PASS | instantiate + call |
| Gamepad API | PASS | `navigator.getGamepads` present (hardware input untested) |
| Pointer lock API | PASS | present (interactive enter/exit untested) |
| Web Audio | PASS | context created, `suspended` until gesture (normal) |
| localStorage | PASS | value persisted across app relaunch (and across HMR↔compiled runs) |
| `window.open` | as expected | returns `null` — confirms the `openRuntimeWindow` binding design |
| bindings: no-arg call | PASS | 2–4 ms round trip |
| bindings: string arg | PASS | 1–6 ms |
| bindings: object arg | PASS | 1 ms |
| bindings: **1 MB string arg** | PASS | **27–28 ms** — scene-JSON-scale payloads are fine |
| bindings: `Uint8Array` arg | **FAIL** | `TypeError: Cannot convert object to primitive value` (laufey 0.6.1); in one earlier run a large Uint8Array froze the bridge entirely |
| **Editor boot probe** | **PASS** | real `/index.html` in the shell: 1 canvas, UI text present, 0 page errors; AssetManager fetched all six manifests + HEAD checks against the Deno server |

## Compiled binary (`deno task desktop:compile` shape)

- Compile time: **7.3 s** (after first-time CEF download).
- `WorldBuilder.app`: **421 MB** total — ≈300 MB CEF framework (fixed floor
  for this backend) + 113 MB embedded payload (`dist/` incl. the 132 MB asset
  library, deduped/compressed).
- `--exclude node_modules --exclude-unused-npm` required — without it the
  auto-detection embeds the full 110 MB `node_modules` the backend never uses.
- Launched from a foreign cwd: embedded files surface under a temp
  `deno-compile-laufey/` path; `serveDir` works against it unchanged.
- VFS serving throughput: 3.4 MB chunk in **22 ms** (~150 MB/s); editor page
  32 ms. No need for `--self-extracting`.

## Decision gates — resolved

- **(a) Large payload transport:** bindings carry all **JSON** traffic
  (project saves, manifests, autosave, prefs — 1 MB string ≈ 28 ms); all
  **binary** traffic (GLB/PNG/OGG imports, thumbnails) goes over HTTP
  `POST /api/...` routes on `Deno.serve`, since `Uint8Array` bindings are
  broken in the current backend. Revisit if a later laufey fixes it.
- **(b) Asset embedding:** plain `--include` + in-memory VFS. Fast enough,
  single-file bundle preserved. No self-extraction, no sidecar.
- **Backend:** CEF confirmed (user decision, now validated) — full Chromium
  eliminates the WKWebView gamepad/pointer-lock risk class.

## Deviations / gotchas discovered

- `deno desktop main.ts` (no flags) **builds** a `desktop.app` bundle; the
  dev loop is `deno desktop --hmr`. Run-mode file paths must prefer
  `Deno.cwd()` and fall back to `import.meta.url` (VFS) for compiled mode.
- The implicit window auto-navigates to the serve root, racing explicit
  `win.navigate()` — whatever the shell should show first must be served
  at `/`.
- `--inspect-renderer=<host:port>` did not open a listening port in HMR mode
  (no CDP access yet); debugging went through HTTP report endpoints instead.
- `Object.keys(bindings)` is empty (proxy) — feature-detect by calling, not
  by enumerating.

## Manual checks (user, window is open after `deno task desktop:hmr`)

- [ ] Editor feel: orbit/pan a scene, FPS acceptable on a heavy level
- [ ] Pointer lock: enter preview mode, mouse-look, Esc exits cleanly
- [ ] Gamepad: plug in a controller, verify input in preview
- [ ] `<input type="file">` on the harness page opens a native picker
- [ ] Compiled `WorldBuilder.app` (repo root): double-click launch, cold-start time

## Verdict

Spike **passes**. Phase B (desktop backend + project persistence) can proceed
on the architecture as planned, with the single amendment that binary asset
writes use HTTP routes instead of bindings.
