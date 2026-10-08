/**
 * Decision detail — the decision (first line = title), its rationale, the
 * alternatives considered, the code it constrains, its supersession timeline
 * and lifecycle actions. Route: /workspace/:slug/decisions/:decisionId
 */
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
  pluralize,
  surface,
} from '@/components/ui'
import { useFormDialog, useToast, useWorkspaceSlug } from '@/hooks'
import { useViewTransition } from '@/hooks/useViewTransition'
import { useDecisionAffectsForm, useEditDecisionForm } from '@/components/forms/DecisionForms'
import { decisionTitle, entityHref, entityIcon } from '@/components/knowledge/noteMeta'
import { workspacePath } from '@/utils/paths'
import type { Decision, DecisionStatus, DecisionAffects, DecisionTimelineEntry } from '@/types'
import { NOMENCLATURE } from '@/constants/nomenclature'

function DetailSkeleton() {
  return (
    <PageContainer width="wide" className="space-y-6">
      <div className="space-y-3" aria-busy="true" aria-label="Loading decision">
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
      setError(err instanceof ApiError && err.status === 404 ? 'not-found' : 'Could not load this decision.')
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
    toast.success('Decision deleted')
    navigate(decisionsHref, { type: 'back-button' })
  }

  const handleStatusChange = async (newStatus: DecisionStatus) => {
    if (!decision) return
    try {
      await decisionsApi.update(decision.id, { status: newStatus })
      setDecision({ ...decision, status: newStatus })
      toast.success(`Status changed to ${getStatusMeta('decision', newStatus).label}`)
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handleRemoveAffects = async (entityType: string, entityId: string) => {
    await decisionsApi.removeAffects(decisionId!, entityType, entityId)
    setAffects((prev) => prev.filter((a) => !(a.entity_type === entityType && a.entity_id === entityId)))
    toast.success('Link removed')
  }

  // ── Dialogs ─────────────────────────────────────────────────────────

  const editDialog = useFormDialog()
  const editForm = useEditDecisionForm(async (data) => {
    if (!decision) return
    await decisionsApi.update(decision.id, data)
    setDecision({ ...decision, ...data })
    toast.success('Decision updated')
  })
  const openEdit = () => {
    if (!decision) return
    editForm.reset({ description: decision.description, rationale: decision.rationale, chosen_option: decision.chosen_option })
    editDialog.open({ title: 'Edit decision', size: 'lg', submitLabel: 'Save' })
  }

  const affectsDialog = useFormDialog()
  const affectsForm = useDecisionAffectsForm(async (data) => {
    if (!decisionId) return
    await decisionsApi.addAffects(decisionId, data)
    setAffects(await decisionsApi.listAffects(decisionId))
    toast.success('Affected entity added')
  })
  const openAddAffects = () => {
    affectsForm.reset()
    affectsDialog.open({ title: 'Add affected entity', submitLabel: 'Add' })
  }

  // ── Loading / Error ─────────────────────────────────────────────────

  if (loading) return <DetailSkeleton />
  if (error === 'not-found') {
    return (
      <PageContainer width="wide">
        <EmptyState
          icon={<Scale className="w-8 h-8 text-gray-500" />}
          title="Decision not found"
          description="It may have been deleted, or the link is wrong."
          action={
            <Link to={decisionsHref} className={`text-sm ${inlineLink}`}>
              Back to decisions
            </Link>
          }
        />
      </PageContainer>
    )
  }
  if (error || !decision) {
    return (
      <PageContainer width="wide">
        <ErrorState title="Could not load the decision" description={error ?? undefined} onRetry={fetchData} />
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
        parentLinks={[{ icon: Scale, label: NOMENCLATURE.decisions.singular, name: NOMENCLATURE.decisions.plural, href: decisionsHref }]}
        status={<StatusMenu kind="decision" status={decision.status} onChange={handleStatusChange} />}
        meta={[
          decision.chosen_option ? (
            <span key="chosen" className="inline-flex items-center gap-1 min-w-0 text-gray-300" title={`Chosen: ${decision.chosen_option}`}>
              <CheckCircle2 className={`w-3 h-3 shrink-0 ${TONE_CLASSES.success.text}`} aria-label="Chosen option" />
              <span className="break-words">{decision.chosen_option}</span>
            </span>
          ) : null,
          decision.decided_by ? `by ${decision.decided_by}` : null,
          <RelativeTime key="d" date={decision.decided_at} prefix="decided " />,
          decision.alternatives.length ? pluralize(decision.alternatives.length, 'alternative') : null,
          affects.length ? `affects ${pluralize(affects.length, 'entity', 'entities')}` : null,
        ]}
        overflowActions={[
          { label: 'Edit', icon: Pencil, onClick: openEdit },
          {
            label: 'Copy ID',
            icon: Copy,
            onClick: async () => {
              try {
                await navigator.clipboard.writeText(decision.id)
                toast.success('ID copied')
              } catch {
                toast.error('Could not copy')
              }
            },
          },
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'danger',
            onClick: handleDelete,
            confirm: { title: 'Delete decision?', description: 'The decision and its links are permanently deleted. This cannot be undone.' },
          },
        ]}
      />

      {decision.status === 'superseded' && (
        <div className={`flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm ${TONE_CLASSES.warning.text}`}>
          <ArrowRightLeft className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p>This decision has been superseded. It is kept for historical reference.</p>
        </div>
      )}

      {/* ── Context (description + rationale) ───────────────────────── */}
      <Section title="Context">
        <div className={`${surface} px-4 py-3 space-y-4`}>
          {!descriptionIsTitle && (
            <div>
              <h3 className="text-xs text-gray-500 mb-1">Description</h3>
              <CollapsibleMarkdown content={decision.description} maxHeight={320} />
            </div>
          )}
          <div>
            <h3 className="text-xs text-gray-500 mb-1">Rationale</h3>
            {decision.rationale ? (
              <CollapsibleMarkdown content={decision.rationale} maxHeight={320} />
            ) : (
              <p className="text-sm text-gray-500">No rationale recorded.</p>
            )}
          </div>
        </div>
      </Section>

      {/* ── Alternatives ────────────────────────────────────────────── */}
      <Section title="Alternatives" count={decision.alternatives.length} description="Options that were considered.">
        {decision.alternatives.length === 0 ? (
          <EmptyState size="sm" title="No alternatives recorded." />
        ) : (
          <EntityList aria-label="Alternatives">
            {decision.alternatives.map((alt, i) => {
              const chosen = alt === decision.chosen_option
              return (
                <EntityRow
                  key={`${alt}-${i}`}
                  title={alt}
                  leading={<StatusIcon tone={chosen ? 'success' : 'neutral'} className={chosen ? TONE_CLASSES.success.text : 'text-gray-600'} />}
                  trailing={chosen ? <ToneText tone="success" dot={false} label="chosen" /> : undefined}
                />
              )
            })}
          </EntityList>
        )}
      </Section>

      {/* ── Affects ─────────────────────────────────────────────────── */}
      <Section
        title="Affects"
        count={affects.length}
        description="What this decision constrains — assistants working there are reminded of it."
        action={
          <Button variant="ghost" size="sm" onClick={openAddAffects}>
            <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Add
          </Button>
        }
      >
        {affects.length === 0 ? (
          <EmptyState
            size="sm"
            title="No affected entities yet"
            description="Link this decision to the files, functions or structs it impacts."
            action={
              <Button size="sm" variant="secondary" onClick={openAddAffects}>
                Add
              </Button>
            }
          />
        ) : (
          <EntityList aria-label="Affected entities">
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
                      label: 'Unlink',
                      icon: Unlink,
                      variant: 'danger',
                      onClick: () => handleRemoveAffects(aff.entity_type, aff.entity_id),
                      confirm: { title: 'Unlink this entity?', description: `The decision will no longer be attached to ${name}.`, confirmLabel: 'Unlink' },
                    },
                  ]}
                />
              )
            })}
          </EntityList>
        )}
      </Section>

      {/* ── Timeline ────────────────────────────────────────────────── */}
      <Section title="Timeline" count={timeline.length} description="How this decision evolved (supersessions).">
        {timeline.length === 0 ? (
          <EmptyState size="sm" title="No timeline entries" description="The timeline shows the decision's evolution over time." />
        ) : (
          <EntityList aria-label="Timeline">
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
                        superseded — see newer
                      </Link>
                    ) : (
                      <span key="sb" className={TONE_CLASSES.warning.text}>
                        superseded by another decision
                      </span>
                    )
                  ) : null,
                  entry.supersedes_chain?.length
                    ? `supersedes ${pluralize(entry.supersedes_chain.length, 'previous decision', 'previous decisions')}`
                    : null,
                ]}
              />
            ))}
          </EntityList>
        )}
      </Section>

      {/* ── Details ─────────────────────────────────────────────────── */}
      <Section title="Details">
        <Facts
          items={[
            { label: 'Decided by', value: decision.decided_by },
            { label: 'Decided', value: formatAbsolute(decision.decided_at) },
            { label: 'ID', value: <span className="font-mono text-xs break-all">{decision.id}</span> },
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
