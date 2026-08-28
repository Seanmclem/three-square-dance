# Phase 65 — Script if-blocks — test plan

## Engine
1. Script `on_interact` with block {IF mode = "a": [x, y] · ELSE IF mode = "b": [z] · ELSE: [w]}
   plus a top-level action t. mode "a" → t, x, y run; "b" → t, z; anything else → t, w.
2. Same block without ELSE, mode "c" → only t runs.
3. A branch condition with **unless** on `mode = "a"`: passes for any other value, fails for "a".
4. Entity-scoped condition (★ this object) inside a branch on an entity's script → evaluates
   against the owner (prefab copies against their own member).
5. Trigger delay 1s + action delay 0.5s inside a branch: the branch is decided when the
   1s elapses; flipping state during the 0.5s does not change which actions ran.

## Editor
1. SCRIPTS → + New → **+ If**: an IF #1 card with one blank condition (⚠ if you remove it).
2. **+ action here** twice → both rows inside the card, each showing `IF #1` in its move picker.
3. **+ Add** a top-level action, click its **if** → IF #2 wrapping it.
4. On IF #1: **+ else if** → ELSE IF #1.1; **+ else** → ELSE #1 (the + else button disappears).
5. Move the IF #2 action to ELSE #1 via its picker; **unwrap** IF #2 (now empty) → gone,
   nothing deleted. **× branch** on ELSE IF drops its actions to the top level.
6. Script list shows `· 1 if`. State-key suggestions include keys used in block conditions.
7. Open a pre-existing script that had a per-action ONLY IF: it shows as a one-branch block;
   any edit saves the new shape; an unedited one stays byte-identical on disk.
8. Delete the script; the scene file is unchanged from before the test.
