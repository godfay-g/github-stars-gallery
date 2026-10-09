/**
 * Category selection rules — the single source of truth shared by the overview pills,
 * the star map and the URL `cat` parameter. Pure functions, unit-tested.
 *
 * - Plain click: switch to that category; clicking the only selected one again clears it.
 * - ⌘/Ctrl click: add/remove that category (multi-select).
 * - 1 selected → the star map expands that category; 2+ → map only highlights them; 0 → overview.
 */
export type CatSelection = string[]

export function clickCategory(selected: CatSelection, id: string, additive: boolean): CatSelection {
  if (additive) return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
  return selected.length === 1 && selected[0] === id ? [] : [id]
}

export function removeCategory(selected: CatSelection, id: string): CatSelection {
  return selected.filter((x) => x !== id)
}

/** Which category the star map should expand for a given selection. */
export function focusForSelection(selected: CatSelection): string | null {
  return selected.length === 1 ? selected[0] : null
}

/**
 * The star map expanded/collapsed a category itself (click inside the map, "back", double-click).
 * Expanding selects exactly that category; collapsing clears a single selection, but keeps a
 * multi-selection (which never had a focused category to begin with).
 */
export function selectionFromMapFocus(selected: CatSelection, focus: string | null): CatSelection {
  if (focus) return [focus]
  return selected.length > 1 ? selected : []
}

/** Modifier for additive selection: ⌘ on macOS, Ctrl elsewhere (either is accepted). */
export function isAdditiveClick(e: { metaKey?: boolean; ctrlKey?: boolean }): boolean {
  return Boolean(e.metaKey || e.ctrlKey)
}
