import { describe, expect, it } from 'vitest'
import { boundsOf, capList, catRadius, exceedsThreshold, phyllotaxis, ringPositions } from './layout'
import { clampK, decay, fitBounds, smoothing, toWorld, zoomAt } from './camera'

describe('layout', () => {
  it('ring positions sit on the radius', () => {
    for (const p of ringPositions(7, 100)) expect(Math.hypot(p.x, p.y)).toBeCloseTo(100)
  })
  it('phyllotaxis keeps nodes apart', () => {
    const pts = phyllotaxis(150, 34, 4)
    let min = Infinity
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y))
    expect(min).toBeGreaterThan(25)
  })
  it('caps at 150 and reports overflow', () => {
    const r = capList(Array.from({ length: 1200 }, (_, i) => i))
    expect(r.shown).toHaveLength(150)
    expect(r.overflow).toBe(1050)
    expect(capList([1, 2]).overflow).toBe(0)
  })
  it('drag threshold is 4px', () => {
    expect(exceedsThreshold(3, 2)).toBe(false)
    expect(exceedsThreshold(4, 1)).toBe(true)
  })
  it('category radius is bounded', () => {
    expect(catRadius(0)).toBe(24)
    expect(catRadius(100000)).toBe(54)
  })
  it('bounds include radius', () => {
    expect(boundsOf([{ x: 0, y: 0, r: 5 }])).toEqual({ minX: -5, minY: -5, maxX: 5, maxY: 5 })
  })
})

describe('camera', () => {
  it('zoomAt keeps the anchor world point fixed', () => {
    const cam = { x: 120, y: 80, k: 1.3 }
    const anchor = { x: 400, y: 260 }
    const before = toWorld(cam, anchor)
    const after = toWorld(zoomAt(cam, anchor, 2.1), anchor)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })
  it('clamps zoom', () => {
    expect(clampK(100)).toBe(4)
    expect(clampK(0)).toBe(0.2)
  })
  it('decay and smoothing are frame-rate independent', () => {
    const a = decay(decay(10, 0.9, 16.6667), 0.9, 16.6667)
    expect(decay(10, 0.9, 33.3334)).toBeCloseTo(a)
    const s1 = smoothing(0.2, 16.6667)
    const twoSteps = 1 - (1 - s1) * (1 - s1)
    expect(smoothing(0.2, 33.3334)).toBeCloseTo(twoSteps)
  })
  it('fitBounds centers content', () => {
    const cam = fitBounds({ minX: -100, minY: -100, maxX: 100, maxY: 100 }, 800, 600, 0, 10)
    expect(cam.k).toBe(3)
    expect(cam.x).toBe(400)
    expect(cam.y).toBe(300)
  })
})
