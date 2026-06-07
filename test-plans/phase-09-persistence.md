# Phase 9 — Persistence Test Plan

## Features covered
- FSA Save (File System Access API — Chrome/Edge)
- FSA Load
- Auto-save to localStorage (60s interval)
- Startup restore prompt
- Dirty indicator (`*` in title)

---

## 1. Dirty indicator

| # | Action | Expected |
|---|--------|----------|
| 1 | Fresh load | No `*` in title |
| 2 | Place a floor or wall | `*` appears next to SquareDance |
| 3 | Undo the action | `*` stays (dirty state is not reversed by undo) |

---

## 2. FSA Save (Chrome only)

| # | Action | Expected |
|---|--------|----------|
| 4 | Place something, press Cmd+S | Native Save file dialog appears, defaulting to `world.json` |
| 5 | Pick a location and confirm | Dialog closes, `*` disappears |
| 6 | Place something else, press Cmd+S | **No dialog** — file is overwritten silently |
| 7 | Confirm by checking file on disk | File timestamp updated, contains new content |

**Success signal:** `*` disappearing is the only confirmation for a successful save — no toast needed. A failed save (permissions revoked, disk full) logs to console; no error UI yet.

---

## 3. FSA Load

| # | Action | Expected |
|---|--------|----------|
| 8 | Click Load | Native Open file dialog (not browser file input) |
| 9 | Select a saved `world.json` | Scene loads, `*` disappears |

---

## 4. Auto-save

| # | Action | Expected |
|---|--------|----------|
| 10 | Open DevTools → Application → Local Storage | `worldeditor_autosave` and `worldeditor_autosave_ts` keys appear within 60s of placing anything |
| 11 | Trigger manually: place something, then run in console: `localStorage.setItem('worldeditor_autosave_ts', Date.now() - 5*60000); location.reload()` | Amber restore banner appears: "Unsaved work from 5 min ago" |

---

## 5. Restore prompt

| # | Action | Expected |
|---|--------|----------|
| 12 | After triggering banner (step 11), click **Restore** | Scene from autosave loads, banner disappears, `*` cleared |
| 13 | Repeat step 11, click **✕** | Banner dismissed, autosave deleted from localStorage, fresh scene stays |
| 14 | Restore then reload | Banner does **not** reappear (autosave cleared on restore/dismiss) |
| 15 | Autosave older than 24h | Banner does not appear; stale autosave is silently removed |

---

## 6. Regression

| # | Check |
|---|-------|
| 16 | Cmd+Z / Cmd+Y still work after save |
| 17 | No console errors on load, save, or restore |
| 18 | Zones panel, undo stack, and selection all behave normally after a load |
