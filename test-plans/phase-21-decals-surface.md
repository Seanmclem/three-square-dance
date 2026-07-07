# Phase 21 — Surface-Effect Decals (in-shader projection) — Test Plan

## Prerequisites
- `npm run typecheck` passes with zero TypeScript errors.
- Dev server running on `http://localhost:7373`.
- Phase 20 (overlay decals) passing — this builds on the same entity/tool/panel.

> **Scope.** `kind: "surface"` decals — water damage, stains, moss, weathering — sampled
> inside the target surface's OWN `MeshStandardMaterial` via `onBeforeCompile`
> (`src/world/decals/surfaceDecals.ts`). No extra mesh, no extra draw call; the base
> normal map is untouched so lighting has zero seam at the decal edge. Optional
> **triplanar** mode ignores the projector direction and wraps corners/edges. Max
> **4 per mesh** (fixed unrolled samplers — GLSL ES 3.0 forbids dynamic sampler
> indexing; excess decals on one mesh are dropped with a console.warn). The patched
> material is a **clone** — the shared AssetManager cache instance is never mutated.
> See `WORLD_EDITOR_ARCHITECTURE.md` v4.8.0 and `aplans/decals-plan.md`.
>
> All checks below ran 2026-07-07 via Chrome MCP and passed with zero console errors.
> One real bug was found and fixed during this pass: `decal:removed` skipped the
> surface-patch reconcile, leaving the wall patched after delete — removal now routes
> through `_rebuildDecal` like add/update.

---

## 1. Stamp a surface decal (gate)

1. Decal tool → **Surface** kind toggle → pick a Weather tile (Leak Stain / Moss / Grime).
2. Hover a wall (ghost quad shows at ~50% look), click to stamp.

```js
window.__world.toJSON().zones[0].decals   // one def, kind: "surface"
let patched = []; __scene.traverse(o => { if (o.isMesh && o.material?.userData?._sdUniforms)
  patched.push({ id: o.userData.editorId, count: o.material.userData._sdUniforms.uSdCount.value }); });
// exactly the intersected mesh(es) patched, uSdCount = 1; NO decal mesh in the scene
```

- [ ] Def stored; **zero** `editorType === "decal"` meshes (surface decals are not meshes).
- [ ] The wall run mesh's material has `userData._sdUniforms`, `uSdCount 1`,
      `userData._ownsMaterial true` — and it is a clone, NOT the shared cache instance.
- [ ] **Visual:** the stain renders blended into the wall texture (screenshot).

## 2. Uniform-only updates (no recompile) (gate)

```js
// record patched material uuid, then move/resize/triplanar-toggle via updateDecal
// (or the DecalView panel / translate gizmo)
```

- [ ] After moving + resizing + toggling triplanar: `material.uuid` **unchanged**;
      `_sdUniforms.uSdAnchor/uSdSize/uSdParams` reflect the new values.

## 3. Triplanar corner wrap (gate)

Place a stain with **TRIPLANAR** on so its radius spans an edge shared by two faces
(e.g. anchor on a wall's top edge, or a wall/floor junction; both faces may be the same
merged run mesh).

- [ ] Screenshot: the texture flows continuously across the edge onto the second face —
      no seam, no directional stretch.
- [ ] Planar mode (triplanar off): the decal does NOT paint the wall's reverse face
      (normal-dot fade) and fades smoothly at its rect border.

## 4. Material hygiene on delete (gate — regression for the fixed bug)

Select the stain (click it — analytic ray-vs-rectangle pick, it has no mesh; a cyan
rectangle outline confirms) → **Delete Decal**.

- [ ] `zones[0].decals` empty AND the wall's material reverts: no `_sdUniforms`,
      `_ownsMaterial` back to `false`, patched clone disposed (0 patched meshes).
- [ ] Cmd+Z restores the def AND the patch (`uSdCount 1` again).

## 5. Rebuild survival

Move a node of the patched wall (drag or `updateNode` in a transaction).

- [ ] After the rebuild, the **new** run mesh carries the patch (`_sdUniforms`,
      `uSdCount 1`, `inScene: true`); the disposed old mesh's record is reaped.
- [ ] Undo restores the wall; the patch follows.

## 6. Panel + selection

- [ ] Clicking a surface stain (Select tool, or Decal tool while disarmed) selects it —
      DecalView shows the kind-specific fields: **TRIPLANAR** checkbox and
      **WET ROUGHNESS** input (blank = off) in addition to the shared fields.
- [ ] Wet roughness (e.g. 0.1) visibly glosses the stained area under the sun; the
      surrounding surface keeps its base roughness.
- [ ] The translate gizmo moves the stain (def-driven; the cyan outline follows).

## 7. Persistence + regression

- [ ] Save/load round-trips surface decals (patch rebuilt in `loadZone`).
- [ ] `npm run typecheck` → 0 errors; console clean.
- [ ] Draw calls unchanged by surface decals (zero extra meshes); overlay decals and
      all Phase 20 checks still pass.
- [ ] More than 4 surface decals intersecting one mesh: extras dropped with a
      `console.warn` (documented cap; atlas is the escape hatch if ever needed).

## Known caveats

- Floor-level **dimming** swaps materials on non-active levels; a dimmed mesh that is
  also surface-patched shows the dim clone (patch hidden) until dimming clears — cosmetic,
  editor-only.
- The over-cap warning is console-only (no panel badge yet).
- Surface decals aren't script/group-bulk targets yet (same as overlay).
