/** Pure layout helpers for the star map (unit-tested, no DOM). */

export type Vec = { x: number; y: number }

/** Max repo nodes rendered when a category is expanded; the rest fold into a "+N" node. */
export const MAX_REPO_NODES = 150
/** Below this zoom level repo avatars are swapped for colored dots (LOD). */
export const LOD_ZOOM = 0.6
/** Pointer travel (px) after which a press becomes a drag and no longer counts as a click. */
export const DRAG_THRESHOLD = 4

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

export function ringPositions(n: number, radius: number, startAngle = -Math.PI / 2): Vec[] {
  const out: Vec[] = []
  for (let i = 0; i < n; i++) {
    const a = startAngle + (Math.PI * 2 * i) / Math.max(n, 1)
    out.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius })
  }
  return out
}

/**
 * Sunflower (phyllotaxis) placement: evenly packed, no overlaps, grows outward.
 * `offset` leaves a hole in the middle for the expanded category node.
 */
export function phyllotaxis(n: number, spacing: number, offset = 0): Vec[] {
  const out: Vec[] = []
  for (let i = 0; i < n; i++) {
    const r = spacing * Math.sqrt(i + offset)
    const a = (i + offset) * GOLDEN_ANGLE
    out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r })
  }
  return out
}

/** Category bubble radius grows with sqrt(count) so huge buckets don't dominate. */
export function catRadius(count: number): number {
  return 24 + Math.min(30, Math.sqrt(Math.max(0, count)) * 3.2)
}

export function capList<T>(list: T[], max = MAX_REPO_NODES): { shown: T[]; overflow: number } {
  if (list.length <= max) return { shown: list, overflow: 0 }
  return { shown: list.slice(0, max), overflow: list.length - max }
}

export function exceedsThreshold(dx: number, dy: number, threshold = DRAG_THRESHOLD): boolean {
  return dx * dx + dy * dy > threshold * threshold
}

export function boundsOf(points: (Vec & { r?: number })[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (!points.length) return { minX: -1, minY: -1, maxX: 1, maxY: 1 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    const r = p.r ?? 0
    minX = Math.min(minX, p.x - r)
    minY = Math.min(minY, p.y - r)
    maxX = Math.max(maxX, p.x + r)
    maxY = Math.max(maxY, p.y + r)
  }
  return { minX, minY, maxX, maxY }
}
