# Phase 90 · Natural lighting indoors

> Status: **PLANNED** (2026-10-09). Nothing built yet.
> Three parts, smallest first; each ships on its own: **A** a shadow budget with lights
> near the player, **B** lighting areas (ambient that depends on where you are), **C** baked
> lighting (lightmaps).
> Follows the v4.128 to v4.129 light work (light prefabs, crease bias, BOUNCE, bounce shadows).

User, after the Zombie Tower stairwell went dark-then-bright-then-invisible: "I just wanted
more natural lighting. maybe it's too ambitious for threejs", then "I do like the idea of
these soon enough too" about baked lighting, a few real-time lights near the player, and
ambient that depends on location.

## 1. Today, and what went wrong in office-1

Every light is real-time (forward shading). That gives three limits, all hit in the
Zombie Tower stairwell (`public/games/zombie-tower/scenes/office-1.json`):

- **Shadows use texture slots, frozen or not.** A material can read at most 16 textures
  (`MAX_TEXTURE_IMAGE_UNITS` on the user's Mac). The stair and wall materials use 5 (color,
  normal, roughness, AO maps plus the scene's environment map), so 11 are left for shadows.
  Six Ceiling Lights with BOUNCE 1 made 12 shadows (each bounce light casts its own since
  v4.129.1). Two shader programs failed to link ("FRAGMENT shader texture image units count
  exceeds MAX_TEXTURE_IMAGE_UNITS(16)") and three.js skipped drawing the stairs. Static
  shadows (`staticShadow`) only save the per-frame render of the map; reading it still takes
  a slot. Nothing warns.
- **Scene-wide lights ignore walls.** Ambient, and the fill and rim directionals that
  `SceneManager._setupLighting` adds next to the sun (fill = sun × 0.3, rim = sun × 0.15),
  cast no shadows, so they light the inside of a closed stairwell like an open field.
  Measured on the level-4 landing: rim about 33% of the brightness, ambient about 25%, fill
  about 13%, sun about 3% (the sun casts shadows, so its share is small). The only control
  is one ambient value and one sun value for the whole scene. The user ended up with ambient
  0 and sun 0, so everything outside a lamp's pool is pitch black.
- **No bounce light.** A surface next to a light is hit at a grazing angle and stays dark.
  BOUNCE (v4.129.0) fakes it with a second light, which doubles that light's cost.

Workaround applied (commit `c30f88b`): range 4.5, BOUNCE 0.25 on only the two lights against
a slab, ambient 0.05. That makes 8 shadows. It fits, but the next few lights will not.

## 2. Part A: a shadow budget, with real-time lights near the player

Goal: a scene can have any number of lights, and no surface ever disappears.

- **Shadow slots.** The scene gets a fixed number of shadow slots. The default is worked out
  from the GPU limit minus the most textures any loaded material uses, with a margin for
  models that bring more maps. three.js keys its shader programs on the *number* of shadowed
  point and spot lights, not on which ones, so moving a slot from one light to another (one
  `castShadow` off, one on, in the same frame) does not recompile any shader. A light that
  gets a frozen (Static) slot renders its map once on arrival.
- **Nearest lights win.** Lights that want a shadow compete for the slots by distance to the
  player (in the editor: the camera's focus point). Reassigned when the player has moved a
  meter or so, not every frame. A bounce light's shadow ranks just behind its own light's.
- **A light with no slot fades out** instead of losing its shadow, so it never shines through
  a floor. It is out of range of the player anyway, since the nearest lights got the slots.
  Fades over about half a second, so a light doesn't pop off in view.
- **Lights that never cast shadows** are not limited by slots. They still cost shader time
  per pixel; a far-off one could fade out the same way (open question 1).
- **The panel says what's happening.** The light's panel shows "Shadow: active" or "Shadow:
  waiting (8 of 8 slots used by nearer lights)". The Lights page (nothing selected) shows
  slots used / available.
- **Where:** `ZoneManager` (light entries already hold the light, bounce and def; a
  `_assignShadowSlots(playerPos)` pass, called from `updateLights`), `SceneManager` (GPU limit),
  `PropertiesPanel` (status lines). Preview and published games both run it.

Size: small. Fixes the disappearing-stairs failure for good.

## 3. Part B: lighting areas (ambient that depends on location)

Goal: the stairwell is dim inside and the street is bright outside, without lamps doing all
the work.

- **A lighting area is a trigger volume with lighting settings.** Volumes already have the
  shapes (box, sphere, cylinder, rotation), the resize handles, prefab support and the
  panel. A new optional `TriggerVolume.lighting`:
  - **Ambient**: color and intensity inside the area.
  - **Outdoor light**: how much of the sun, fill, rim and environment light reaches inside,
    0 to 1 (0 = a closed room, 1 = outdoors). One knob for all four, since the fill and rim
    have no settings of their own.
- **The camera's position picks the area.** The innermost area containing the camera wins;
  outside all areas, the scene's own lighting applies. Crossing a boundary blends over about
  a meter, so walking through a door doesn't snap.
- **In the editor** the same rule follows the editor camera, so flying into the stairwell
  shows its lighting. A toggle on the Lights page turns that off while building.
- **Limits, said up front:** the whole screen gets one area's values. Standing inside the
  stairwell looking out a window, the street outside is also drawn with the stairwell's
  ambient. Part C removes that for surfaces that don't move.
- **Where:** `types.ts` (`TriggerVolume.lighting`), `SceneManager` (area values applied over
  the scene's, blended), a small area tracker fed the camera position (`TriggerSystem` tracks
  the player, not the camera, so this is new), the volume's panel (a Lighting section).

Size: medium.

## 4. Part C: baked lighting (lightmaps)

Goal: natural light on everything that doesn't move. Real bounce light, soft shadows, dark
corners, no light through floors, and no per-frame cost however many lights there are.

### How it works

1. **Each light gets a mode:** `Real-time` (today), `Baked`, or `Both`. Baked lights are
   worked out once and are not in the scene at all while playing, so they cost nothing.
   Lights that flicker, are switched by scripts, or move with a mover stay real-time (the
   panel greys out Baked for them and says why). `Both` bakes the soft light and bounce but
   keeps a real-time light for the shadows on the player and enemies.
2. **A second UV layout per surface.** Today's UVs repeat the brick texture across a wall
   (world-space tiling, `UVUtils.ts`), so they can't hold a lightmap, which needs every bit
   of surface to have its own spot in one texture. The builders (`WallBuilder`,
   `FloorBuilder`, `PlatformBuilder`, `StairBuilder`, `ShapeBuilder`) already know each flat
   face and its size in meters, so they can lay their faces out as rectangles and pack them
   into one atlas per scene (a `uv1` attribute; three.js r167 reads a lightmap through
   `texture.channel = 1`). Imported models (`.glb`) would need an automatic unwrapper
   (xatlas, open question 3) or stay real-time-lit in v1.
3. **The bake** runs in a web worker inside the editor:
   - Every lightmap texel gets a world position and normal.
   - **Direct light:** a ray to each baked light; three-mesh-bvh (already installed, used by
     the CSG code) answers whether something is in the way. Several jittered rays per light
     give soft shadow edges.
   - **Bounce light:** rays out over the hemisphere pick up the direct light already
     computed where they land, tinted by that surface's color. One or two bounces.
   - **Outdoor light** from the sky and sun the same way, so a window lights a room.
   - **Cleanup:** blur between neighbors to hide noise, and pad the edges of each rectangle
     so no seams show.
   - A progress bar and Cancel; it runs while you keep working. A rough guess is tens of
     seconds for office-1 at 10 texels per meter; to be measured.
4. **Saved with the game:** one lightmap image per scene in
   `public/games/<game>/lightmaps/<scene>.png` (or a set of them if one is too big), plus a
   fingerprint of the geometry and baked lights it was made from. Published games carry the
   files like any other asset.
5. **Out of date:** moving a wall or a baked light changes the fingerprint. The Lights page
   shows "Lighting out of date: Bake" and the editor keeps showing the old bake until you
   bake again (open question 2).
6. **Moving things** (player, enemies, doors, objects on movers) can't use a lightmap. In v1
   they're lit by real-time lights plus the Part B area they stand in. A later step could
   bake a grid of light probes (three.js `LightProbe`) so they pick up the baked light too.

### Why build it here instead of using Blender

Blender can bake lightmaps, but every wall, stair and floor here is built by the editor,
and changes whenever a wall is dragged. A round trip through Blender on every change would
be slow and needs Blender installed. A built-in baker re-bakes in place.

Size: large. Its own sub-phases: C1 UV layout for walls, floors, platforms and stairs, shown
as a checker in the editor; C2 the baker for direct light; C3 bounce and sky; C4 light modes,
out-of-date detection and publishing.

## 5. Order

A first: it's small and stops the failure that hid the stairs. B next: it makes dark
interiors read right with no new lights. C last: it is the real fix for natural light, and
A and B stay useful under it (A for the real-time lights that remain, B for moving things).

## 6. Open questions

1. Part A: should lights that don't cast shadows also fade out when far from the player, to
   save shader time, or only shadowed ones?
2. Part C: when a bake is out of date, keep showing the old lightmap (looks right until things
   moved), or switch back to real-time lights until you bake again?
3. Part C: imported models in v1, real-time only, or add an automatic unwrapper (xatlas, a
   WebAssembly library) so props bake too?
4. Part C: bake quality presets (Draft for a fast preview while building, Final for
   publishing), or one setting?
