# Phase 68 — Game defaults & scene overrides — test plan (Part 1)

1. Open a project whose game.json has no playerSettings: it gains them (seeded
   from the entry scene) on adopt — check games/<id>/game.json.
2. Spawn panel root: THIS SCENE ⇄ GAME DEFAULTS switch (project only; absent in
   single-scene mode). GAME DEFAULTS scope edits game.json live and every
   non-overriding scene follows.
3. A legacy scene (full settings in its JSON): every page shows the amber
   "Overriding the game defaults" banner — behaviour unchanged.
4. On a page, "Use game defaults": fields grey out (read-only) and snap to the
   game values; the scene JSON loses that page's fields on save. "Override for
   this scene": fields copy in at their current effective values and edit
   independently; other scenes unaffected.
5. Root → "★ Make these the game defaults": game.json takes this scene's
   effective settings; every page banner flips to "Using the game defaults".
6. New scene: inherits everything (all pages non-overridden); character
   feels identical to the entry scene.
7. Undo reverts a page-override flip (scene layer is journaled).
8. Runtime shell + export: play uses the same resolution; an exported game
   ships the game-default character model and sounds.

## Part 2 — lighting + mixer

9. game.json gains `lighting` and `audio.mix` (seeded from the entry scene).
10. Lights page: legacy scene shows the amber "overrides the game's lighting"
    banner. "Use game defaults" → grey "Following…" (values unchanged, since the
    defaults were seeded from this scene); editing any lighting value takes it
    back over. "★ Make this the game default" copies the scene's lighting into
    game.json and flips the scene to following.
11. Mixer page: same banner pair for the four bus sliders.
12. New scene: inherits lighting (`lightingFromGame: true`) and the game mix;
    its look/sound matches the entry scene out of the box.
13. Runtime + export resolve identically (game-default skybox ships).
