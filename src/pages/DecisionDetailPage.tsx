import { createElement, useState, useEffect, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRightLeft, Check, CheckCircle2, Copy, Pencil, Plus, Scale, Trash2, Unlink } from 'lucide-react'
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
  Input,
  PageContainer,
  PageHeader,
  RelativeTime,
  Section,
  Select,
  Skeleton,
  SkeletonLine,
  StatusMenu,
  StatusText,
  Textarea,
  TONE_CLASSES,
  formatAbsolute,
  inlineLink,
  pluralize,
  surface,
} from '@/components/ui'
import { useFormDialog, useToast, useWorkspaceSlug } from '@/hooks'
import { useViewTransition } from '@/hooks/useViewTransition'
import { entityHref, entityIcon } from '@/components/knowledge/noteMeta'
import { workspacePath } from '@/utils/paths'
import type { Decision, DecisionStatus, DecisionAffects, DecisionTimelineEntry } from '@/types'

const AFFECTS_TYPES = [
  { value: 'File', label: 'File' },
  { value: 'Function', label: 'Function' },
  { value: 'Struct', label: 'Struct' },
  { value: 'Trait', label: 'Trait' },
]

/** First line of the description (plain text) — the decision's title. */
function decisionTitle(description: string): string {
  const first = description
    .split('\n')
    .map((l) => l.replace(/^#{1,6}\s+/, '').replace(/[*_`]+/g, '').trim())
    .find(Boolean)
  return first || 'Untitled decision'
}

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
  const affectsFormDialog = useFormDialog()
  const { navigate } = useViewTransition()
  const decisionsHref = workspacePath(wsSlug, '/decisions')

  // ── State ───────────────────────────────────────────────────────────
  const [decision, setDecision] = useState<Decision | null>(null)
  const [affects, setAffects] = useState<DecisionAffects[]>([])
  const [timeline, setTimeline] = useState<DecisionTimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<'not-found' | string | null>(null)

  // Edit mode for the context section
  const [editing, setEditing] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [rationaleDraft, setRationaleDraft] = useState('')
  const [chosenDraft, setChosenDraft] = useState('')
  const [saving, setSaving] = useState(false)

  // Add affects form state
  const [affEntityType, setAffEntityType] = useState('File')
  const [affEntityId, setAffEntityId] = useState('')
  const [affImpact, setAffImpact] = useState('')

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
      setError(err instanceof ApiError && err.status === 404 ? 'not-found' : 'Failed to load decision')
    } finally {
      setLoading(false)
    }
  }, [decisionId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Handlers ────────────────────────────────────────────────────────

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
      toast.success(`Status changed to ${newStatus}`)
    } catch {
      toast.error('Failed to update status')
    }
  }

  const startEditing = () => {
    if (!decision) return
    setDescDraft(decision.description)
    setRationaleDraft(decision.rationale)
    setChosenDraft(decision.chosen_option || '')
    setEditing(true)
  }

  const handleSave = async () => {
    if (!decision) return
    setSaving(true)
    try {
      await decisionsApi.update(decision.id, {
        description: descDraft.trim(),
        rationale: rationaleDraft.trim(),
        chosen_option: chosenDraft.trim() || undefined,
      })
      setDecision({
        ...decision,
        description: descDraft.trim(),
        rationale: rationaleDraft.trim(),
        chosen_option: chosenDraft.trim() || undefined,
      })
      setEditing(false)
      toast.success('Decision updated')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const openAddAffects = () => {
    setAffEntityType('File')
    setAffEntityId('')
    setAffImpact('')
    affectsFormDialog.open({ title: 'Add affected entity', size: 'md', submitLabel: 'Add' })
  }

  const handleAddAffects = async () => {
    if (!decisionId || !affEntityId.trim()) return false
    try {
      await decisionsApi.addAffects(decisionId, {
        entity_type: affEntityType,
        entity_id: affEntityId.trim(),
        impact_description: affImpact.trim() || undefined,
      })
      const aff = await decisionsApi.listAffects(decisionId)
      setAffects(aff)
      toast.success('Affects added')
    } catch {
      toast.error('Failed to add affects')
      return false
    }
  }

  const handleRemoveAffects = async (entityType: string, entityId: string) => {
    await decisionsApi.removeAffects(decisionId!, entityType, entityId)
    setAffects((prev) => prev.filter((a) => !(a.entity_type === entityType && a.entity_id === entityId)))
    toast.success('Affects removed')
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
        <ErrorState title="Could not load the decision" description={error || 'Could not load decision.'} onRetry={fetchData} />
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
        parentLinks={[{ icon: Scale, label: 'Decisions', name: 'Architectural decisions', href: decisionsHref }]}
        status={<StatusMenu kind="decision" status={decision.status} onChange={handleStatusChange} />}
        meta={[
          decision.chosen_option ? (
            <span key="chosen" className="inline-flex items-center gap-1 min-w-0 text-gray-300" title={`Chosen: ${decision.chosen_option}`}>
              <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" aria-label="Chosen option" />
              <span className="break-words">{decision.chosen_option}</span>
            </span>
          ) : null,
          decision.decided_by ? `by ${decision.decided_by}` : null,
          <RelativeTime key="d" date={decision.decided_at} prefix="decided " />,
          decision.alternatives.length ? pluralize(decision.alternatives.length, 'alternative') : null,
          affects.length ? `affects ${pluralize(affects.length, 'entity', 'entities')}` : null,
        ]}
        overflowActions={[
          { label: 'Edit', icon: Pencil, onClick: startEditing, hidden: editing },
          { label: 'Add affected entity', icon: Plus, onClick: openAddAffects },
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
            confirm: { title: 'Delete Decision', description: 'Permanently delete this decision? This cannot be undone.' },
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
      <Section
        title="Context"
        action={
          editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} loading={saving}>
                <Check className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Save
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={startEditing}>
              <Pencil className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Edit
            </Button>
          )
        }
      >
        <div className={`${surface} px-4 py-3 space-y-4`}>
          {editing ? (
            <>
              <Textarea label="Description" value={descDraft} onChange={(e) => setDescDraft(e.target.value)} rows={3} />
              <Textarea label="Rationale" value={rationaleDraft} onChange={(e) => setRationaleDraft(e.target.value)} rows={5} />
              <Input
                label="Chosen option"
                value={chosenDraft}
                onChange={(e) => setChosenDraft(e.target.value)}
                placeholder="e.g. Option A"
              />
            </>
          ) : (
            <>
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
            </>
          )}
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
                  leading={
                    chosen ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-label="Chosen" />
                    ) : (
                      <span className="w-4 h-4 inline-flex items-center justify-center" aria-hidden="true">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                      </span>
                    )
                  }
                  trailing={chosen ? <span className="text-emerald-400">chosen</span> : undefined}
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
        description="Code this decision constrains — agents working there are reminded of it."
        action={
          <Button variant="ghost" size="sm" onClick={openAddAffects}>
            <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Add
          </Button>
        }
      >
        {affects.length === 0 ? (
          <EmptyState
            size="sm"
            title="No affected entities"
            description="Link this decision to files, functions, or structs it impacts."
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
                      label: 'Remove',
                      icon: Unlink,
                      variant: 'danger',
                      onClick: () => handleRemoveAffects(aff.entity_type, aff.entity_id),
                      confirm: { title: 'Remove Affects', description: `Remove impact link to ${aff.entity_type} "${aff.entity_id}"?` },
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
          <EmptyState size="sm" title="No timeline entries" description="Timeline shows the decision's evolution over time." />
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
                        className={`relative z-10 text-amber-400 ${inlineLink}`}
                      >
                        superseded — see newer
                      </Link>
                    ) : (
                      <span key="sb" className="text-amber-400">
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

      <FormDialog {...affectsFormDialog.dialogProps} onSubmit={handleAddAffects}>
        <Select label="Entity Type" options={AFFECTS_TYPES} value={affEntityType} onChange={(v) => setAffEntityType(v)} />
        <Input
          label="Entity ID"
          placeholder="e.g. src/api/handlers.rs or function_name"
          value={affEntityId}
          onChange={(e) => setAffEntityId(e.target.value)}
          autoFocus
        />
        <Textarea
          label="Impact Description"
          placeholder="How does this decision affect this entity? (optional)"
          value={affImpact}
          onChange={(e) => setAffImpact(e.target.value)}
          rows={3}
        />
      </FormDialog>
    </PageContainer>
  )
}
