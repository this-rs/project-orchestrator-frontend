/**
 * Focus for the modal views (dialogs, drawers, full-screen views on a phone).
 *
 * `useModalFocus(ref, options)` while `active`:
 * - moves focus into the container when it is outside (`initialFocus`, else its first
 *   tabbable element, else the container itself);
 * - keeps Tab / Shift+Tab inside: from the last element to the first and back, also
 *   from the container itself or when nothing in it is tabbable. Done in JS on keydown:
 *   jsdom (and older browsers) do not implement `inert`;
 * - makes the background `inert` + `aria-hidden="true"`: every sibling of the container
 *   and of each of its ancestors up to <body> — for a view portalled into <body>, every
 *   other child of <body>; for a view rendered in place, the rest of the tree around
 *   it. The previous values come back on close. Live regions (toasts) stay announced;
 * - gives focus back to what had it before opening (the trigger), on close or unmount,
 *   when focus is inside the view or lost.
 *
 * Modal views nest: they are kept in a stack and only the topmost one hides its
 * background and traps Tab. Opening an inner view hands the background over to it;
 * closing it gives it back to the outer one, so an inner view closing never un-hides
 * what the outer one still needs hidden.
 *
 * `onEscape` is optional: components that already handle Escape keep their handler.
 *
 * `useRestoreFocus(ref, active)` is only the last point, for non-modal panels.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

export interface ModalFocusOptions {
  /** Default `true`: for a component that stays mounted while closed (a `Dialog` with `open`). */
  active?: boolean
  /** Where focus goes on opening, when it is outside the view. Default: the first tabbable element. */
  initialFocus?: RefObject<HTMLElement | null> | (() => HTMLElement | null | undefined)
  /** Escape while this view is the topmost one (and nothing inside handled it). */
  onEscape?: () => void
}

const TABBABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',')

function isVisible(el: HTMLElement): boolean {
  if (el.closest('[hidden], [inert]')) return false
  // Browsers: `display: none`, `visibility: hidden` (jsdom has no checkVisibility: everything counts).
  const check = (el as HTMLElement & { checkVisibility?: (o?: object) => boolean }).checkVisibility
  return typeof check === 'function' ? check.call(el, { visibilityProperty: true }) : true
}

/** The elements Tab reaches inside `container`, in document order. */
export function tabbables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) => el.tabIndex >= 0 && isVisible(el),
  )
}

// ── Background: inert + aria-hidden ───────────────────────────────────────

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT', 'META'])

function isLiveRegion(el: Element): boolean {
  const role = el.getAttribute('role')
  return el.hasAttribute('aria-live') || role === 'alert' || role === 'status' || role === 'log'
}

/** Hides everything around `container` (siblings of it and of each ancestor below <body>); returns the undo. */
export function hideOutside(container: HTMLElement): () => void {
  const saved: { el: Element; inert: string | null; ariaHidden: string | null }[] = []
  let node: Element = container
  while (node.parentElement && node !== document.body) {
    const parent: HTMLElement = node.parentElement
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || SKIPPED_TAGS.has(sibling.tagName) || isLiveRegion(sibling)) continue
      saved.push({ el: sibling, inert: sibling.getAttribute('inert'), ariaHidden: sibling.getAttribute('aria-hidden') })
      sibling.setAttribute('inert', '')
      sibling.setAttribute('aria-hidden', 'true')
    }
    if (parent === document.body) break
    node = parent
  }
  return () => {
    for (const { el, inert, ariaHidden } of saved.reverse()) {
      if (inert === null) el.removeAttribute('inert')
      else el.setAttribute('inert', inert)
      if (ariaHidden === null) el.removeAttribute('aria-hidden')
      else el.setAttribute('aria-hidden', ariaHidden)
    }
  }
}

// ── The stack of open modal views ─────────────────────────────────────────

interface Layer {
  container: HTMLElement
  /** Undo of the background hidden for this layer: set only while it is the topmost one. */
  reveal: (() => void) | null
}

const stack: Layer[] = []

function isTop(layer: Layer): boolean {
  return stack[stack.length - 1] === layer
}

