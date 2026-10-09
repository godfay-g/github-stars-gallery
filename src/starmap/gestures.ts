/** Input policy for the star map (pure, unit-tested). The map must never swallow page scroll. */

export type WheelLike = { ctrlKey: boolean; metaKey: boolean }

/**
 * Plain wheel / trackpad two-finger scroll => let the page scroll.
 * Ctrl/⌘ + wheel, or a trackpad pinch (browsers report it as wheel + ctrlKey) => zoom the map.
 */
export function wheelIntent(e: WheelLike): 'zoom' | 'scroll' {
  return e.ctrlKey || e.metaKey ? 'zoom' : 'scroll'
}

/**
 * What a pointer drag should do. On touch, one finger belongs to the page (vertical scroll via
 * `touch-action: pan-y`, taps still click); only two fingers pan/zoom the map.
 * Mouse/pen drags pan the map, or move a node when the press started on one.
 */
export function dragIntent(pointerType: string, pointerCount: number, onNode: boolean): 'pinch' | 'pan' | 'node' | 'none' {
  if (pointerCount >= 2) return pointerType === 'mouse' ? 'none' : 'pinch'
  if (pointerType === 'touch') return 'none'
  return onNode ? 'node' : 'pan'
}
