/** Camera math for pan / zoom / inertia (pure, unit-tested). */
import type { Vec } from './layout'

export type Cam = { x: number; y: number; k: number }

export const MIN_K = 0.2
export const MAX_K = 4

export function clampK(k: number): number {
  return Math.min(MAX_K, Math.max(MIN_K, k))
}

export function toWorld(cam: Cam, p: Vec): Vec {
  return { x: (p.x - cam.x) / cam.k, y: (p.y - cam.y) / cam.k }
}

/** Zoom to `k` while keeping the world point under screen point `anchor` fixed (cursor-centric zoom). */
export function zoomAt(cam: Cam, anchor: Vec, k: number): Cam {
  const nk = clampK(k)
  const w = toWorld(cam, anchor)
  return { x: anchor.x - w.x * nk, y: anchor.y - w.y * nk, k: nk }
}

/** Frame-rate independent exponential decay: `friction` is the per-16.67ms multiplier. */
export function decay(v: number, friction: number, dtMs: number): number {
  return v * Math.pow(friction, dtMs / 16.6667)
}

/** Frame-rate independent smoothing factor for `x += (target - x) * f`. */
export function smoothing(rate: number, dtMs: number): number {
  return 1 - Math.pow(1 - rate, dtMs / 16.6667)
}

export function fitBounds(
  b: { minX: number; minY: number; maxX: number; maxY: number },
  width: number,
  height: number,
  pad = 32,
  maxK = 1.25,
): Cam {
  const bw = Math.max(1, b.maxX - b.minX)
  const bh = Math.max(1, b.maxY - b.minY)
  const k = clampK(Math.min((width - pad * 2) / bw, (height - pad * 2) / bh, maxK))
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  return { x: width / 2 - cx * k, y: height / 2 - cy * k, k }
}
