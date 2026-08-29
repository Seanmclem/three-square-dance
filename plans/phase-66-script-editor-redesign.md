# Phase 66 — Script editor redesign (brief for mockups)

> **Decision (2026-08-29):** direction **E · Cards** with the **properties
> panel** field style, chosen from the interactive prototype. Shipped as
> v4.79.49 (see the arch-doc changelog for what was built). Follow-ups from
> the review: condition rows ordered Whose state → State key → Condition;
> popups stay open when their scrollbar is dragged; "delete block".

> User ask (2026-08-28): "that whole UI is so nasty. needs redone." Written as
> a self-contained brief: someone (or a Claude) with NO repo access should be
> able to read this and produce mockups. Part A describes exactly what exists
> today; Part B is the proposed direction; Part C lists the screens to mock and
> the rules the mockups must respect. Implementation is a later plan — this
> phase ends when a mockup is chosen.

---

## Part A — the current UI, exactly

### A1. Where it lives

- A **left side panel** in a dark 3D editor. Toolbar column (64px) on the far
  left; the panel docks beside it, full height under a 48px top bar.
- Panel width **320px by default**, user-resizable **280–600px** by dragging
  its right edge. The 3D viewport fills the rest; a properties panel (≈290px)
  sits on the far right. Most users never widen the panel.
- Theme: near-black glass (`rgba(28,28,28,0.97)`), 1px `rgba(255,255,255,0.08)`
  borders. Text is **monospace** throughout. Palette rungs in use:
  - readable text `#dde3f0` / `#c2cadb`; secondary `#98a2b8`; muted `#8b94a8`
  - section/field labels `#8888a0`, **9px, letter-spaced, ALL CAPS**
  - accent blue `#80aaff` (primary buttons, picked states)
  - amber `#e8c14b` (everything "if": blocks, wrap button, + If)
  - danger `#cc6666` (×, Delete, Stop)
  - fields: `rgba(40,40,40,0.9)` fill, 1px `rgba(255,255,255,0.1)` border,
    radius 4, 10px text; buttons are the same recipe with 11px text.

### A2. Panel header and tabs

`SCRIPTS` title, a ✕ to close, then a tab strip:
`LEVEL · SELECTED · DIALOGUE · STATE · ITEMS · UI`
- **LEVEL** — scripts owned by the scene (zone-level).
- **SELECTED** — scripts owned by the currently selected object / trigger
  volume (these can use "★ this object").
- The other tabs are sibling editors (dialogue trees, state schema, items,
  HUD widgets) and are out of scope, but the redesign must leave room for
  them.

### A3. List view (per tab)

A `+ New` button, then one row per script:

