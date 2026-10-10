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
  const all = Array.from(document.querySelectorAll<HTMLElement>(TABBABLE)).filter((n) => !n.closest('[role="dialog"][data-testid="capability-gaps-popover"]'))
  const i = all.indexOf(el)
  return i >= 0 ? (all[i + 1] ?? null) : null
}

/**
 * The capability banner, put away: an amber warning icon in the chat header with the number of
 * missing features next to it (said in words to assistive tech and in the tooltip — never by
 * colour alone). It opens the same list in a popover anchored to it; Escape or Shift+Tab out closes
 * it with focus back on the icon, Tab out closes it with focus on the next control, a tap outside
 * closes it. "Show above the message box" puts the banner
 * back in place.
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
  const panelRef = useRef<HTMLDivElement>(null)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const panelId = `capgaps-${uid}`
  const titleId = `capgaps-title-${uid}`
  const label = t('session.degradation.collapsedLabel', { count: items.length })

  const close = useCallback((focusTrigger: boolean) => {
    setOpen(false)
    if (focusTrigger) triggerRef.current?.focus()
  }, [triggerRef])

  const reposition = useCallback(() => {
    if (triggerRef.current && panelRef.current) positionFloating(triggerRef.current, panelRef.current, { align: 'end' })
  }, [triggerRef])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
    panelRef.current?.focus({ preventScroll: true })
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, close, reposition, triggerRef])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
      return
    }
    if (e.key !== 'Tab' || !panelRef.current) return
    // The popover is portalled to the end of <body>: Tab past its edges would leave the page.
    // Leaving it closes it and puts focus where the icon's neighbours are: back on the icon
    // (Shift+Tab), or on the control after the icon (Tab).
    const inside = Array.from(panelRef.current.querySelectorAll<HTMLElement>(TABBABLE))
    const active = document.activeElement
    if (e.shiftKey ? active === panelRef.current || active === inside[0] : inside.length === 0 || active === inside[inside.length - 1]) {
      e.preventDefault()
      setOpen(false)
      if (e.shiftKey) triggerRef.current?.focus()
      else (nextTabbable(triggerRef.current) ?? triggerRef.current)?.focus()
    }
  }

  // Focus that leaves by other means (a click elsewhere, another window): it closes, focus stays where it went.
  const onBlur = (e: FocusEvent) => {
    const next = e.relatedTarget as Node | null
    if (panelRef.current?.contains(next) || triggerRef.current?.contains(next)) return
    close(false)
  }

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
      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
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
                  setOpen(false)
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
        )}
    </>
  )
}
