/**
 * The anchors of the conversation on screen, under the chat header: each one a
 * link to its entity, its role and its state in words, and (except the origin)
 * a menu to make it a focus / a mention or to remove it.
 *
 * Folded by default (one line: "Context anchors 3"). Absent when the
 * conversation has none, and when the server has no anchors routes: a chat on
 * an older server looks exactly as before.
 *
 * A change refused because the set moved elsewhere (409) shows the CURRENT
 * anchors and says so in the live region: nothing is re-sent over them.
 */
import { useContext, useId, useState } from 'react'
import { Link, useInRouterContext, useParams } from 'react-router-dom'
import { ChevronRight, Crosshair, Anchor as AnchorIcon, AtSign, Trash2 } from 'lucide-react'
import { useT } from '@/i18n'
import { OverflowMenu } from '@/components/ui/OverflowMenu'
import { Button } from '@/components/ui/Button'
import { focusRing } from '@/components/ui/classes'
import { ChromeWorkspaceSlugContext } from '@/hooks/useWorkspace'
import { refKindDef } from '@/refs/registry'
import { useSessionAnchors } from '@/hooks/useAnchors'
import { MAX_FOCUS_ANCHORS, type Anchor } from '@/services/anchors'
import { AnchorStateText } from './anchorDisplay'
import { anchorName, anchorPath } from './anchorNames'
import { useAnchorNoticeText } from './anchorNotice'

const ROLE_ORDER = { origin: 0, focus: 1, mention: 2 } as const
const mainRole = (a: Anchor) => [...a.roles].sort((x, y) => ROLE_ORDER[x] - ROLE_ORDER[y])[0]

function AnchorRow({ anchor, slug, inRouter, busy, focusCount, onPromote, onDemote, onRemove }: {
  anchor: Anchor
  slug: string | null
  inRouter: boolean
  busy: boolean
  focusCount: number
  onPromote: () => void
  onDemote: () => void
  onRemove: () => void
}) {
  const { t } = useT()
  const def = refKindDef(anchor.target_type)
  const name = anchorName(anchor)
  const to = anchor.state === 'dangling' ? null : anchorPath(slug, anchor)
  const isOrigin = anchor.roles.includes('origin')
  const isFocus = anchor.roles.includes('focus')
  const role = mainRole(anchor)
  const RoleIcon = role === 'focus' ? Crosshair : role === 'origin' ? AnchorIcon : AtSign

  const label = (
    <>
      <def.Icon className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
      <span className="sr-only">{def.name}: </span>
      <span className={`truncate ${anchor.state === 'dangling' ? 'line-through' : ''}`}>{name}</span>
    </>
  )
  const linkClass = `inline-flex min-h-11 md:min-h-6 min-w-0 items-center gap-1.5 rounded text-sm text-gray-200 hover:text-white ${focusRing}`

  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 py-0.5" data-testid="session-anchor" data-anchor-id={anchor.id}>
      {to ? (
        inRouter ? (
          <Link to={to} className={linkClass} title={name}>
            {label}
          </Link>
        ) : (
          <a href={to} className={linkClass} title={name}>
            {label}
          </a>
        )
      ) : (
        <span className="inline-flex min-h-6 min-w-0 items-center gap-1.5 text-sm text-gray-300" title={name}>
          {label}
        </span>
      )}
      <span className="inline-flex items-center gap-1 text-xs text-gray-400" title={t(`anchors.by.${anchor.by}`)}>
        <RoleIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
        {anchor.roles.map((r) => t(`anchors.role.${r}`)).join(' · ')}
        <span className="sr-only">, {t(`anchors.by.${anchor.by}`)}</span>
      </span>
      <AnchorStateText state={anchor.state} className="text-xs" />
      <span className="ms-auto">
        {isOrigin ? (
          <span className="text-[11px] text-gray-500">{t('anchors.bar.originFixed')}</span>
        ) : (
          <OverflowMenu
            size="sm"
            label={t('anchors.bar.actions', { name })}
            actions={[
              { label: t('anchors.bar.makeFocus'), icon: Crosshair, onClick: onPromote, hidden: isFocus, disabled: busy || focusCount >= MAX_FOCUS_ANCHORS },
              { label: t('anchors.bar.makeMention'), icon: AtSign, onClick: onDemote, hidden: !isFocus, disabled: busy },
              { label: t('anchors.bar.remove'), icon: Trash2, variant: 'danger', onClick: onRemove, disabled: busy },
            ]}
          />
        )}
      </span>
    </li>
  )
}

export function SessionAnchorsBar({ sessionId }: { sessionId: string | null }) {
  const { t } = useT()
  const anchors = useSessionAnchors(sessionId)
  const noticeText = useAnchorNoticeText()
  const [open, setOpen] = useState(false)
  const listId = useId()
  const { slug: paramSlug } = useParams<{ slug: string }>()
  const chromeSlug = useContext(ChromeWorkspaceSlugContext)
  const inRouter = useInRouterContext()
  const slug = paramSlug ?? chromeSlug

  const list = anchors.set?.anchors ?? []
  const message = noticeText(anchors.notice)
  // Nothing to say: no session, no route on this server, still reading, or no anchor at all.
  if (!sessionId || anchors.status === 'unavailable' || anchors.status === 'idle') return null
  if (anchors.status === 'loading' && list.length === 0) return null
  if (anchors.status === 'error' && list.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-1.5 text-xs text-amber-300" role="status">
        {t('anchors.bar.loadFailed')}
        <Button size="sm" variant="ghost" onClick={anchors.reload}>
          {t('anchors.bar.retry')}
        </Button>
      </div>
    )
  }
  if (list.length === 0 && !message) return null

  const focusCount = list.filter((a) => a.roles.includes('focus')).length
  const sorted = [...list].sort((a, b) => ROLE_ORDER[mainRole(a)] - ROLE_ORDER[mainRole(b)])

  return (
    <div className="border-b border-white/[0.06] px-4 py-1" data-testid="session-anchors">
      {list.length > 0 && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex min-h-11 md:min-h-7 items-center gap-1.5 rounded text-xs text-gray-400 hover:text-gray-200 ${focusRing}`}
        >
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
          <span>{t('anchors.bar.title')}</span>
          <span className="tabular-nums text-gray-500" aria-hidden="true">{list.length}</span>
          <span className="sr-only">{t('anchors.bar.count', { count: list.length })}</span>
        </button>
      )}
      {open && list.length > 0 && (
        <ul id={listId} className="pb-1" aria-label={t('anchors.bar.title')}>
          {sorted.map((a) => (
            <AnchorRow
              key={a.id}
              anchor={a}
              slug={slug}
              inRouter={inRouter}
              busy={anchors.pending}
              focusCount={focusCount}
              onPromote={() => void anchors.promote(a)}
              onDemote={() => void anchors.demote(a)}
              onRemove={() => void anchors.remove(a)}
            />
          ))}
        </ul>
      )}
      <p className={message ? `pb-1 text-xs ${anchors.notice?.kind === 'done' ? 'text-gray-400' : 'text-amber-300'}` : 'sr-only'} role="status" aria-live="polite" data-testid="anchors-notice">
        {message}
      </p>
    </div>
  )
}