```
┌────────────────────────────────────────┐
│ spike pop intervals                    │   ← label, 12px
│ on_timer · 1 cond · 4 if · 5 actions   │   ← sub line, 10px muted
└────────────────────────────────────────┘
```
Click → editor. An empty tab shows a hint paragraph ("No scripts yet — hit
+ New. A script is a trigger … conditions … actions").

### A4. Editor view (one script)

Top: `←` back button, the script's label as title, a `?` help tooltip.
Then a vertical stack of sections separated by 1px dividers, every field
stacked with its ALL-CAPS label above it:

```
LABEL
[ spike pop intervals                      ]

TRIGGER
[ on_timer                               ▾ ]
INTERVAL (SECONDS)
[ 2                                        ]
☑ Repeat every interval (off = fire once)
☐ One-shot                    Delay (s) [ 0 ]

──────────────────────────────────────────
CONDITIONS                          [+ Add]
(none)

──────────────────────────────────────────
ACTIONS                      [+ Add] [+ If]
… action rows and if-block cards …

──────────────────────────────────────────
[        Disable        ]  [ Delete ]
```

Trigger-specific fields appear under TRIGGER: a **target picker** for
on_player_enter/exit (a volume), on_interact (an object), on_dialogue_end
(a dialogue); INTERVAL + Repeat for on_timer; STATE KEY (+ VALUE for
on_state_equals, + WHOSE STATE scope) for the state triggers; nothing for
on_game_start / on_level_load / on_health_zero / the enemy triggers
(on_player_detected / on_player_lost / on_enemy_attack).

### A5. A condition row (used in CONDITIONS and inside if-blocks)

Fields wrap onto 2–3 lines at the default width:

```
[ state equals value ▾ ]  WHOSE STATE
                          [ ○ hurt spikes (vol_… ]
          STATE KEY                EQUALS
☐ unless  [ spikes-up          ]   [ false      ▾ ]   [×]
```
- Type select (120px): `state is set / true`, `state equals value`,
  `number compare (< > =)`, `has item`, `player falling`.
- **WHOSE STATE**: a type-to-filter combobox — `🌐 Global`, `★ this object`
  (only on SELECTED-tab scripts), any object/volume by name, prefab
  siblings marked ⬡. Popup flips upward near the bottom of the screen.
- **STATE KEY**: text input with a custom suggestion popup (exactly the
  chosen scope's registered keys; global list for Global).
- `number compare` adds an operator select + number; `has item` adds an
  item picker + operator + count; `player falling` has no fields.
- `unless` checkbox inverts the condition. `×` removes it.

### A6. An action row

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│                    DELAY (S)                        │
│ [ play_animation ▾ ] [ 0    ] [if] [top level ▾] [×]│
│ TARGET                                              │
│ [ ★ this object                                   ] │
│ CLIP                                                │
│ [ SpikeTrap_Up                                  ▾ ] │
│ ☐ loop   ☐ hold last frame   BLEND (S) [    ]       │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```
Row = faint card (`rgba(255,255,255,0.03)`, 1px border). Line 1: action
type select (sorted, raw ids like `despawn_object`), DELAY (52px), amber
**if** (wrap in a block), a 58px **move to** select (only when blocks
exist: top level / IF #1 / ELSE IF #1.1 / ELSE #1), red ×. Below: the
type's fields, each with its own label line. A typical script of 5 actions
is ~1,400px tall at 320px width.

Action families and their fields (37 types):
- **Sound**: play_sound (SOUND picker with ▶ preview + VOL, TARGET or
  position, loop), stop_sound, play_music (music picker, VOL, loop, fade),
  stop_music (fade), set_footstep.
- **Objects**: play_animation (TARGET, CLIP, loop, hold, blend),
  move_object (TARGET, X/Y/Z), spawn_object / despawn_object (TARGET, fade),
  spawn_npc, change_material, open_door / close_door, start_mover /
  stop_mover / toggle_mover, light_on / light_off / toggle_light.
- **State**: set_state (WHOSE STATE, STATE KEY, VALUE — booleans get a
  true/false/toggle select), adjust_number (scope, key, ± change),
  delete_state, store_position, fire_event.
- **Player**: teleport_player, launch_player (direction/strength, relative
  to owner), respawn_player, flash_player, fade_screen.
- **Items**: give_item / take_item / transfer_item (item picker, count,
  from/to for transfer).
- **Flow / UI**: show_dialogue, show_ui / hide_ui, run_script, load_scene.

### A7. An if-block card (Phase 65)

```
╔═ amber-tinted card ═══════════════════════════════╗
║ IF #1  [+ condition]                              ║
║   … condition rows …                              ║
║ ┃ … action rows (indented, amber left rule) …     ║
║ ┃ [+ action here]                                 ║
║ ELSE IF #1.1  [+ condition]           [× branch]  ║
║   … condition rows …                              ║
║ ┃ …                                               ║
║ ELSE #1                               [× branch]  ║
║ ┃ …                                               ║
║ [+ else if] [+ else]                     [unwrap] ║
╚═══════════════════════════════════════════════════╝
```
Semantics the mockup must convey: a block is decided once when the script's
actions start; first passing branch wins; actions in a branch still run in
parallel with their own delays; "unless" lives on individual conditions.

### A8. What's wrong (from real scripts, with screenshots)

1. **Height.** Everything is a labeled field stack; one action ≈ 250px.
   The user's 5-action spike script scrolls for three screens.
2. **Width.** 320px forces 2–3-line wraps in every row; fields have
   clipped (VALUE under STATE KEY until v4.79.48; "State key" placeholders
   truncated; `play_animatio…`).
3. **Repetition.** Migrated scripts are N one-action blocks with the same
   condition — the structure is invisible in the wall of cards.
4. **No overview.** You cannot read a script as a sentence
   ("every 2s: if spikes are up → despawn the volume, play the animation").
5. **Raw ids as UI.** Action and trigger names are code ids
   (`despawn_object`, `on_player_enter`); condition types are half-translated.
6. **Chrome vs content.** ALL-CAPS 9px letter-spaced labels, dividers and
   card borders take as much space as the values.
7. Small: the `move to` select is cryptic (`IF #1`, `ELSE IF #1.1`);
   Delete is a native confirm; numbering blocks (#1, #1.1) is programmer-ish.

---

## Part B — proposed direction

Four moves, in order of impact. They compose; a mockup should try all four.

### B1. Sentence rows

Every action is ONE line in its resting state — a sentence built from its
fields, with the fields becoming editable inline when the row is selected:

```
▸ play animation  SpikeTrap_Up  on ★ this object
▸ despawn  vol_11875031           fade 0s      after 0.5s
▸ set  hurt spikes › spikes-up  →  toggle      after 1s
▸ play sound  spike_pop  vol 1.0  at ★ this object
```
- Verb phrase in readable words (a display-name table over the ids); the
  important noun (clip / key / sound / target) brightest; secondary
  parameters (delay, fade, volume) dimmer and right-aligned.
- Click a row → it expands to its fields (the current ActionFields), still
  inline; click elsewhere → collapses. One open row at a time by default.
- Delay renders as `after 0.5s` at the row's end, or nothing when 0.
- Hover reveals the row controls (↑↓ move, duplicate, wrap in if, ×);
  they're not permanently painted.

### B2. Conditions as sentences

```
if   hurt spikes › spikes-up  =  false
and  unless  player falling
```
Same grammar: `scope › key  op  value`, editable inline; "unless" as a
small pill toggle at the row start instead of a checkbox. Script-level
conditions read `only when …` under the trigger.

### B3. Blocks as structure, not more cards

```
every 2s  (repeating)

  ▸ play sound  tick

  if  hurt spikes › spikes-up = false
      ▸ play animation  SpikeTrap_Up  on ★ this object
      ▸ set  hurt spikes › spikes-up → true         after 0.5s
  else if  hurt spikes › spikes-up = true
      ▸ despawn  vol_11875031
  else
      ▸ play sound  error

  + action   + if
```
- IF / ELSE IF / ELSE are slim amber rules with the condition sentence on
  the same line; actions indent under them. No inner card, no "#1.1".
- `+ action` at the end of each branch appears on hover of the branch (and
  always at the bottom of the script).
- Drag a row between branches / top level (fallback: the existing move
  menu, relabeled with the branch's condition text).
- The trigger reads as the heading: `when the player enters hurt spikes`,
  `every 2s`, `on game start`, `when coins becomes 10`.

### B4. Room to breathe

- The script EDITOR opens in a wider docked pane (≈520px, like the
  dialogue flowchart) while the script LIST stays in the narrow panel; or
  the panel auto-widens when an editor opens and restores on back.
- Labels become 10–11px sentence-case, no letter-spacing; section
  dividers replaced by whitespace; one card border per block, none per row.
- Type/verb pickers show display names grouped by family (Sound, Objects,
  State, Player, Items, Flow) with a type-to-filter box; the raw id shown
  as a subtle suffix for the curious.

### Also worth mocking (smaller)

- **Header summary** on the list rows in the same sentence grammar:
  `every 2s → 5 actions in 2 branches`.
- A **"reads as" line** at the top of the editor (the whole script as prose)
  as a sanity check while editing.
- Inline warnings in-row (`⚠ key not registered`, `⚠ target missing`)
  instead of separate lines.
- Delete → the app's ConfirmDialog (no native confirm).

---

## Interactive prototype

`plans/mockups/script-editor-prototype.html` — open it in a browser (React +
JSX via CDN, no build). Seven directions (A–G: sentence rows, outline, wide
pane, prose, cards, flow, grid) side by side or one at a time, over a live
data model shaped like the real ScriptDef (flat actions + blocks + tags):
click any sentence to edit it with real fields (edits rewrite the sentence),
hover a row for if · ⇄ move · ⧉ · ×, collapse branches, add / remove
conditions and branches, unwrap, switch scripts in C. "verbs" toggles
monospace vs proportional for the verb words.

## Part C — for the mockups

### C1. Screens to produce

1. Script LIST (narrow panel) — 4 rows, mixed triggers, one disabled.
2. EDITOR, resting — the spike script above: on_timer, no script-level
   conditions, 1 top-level action, one block with if / else if / else.
3. EDITOR, editing — the same, with one `set_state` row expanded inline
   (scope picker open showing `🌐 Global`, `★ this object`, entities, ⬡
   prefab siblings) and one condition row expanded.
4. EDITOR, wide variant (B4) — the same script in the 520px pane.
5. EDITOR, empty script — the "add your first action / if" state.
6. Hover states: a row showing its controls; a branch showing `+ action`.
7. Legacy migration hint: how a script that still has old per-action
   guards is presented (currently: shown as one-action blocks silently).

### C2. Rules the mockups must respect

- Dark theme only; text at `#dde3f0` / `#c2cadb` on the glass background —
  **no grey-on-grey**. 4px spacing scale; whole-number font sizes.
- Monospace is the current family; a mockup may propose a proportional
  face for prose rows with monospace for ids/keys/values — say which.
- **No disabled buttons**: a control that can't apply explains itself on
  click (dialog/hint), or isn't shown.
- Every existing capability stays reachable: all 37 actions and their
  fields, the 5 condition types, entity/global/self/prefab-sibling scoping,
  unless, per-action delay, trigger delay, one-shot, enable/disable,
  else-if chains, move between branches, unwrap.
- Keyboard: Esc closes popups/pickers; Enter commits an inline edit.
- The data model does not change (this is a view rebuild).

### C3. Open questions for the mockup round

- Sentence rows for ALL actions vs. a compact "type + primary noun" row
  with details on expand — how far does the grammar go for the odd ones
  (launch_player: direction/strength/relative; transfer_item: from/to)?
- Auto-widen the panel vs. a separate docked editor pane?
- Drag-and-drop between branches in v1, or move menu only?
- Should the list row's sub-line be the prose summary, or stay
  `trigger · N cond · N actions`?

---

## Implementation (later plan)

Not part of this phase. Expected shape: a `ScriptRow`/`ConditionRow`
sentence renderer + inline-edit host in `src/ui/ScriptPanel.tsx`, a
display-name table for triggers/actions/conditions, a docked/wide editor
mode in `LeftPanel.tsx`, `OBJECT_SCRIPTS_GUIDE.md` screenshots, arch-doc
file sections, and a `test-plans/phase-66-*.md` covering every capability
in C2 through the new UI.
