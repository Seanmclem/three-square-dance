# Phase 66 — Script editor cards — test plan

1. Select an object with scripts → Scripts → SELECTED → open a script. The trigger
   card shows a sentence title, "on ★ <object label>", and chips. Clicking
   *timer repeats…* / *runs each time it fires* toggles them (data changes); ⋯ opens
   the trigger form (type dropdown with plain names, interval, repeat switch,
   delay slider, one-shot switch).
2. Click the header title and rename the script — the list row updates.
3. Action cards: title = the thing (clip / sound / key / target label, never an id),
   subtitle = verb · params · `after Ns`. Click → property rows; only one card open
   at a time; ⋯ → wrap in if-block / move to (labelled by condition text) /
   duplicate (opens the copy) / delete.
4. play_sound: the ▶ preview and VOL still work inside the rows; play_animation:
   Loop / Hold at end switches and a Blend slider; despawn: the target picker's
   list scrolls by wheel AND by dragging its scrollbar.
5. If-block: the IF strip shows the condition sentence; click it → rows in the order
   Whose state → State key → Condition → Equals → Unless (switch) → remove/done;
   *+ and* adds a second condition (opens blank). *+ else if* / *+ else* / *×*
   branch; *unwrap* keeps the actions; *delete block* removes them too.
6. *+ action* inside a branch and at the bottom both add an opened card.
7. Dialogue-option effects and UI-menu options use the same cards and rows.
8. Scene JSON: only the edits you made changed; opening/closing cards writes nothing.
