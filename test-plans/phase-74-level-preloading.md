# Phase 74 test plan: level preloading (executed 2026-09-20, v4.84.0)

What it is: the menu fully loads the level Start (or Continue) opens; a level
that is being played downloads, but does not decode, the levels its
`load_scene` actions point at. Code: `src/runtime/ScenePreloader.ts`,
in-flight sharing in `src/core/AssetManager.ts`.

## Setup used

- Scripted `exportGameBundle` of `platfrom-obby` (level_1 links to level_2).
- Served by a small Python static server that sleeps N ms per request, to
  behave like a real web host from localhost (a plain `http.server` has no
  latency, so it cannot show a loading-time difference).
- Chrome via the claude-in-chrome tools. The test tab was hidden, so timers
  are throttled to 1 s: **time with a MutationObserver, never a setTimeout
  poll** (a poll reported a fake, identical 1006 ms for both builds).

## Automated, all PASS

1. **Menu preload happens.** At the title screen, before any click: 76
   requests (was 12), including `scenes/level_1.json`, all 39 models, 8 texture
   files, 11 sounds, 4 icons.
2. **Start needs nothing more.** Pressing Start adds exactly one request (the
   router's own scene JSON fetch).
3. **Start is faster.** 80 ms latency per request, Start click to HUD visible:
   **4530 ms (old bundle) vs 275 ms (new)**.
4. **Next level is downloaded during play.** About 3 s after level 1 is up:
   `scenes/level_2.json`, then only what level 2 adds (3 models, 3 sounds); its
   14 shared assets are skipped. `initiatorType: fetch`.
5. **Those downloads are reused.** Re-requesting two of them:
   `deliveryType: "cache"`, `transferSize: 0`.
6. **Start pressed mid-preload.** 1.5 s latency, Start clicked with 31 of 39
   models loaded: game reaches the HUD, and no asset URL appears twice in the
   resource list (only the scene JSON, its second copy served from cache).
7. **Real transition.** On the dev shell origin (dev globals),
   `__runtime.router.go("level_2")`: level 2 renders (lever, rocks, player);
   during the transition only level 2's 3 new models were requested, the 7
   shared models came from memory.
8. **Continue path.** With a runtime save in level_2, the menu warms level_2
   (`stats.warmed: 20`) and treats level_1 as the download-only candidate.
9. **No-cache host.** The dev shell serves `cache-control: no-store`: the
   download tier notices on its first response and turns itself off
   (`_cacheless: true`, `stats.prefetched: 0`). Found and fixed here: it
   previously kept counting the skipped downloads as prefetched.
10. **No failed requests** beyond `favicon.ico` and the `/api/getAppInfo`
    desktop probe (expected on a static host).

## Checks

`tsc --noEmit` clean; `deno check desktop/export.ts` clean (it imports
`assetRefs.ts`); watcher build green. Runtime chunk 19.6 KB to 26.9 KB; the
export still ships no `main-*` or `testHelpers-*` chunk.

## Manual (user)

- [ ] Export a game, put it on a real host, and feel the Start button: it
      should open level 1 almost immediately if you paused on the menu for a
      second or two.
- [ ] Walk through a real portal from level 1 to level 2 on that host and
      compare the loading pause with an older export.
- [ ] Editor ▶ Play window still behaves as before (the preloader also runs
      there; on the dev shell its download tier switches itself off).

## Known limits (deliberate)

- The first frame of a level still pays texture upload and shader compile;
  nothing is pre-uploaded to the GPU.
- Map slots that only a per-instance override enables are not warmed.
- In-memory caches never shrink across levels (unchanged from before).
- A level with more than 3 `load_scene` targets only prefetches the first 3.
