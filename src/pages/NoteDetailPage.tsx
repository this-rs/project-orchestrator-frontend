/**
 * Note detail — the knowledge note itself (full markdown), what it is linked
 * to, how "alive" it is (energy / staleness / activations explained in plain
 * words), the other notes reaching the same code, its history and every
 * lifecycle action. Route: /workspace/:slug/notes/:noteId
 */
import { AnchoredConversations } from '@/components/anchors/AnchoredConversations'
import { useUiContext } from '@/hooks/useUiContext'
import { createElement, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowRightLeft,
  Check,
  Copy,
  Link2,
  Pencil,
  Replace,
  StickyNote,
  Trash2,
  Unlink,
  XCircle,
} from 'lucide-react'
import { notesApi } from '@/services'
import { ApiError } from '@/services/api'
import {
  Button,
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  Facts,
  FormDialog,
  PageContainer,
  PageHeader,
  RelativeTime,
  Section,
  Select,
  Skeleton,
  SkeletonLine,
  StatusMenu,
  StatusText,
  TONE_CLASSES,
  formatAbsolute,
  inlineLink,
  surface,
  type StatusTone,
  Meter,
} from '@/components/ui'
import { MarkdownText } from '@/components/chat/MarkdownText'
import { NoteTypeLabel } from '@/components/knowledge/NoteTypeLabel'
import {
  CHANGE_LABELS,
  MEMORY_HORIZON_TEXT,
  anchorName,
  changeDetailsText,
  energyText,
  entityHref,
  entityIcon,
  entityTypeLabel,
  noteBody,
  noteTitle,
  pct,
  scopeLabel,
  stalenessText,
  type NoteDetail,
} from '@/components/knowledge/noteMeta'
import {
  useEditNoteForm,
  useInvalidateNoteForm,
  useLinkNoteEntityForm,
  useSupersedeNoteForm,
} from '@/components/forms/NoteForms'
import { useFormDialog, useToast, useWorkspaceSlug } from '@/hooks'
import { useViewTransition } from '@/hooks/useViewTransition'
import { workspacePath } from '@/utils/paths'
import type { Note, NoteAnchor, NoteImportance, NoteStatus } from '@/types'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { activeTranslator, useT } from '@/i18n'

// ── Related notes (GET /notes/context) ──────────────────────────────────

interface RelatedNote {
  note: Note
  /** 0–1 */
  score: number
  /** 0 = attached directly to the entity */
  distance: number
  via?: string
}

/** The endpoint returns `{ direct_notes, propagated_notes }`; older builds `{ items }`. Accept both. */
function normalizeContext(raw: unknown, selfId: string): RelatedNote[] {
  const out: RelatedNote[] = []
  if (!raw || typeof raw !== 'object') return out
  const r = raw as Record<string, unknown>
  const direct = Array.isArray(r.direct_notes) ? (r.direct_notes as Note[]) : []
  direct.forEach((note) => out.push({ note, score: 1, distance: 0 }))
  const propagated = Array.isArray(r.propagated_notes) ? r.propagated_notes : []
  propagated.forEach((p: Record<string, unknown>) => {
    const note = (p.note ?? p) as Note
    out.push({
      note,
      score: Number(p.relevance_score ?? 0),
      distance: Number(p.distance ?? 1),
      via: typeof p.source_entity === 'string' ? p.source_entity : undefined,
    })
  })
  if (Array.isArray(r.items)) {
    ;(r.items as (Note & { relevance_score?: number })[]).forEach((n) =>
      out.push({ note: n, score: n.relevance_score ?? 1, distance: 0 }),
    )
  }
  const seen = new Set<string>([selfId])
  return out
    .filter((x) => x.note?.id && !seen.has(x.note.id) && seen.add(x.note.id))
    .sort((a, b) => a.distance - b.distance || b.score - a.score)
}

// ── Small presentational pieces ─────────────────────────────────────────

interface Signal {
  label: string
  value: ReactNode
  explain: ReactNode
  meter?: { value: number; tone: StatusTone }
  hidden?: boolean
}

