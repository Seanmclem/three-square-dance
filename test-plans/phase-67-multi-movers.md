# Phase 67 — Multiple movers — test plan

1. Select an object → the **Motion** row (its own page, no longer inside Geometry; summary shows e.g. "spin Y + slide Y") → + motion twice: a Slide Y and a Spin Y row, each
   with its own enable, fields, and ×. The JSON gains `movers: [...]` with
   `mvr_` ids; a legacy `mover` field is removed on the first edit.
2. Preview: the object spins while bobbing. Stand on it — you ride the bob and
   are carried correctly. Exit preview → exact rest pose.
3. A legacy single-mover entity (untouched JSON) still animates.
4. Script start/stop/toggle_mover on a 2-mover target shows "Which mover"
   (all · slide Y #1 · spin Y #2). "stop · slide" freezes the bob, the spin
   continues; "stop · all movers" freezes both; toggle on a once-slide still
   reverses direction.
5. An attached trigger volume on a 2-mover host still rides it; the attach-to
   dropdown still lists multi-mover hosts.
6. Enemy AI objects (aiDriven hosts) are unaffected — no mover subs register.
