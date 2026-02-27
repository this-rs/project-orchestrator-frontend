import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Pencil,
  Check,
  X,
  Plus,
  CheckCircle2,
  ArrowRightLeft,
  FileCode2,
  Box,
  Hash,
} from 'lucide-react'
import { decisionsApi } from '@/services'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Textarea,
  Badge,
  InteractiveDecisionStatusBadge,
  CollapsibleMarkdown,
  ConfirmDialog,
  FormDialog,
  SectionNav,
  LoadingPage,
  ErrorState,
  EmptyState,
  Select,
} from '@/components/ui'
import { PageHeader } from '@/components/ui/PageHeader'
import { useConfirmDialog, useFormDialog, useToast, useWorkspaceSlug, useSectionObserver } from '@/hooks'
import { useViewTransition } from '@/hooks/useViewTransition'
import { workspacePath } from '@/utils/paths'
import type { Decision, DecisionStatus, DecisionAffects, DecisionTimelineEntry } from '@/types'

// ── Section nav ─────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'affects', label: 'Affects' },
  { id: 'timeline', label: 'Timeline' },
]

// ── Entity type icons ───────────────────────────────────────────────────

const entityTypeIcons: Record<string, typeof FileCode2> = {
  File: FileCode2,
  Function: Hash,
  Struct: Box,
  Trait: Box,
}

function EntityTypeIcon({ type }: { type: string }) {
  const Icon = entityTypeIcons[type] || FileCode2
  return <Icon className="w-3.5 h-3.5" />
}

// ── Relative time ───────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

// ── Main page ───────────────────────────────────────────────────────────

