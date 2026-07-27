# Phase 50 — Runtime Instancing — Acceptance Checklist

Fixture: `runtime.html?manifest=/games/platfrom-obby/manifest.json` (committed obby level,
126 kit tiles). All probes via `javascript_tool` on the runtime tab (TESTING.md §2 —
runtime tabs only write `runtime_gamesave:*`; snapshot that key if you Start/Continue).

| # | Check | How | Expected (measured 2026-07-26) |
|---|---|---|---|
| 1 | Typecheck + build | `npm run typecheck && npm run build` | clean |
| 2 | Editor bundle unaffected | `grep -l "InstancedObjectPool" dist/assets/*.js` | runtime chunk only |
| 3 | Draw-call collapse | New Game → `r.info.autoReset=false; r.info.reset(); r.render(__scene,__camera)` → `r.info.render.calls` | ~68 (was 784); tris ~10.9k |
| 4 | Everything pooled | traverse: count `name.startsWith("pool_")`, `userData._instanced`, clone roots | 35 pools, 130 proxies, 0 clone roots |
| 5 | Collider parity | `__runtime.physicsWorld.world.colliders.len()`; avatar stands on a tile | 135; grounded |
| 6 | Shadows include pooled tiles | screenshot: tile shadows on terrain/slopes | visible |
| 7 | Reload leak-free (disposal trap) | `router.go("level_1",{newGame:true})` ×2, re-measure | colliders 135 each pass; `info.memory.geometries` stable (48); render identical; pools rebuilt |
| 8 | Eligibility branches | synthetic `__instancing.tryAdd` calls on a fake zone (see plan §Measured) | material/mover/interactable/script/group/dialogue targets → null; plain tile → pooled |
| 9 | No scan-gap warnings | console filter `instancing eligibility` | zero |
| 10 | Editor regression | editor tab: traverse for pools/proxies; place/delete/undo a tile; no overlay errors | 0 pools/proxies; normal behavior |

Known pre-existing (not this phase): `info.memory.textures` grows ~+11 per scene reload —
terrain/material GL textures orphaned on the transition path. Kit tiles are untextured;
the pool allocates no textures.
