import { useEffect, useState, type ReactNode } from 'react'
import { useAtom } from 'jotai'
import { atom } from 'jotai'
import { ChevronDown } from 'lucide-react'
import { useT } from '@/i18n'
import { graphFloat, graphControl } from './graphSurface'

/**
 * One floating control panel around the graph, with a collapsible header.
 *
 * - Desktop: open by default (per-panel `useState`), each panel folds on its own.
 * - Mobile (< 768 px): collapsed by default, ONE panel open at a time through a
 *   shared atom, all closed = the canvas is fully visible.
 *
 * The surface is the graph recipe (`graphSurface.ts`) and the PO tokens, never a
 * Tailwind grey.
 */

/** Which panel is open on mobile — a single slot, so opening one closes the others. */
const mobileOpenPanelAtom = atom<string | null>(null)

/** Reactive `min-width: 768px` check. jsdom has no `matchMedia`, so default to desktop. */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return !window.matchMedia('(min-width: 768px)').matches
  })
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(min-width: 768px)')
    const onChange = (e: MediaQueryListEvent) => setIsMobile(!e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return isMobile
}

interface GraphPanelProps {
  /** Unique id across every panel of the graph (drives the mobile single-open slot). */
  id: string
  /** Header label, already translated by the caller. */
  title: string
  /** Optional leading icon, already rendered by the caller. */
  icon?: ReactNode
  /** Positioning / width classes for the outer surface (e.g. `absolute bottom-3 left-3 z-40`). */
  className?: string
  /** Open by default on desktop. */
  defaultOpen?: boolean
  children: ReactNode
}

export function GraphPanel({ id, title, icon, className, defaultOpen = false, children }: GraphPanelProps) {
  const { t } = useT()
  const isMobile = useIsMobile()
  const [mobileOpenId, setMobileOpenId] = useAtom(mobileOpenPanelAtom)
  const [desktopOpen, setDesktopOpen] = useState(defaultOpen)

  const open = isMobile ? mobileOpenId === id : desktopOpen
  const bodyId = `graph-panel-${id}-body`

  const toggle = () => {
    if (isMobile) setMobileOpenId((cur) => (cur === id ? null : id))
    else setDesktopOpen((v) => !v)
  }

  const foldLabel = open ? t('intelPage.graph.panels.collapse') : t('intelPage.graph.panels.expand')

  return (
    <div className={`${graphFloat} shadow-[var(--shadow-md)] overflow-hidden ${className ?? ''}`}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={bodyId}
        title={foldLabel}
        className={`${graphControl} flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)]`}
      >
        {icon}
        <span className="flex-1 truncate text-left">{title}</span>
        <ChevronDown
          size={12}
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div id={bodyId} className="border-t border-border-subtle">
          {children}
        </div>
      )}
    </div>
  )
}
