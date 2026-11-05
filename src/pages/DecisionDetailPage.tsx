/**
 * Decision detail — the decision (first line = title), its rationale, the
 * alternatives considered, the code it constrains, its supersession timeline
 * and lifecycle actions. Route: /workspace/:slug/decisions/:decisionId
 */
import { AnchoredConversations } from '@/components/anchors/AnchoredConversations'
import { useUiContext } from '@/hooks/useUiContext'
import { createElement, useState, useEffect, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRightLeft, CheckCircle2, Copy, Pencil, Plus, Scale, Trash2, Unlink } from 'lucide-react'
import { decisionsApi } from '@/services'
import { ApiError } from '@/services/api'
import {
  Button,
  CollapsibleMarkdown,
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
  Skeleton,
  SkeletonLine,
  StatusIcon,
  StatusMenu,
  StatusText,
  TONE_CLASSES,
  ToneText,
  formatAbsolute,
  getStatusMeta,
  inlineLink,
  surface,
} from '@/components/ui'
import { useFormDialog, useToast, useWorkspaceSlug } from '@/hooks'
import { useViewTransition } from '@/hooks/useViewTransition'
import { useDecisionAffectsForm, useEditDecisionForm } from '@/components/forms/DecisionForms'
import { decisionTitle, entityHref, entityIcon } from '@/components/knowledge/noteMeta'
import { workspacePath } from '@/utils/paths'
import type { Decision, DecisionStatus, DecisionAffects, DecisionTimelineEntry } from '@/types'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { activeTranslator, useT } from '@/i18n'

function DetailSkeleton() {
  const { t } = useT()
  return (
    <PageContainer width="wide" className="space-y-6">
      <div className="space-y-3" aria-busy="true" aria-label={t('siteKnowledge.decision.loadingAria')}>
        <SkeletonLine width="30%" />
        <Skeleton className="h-7 w-3/4" />
        <SkeletonLine width="55%" />
      </div>
      <div className={`${surface} p-4 space-y-2`}>
        <SkeletonLine />
        <SkeletonLine width="85%" />
        <SkeletonLine width="60%" />
      </div>
      <EntityListSkeleton rows={3} />
    </PageContainer>
  )
}

// ── Main page ───────────────────────────────────────────────────────────

