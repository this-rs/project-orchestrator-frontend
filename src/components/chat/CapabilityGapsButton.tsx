import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { PanelBottomOpen, TriangleAlert } from 'lucide-react'
import { useT } from '@/i18n'
import type { Degradation } from '@/constants/engine'
import { glassButton, glassFlat, iconButton } from '@/components/ui/classes'
import { positionFloating } from '@/components/ui/menuPosition'
import { panelGlass } from '@/components/ui/panelGlass'
import { EngineGapsDetail } from './EngineBanner'

const TABBABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** The next control after `el` in the page's tab order (outside the popover). */
function nextTabbable(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null
  const all = Array.from(document.querySelectorAll<HTMLElement>(TABBABLE)).filter((n) => !n.closest('[data-testid="capability-gaps-popover"]'))
  const i = all.indexOf(el)
  return i >= 0 ? (all[i + 1] ?? null) : null
}

/**
 * The list of missing features in a popover anchored to a header control: the amber icon on
 * desktop, the ⋯ menu button (with its amber count badge) on a phone. Escape or Shift+Tab out
 * closes it with focus back on the anchor, Tab out closes it with focus on the control after the
 * anchor, a tap outside closes it. "Show above the message box" puts the banner back in place.
 */
export function CapabilityGapsPopover({
  open,
  onClose,
  anchorRef,
  items,
  onExpand,
  id,
}: {
  open: boolean
  /** `true` when focus should go back to the anchor. */
  onClose: (focusAnchor: boolean) => void
  anchorRef: RefObject<HTMLElement | null>
  items: readonly Degradation[]
  onExpand: () => void
  id?: string
}) {
  const { t } = useT()
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = `${useId().replace(/[^a-zA-Z0-9_-]/g, '')}-capgaps-title`

  const reposition = useCallback(() => {
    if (anchorRef.current && panelRef.current) positionFloating(anchorRef.current, panelRef.current, { align: 'end' })
  }, [anchorRef])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
    panelRef.current?.focus({ preventScroll: true })
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onClose(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, onClose, reposition, anchorRef])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose(true)
      return
    }
    if (e.key !== 'Tab' || !panelRef.current) return
    // The popover is portalled to the end of <body>: Tab past its edges would leave the page.
    // Leaving it closes it and puts focus where the anchor's neighbours are: back on the anchor
    // (Shift+Tab), or on the control after it (Tab).
    const inside = Array.from(panelRef.current.querySelectorAll<HTMLElement>(TABBABLE))
    const active = document.activeElement
    if (e.shiftKey ? active === panelRef.current || active === inside[0] : inside.length === 0 || active === inside[inside.length - 1]) {
      e.preventDefault()
      if (e.shiftKey) onClose(true)
      else {
        const next = nextTabbable(anchorRef.current)
        onClose(!next)
        next?.focus()
      }
    }
  }

  // Focus that leaves by other means (a click elsewhere, another window): it closes, focus stays where it went.
  const onBlur = (e: FocusEvent) => {
    const next = e.relatedTarget as Node | null
    if (panelRef.current?.contains(next) || anchorRef.current?.contains(next)) return
    onClose(false)
  }

  if (!open) return null
  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="capability-gaps-popover"
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      className={`fixed z-[60] w-[min(24rem,calc(100vw-16px))] overflow-y-auto rounded-lg border border-amber-500/25 ${panelGlass.warning} p-3 text-[11px] text-amber-200 shadow-lg outline-none ui-pop-in`}
      style={{ top: 0, left: 0 }}
    >
      <EngineGapsDetail items={items} titleId={titleId} />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          data-testid="capability-gaps-expand"
          onClick={() => {
            onClose(false)
            onExpand()
          }}
          className={`${glassButton.ghost} ${glassFlat} min-h-9 pointer-coarse:min-h-11 gap-1.5 px-2.5 text-xs text-amber-100`}
        >
          <PanelBottomOpen className="w-3.5 h-3.5" aria-hidden="true" />
          {t('session.degradation.expand')}
        </button>
      </div>
    </div>,
    document.body,
  )
}

/**
 * The capability banner, put away (desktop): an amber warning icon in the chat header with the
 * number of missing features next to it (said in words to assistive tech and in the tooltip —
 * never by colour alone). It opens `CapabilityGapsPopover`. On a phone the header has no room for
 * it: the ⋯ menu button carries the amber count instead (see ChatPanel).
 */
export function CapabilityGapsButton({
  items,
  onExpand,
  triggerRef: outerRef,
}: {
  items: readonly Degradation[]
  onExpand: () => void
  /** The icon itself, for whoever must move focus to it (the banner that was just put away). */
  triggerRef?: RefObject<HTMLButtonElement | null>
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const ownRef = useRef<HTMLButtonElement>(null)
  const triggerRef = outerRef ?? ownRef
  const panelId = `capgaps-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const label = t('session.degradation.collapsedLabel', { count: items.length })

  const close = useCallback((focusTrigger: boolean) => {
    setOpen(false)
    if (focusTrigger) triggerRef.current?.focus()
  }, [triggerRef])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="capability-gaps-button"
        onClick={() => (open ? close(false) : setOpen(true))}
        className={`${iconButton('ghost', 'h-9 md:h-8 pointer-coarse:h-11 min-w-9 md:min-w-8 pointer-coarse:min-w-11 w-auto px-1.5')} ${glassFlat} gap-0.5 text-amber-400 hover:text-amber-300`}
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        <TriangleAlert className="w-4 h-4" aria-hidden="true" />
        <span className="text-[11px] font-semibold tabular-nums" aria-hidden="true">{items.length}</span>
      </button>
      <CapabilityGapsPopover open={open} onClose={close} anchorRef={triggerRef} items={items} onExpand={onExpand} id={panelId} />
    </>
  )
}