function pushLayer(layer: Layer) {
  const below = stack[stack.length - 1]
  if (below?.reveal) {
    below.reveal()
    below.reveal = null
  }
  stack.push(layer)
  layer.reveal = hideOutside(layer.container)
}

function removeLayer(layer: Layer) {
  const index = stack.indexOf(layer)
  if (index === -1) return
  const wasTop = index === stack.length - 1
  layer.reveal?.()
  layer.reveal = null
  stack.splice(index, 1)
  const top = stack[stack.length - 1]
  if (wasTop && top && top.container.isConnected) top.reveal = hideOutside(top.container)
}

/** Test helper: how many modal views are open. */
export function modalStackDepth(): number {
  return stack.length
}

// ── Focus ─────────────────────────────────────────────────────────────────

function currentFocus(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const el = document.activeElement
  return el instanceof HTMLElement && el !== document.body ? el : null
}

/** What had focus when the view became active (read while rendering, before any autoFocus inside). */
function useOpener(active: boolean): HTMLElement | null {
  const [state, setState] = useState(() => ({ active, opener: active ? currentFocus() : null }))
  // Adjusting state while rendering: React renders again at once with the new opener.
  if (state.active !== active) setState({ active, opener: active ? currentFocus() : null })
  return state.opener
}

function restoreFocus(opener: HTMLElement | null, node: HTMLElement | null) {
  const focused = document.activeElement
  const lost = !focused || focused === document.body || (node?.contains(focused) ?? false)
  if (lost && opener?.isConnected && !node?.contains(opener)) opener.focus()
}

/** Focus goes back to the opener when the view closes with focus inside it, or lost. */
export function useRestoreFocus(container: RefObject<HTMLElement | null>, active = true) {
  const opener = useOpener(active)
  useEffect(() => {
    if (!active) return
    const node = container.current
    return () => restoreFocus(opener, node)
  }, [active, opener, container])
}

function useLatest<T>(value: T) {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  })
  return ref
}

export function useModalFocus(container: RefObject<HTMLElement | null>, options: ModalFocusOptions = {}) {
  const { active = true } = options
  const initialFocus = useLatest(options.initialFocus)
  const onEscape = useLatest(options.onEscape)

  useEffect(() => {
    const node = container.current
    if (!active || !node) return
    const layer: Layer = { container: node, reveal: null }
    pushLayer(layer)

    // A container with nothing tabbable takes focus itself.
    const addedTabIndex = !node.hasAttribute('tabindex')
    if (addedTabIndex) node.setAttribute('tabindex', '-1')

    if (!node.contains(document.activeElement)) {
      const wanted = initialFocus.current
      const target = (typeof wanted === 'function' ? wanted() : wanted?.current) ?? tabbables(node)[0] ?? node
      target.focus()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTop(layer) || e.defaultPrevented) return
      if (e.key === 'Escape') {
        if (onEscape.current) {
          e.preventDefault()
          onEscape.current()
        }
        return
      }
      if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return
      const focused = document.activeElement
      const inside = focused instanceof Node && node.contains(focused)
      // Focus in something opened from the view outside it (a portalled menu): its own business.
      if (!inside && focused instanceof HTMLElement && focused !== document.body && !focused.closest('[inert]')) return
      const items = tabbables(node)
      if (items.length === 0) {
        e.preventDefault()
        node.focus()
        return
      }
      if (!inside) {
        e.preventDefault()
        ;(e.shiftKey ? items[items.length - 1] : items[0]).focus()
        return
      }
      // Only the wrap is ours; the browser moves focus between the elements inside.
      const reference = focused as Node
      if (e.shiftKey) {
        const hasPrevious = items.some((el) => reference.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING)
        if (!hasPrevious) {
          e.preventDefault()
          items[items.length - 1].focus()
        }
      } else {
        const hasNext = items.some((el) => reference.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
        if (!hasNext) {
          e.preventDefault()
          items[0].focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (addedTabIndex) node.removeAttribute('tabindex')
      removeLayer(layer)
    }
  }, [active, container, initialFocus, onEscape])

  // Declared after the effect above: on close its cleanup runs first, so the trigger is
  // no longer inert when focus goes back to it.
  useRestoreFocus(container, active)
}