/** Label · value · plain-language explanation — readable on a phone without tooltips. */
function SignalList({ items }: { items: Signal[] }) {
  return (
    <dl className={`${surface} divide-y divide-white/[0.05]`}>
      {items
        .filter((i) => !i.hidden)
        .map((item) => (
          <div key={item.label} className="px-3 py-2.5 md:px-4 space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-gray-500">{item.label}</dt>
              <dd className="text-sm text-gray-200 tabular-nums text-right min-w-0 break-words">{item.value}</dd>
            </div>
            {item.meter && <Meter size="bar" value={item.meter.value} tone={item.meter.tone} className="max-w-40" />}
            <p className="text-xs leading-4 text-gray-500">{item.explain}</p>
          </div>
        ))}
    </dl>
  )
}

function Callout({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm ${TONE_CLASSES[tone].text}`}>
      {children}
    </div>
  )
}

function DetailSkeleton() {
  const { t } = useT()
  return (
    <PageContainer width="wide" className="space-y-6">
      <div className="space-y-3" aria-busy="true" aria-label={t('siteKnowledge.note.loadingAria')}>
        <SkeletonLine width="30%" />
        <Skeleton className="h-7 w-3/4" />
        <SkeletonLine width="55%" />
      </div>
      <div className={`${surface} p-4 space-y-2`}>
        <SkeletonLine />
        <SkeletonLine width="92%" />
        <SkeletonLine width="80%" />
        <SkeletonLine width="60%" />
      </div>
      <EntityListSkeleton rows={3} />
    </PageContainer>
  )
}

// ── Page ────────────────────────────────────────────────────────────────

export function NoteDetailPage() {
  const { noteId } = useParams<{ noteId: string }>()
  const wsSlug = useWorkspaceSlug()
  const toast = useToast()
  const { t } = useT()
  const { navigate } = useViewTransition()

  const [note, setNote] = useState<NoteDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<'not-found' | string | null>(null)

  const notesHref = workspacePath(wsSlug, '/notes')

  const load = useCallback(
    async (silent = false) => {
      if (!noteId) return
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const data = (await notesApi.get(noteId)) as NoteDetail
        setNote(data)
        setError(null)
      } catch (err) {
        if (!silent) {
          setNote(null)
          setError(err instanceof ApiError && err.status === 404 ? 'not-found' : activeTranslator().t('siteKnowledge.note.loadFailed'))
        } else {
          toast.error(activeTranslator().t('siteKnowledge.note.refreshFailed'))
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable (Jotai setter)
    [noteId],
  )

  useEffect(() => {
    load()
  }, [load])

  // ── Mutations ─────────────────────────────────────────────────────────

  const patch = async (data: Partial<{ content: string; importance: string; status: string; tags: string[] }>, msg: string) => {
    if (!note) return
    try {
      await notesApi.update(note.id, data)
      setNote((prev) => (prev ? ({ ...prev, ...data } as NoteDetail) : prev))
      toast.success(msg)
      load(true)
    } catch {
      toast.error(t('siteKnowledge.note.updateFailed'))
    }
  }

  const handleStatus = (status: NoteStatus) => patch({ status }, t('siteKnowledge.note.statusChanged', { status: status.replace('_', ' ') }))
  const handleImportance = (importance: NoteImportance) => patch({ importance }, t('siteKnowledge.note.importanceSet', { importance }))

  const handleConfirm = async () => {
    if (!note) return
    try {
      await notesApi.confirm(note.id)
      setNote((prev) => (prev ? { ...prev, status: 'active', staleness_score: 0, last_confirmed_at: new Date().toISOString() } : prev))
      toast.success(t('siteKnowledge.note.confirmed'))
      load(true)
    } catch {
      toast.error(t('siteKnowledge.note.confirmFailed'))
    }
  }

  const handleDelete = async () => {
    if (!note) return
    await notesApi.delete(note.id)
    toast.success(t('siteKnowledge.note.deleted'))
    navigate(notesHref, { type: 'back-button' })
  }

  const handleUnlink = async (anchor: NoteAnchor) => {
    if (!note) return
    await notesApi.unlinkFromEntity(note.id, anchor.entity_type, anchor.entity_id)
    setNote((prev) =>
      prev
        ? {
            ...prev,
            anchors: prev.anchors.filter((a) => !(a.entity_type === anchor.entity_type && a.entity_id === anchor.entity_id)),
          }
        : prev,
    )
    toast.success(t('siteKnowledge.note.linkRemoved'))
  }

  // ── Dialogs ───────────────────────────────────────────────────────────

  const editDialog = useFormDialog()
  const editForm = useEditNoteForm(async (data) => {
    if (!note) return
    await notesApi.update(note.id, data)
    setNote((prev) => (prev ? { ...prev, ...data } : prev))
    toast.success(t('siteKnowledge.note.updated'))
    load(true)
  })

  const invalidateDialog = useFormDialog()
  const invalidateForm = useInvalidateNoteForm(async (reason) => {
    if (!note) return
    await notesApi.invalidate(note.id, reason)
    setNote((prev) => (prev ? { ...prev, status: 'obsolete' } : prev))
    toast.success(t('siteKnowledge.note.invalidated'))
    load(true)
  })

  const supersedeDialog = useFormDialog()
  const supersedeForm = useSupersedeNoteForm(async (data) => {
    if (!note) return
    const created = (await notesApi.supersede(note.id, { project_id: note.project_id, ...data })) as Note | undefined
    toast.success(t('siteKnowledge.note.newVersion'))
    if (created?.id) navigate(workspacePath(wsSlug, `/notes/${created.id}`))
    else load(true)
  })

  const linkDialog = useFormDialog()
  const linkForm = useLinkNoteEntityForm(async (entityType, entityId) => {
    if (!note) return
    await notesApi.linkToEntity(note.id, entityType, entityId)
    toast.success(t('siteKnowledge.note.linked'))
    load(true)
  })

  const openEdit = () => {
    if (!note) return
    editForm.reset({ content: note.content, importance: note.importance, tags: note.tags ?? [] })
    editDialog.open({ title: t('siteKnowledge.note.editTitle'), size: 'lg', submitLabel: t('siteKnowledge.note.save') })
  }
  const openInvalidate = () => {
    invalidateForm.reset()
    invalidateDialog.open({ title: t('siteKnowledge.note.invalidateTitle'), submitLabel: t('siteKnowledge.note.invalidate') })
  }
  const openSupersede = () => {
    if (!note) return
    supersedeForm.reset({ note_type: note.note_type, content: note.content, importance: note.importance, tags: note.tags ?? [] })
    supersedeDialog.open({ title: t('siteKnowledge.note.supersedeTitle'), size: 'lg', submitLabel: t('siteKnowledge.note.supersedeSubmit') })
  }
  const openLink = () => {
    linkForm.reset()
    linkDialog.open({ title: t('siteKnowledge.note.linkTitle'), submitLabel: t('siteKnowledge.note.link') })
  }

  // ── Related notes via the first / selected anchor ─────────────────────

  const anchors = useMemo(() => note?.anchors ?? [], [note])
  const [anchorKey, setAnchorKey] = useState<string>('')
  const anchorOptions = anchors.map((a) => ({
    value: `${a.entity_type}::${a.entity_id}`,
    label: `${entityTypeLabel(a.entity_type)} · ${anchorName(a)}`,
  }))
  const currentAnchorKey = anchorOptions.some((o) => o.value === anchorKey) ? anchorKey : anchorOptions[0]?.value ?? ''
  const [related, setRelated] = useState<RelatedNote[] | null>(null)
  const [relatedError, setRelatedError] = useState(false)

  useEffect(() => {
    if (!note || !currentAnchorKey) {
      setRelated(null)
      return
    }
    const [type, ...rest] = currentAnchorKey.split('::')
    const id = rest.join('::')
    let cancelled = false
    setRelated(null)
    setRelatedError(false)
    notesApi
      .getContextNotes(type, id, { max_depth: 2 })
      .then((res) => {
        if (!cancelled) setRelated(normalizeContext(res, note.id))
      })
      .catch(() => {
        if (!cancelled) {
          setRelated([])
          setRelatedError(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [note?.id, currentAnchorKey]) // eslint-disable-line react-hooks/exhaustive-deps -- refetch only when the note or the anchor changes

  useUiContext('note', note?.id, note ? noteTitle(note.content) : null)

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) return <DetailSkeleton />

  if (error === 'not-found') {
    return (
      <PageContainer width="wide">
        <EmptyState
          icon={<StickyNote className="w-8 h-8 text-gray-500" />}
          title={t('siteKnowledge.note.notFound')}
          description={t('siteKnowledge.shared.notFoundHint')}
          action={
            <Link to={notesHref} className={`text-sm ${inlineLink}`}>
              {t('siteKnowledge.note.backToNotes')}
            </Link>
          }
        />
      </PageContainer>
    )
  }

  if (error || !note) {
    return (
      <PageContainer width="wide">
        <ErrorState title={t('siteKnowledge.note.loadFailedTitle')} description={error ?? undefined} onRetry={() => load()} />
      </PageContainer>
    )
  }

  const staleness = note.staleness_score ?? 0
  const energy = note.energy
  const validAnchors = anchors.filter((a) => a.is_valid !== false).length
  const changes = [...(note.changes ?? [])].sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
  const horizon = note.memory_horizon ? MEMORY_HORIZON_TEXT[note.memory_horizon] : null
  const scope = scopeLabel(note.scope)
  const needsReview = note.status === 'needs_review' || note.status === 'stale' || staleness >= 0.5
  const currentAnchor = anchors.find((a) => `${a.entity_type}::${a.entity_id}` === currentAnchorKey)
  const body = noteBody(note.content)

  const signals: Signal[] = [
    {
      label: t('siteKnowledge.note.energy'),
      hidden: energy === undefined,
      value: pct(energy),
      meter: { value: energy ?? 0, tone: (energy ?? 0) >= 0.7 ? 'success' : (energy ?? 0) >= 0.3 ? 'warning' : 'muted' },
      explain: t('siteKnowledge.note.energyExplain', { text: energyText(energy) }),
    },
    {
      label: t('siteKnowledge.note.staleness'),
      value: pct(staleness),
      meter: { value: staleness, tone: staleness < 0.3 ? 'success' : staleness < 0.6 ? 'warning' : 'danger' },
      explain: t('siteKnowledge.note.stalenessExplain', { text: stalenessText(staleness) }),
    },
    {
      label: t('siteKnowledge.note.usedBy'),
      hidden: note.activation_count === undefined,
      value: (
        <>
          {(note.activation_count ?? 0) === 1
            ? t('siteKnowledge.shared.times.one', { n: 1 })
            : t('siteKnowledge.shared.times.other', { n: note.activation_count ?? 0 })}
          {note.last_activated && (
            <span className="text-gray-500">
              {' · '}
              <RelativeTime date={note.last_activated} prefix={`${t('siteKnowledge.note.last')} `} />
            </span>
          )}
        </>
      ),
      explain:
        (note.reactivation_count ?? 0) > 0
          ? t('siteKnowledge.note.usedByReused', {
              times: (note.reactivation_count ?? 0) === 1
                ? t('siteKnowledge.shared.times.one', { n: 1 })
                : t('siteKnowledge.shared.times.other', { n: note.reactivation_count ?? 0 }),
            })
          : t('siteKnowledge.note.usedByExplain'),
    },
    {
      label: t('siteKnowledge.note.memory'),
      hidden: !horizon,
      value: horizon?.label,
      explain: horizon?.explain,
    },
    {
      label: t('siteKnowledge.note.anchors'),
      hidden: anchors.length === 0,
      value: t('siteKnowledge.note.anchorsValue', { valid: validAnchors, total: anchors.length }),
      meter: { value: anchors.length ? validAnchors / anchors.length : 0, tone: validAnchors === anchors.length ? 'success' : 'warning' },
      explain: t('siteKnowledge.note.anchorsExplain'),
    },
    {
      label: t('siteKnowledge.note.codeActivity'),
      hidden: !note.freshness_pinged_at,
      value: <RelativeTime date={note.freshness_pinged_at} />,
      explain: t('siteKnowledge.note.codeActivityExplain'),
    },
    {
      label: t('siteKnowledge.note.scar'),
      hidden: !note.scar_intensity,
      value: pct(note.scar_intensity),
      meter: { value: note.scar_intensity ?? 0, tone: 'danger' },
      explain: t('siteKnowledge.note.scarExplain', { percent: Math.round((note.scar_intensity ?? 0) * 70) }),
    },
    {
      label: t('siteKnowledge.note.assertion'),
      hidden: !note.assertion_rule,
      value: note.last_assertion_result ? (
        <StatusText status={note.last_assertion_result.passed ? 'passed' : 'failed'} />
      ) : (
        t('siteKnowledge.note.notChecked')
      ),
      explain: note.assertion_rule
        ? `${t('siteKnowledge.note.assertionExplain', {
            check: note.assertion_rule.check_type.replace(/_/g, ' '),
            target: note.assertion_rule.target,
          })}${note.last_assertion_result ? ` ${note.last_assertion_result.message}` : ''}`
        : null,
    },
  ]

  return (
    <PageContainer width="wide" className="space-y-6">
      <PageHeader
        title={noteTitle(note.content)}
        entityRef={{ kind: 'note', id: note.id }}
        parentLinks={[{ icon: StickyNote, label: NOMENCLATURE.notes.singular, name: NOMENCLATURE.notes.plural, href: notesHref }]}
        status={<StatusMenu kind="note" status={note.status} onChange={handleStatus} />}
        meta={[
          <StatusMenu
            key="importance"
            kind="importance"
            status={note.importance}
            onChange={handleImportance}
            label={t('siteKnowledge.note.importanceAria', { importance: note.importance })}
          />,
          <NoteTypeLabel key="type" type={note.note_type} className="text-gray-400" />,
          scope ? (
            <span key="scope" className="truncate max-w-[16rem]" title={scope}>
              {scope}
            </span>
          ) : null,
          <RelativeTime key="created" date={note.created_at} prefix={`${t('siteKnowledge.note.created')} `} />,
          note.last_confirmed_at ? <RelativeTime key="confirmed" date={note.last_confirmed_at} prefix={`${t('siteKnowledge.note.confirmedPrefix')} `} /> : null,
        ]}
        actions={
          <Button size="sm" variant={needsReview ? 'primary' : 'secondary'} onClick={handleConfirm}>
            <Check className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
            {t('siteKnowledge.note.confirmButton')}
          </Button>
        }
        overflowActions={[
          { label: t('siteKnowledge.shared.edit'), icon: Pencil, onClick: openEdit },
          { label: t('siteKnowledge.note.link'), icon: Link2, onClick: openLink },
          { label: t('siteKnowledge.note.supersedeAction'), icon: Replace, onClick: openSupersede, hidden: Boolean(note.superseded_by) },
          { label: t('siteKnowledge.note.invalidateAction'), icon: XCircle, onClick: openInvalidate, hidden: note.status === 'obsolete' },
          {
            label: t('siteKnowledge.shared.copyId'),
            icon: Copy,
            onClick: async () => {
              try {
                await navigator.clipboard.writeText(note.id)
                toast.success(t('siteKnowledge.note.copied'))
              } catch {
                toast.error(t('siteKnowledge.note.copyFailed'))
              }
            },
          },
          {
            label: t('siteKnowledge.shared.delete'),
            icon: Trash2,
            variant: 'danger',
            onClick: handleDelete,
            confirm: { title: t('siteKnowledge.note.deleteTitle'), description: t('siteKnowledge.note.deleteDescription') },
          },
        ]}
      >
        {(note.tags ?? []).map((tag) => (
          <span key={tag} className="rounded border border-white/[0.08] px-1.5 text-[11px] leading-5 text-gray-400">
            #{tag}
          </span>
        ))}
      </PageHeader>

      {(note.superseded_by || note.supersedes) && (
        <div className="space-y-2">
          {note.superseded_by && (
            <Callout tone="warning">
              <ArrowRightLeft className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                {t('siteKnowledge.note.newerVersion')}{' '}
                <Link to={workspacePath(wsSlug, `/notes/${note.superseded_by}`)} className="underline underline-offset-2">
                  {t('siteKnowledge.note.openNewer')}
                </Link>
              </span>
            </Callout>
          )}
          {note.supersedes && (
            <Callout tone="neutral">
              <ArrowRightLeft className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                {t('siteKnowledge.note.replacesOlder')}{' '}
                <Link to={workspacePath(wsSlug, `/notes/${note.supersedes}`)} className="underline underline-offset-2">
                  {t('siteKnowledge.note.seePrevious')}
                </Link>
              </span>
            </Callout>
          )}
        </div>
      )}

      {/* ── The note itself (the title line is already the page title) ── */}
      {body && (
        <article aria-label={t('siteKnowledge.note.contentAria')} className={`${surface} px-4 py-3`}>
          <div className="prose prose-invert prose-sm max-w-[72ch] break-words [&_pre]:overflow-x-auto [&_table]:block [&_table]:overflow-x-auto">
            <MarkdownText content={body} />
          </div>
        </article>
      )}

      {/* ── Linked entities ─────────────────────────────────────────── */}
      <Section
        title={t('siteKnowledge.note.linkedTo')}
        count={anchors.length}
        description={t('siteKnowledge.note.linkedDescription')}
        action={
          <Button size="sm" variant="ghost" onClick={openLink}>
            <Link2 className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
            {t('siteKnowledge.note.link')}
          </Button>
        }
      >
        {anchors.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<Link2 />}
            title={t('siteKnowledge.note.notLinked')}
            description={t('siteKnowledge.note.notLinkedDescription')}
          />
        ) : (
          <EntityList aria-label={t('siteKnowledge.note.linkedAria')}>
            {anchors.map((a) => {
              const name = anchorName(a)
              return (
                <EntityRow
                  key={`${a.entity_type}-${a.entity_id}`}
                  title={name}
                  href={entityHref(wsSlug, a.entity_type, a.entity_id) ?? undefined}
                  leading={createElement(entityIcon(a.entity_type), { className: 'w-4 h-4 text-gray-500', 'aria-hidden': true })}
                  description={name !== a.entity_id ? <span className="font-mono break-all">{a.entity_id}</span> : undefined}
                  trailing={a.last_verified ? <RelativeTime date={a.last_verified} prefix={`${t('siteKnowledge.note.verified')} `} /> : undefined}
                  meta={[
                    a.is_valid === false ? (
                      <StatusText key="v" status="broken" label={t('siteKnowledge.note.brokenAnchor')} />
                    ) : null,
                    entityTypeLabel(a.entity_type),
                  ]}
                  actions={[
                    {
                      label: t('siteKnowledge.note.unlink'),
                      icon: Unlink,
                      variant: 'danger',
                      onClick: () => handleUnlink(a),
                      confirm: {
                        title: t('siteKnowledge.note.unlinkTitle'),
                        description: t('siteKnowledge.note.unlinkDescription', { name }),
                        confirmLabel: t('siteKnowledge.note.unlink'),
                      },
                    },
                  ]}
                />
              )
            })}
          </EntityList>
        )}
      </Section>

      {/* ── Health, explained ───────────────────────────────────────── */}
      <Section title={t('siteKnowledge.note.health')} description={t('siteKnowledge.note.healthDescription')}>
        <SignalList items={signals} />
      </Section>

      {/* ── Related notes (propagation) ─────────────────────────────── */}
      {anchors.length > 0 && (
        <Section
          title={t('siteKnowledge.note.related')}
          count={related?.length}
          description={
            currentAnchor
              ? t('siteKnowledge.note.relatedDescription', { name: anchorName(currentAnchor) })
              : undefined
          }
          action={
            anchorOptions.length > 1 ? (
              <Select
                options={anchorOptions}
                value={currentAnchorKey}
                onChange={setAnchorKey}
                className="w-40 sm:w-56"
              />
            ) : undefined
          }
        >
          {related === null ? (
            <EntityListSkeleton rows={3} />
          ) : related.length === 0 ? (
            <EmptyState
              size="sm"
              title={relatedError ? t('siteKnowledge.note.relatedFailed') : t('siteKnowledge.note.relatedNone')}
              description={relatedError ? undefined : t('siteKnowledge.note.relatedNoneDescription')}
            />
          ) : (
            <EntityList aria-label={t('siteKnowledge.note.relatedAria')}>
              {related.slice(0, 20).map((r) => (
                <EntityRow
                  key={r.note.id}
                  title={noteTitle(r.note.content)}
                  entityRef={{ kind: 'note', id: r.note.id }}
                  href={workspacePath(wsSlug, `/notes/${r.note.id}`)}
                  trailing={r.distance === 0 ? t('siteKnowledge.note.direct') : `${Math.round(r.score * 100)}%`}
                  meta={[
                    <StatusText key="s" kind="note" status={r.note.status} />,
                    <NoteTypeLabel key="t" type={r.note.note_type} />,
                    r.via && r.distance > 0 ? (
                      <span key="via" className="truncate max-w-[14rem]" title={r.via}>
                        {t('siteKnowledge.note.via', { source: r.via.split('/').pop() ?? '' })}
                      </span>
                    ) : null,
                    r.distance === 0
                      ? t('siteKnowledge.note.attachedHere')
                      : r.distance === 1
                        ? t('siteKnowledge.note.hops.one', { n: 1 })
                        : t('siteKnowledge.note.hops.other', { n: r.distance }),
                  ]}
                />
              ))}
            </EntityList>
          )}
        </Section>
      )}

      {/* ── History ─────────────────────────────────────────────────── */}
      {changes.length > 0 && (
        <Section title={t('siteKnowledge.note.history')} count={changes.length} collapsible defaultOpen={changes.length <= 5}>
          <EntityList aria-label={t('siteKnowledge.note.historyAria')}>
            {changes.map((c, i) => (
              <EntityRow
                key={`${c.timestamp}-${i}`}
                title={CHANGE_LABELS[c.change_type] ?? c.change_type.replace(/_/g, ' ')}
                trailing={<RelativeTime date={c.timestamp} />}
                description={changeDetailsText(c.details)}
                meta={[c.actor ? t('siteKnowledge.shared.by', { who: c.actor }) : null]}
              />
            ))}
          </EntityList>
        </Section>
      )}

      <AnchoredConversations targetType="note" targetId={note.id} />

      {/* ── Details ─────────────────────────────────────────────────── */}
      <Section title={t('siteKnowledge.note.details')}>
        <Facts
          items={[
            { label: t('siteKnowledge.note.type'), value: <NoteTypeLabel type={note.note_type} /> },
            { label: t('siteKnowledge.note.createdLabel'), value: `${formatAbsolute(note.created_at)} · ${note.created_by}` },
            {
              label: t('siteKnowledge.note.lastConfirmed'),
              value: note.last_confirmed_at
                ? `${formatAbsolute(note.last_confirmed_at)}${note.last_confirmed_by ? ` · ${note.last_confirmed_by}` : ''}`
                : null,
            },
            { label: t('siteKnowledge.note.scope'), value: scope },
            {
              label: t('siteKnowledge.note.project'),
              value: note.project_id ? <span className="font-mono text-xs break-all">{note.project_id}</span> : t('siteKnowledge.note.globalProject'),
            },
            { label: t('siteKnowledge.note.idLabel'), value: <span className="font-mono text-xs break-all">{note.id}</span> },
          ]}
        />
      </Section>

      {/* ENTITY_GRAPH_SLOT entity_type="note" entity_id={note.id} */}

      <FormDialog {...editDialog.dialogProps} onSubmit={editForm.submit}>
        {editForm.fields}
      </FormDialog>
      <FormDialog {...invalidateDialog.dialogProps} onSubmit={invalidateForm.submit}>
        {invalidateForm.fields}
      </FormDialog>
      <FormDialog {...supersedeDialog.dialogProps} onSubmit={supersedeForm.submit}>
        {supersedeForm.fields}
      </FormDialog>
      <FormDialog {...linkDialog.dialogProps} onSubmit={linkForm.submit}>
        {linkForm.fields}
      </FormDialog>
    </PageContainer>
  )
}
