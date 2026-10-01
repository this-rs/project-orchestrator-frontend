/**
 * JS positioning for floating menus.
 *
 * Why: CSS Anchor Positioning (`anchor-name` / `position-area`) is only
 * available from Safari 26 — on older iOS Safari and in Tauri's WKWebView a
 * popover styled with `.popover-dropdown` falls back to the top-left corner of
 * the viewport. These helpers compute `position: fixed` coordinates from the
 * trigger's bounding rect instead: below the trigger, flipped above when there
 * is no room, and always clamped inside the viewport (8px margin).
 */

export interface Rect {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface MenuPositionOptions {
  /** Horizontal alignment relative to the trigger. `end` = right edges aligned (default). */
  align?: 'start' | 'end'
  /** Gap between trigger and menu, px. */
  gap?: number
  /** Minimum distance to the viewport edges, px. */
  margin?: number
}

export interface MenuPosition {
  top: number
  left: number
  /** Max height so the menu never exceeds the available space (scroll inside). */
  maxHeight: number
  placement: 'bottom' | 'top'
}

export function computeMenuPosition(
  trigger: Rect,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  { align = 'end', gap = 4, margin = 8 }: MenuPositionOptions = {},
): MenuPosition {
  const spaceBelow = viewport.height - trigger.bottom - gap - margin
  const spaceAbove = trigger.top - gap - margin
  const placement: 'bottom' | 'top' = menu.height <= spaceBelow || spaceBelow >= spaceAbove ? 'bottom' : 'top'
  const maxHeight = Math.max(80, placement === 'bottom' ? spaceBelow : spaceAbove)
  const height = Math.min(menu.height, maxHeight)

  const top = placement === 'bottom' ? trigger.bottom + gap : trigger.top - gap - height

  const rawLeft = align === 'end' ? trigger.right - menu.width : trigger.left
  const maxLeft = viewport.width - margin - menu.width
  const left = Math.max(margin, Math.min(rawLeft, maxLeft))

  return { top: Math.round(top), left: Math.round(left), maxHeight: Math.floor(maxHeight), placement }
}

/**
 * Whether the browser supports CSS Anchor Positioning. Components that rely on
 * `.popover-dropdown` must apply `positionFloating()` when this is false.
 */
export const supportsAnchorPositioning: boolean =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('position-area', 'block-end')

/**
 * Imperatively place `menu` (position: fixed) next to `trigger`. Safe to call
 * repeatedly (on open, scroll, resize). Clears any CSS-anchor inset first.
 * Writes `data-placement="top|bottom"` on the menu for the entrance motion.
 */
export function positionFloating(
  trigger: HTMLElement,
  menu: HTMLElement,
  options?: MenuPositionOptions & { matchWidth?: boolean },
): MenuPosition {
  const rect = trigger.getBoundingClientRect()
  menu.style.position = 'fixed'
  menu.style.margin = '0'
  if (options?.matchWidth) menu.style.minWidth = `${rect.width}px`
  const size = { width: menu.offsetWidth, height: menu.scrollHeight || menu.offsetHeight }
  const pos = computeMenuPosition(
    rect,
    size,
    { width: window.innerWidth, height: window.innerHeight },
    options,
  )
  menu.style.top = `${pos.top}px`
  menu.style.left = `${pos.left}px`
  menu.style.right = 'auto'
  menu.style.bottom = 'auto'
  menu.style.maxHeight = `${pos.maxHeight}px`
  // Lets CSS grow the menu out of its trigger (`.ui-pop-in[data-placement]`):
  // a menu flipped above must scale from its bottom edge and rise, not drop.
  menu.dataset.placement = pos.placement
  return pos
}

/** Shared class for menu items (40px touch / 36px desktop). */
export const menuItemClass = (danger = false) =>
  `w-full min-h-10 md:min-h-9 px-3 py-2 flex items-center gap-2.5 text-left text-sm transition-colors outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
    danger
      ? 'text-red-400 hover:bg-red-500/10 focus-visible:bg-red-500/10'
      : 'text-gray-200 hover:bg-white/[0.06] focus-visible:bg-white/[0.06]'
  }`