export function DecisionDetailPage() {
  const { decisionId } = useParams<{ decisionId: string }>()
  const wsSlug = useWorkspaceSlug()
  const toast = useToast()
  const confirmDialog = useConfirmDialog()
  const affectsFormDialog = useFormDialog()
  const { navigate } = useViewTransition()
  const activeSection = useSectionObserver(SECTIONS.map((s) => s.id))

  // ── State ───────────────────────────────────────────────────────────
  const [decision, setDecision] = useState<Decision | null>(null)
  const [affects, setAffects] = useState<DecisionAffects[]>([])
  const [timeline, setTimeline] = useState<DecisionTimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit mode for overview
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
    const isInitial = !decision
    if (isInitial) setLoading(true)
    setError(null)
    try {
      const [d, aff] = await Promise.all([
        decisionsApi.get(decisionId),
        decisionsApi.listAffects(decisionId),
      ])
      setDecision(d)
      setAffects(aff)
      // Timeline is best-effort (may not have task_id context)
      try {
        const tl = await decisionsApi.getTimeline({})
        // Filter timeline to this decision
        setTimeline(tl.filter((e) => e.decision.id === decisionId))
      } catch {
        setTimeline([])
      }
    } catch {
      setError('Failed to load decision')
    } finally {
      setLoading(false)
    }
  }, [decisionId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Handlers ────────────────────────────────────────────────────────

  const handleDelete = () => {
    confirmDialog.open({
      title: 'Delete Decision',
      description: 'Permanently delete this decision? This cannot be undone.',
      onConfirm: async () => {
        await decisionsApi.delete(decisionId!)
        toast.success('Decision deleted')
        navigate(workspacePath(wsSlug, '/decisions'), { type: 'back-button' })
      },
    })
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

  const handleAddAffects = async () => {
    if (!decisionId || !affEntityId.trim()) return false
    try {
      await decisionsApi.addAffects(decisionId, {
        entity_type: affEntityType,
        entity_id: affEntityId.trim(),
        impact_description: affImpact.trim() || undefined,
      })
      // Refresh affects list
      const aff = await decisionsApi.listAffects(decisionId)
      setAffects(aff)
      toast.success('Affects added')
      // Reset form
      setAffEntityType('File')
      setAffEntityId('')
      setAffImpact('')
    } catch {
      toast.error('Failed to add affects')
      return false
    }
  }

  const handleRemoveAffects = (entityType: string, entityId: string) => {
    confirmDialog.open({
      title: 'Remove Affects',
      description: `Remove impact link to ${entityType} "${entityId}"?`,
      onConfirm: async () => {
        await decisionsApi.removeAffects(decisionId!, entityType, entityId)
        setAffects((prev) => prev.filter((a) => !(a.entity_type === entityType && a.entity_id === entityId)))
        toast.success('Affects removed')
      },
    })
  }

  // ── Section counts ──────────────────────────────────────────────────
  const sectionCounts = SECTIONS.map((s) => {
    if (s.id === 'affects') return { ...s, count: affects.length }
    if (s.id === 'timeline') return { ...s, count: timeline.length }
    return s
  })

  // ── Loading / Error ─────────────────────────────────────────────────

  if (loading) return <LoadingPage />
  if (error || !decision) {
    return <ErrorState title="Decision not found" description={error || 'Could not load decision.'} onRetry={fetchData} />
  }

  return (
    <div className="pt-6 space-y-6">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <PageHeader
        title={decision.description.length > 80 ? decision.description.slice(0, 80) + '…' : decision.description}
        status={<InteractiveDecisionStatusBadge status={decision.status} onStatusChange={handleStatusChange} />}
        metadata={[
          { label: 'Decided by', value: decision.decided_by },
          { label: 'Decided', value: relativeTime(decision.decided_at) },
        ]}
        overflowActions={[{ label: 'Delete', variant: 'danger' as const, onClick: handleDelete }]}
      >
        {decision.chosen_option && (
          <Badge variant="success">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {decision.chosen_option}
          </Badge>
        )}
      </PageHeader>

      <SectionNav sections={sectionCounts} activeSection={activeSection} />

      {/* ── Overview Section ────────────────────────────────────────── */}
      <section id="overview" className="scroll-mt-20 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Context</CardTitle>
            {!editing ? (
              <Button variant="secondary" size="sm" onClick={startEditing}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
                  <Check className="w-3.5 h-3.5 mr-1" /> Save
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Description</label>
                  <Textarea value={descDraft} onChange={(e) => setDescDraft(e.target.value)} rows={3} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Rationale</label>
                  <Textarea value={rationaleDraft} onChange={(e) => setRationaleDraft(e.target.value)} rows={5} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Chosen Option</label>
                  <Input value={chosenDraft} onChange={(e) => setChosenDraft(e.target.value)} placeholder="e.g. Option A" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Description</h4>
                  <CollapsibleMarkdown content={decision.description} />
                </div>
                {decision.rationale && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Rationale</h4>
                    <CollapsibleMarkdown content={decision.rationale} />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Alternatives sub-section */}
        <Card>
          <CardHeader>
            <CardTitle>Alternatives ({decision.alternatives.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {decision.alternatives.length === 0 ? (
              <p className="text-sm text-gray-500">No alternatives recorded.</p>
            ) : (
              <div className="space-y-2">
                {decision.alternatives.map((alt, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 p-2.5 rounded-lg ${
                      alt === decision.chosen_option
                        ? 'bg-emerald-500/10 ring-1 ring-emerald-500/20'
                        : 'bg-white/[0.04]'
                    }`}
                  >
                    {alt === decision.chosen_option && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    <span
                      className={`text-sm ${
                        alt === decision.chosen_option ? 'text-emerald-300 font-medium' : 'text-gray-300'
                      }`}
                    >
                      {alt}
                    </span>
                    {alt === decision.chosen_option && (
                      <Badge variant="success" className="ml-auto text-[10px]">
                        chosen
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Affects Section ─────────────────────────────────────────── */}
      <section id="affects" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle>Affects ({affects.length})</CardTitle>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setAffEntityType('File')
                setAffEntityId('')
                setAffImpact('')
                affectsFormDialog.open({ title: 'Add Affects', size: 'md' })
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add
            </Button>
          </CardHeader>
          <CardContent>
            {affects.length === 0 ? (
              <EmptyState
                title="No affected entities"
                description="Link this decision to files, functions, or structs it impacts."
              />
            ) : (
              <div className="space-y-2">
                {affects.map((aff) => (
                  <div
                    key={`${aff.entity_type}-${aff.entity_id}`}
                    className="flex items-center gap-3 p-2.5 bg-white/[0.04] rounded-lg group/aff"
                  >
                    <Badge variant="default" className="shrink-0">
                      <EntityTypeIcon type={aff.entity_type} />
                      <span className="ml-1">{aff.entity_type}</span>
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-200 truncate">{aff.entity_name || aff.entity_id}</p>
                      {aff.entity_name && aff.entity_name !== aff.entity_id && (
                        <p className="text-xs text-gray-500 truncate">{aff.entity_id}</p>
                      )}
                      {aff.impact_description && (
                        <p className="text-xs text-gray-400 mt-0.5">{aff.impact_description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveAffects(aff.entity_type, aff.entity_id)}
                      className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover/aff:opacity-100 transition-all shrink-0"
                      title="Remove"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Timeline Section ────────────────────────────────────────── */}
      <section id="timeline" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {timeline.length === 0 ? (
              <EmptyState title="No timeline entries" description="Timeline shows the decision's evolution over time." />
            ) : (
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-4 top-0 bottom-0 w-px bg-white/[0.08]" />
                <div className="space-y-4">
                  {timeline.map((entry, i) => (
                    <div key={i} className="relative flex items-start gap-3 pl-10">
                      <div className="absolute left-2.5 top-1 w-3 h-3 rounded-full bg-gray-700 ring-2 ring-gray-900" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={entry.decision.status === 'accepted' ? 'success' : 'default'}>
                            {entry.decision.status}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {relativeTime(entry.decision.decided_at)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-300 mt-1 line-clamp-2">{entry.decision.description}</p>
                        {entry.superseded_by && (
                          <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                            <ArrowRightLeft className="w-3 h-3" />
                            Superseded by another decision
                          </p>
                        )}
                        {entry.supersedes_chain && entry.supersedes_chain.length > 0 && (
                          <p className="text-xs text-gray-500 mt-1">
                            Supersedes {entry.supersedes_chain.length} previous decision
                            {entry.supersedes_chain.length > 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Supersession banner ─────────────────────────────────────── */}
      {decision.status === 'superseded' && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-amber-400">
              <ArrowRightLeft className="w-4 h-4 shrink-0" />
              <p className="text-sm">
                This decision has been <strong>superseded</strong>. It is kept for historical reference.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Dialogs ─────────────────────────────────────────────────── */}
      <FormDialog {...affectsFormDialog.dialogProps} onSubmit={handleAddAffects}>
        <Select
          label="Entity Type"
          options={[
            { value: 'File', label: 'File' },
            { value: 'Function', label: 'Function' },
            { value: 'Struct', label: 'Struct' },
            { value: 'Trait', label: 'Trait' },
          ]}
          value={affEntityType}
          onChange={(v) => setAffEntityType(v)}
        />
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

      <ConfirmDialog {...confirmDialog.dialogProps} />
    </div>
  )
}
