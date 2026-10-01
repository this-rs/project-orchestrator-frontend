import { useCallback, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ConfirmDialog, EntityRow, ListGroup } from '@/components/ui'
import { RelativeTime } from '@/components/ui/MetaLine'
import { focusRing } from '@/components/ui/classes'
import { useToast } from '@/hooks/useToast'
import { api } from '@/services/api'
import { attentionApi, type Verdict } from '@/services/attention'
import { notesApi } from '@/services/notes'
import type { ThinkingItem, ThinkingKind } from '@/types/attention'
import { workspacePath } from '@/utils/paths'

/**
 * Band 4 of the Today cockpit: the thinking threads. Nobody is blocked here — this is
 * where you DECIDE, not where you execute. It is the least urgent band and looks it:
 * last on the page, dense, collapsible, a quiet counter. It is never hidden for good,
 * though: an undecided RFC silently blocks a future plan.
 *
 * - Existing primitives only (`EntityRow` + `ListGroup`).
 * - One main action per nature, in place: RFC accept / reject, decision accept,
 *   note confirm / invalidate, alert acknowledge. "Read" = the row title, which opens
 *   the item.
 * - Optimistic: the row leaves at once and comes back with an error toast if the call
 *   fails. Only rejecting an RFC asks for confirmation (hard to undo).
 * - The collapsed state is remembered in localStorage (guarded: it can throw).
 */

const THINKING_COLLAPSED_KEY = 'today.thinking.collapsed'

/** Reason recorded when a note is invalidated from the cockpit (the API requires one). */
const INVALIDATE_REASON = 'Invalidated from Today'
/** Who acknowledges an alert from the cockpit (the API requires one). */
const ACKNOWLEDGED_BY = 'today'

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(THINKING_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}
function writeCollapsed(v: boolean) {
  try {
    window.localStorage.setItem(THINKING_COLLAPSED_KEY, v ? '1' : '0')
  } catch {
    /* storage unavailable: the band still works, it just forgets */
  }
}

const GROUPS: { kind: ThinkingKind; title: string; noun: string }[] = [
  { kind: 'rfc', title: 'RFC', noun: 'RFC' },
  { kind: 'decision', title: 'Decisions', noun: 'decision' },
  { kind: 'note_review', title: 'Notes to review', noun: 'note' },
  { kind: 'alert', title: 'Alerts', noun: 'alert' },
]

/** Page of the item, relative to its lane; null when it has none (or no lane). */
function thinkingHref(item: ThinkingItem): string | null {
  if (!item.workspace) return null
  const seg = item.kind === 'rfc' ? 'rfcs' : item.kind === 'decision' ? 'decisions' : item.kind === 'note_review' ? 'notes' : null
  return seg ? workspacePath(item.workspace, `/${seg}/${item.id}`) : null
}

type Act = 'accept' | 'reject' | 'confirm' | 'invalidate' | 'acknowledge'

const DONE_TOAST: Record<Act, string> = {
  accept: 'Accepted',
  reject: 'Rejected',
  confirm: 'Note confirmed',
  invalidate: 'Note invalidated',
  acknowledge: 'Alert acknowledged',
}

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

const actionBtn =
  'inline-flex items-center justify-center min-h-9 px-3 rounded-lg text-xs font-medium border border-white/[0.08] bg-white/[0.04] text-gray-200 hover:bg-white/[0.08] active:bg-white/[0.1]'

export interface ThinkingListProps {
  items: ThinkingItem[]
  /** Called after a successful action (typically `refresh`). */
  onChanged?: () => void
  /** Label of the band (the page names it in its own language). */
  title?: string
  /** Outer spacing; the page lays the band out itself. */
  className?: string
}

export function ThinkingList({ items, onChanged, title = 'Threads of thought', className = 'mt-8' }: ThinkingListProps) {
  const toast = useToast()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  // Optimistic overlay: rows gone locally until the server settles.
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set())
  const [rejecting, setRejecting] = useState<ThinkingItem | null>(null)

  const toggle = () =>
    setCollapsed((c) => {
      writeCollapsed(!c)
      return !c
    })

  const perform = useCallback(
    async (item: ThinkingItem, act: Act) => {
      setGone((s) => new Set(s).add(item.id))
      try {
        await call(item, act)
        toast.success(DONE_TOAST[act])
        onChanged?.()
      } catch (err) {
        setGone((s) => {
          const n = new Set(s)
          n.delete(item.id)
          return n
        })
        toast.error(`Not saved${err instanceof Error && err.message ? `: ${err.message}` : ''}`)
      }
    },
    [toast, onChanged],
  )

  const visible = items.filter((i) => !gone.has(i.id))
  const bodyId = 'today-thinking-body'

  const actionsFor = (item: ThinkingItem) => {
    const label = (verb: string) => `${verb} ${item.title}`
    const btn = (act: Act, text: string, onClick: () => void) => (
      <button key={act} type="button" className={`${actionBtn} ${focusRing}`} aria-label={label(text)} onClick={onClick}>
        {text}
      </button>
    )
    switch (item.kind) {
      case 'rfc':
        return [btn('accept', 'Accept', () => void perform(item, 'accept')), btn('reject', 'Reject', () => setRejecting(item))]
      case 'decision':
        return [btn('accept', 'Accept', () => void perform(item, 'accept'))]
      case 'note_review':
        return [
          btn('confirm', 'Confirm', () => void perform(item, 'confirm')),
          btn('invalidate', 'Invalidate', () => void perform(item, 'invalidate')),
        ]
      case 'alert':
        return [btn('acknowledge', 'Acknowledge', () => void perform(item, 'acknowledge'))]
    }
  }

  return (
    <section aria-label={title} data-band="thinking" className={className}>
      <h2 id="today-thinking-title" className="text-xs font-medium text-gray-500">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          className={`inline-flex items-center gap-1.5 min-h-9 -mx-1 px-1 rounded hover:text-gray-300 ${focusRing}`}
        >
          <ChevronRight className={`w-3 h-3 shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`} aria-hidden="true" />
          <span>{title}</span>
          <span className="tabular-nums font-normal text-gray-600">{visible.length}</span>
        </button>
      </h2>

      <div id={bodyId} hidden={collapsed}>
        {visible.length === 0 ? (
          <p className="px-1 py-2 text-xs text-gray-500">Nothing to decide.</p>
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
        title="Reject this RFC?"
        description={rejecting ? `"${rejecting.title}" will be rejected. This is hard to undo.` : undefined}
        confirmLabel="Reject"
        cancelLabel="Cancel"
        variant="danger"
      />
    </section>
  )
}
