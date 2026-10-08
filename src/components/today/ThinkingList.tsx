import { useCallback, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button, ConfirmDialog, EntityRow, ListGroup } from '@/components/ui'
import { RelativeTime } from '@/components/ui/MetaLine'
import { focusRing } from '@/components/ui/classes'
import { useToast } from '@/hooks/useToast'
import { api } from '@/services/api'
import { attentionApi, type Verdict } from '@/services/attention'
import { notesApi } from '@/services/notes'
import type { ThinkingItem, ThinkingKind } from '@/types/attention'
import { workspacePath } from '@/utils/paths'
import { TEXT } from './text'

const T = TEXT.thinking

/**
 * Section "To read" of Today: proposals, decisions, notes to re-read, alerts. Nobody is blocked here — this is
 * where you DECIDE, not where you execute. It is the least urgent section and looks it:
 * last on the page, dense, FOLDED by default, a quiet counter. It is never hidden for good,
 * though: an undecided proposal silently blocks a future plan.
 *
 * - Existing primitives only (`EntityRow` + `ListGroup`).
 * - One main action per nature, in place: proposal accept / reject, decision accept,
 *   note confirm / invalidate, alert acknowledge. "Read" = the row title, which opens
 *   the item. The buttons repeat per row: glass without blur (`flat`).
 * - Optimistic: the row leaves at once and comes back with an error toast if the call
 *   fails. Only rejecting a proposal asks for confirmation (hard to undo).
 * - The folded state is remembered in localStorage (guarded: it can throw); folded when nothing is stored.
 */

const THINKING_COLLAPSED_KEY = 'today.thinking.collapsed'

/** Reason recorded when a note is invalidated from Today (the API requires one). */
const INVALIDATE_REASON = 'Invalidated from Today' // stored data, sent to the API as is
/** Who acknowledges an alert from Today (the API requires one). */
const ACKNOWLEDGED_BY = 'today'

/** Folded by default: nothing here blocks anyone. Only an explicit "open" is remembered as open. */
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(THINKING_COLLAPSED_KEY) !== '0'
  } catch {
    return true
  }
}
function writeCollapsed(v: boolean) {
  try {
    window.localStorage.setItem(THINKING_COLLAPSED_KEY, v ? '1' : '0')
  } catch {
    /* storage unavailable: the band still works, it just forgets */
  }
}

/** Folded state of the section, remembered; shared with the page so a header counter can open it. */
export function useThinkingCollapsed() {
  const [collapsed, setCollapsedState] = useState(readCollapsed)
  const setCollapsed = useCallback((v: boolean) => {
    writeCollapsed(v)
    setCollapsedState(v)
  }, [])
  return { collapsed, setCollapsed }
}

const GROUPS: { kind: ThinkingKind; title: string }[] = (['rfc', 'decision', 'note_review', 'alert'] as const).map((kind) => ({
  kind,
  title: T.groups[kind],
}))

/** Page of the item, relative to its lane; null when it has none (or no lane). */
function thinkingHref(item: ThinkingItem): string | null {
  if (!item.workspace) return null
  const seg = item.kind === 'rfc' ? 'rfcs' : item.kind === 'decision' ? 'decisions' : item.kind === 'note_review' ? 'notes' : null
  return seg ? workspacePath(item.workspace, `/${seg}/${item.id}`) : null
}

type Act = 'accept' | 'reject' | 'confirm' | 'invalidate' | 'acknowledge'

const DONE_TOAST: Record<Act, string> = T.done

function call(item: ThinkingItem, act: Act): Promise<unknown> {
  switch (act) {
    case 'accept':
    case 'reject':
      return attentionApi.decide(item.kind as 'rfc' | 'decision', item.id, act as Verdict)
    case 'confirm':
      return notesApi.confirm(item.id)
    case 'invalidate':
      return notesApi.invalidate(item.id, INVALIDATE_REASON)
    case 'acknowledge':
      return api.post(`/alerts/${item.id}/acknowledge`, { acknowledged_by: ACKNOWLEDGED_BY })
  }
}

export interface ThinkingListProps {
  items: ThinkingItem[]
  /** Called after a successful action (typically `refresh`). */
  onChanged?: () => void
  /** Label of the section. */
  title?: string
  /** Controlled fold state (the page owns it); omitted = the list keeps its own. */
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  /** Outer spacing; the page lays the band out itself. */
  className?: string
}

