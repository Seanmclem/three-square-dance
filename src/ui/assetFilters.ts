import { useState } from "react";

// Shared facet-filter semantics for every asset browser (models, materials, sounds,
// skyboxes, graphics, decals). Presentation differs — AssetBrowser has its own strip
// with a `More ▾` popout, the rest use `AssetFilterBar` — but the *meaning* of a facet
// (what it counts, when it is worth showing, what it matches) lives only here, so the
// panels can't drift apart on behaviour.

export interface FacetSpec<T> {
  key:     string;                                        // stable state key
  label:   string;                                        // segment label
  multi?:  boolean;                                       // multi-select, ANDed (tags); default exclusive
  prefix?: string;                                         // "#" on tag chips
  always?: boolean;                                        // exempt from the auto-hide rule (category)
  order?:  "count" | "alpha";                              // default "count" (most-used first)
  counts?: boolean;                                        // default true; category pills stay bare
  /** Label for a synthetic bucket of items whose `read` yields nothing (e.g. "(no pack)").
   *  Makes "one real kit + unlabeled items" a showable split — without it, audio's single
   *  pack plus 3 unattributed fixtures rendered no Pack segment at all. */
  blankBucket?: string;
  read:    (item: T) => string | string[] | undefined | null;
}

export interface FacetValue { value: string; count: number }
export interface Facet {
  key: string; label: string; multi: boolean; prefix: string; counts: boolean; values: FacetValue[];
}

/** Which facets can actually split this library: ≥2 distinct values AND at least one
 *  value shared by ≥2 items. The second clause is what keeps a "Pack" segment off the
 *  materials panel, whose `sourceName` holds a per-texture name ("Paving Stones 141")
 *  rather than a kit — a list of singletons filters nothing. Category passes `always`
 *  because it is the default facet and every panel has shown its pills since Phase 7.
 *  Values are ordered by count desc, then alphabetically. */
export function buildFacets<T>(items: T[], specs: FacetSpec<T>[]): Facet[] {
  const out: Facet[] = [];
  for (const s of specs) {
    const counts = new Map<string, number>();
    let blanks = 0;
    for (const item of items) {
      const raw = s.read(item);
      let any = false;
      for (const v of Array.isArray(raw) ? raw : [raw]) {
        const t = (v ?? "").trim();
        if (t) { counts.set(t, (counts.get(t) ?? 0) + 1); any = true; }
      }
      if (!any && s.blankBucket) blanks++;
    }
    const values = [...counts].map(([value, count]) => ({ value, count }));
    // "(no pack)" joins only when it makes the facet worth showing alongside at
    // least one real shared value — never as the facet's sole reason to exist.
    const blankSplits = !!s.blankBucket && blanks >= 1 && values.some(v => v.count >= 2);
    if (blankSplits) values.push({ value: s.blankBucket!, count: blanks });
    values.sort(s.order === "alpha"
      ? (a, b) => a.value.localeCompare(b.value)
      : (a, b) => (b.count - a.count) || a.value.localeCompare(b.value));
    if (s.always || blankSplits || (values.length >= 2 && values.some(v => v.count >= 2)))
      out.push({
        key: s.key, label: s.label, multi: !!s.multi, prefix: s.prefix ?? "",
        counts: s.counts ?? true, values,
      });
  }
  return out;
}

/** Selected values per facet key. Absent/empty = that facet is not filtering. */
export type FacetSel = Record<string, string[]>;

export function matchesFacets<T>(item: T, specs: FacetSpec<T>[], sel: FacetSel): boolean {
  for (const s of specs) {
    const picked = sel[s.key];
    if (!picked?.length) continue;
    const raw = s.read(item);
    const own = (Array.isArray(raw) ? raw : [raw]).map(v => (v ?? "").trim()).filter(Boolean);
    if (!own.length && s.blankBucket) own.push(s.blankBucket);   // unlabeled items live in the synthetic bucket
    // Multi-select is ANDed (an item must carry every picked tag); exclusive facets hold
    // one value, and an item has exactly one, so membership is the same test.
    const ok = s.multi ? picked.every(p => own.includes(p)) : own.includes(picked[0]!);
    if (!ok) return false;
  }
  return true;
}

/** Facet state + the filtered list. `sel` is self-healing: values that no longer exist
 *  (a tag whose last sound was deleted) are dropped from the effective selection rather
 *  than silently filtering the panel down to nothing. */
export function useFacetFilters<T>(items: T[], specs: FacetSpec<T>[]) {
  const [mode, setMode] = useState<string>(specs[0]?.key ?? "");
  const [rawSel, setSel] = useState<FacetSel>({});

  const facets = buildFacets(items, specs);
  const valid = new Map(facets.map(f => [f.key, new Set(f.values.map(v => v.value))]));

  const sel: FacetSel = {};
  for (const [key, values] of Object.entries(rawSel)) {
    const keep = values.filter(v => valid.get(key)?.has(v));
    if (keep.length) sel[key] = keep;
  }

  // A facet that stopped being worth showing must not stay the active one.
  const activeKey = facets.some(f => f.key === mode) ? mode : (facets[0]?.key ?? "");

  const toggle = (key: string, value: string) => setSel(prev => {
    const multi = specs.find(s => s.key === key)?.multi;
    const cur = prev[key] ?? [];
    if (!multi) return { ...prev, [key]: cur[0] === value ? [] : [value] };
    return { ...prev, [key]: cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value] };
  });
  const clearFacet = (key: string) => setSel(prev => ({ ...prev, [key]: [] }));
  const clear = () => setSel({});

  const activeCount = Object.values(sel).reduce((n, v) => n + v.length, 0);
  const filtered = items.filter(i => matchesFacets(i, specs, sel));

  return { facets, activeKey, setMode, sel, toggle, clearFacet, clear, activeCount, filtered };
}

/** The two facets every asset type carries via `attribution` — the pack/kit a thing came
 *  from and who made it. Spelled out here so all six panels label them identically. */
export const PACK_FACET   = { key: "pack",   label: "Pack"   } as const;
export const AUTHOR_FACET = { key: "author", label: "Author" } as const;
