/**
 * Where the chat shows its timeline (the toggle next to Auto-continue).
 *
 * - Desktop (≥ md, the breakpoint of the chat itself): a side panel next to the
 *   conversation. Non-modal — the transcript and the composer stay usable.
 *   In the docked chat it sits against the chat panel's left edge; in the
 *   full-screen chat it is a right-hand column, like the assistant tree.
 * - Phone: a full-screen view (100dvh, safe areas). Modal (useModalFocus): focus
 *   moves to its close control and Tab stays inside, the page behind is inert and
 *   does not scroll, Escape closes, and focus goes back to what opened it.
 *
 * Both carry a link to the dedicated page (`/chat/:id/timeline`).
 */
import { useCallback, useEffect, useId, useRef, useState, type ComponentProps, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { ChartNoAxesGantt, Maximize2, X } from 'lucide-react'
import { useIsMobile } from '@/hooks'
import { useModalFocus, useRestoreFocus } from '@/hooks/useModalFocus'
import { useT } from '@/i18n'
import { focusRing, glassFlat, iconButton } from '@/components/ui/classes'
import { workspacePath } from '@/utils/paths'
import { ChatTimelineStrip } from './ChatTimelineStrip'
import { CHAT_COLUMN_WIDTH } from './timelineRoom'

type StripProps = Omit<ComponentProps<typeof ChatTimelineStrip>, 'maxRowsHeight' | 'onShown'>

export interface ChatTimelinePanelProps extends StripProps {
  onClose: () => void
  /** Desktop only: `docked` beside the docked chat panel, `column` inside the full-screen chat. */
  placement: 'docked' | 'column'
  /** Width of the docked chat panel (px): the side panel opens against its left edge. */
  dockOffset?: number
}

/** Same width as the other side panels of the chat (assistant tree, the chat panel's minimum width). */
const SIDE_WIDTH = CHAT_COLUMN_WIDTH.className
const SIDE_WIDTH_PX = CHAT_COLUMN_WIDTH.px
/** The docked chat's resize handle (`w-1` on its left edge): an overlay starts right of it. */
const RESIZE_HANDLE_PX = 4

/** The viewport, following resizes, rotations and the on-screen keyboard (visualViewport). */
function readViewport() {
  return { width: window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight }
}
function useViewport() {
  const [size, setSize] = useState(readViewport)
  useEffect(() => {
    const update = () => setSize(readViewport())
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [])
  return size
}

export function ChatTimelinePanel({ onClose, placement, dockOffset = 0, ...strip }: ChatTimelinePanelProps) {
  const isMobile = useIsMobile()
  return isMobile
    ? <FullScreenTimeline onClose={onClose} {...strip} />
    : <SideTimeline onClose={onClose} placement={placement} dockOffset={dockOffset} {...strip} />
}

function Header({ titleId, sessionId, workspaceSlug, onClose, mobile }: { titleId: string; sessionId: string | null; workspaceSlug?: string | null; onClose: () => void; mobile: boolean }) {
  const { t } = useT()
  // 44 px targets on a phone, the chat chrome's 32 px on desktop.
  const control = `${iconButton('ghost', mobile ? 'size-11' : 'size-8')} ${glassFlat} shrink-0 text-gray-400`
  return (
    <div className={`flex shrink-0 items-center gap-2 border-b border-white/[0.06] ${mobile ? 'h-14 px-2' : 'h-14 px-3'}`}>
      <ChartNoAxesGantt className="size-4 shrink-0 text-gray-500" aria-hidden="true" />
      <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-medium text-gray-200">{t('session.timeline.title')}</h2>
      {sessionId && workspaceSlug && (
        <Link
          to={workspacePath(workspaceSlug, `/chat/${sessionId}/timeline`)}
          className={`${control} ${focusRing}`}
          title={t('session.timeline.openPage')}
          aria-label={t('session.timeline.openPage')}
        >
          <Maximize2 className="size-4" aria-hidden="true" />
        </Link>
      )}
      <HeaderClose onClose={onClose} className={control} />
    </div>
  )
}

function HeaderClose({ onClose, className }: { onClose: () => void; className: string }) {
  const { t } = useT()
  return (
    <button type="button" onClick={onClose} className={className} title={t('session.timeline.hide')} aria-label={t('session.timeline.hide')} data-timeline-close>
      <X className="size-4" aria-hidden="true" />
    </button>
  )
}

/**
 * Desktop, 20rem wide:
 * - `column`: a column of the full-screen chat (which hides its sidebar, or the
 *   assistant tree, when room is short: see `timelineRoom`);
 * - `dock`: against the docked chat's left edge, when the window has room for it;
 * - `overlay-chat`: otherwise (a chat resized to nearly the whole window), over the
 *   chat, just right of its resize handle so the chat can still be narrowed back.
 * Escape closes it while the focus is inside (a detail sheet closes first).
 */
function SideTimeline({ onClose, placement, dockOffset, ...strip }: StripProps & { onClose: () => void; placement: 'docked' | 'column'; dockOffset: number }) {
  const ref = useRef<HTMLElement>(null)
  const titleId = useId()
  useRestoreFocus(ref)
  const { width } = useViewport()
  const free = Math.max(0, width - dockOffset)
  const layout: 'dock' | 'column' | 'overlay-chat' = placement === 'column'
    ? 'column'
    : free >= SIDE_WIDTH_PX ? 'dock' : 'overlay-chat'
  // The transform makes the panel the containing block of the trace's detail sheet
  // (`position: fixed`): it opens over the panel, not across the whole window.
  const className = {
    dock: `fixed top-0 bottom-0 z-30 border-l border-border-subtle bg-surface-raised shadow-2xl`,
    'overlay-chat': `fixed top-0 bottom-0 z-40 max-w-full border-x border-border-subtle bg-surface-raised shadow-2xl`,
    column: `shrink-0 border-l border-white/[0.06]`,
  }[layout]
  const style = layout === 'dock'
    ? { right: dockOffset }
    : layout === 'overlay-chat'
      ? { left: Math.min(free + RESIZE_HANDLE_PX, Math.max(0, width - SIDE_WIDTH_PX)) }
      : undefined
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Escape' || ref.current?.querySelector('[data-testid="trace-sheet"]')) return
    onClose()
  }
  return (
    <aside
      ref={ref}
      aria-labelledby={titleId}
      data-testid="chat-timeline-panel"
      data-variant="side"
      data-layout={layout}
      className={`flex ${SIDE_WIDTH} flex-col [transform:translateZ(0)] ${className}`}
      style={style}
      onKeyDown={onKeyDown}
    >
      <Header titleId={titleId} sessionId={strip.sessionId} workspaceSlug={strip.workspaceSlug} onClose={onClose} mobile={false} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-1">
        <ChatTimelineStrip {...strip} maxRowsHeight={420} />
      </div>
    </aside>
  )
}

function FullScreenTimeline({ onClose, ...strip }: StripProps & { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // Focus into the view (its close control), Tab kept inside, the page behind inert,
  // focus back to the toggle on close.
  useModalFocus(ref, { initialFocus: () => ref.current?.querySelector<HTMLElement>('[data-timeline-close]') })

  // Escape closes — the detail sheet first, when one is open (it handles its own Escape).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || ref.current?.querySelector('[data-testid="trace-sheet"]')) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // The page behind does not scroll.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  // Leaving for another page (the full timeline, a plan) closes the view. Only the path counts:
  // the chat rewrites its own query (`?session=…&chat=…`, with replace) while it is open.
  const { pathname } = useLocation()
  const first = useRef(pathname)
  useEffect(() => {
    if (pathname !== first.current) onClose()
  }, [pathname, onClose])

  // Rows get what the screen has left under the header (the detail opens below them);
  // follows rotations and the on-screen keyboard.
  const { height } = useViewport()
  const rowsHeight = Math.max(240, Math.round(height * 0.55))
  const shown = useCallback(() => onClose(), [onClose])

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="chat-timeline-panel"
      data-variant="fullscreen"
      className="fixed inset-0 z-50 flex h-dvh w-full flex-col overflow-hidden bg-surface-raised pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
    >
      <Header titleId={titleId} sessionId={strip.sessionId} workspaceSlug={strip.workspaceSlug} onClose={onClose} mobile />
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-1">
        <ChatTimelineStrip {...strip} maxRowsHeight={rowsHeight} onShown={shown} />
      </div>
    </div>,
    document.body,
  )
}