export function DecisionDetailPage() {
  const { decisionId } = useParams<{ decisionId: string }>()
  const wsSlug = useWorkspaceSlug()
  const toast = useToast()
  const { t } = useT()
  const { navigate } = useViewTransition()
  const decisionsHref = workspacePath(wsSlug, '/decisions')

  const [decision, setDecision] = useState<Decision | null>(null)
  const [affects, setAffects] = useState<DecisionAffects[]>([])
  const [timeline, setTimeline] = useState<DecisionTimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<'not-found' | string | null>(null)

  // ── Fetch ───────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!decisionId) return
    setLoading(true)
    setError(null)
    try {
      const [d, aff] = await Promise.all([decisionsApi.get(decisionId), decisionsApi.listAffects(decisionId)])
      setDecision(d)
      setAffects(Array.isArray(aff) ? aff : [])
      // Timeline is best-effort (may not have task_id context)
      try {
        const tl = await decisionsApi.getTimeline({})
        setTimeline(tl.filter((e) => e.decision.id === decisionId))
      } catch {
        setTimeline([])
      }
    } catch (err) {
      setDecision(null)
      setError(err instanceof ApiError && err.status === 404 ? 'not-found' : activeTranslator().t('siteKnowledge.decision.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [decisionId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Mutations ───────────────────────────────────────────────────────

  const handleDelete = async () => {
    await decisionsApi.delete(decisionId!)
    toast.success(t('siteKnowledge.decisions.deleted'))
    navigate(decisionsHref, { type: 'back-button' })
  }

  const handleStatusChange = async (newStatus: DecisionStatus) => {
    if (!decision) return
    try {
      await decisionsApi.update(decision.id, { status: newStatus })
      setDecision({ ...decision, status: newStatus })
      toast.success(t('siteKnowledge.decisions.statusChanged', { status: getStatusMeta('decision', newStatus).label }))
    } catch {
      toast.error(t('siteKnowledge.decisions.statusFailed'))
    }
  }

  const handleRemoveAffects = async (entityType: string, entityId: string) => {
    await decisionsApi.removeAffects(decisionId!, entityType, entityId)
    setAffects((prev) => prev.filter((a) => !(a.entity_type === entityType && a.entity_id === entityId)))
    toast.success(t('siteKnowledge.decision.linkRemoved'))
  }

  // ── Dialogs ─────────────────────────────────────────────────────────

  const editDialog = useFormDialog()
  const editForm = useEditDecisionForm(async (data) => {
    if (!decision) return
    await decisionsApi.update(decision.id, data)
    setDecision({ ...decision, ...data })
    toast.success(t('siteKnowledge.decision.updated'))
  })
  const openEdit = () => {
    if (!decision) return
    editForm.reset({ description: decision.description, rationale: decision.rationale, chosen_option: decision.chosen_option })
    editDialog.open({ title: t('siteKnowledge.decision.editTitle'), size: 'lg', submitLabel: t('siteKnowledge.decision.save') })
  }

  const affectsDialog = useFormDialog()
  const affectsForm = useDecisionAffectsForm(async (data) => {
    if (!decisionId) return
    await decisionsApi.addAffects(decisionId, data)
    setAffects(await decisionsApi.listAffects(decisionId))
    toast.success(t('siteKnowledge.decision.affectAdded'))
  })
  const openAddAffects = () => {
    affectsForm.reset()
    affectsDialog.open({ title: t('siteKnowledge.decision.addAffectTitle'), submitLabel: t('siteKnowledge.decision.add') })
  }

  useUiContext('decision', decision?.id, decision ? decisionTitle(decision.description) : null)

  // ── Loading / Error ─────────────────────────────────────────────────

  if (loading) return <DetailSkeleton />
  if (error === 'not-found') {
    return (
      <PageContainer width="wide">
        <EmptyState
          icon={<Scale className="w-8 h-8 text-gray-500" />}
          title={t('siteKnowledge.decision.notFound')}
          description={t('siteKnowledge.shared.notFoundHint')}
          action={
            <Link to={decisionsHref} className={`text-sm ${inlineLink}`}>
              {t('siteKnowledge.decision.backToDecisions')}
            </Link>
          }
        />
      </PageContainer>
    )
  }
  if (error || !decision) {
    return (
      <PageContainer width="wide">
        <ErrorState title={t('siteKnowledge.decision.loadFailedTitle')} description={error ?? undefined} onRetry={fetchData} />
      </PageContainer>
    )
  }

  const title = decisionTitle(decision.description)
  // The header shows the first line; the section shows the full text unless it IS that line.
  const descriptionIsTitle = decision.description.trim() === title

  return (
    <PageContainer width="wide" className="space-y-6">
      <PageHeader
        title={title}
        entityRef={{ kind: 'decision', id: decision.id }}
        parentLinks={[{ icon: Scale, label: NOMENCLATURE.decisions.singular, name: NOMENCLATURE.decisions.plural, href: decisionsHref }]}
        status={<StatusMenu kind="decision" status={decision.status} onChange={handleStatusChange} />}
        meta={[
          decision.chosen_option ? (
            <span key="chosen" className="inline-flex items-center gap-1 min-w-0 text-gray-300" title={t('siteKnowledge.decisions.chosen', { option: decision.chosen_option })}>
              <CheckCircle2 className={`w-3 h-3 shrink-0 ${TONE_CLASSES.success.text}`} aria-label={t('siteKnowledge.decision.chosenOption')} />
              <span className="break-words">{decision.chosen_option}</span>
            </span>
          ) : null,
          decision.decided_by ? t('siteKnowledge.shared.by', { who: decision.decided_by }) : null,
          <RelativeTime key="d" date={decision.decided_at} prefix={`${t('siteKnowledge.decision.decided')} `} />,
          decision.alternatives.length
            ? decision.alternatives.length === 1
              ? t('siteKnowledge.decisions.alternatives.one', { n: 1 })
              : t('siteKnowledge.decisions.alternatives.other', { n: decision.alternatives.length })
            : null,
          affects.length
            ? affects.length === 1
              ? t('siteKnowledge.decision.affectsCount.one', { n: 1 })
              : t('siteKnowledge.decision.affectsCount.other', { n: affects.length })
            : null,
        ]}
        overflowActions={[
          { label: t('siteKnowledge.shared.edit'), icon: Pencil, onClick: openEdit },
          {
            label: t('siteKnowledge.shared.copyId'),
            icon: Copy,
            onClick: async () => {
              try {
                await navigator.clipboard.writeText(decision.id)
                toast.success(t('siteKnowledge.decision.copied'))
              } catch {
                toast.error(t('siteKnowledge.decision.copyFailed'))
              }
            },
          },
          {
            label: t('siteKnowledge.shared.delete'),
            icon: Trash2,
            variant: 'danger',
            onClick: handleDelete,
            confirm: { title: t('siteKnowledge.decision.deleteTitle'), description: t('siteKnowledge.decision.deleteDescription') },
          },
        ]}
      />

      {decision.status === 'superseded' && (
        <div className={`flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm ${TONE_CLASSES.warning.text}`}>
          <ArrowRightLeft className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p>{t('siteKnowledge.decision.superseded')}</p>
        </div>
      )}

      {/* ── Context (description + rationale) ───────────────────────── */}
      <Section title={t('siteKnowledge.decision.context')}>
        <div className={`${surface} px-4 py-3 space-y-4`}>
          {!descriptionIsTitle && (
            <div>
              <h3 className="text-xs text-gray-500 mb-1">{t('siteKnowledge.decision.description')}</h3>
              <CollapsibleMarkdown content={decision.description} maxHeight={320} />
            </div>
          )}
          <div>
            <h3 className="text-xs text-gray-500 mb-1">{t('siteKnowledge.decision.rationale')}</h3>
            {decision.rationale ? (
              <CollapsibleMarkdown content={decision.rationale} maxHeight={320} />
            ) : (
              <p className="text-sm text-gray-500">{t('siteKnowledge.decision.noRationale')}</p>
            )}
          </div>
        </div>
      </Section>

      {/* ── Alternatives ────────────────────────────────────────────── */}
      <Section title={t('siteKnowledge.decision.alternatives')} count={decision.alternatives.length} description={t('siteKnowledge.decision.alternativesDescription')}>
        {decision.alternatives.length === 0 ? (
          <EmptyState size="sm" title={t('siteKnowledge.decision.noAlternatives')} />
        ) : (
          <EntityList aria-label={t('siteKnowledge.decision.alternativesAria')}>
            {decision.alternatives.map((alt, i) => {
              const chosen = alt === decision.chosen_option
              return (
                <EntityRow
                  key={`${alt}-${i}`}
                  title={alt}
                  leading={<StatusIcon tone={chosen ? 'success' : 'neutral'} className={chosen ? TONE_CLASSES.success.text : 'text-gray-600'} />}
                  trailing={chosen ? <ToneText tone="success" dot={false} label={t('siteKnowledge.decision.chosenTag')} /> : undefined}
                />
              )
            })}
          </EntityList>
        )}
      </Section>

      {/* ── Affects ─────────────────────────────────────────────────── */}
      <Section
        title={t('siteKnowledge.decision.affects')}
        count={affects.length}
        description={t('siteKnowledge.decision.affectsDescription')}
        action={
          <Button variant="ghost" size="sm" onClick={openAddAffects}>
            <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> {t('siteKnowledge.decision.add')}
          </Button>
        }
      >
        {affects.length === 0 ? (
          <EmptyState
            size="sm"
            title={t('siteKnowledge.decision.noAffects')}
            description={t('siteKnowledge.decision.noAffectsDescription')}
            action={
              <Button size="sm" variant="secondary" onClick={openAddAffects}>
                {t('siteKnowledge.decision.add')}
              </Button>
            }
          />
        ) : (
          <EntityList aria-label={t('siteKnowledge.decision.affectsAria')}>
            {affects.map((aff) => {
              const name = aff.entity_name || aff.entity_id
              return (
                <EntityRow
                  key={`${aff.entity_type}-${aff.entity_id}`}
                  title={name}
                  href={entityHref(wsSlug, aff.entity_type, aff.entity_id) ?? undefined}
                  leading={createElement(entityIcon(aff.entity_type), { className: 'w-4 h-4 text-gray-500', 'aria-hidden': true })}
                  description={aff.impact_description}
                  meta={[
                    aff.entity_type,
                    aff.entity_name && aff.entity_name !== aff.entity_id ? (
                      <span key="id" className="font-mono break-all">
                        {aff.entity_id}
                      </span>
                    ) : null,
                  ]}
                  actions={[
                    {
                      label: t('siteKnowledge.decision.unlink'),
                      icon: Unlink,
                      variant: 'danger',
                      onClick: () => handleRemoveAffects(aff.entity_type, aff.entity_id),
                      confirm: {
                        title: t('siteKnowledge.decision.unlinkTitle'),
                        description: t('siteKnowledge.decision.unlinkDescription', { name }),
                        confirmLabel: t('siteKnowledge.decision.unlink'),
                      },
                    },
                  ]}
                />
              )
            })}
          </EntityList>
        )}
      </Section>

      {/* ── Timeline ────────────────────────────────────────────────── */}
      <Section title={t('siteKnowledge.decision.timeline')} count={timeline.length} description={t('siteKnowledge.decision.timelineDescription')}>
        {timeline.length === 0 ? (
          <EmptyState size="sm" title={t('siteKnowledge.decision.noTimeline')} description={t('siteKnowledge.decision.noTimelineDescription')} />
        ) : (
          <EntityList aria-label={t('siteKnowledge.decision.timelineAria')}>
            {timeline.map((entry, i) => (
              <EntityRow
                key={`${entry.decision.id}-${i}`}
                title={decisionTitle(entry.decision.description)}
                trailing={<RelativeTime date={entry.decision.decided_at} />}
                meta={[
                  <StatusText key="s" kind="decision" status={entry.decision.status} />,
                  entry.superseded_by ? (
                    entry.superseded_by !== decision.id ? (
                      <Link
                        key="sb"
                        to={workspacePath(wsSlug, `/decisions/${entry.superseded_by}`)}
                        className={`relative z-10 ${TONE_CLASSES.warning.text} ${inlineLink}`}
                      >
                        {t('siteKnowledge.decision.seeNewer')}
                      </Link>
                    ) : (
                      <span key="sb" className={TONE_CLASSES.warning.text}>
                        {t('siteKnowledge.decision.supersededByOther')}
                      </span>
                    )
                  ) : null,
                  entry.supersedes_chain?.length
                    ? entry.supersedes_chain.length === 1
                      ? t('siteKnowledge.decision.supersedes.one', { n: 1 })
                      : t('siteKnowledge.decision.supersedes.other', { n: entry.supersedes_chain.length })
                    : null,
                ]}
              />
            ))}
          </EntityList>
        )}
      </Section>

      <AnchoredConversations targetType="decision" targetId={decision.id} />

      {/* ── Details ─────────────────────────────────────────────────── */}
      <Section title={t('siteKnowledge.decision.details')}>
        <Facts
          items={[
            { label: t('siteKnowledge.decision.decidedByLabel'), value: decision.decided_by },
            { label: t('siteKnowledge.decision.decidedLabel'), value: formatAbsolute(decision.decided_at) },
            { label: t('siteKnowledge.decision.idLabel'), value: <span className="font-mono text-xs break-all">{decision.id}</span> },
          ]}
        />
      </Section>

      {/* ENTITY_GRAPH_SLOT entity_type="decision" entity_id={decision.id} */}

      <FormDialog {...editDialog.dialogProps} onSubmit={editForm.submit}>
        {editForm.fields}
      </FormDialog>
      <FormDialog {...affectsDialog.dialogProps} onSubmit={affectsForm.submit}>
        {affectsForm.fields}
      </FormDialog>
    </PageContainer>
  )
}