export function ThinkingList({
  items,
  onChanged,
  title = TEXT.bands.thinking.title,
  collapsed: collapsedProp,
  onCollapsedChange,
  className = 'mt-8',
}: ThinkingListProps) {
  const toast = useToast()
  const own = useThinkingCollapsed()
  const collapsed = collapsedProp ?? own.collapsed
  const setCollapsed = onCollapsedChange ?? own.setCollapsed
  // Optimistic overlay: rows gone locally until the server settles.
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set())
  const [rejecting, setRejecting] = useState<ThinkingItem | null>(null)

  const toggle = () => setCollapsed(!collapsed)

  const perform = useCallback(
    async (item: ThinkingItem, act: Act) => {
      setGone((s) => new Set(s).add(item.id))
      try {
        await call(item, act)
        toast.success(`${DONE_TOAST[act]}: ${item.title}`)
        onChanged?.()
      } catch (err) {
        setGone((s) => {
          const n = new Set(s)
          n.delete(item.id)
          return n
        })
        toast.error(T.notSaved(err instanceof Error && err.message ? err.message : null))
      }
    },
    [toast, onChanged],
  )

  const visible = items.filter((i) => !gone.has(i.id))
  const bodyId = 'today-thinking-body'

  const actionsFor = (item: ThinkingItem) => {
    const label = (verb: string) => `${verb} ${item.title}`
    const btn = (act: Act, text: string, onClick: () => void) => (
      <Button key={act} variant="secondary" size="sm" flat aria-label={label(text)} onClick={onClick}>
        {text}
      </Button>
    )
    switch (item.kind) {
      case 'rfc':
        return [btn('accept', T.accept, () => void perform(item, 'accept')), btn('reject', T.reject, () => setRejecting(item))]
      case 'decision':
        return [btn('accept', T.accept, () => void perform(item, 'accept'))]
      case 'note_review':
        return [
          btn('confirm', T.confirm, () => void perform(item, 'confirm')),
          btn('invalidate', T.invalidate, () => void perform(item, 'invalidate')),
        ]
      case 'alert':
        return [btn('acknowledge', T.acknowledge, () => void perform(item, 'acknowledge'))]
    }
  }

  return (
    <section id="today-thinking" aria-label={title} data-band="thinking" className={`scroll-mt-4 ${className}`}>
      <h2 id="today-thinking-title" className="text-xs font-medium text-gray-400">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          className={`inline-flex items-center gap-1.5 min-h-9 -mx-1 px-1 rounded hover:text-gray-300 ${focusRing}`}
        >
          <ChevronRight className={`w-3 h-3 shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`} aria-hidden="true" />
          <span>{title}</span>
          <span className="tabular-nums font-normal text-gray-400">{visible.length}</span>
        </button>
      </h2>

      <div id={bodyId} hidden={collapsed}>
        {visible.length === 0 ? (
          <p className="px-1 py-2 text-xs text-gray-400">{T.empty}</p>
        ) : (
          GROUPS.map(({ kind, title }) => {
            const rows = visible.filter((i) => i.kind === kind)
            if (rows.length === 0) return null
            return (
              <ListGroup key={kind} title={title} count={rows.length}>
                {rows.map((item) => {
                  const href = thinkingHref(item)
                  return (
                    <EntityRow
                      key={item.id}
                      title={item.title}
                      href={href ?? undefined}
                      trailing={<RelativeTime date={item.since} />}
                      meta={[item.status.replace(/_/g, ' '), item.workspace]}
                      context={<div className="relative z-10 flex flex-wrap gap-2">{actionsFor(item)}</div>}
                    />
                  )
                })}
              </ListGroup>
            )
          })
        )}
      </div>

      <ConfirmDialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        onConfirm={() => {
          const item = rejecting
          setRejecting(null)
          if (item) void perform(item, 'reject')
        }}
        title={T.rejectTitle}
        description={rejecting ? T.rejectDescription(rejecting.title) : undefined}
        confirmLabel={T.reject}
        cancelLabel={T.cancel}
        variant="danger"
      />
    </section>
  )
}
