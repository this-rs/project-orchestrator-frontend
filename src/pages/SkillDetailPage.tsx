import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Brain,
  Zap,
  Download,
  X,
  FileText,
  Scale,
  Pencil,
  Check,
  Activity,
  Shield,
} from 'lucide-react'
import { skillsApi } from '@/services'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  LoadingPage,
  ErrorState,
  EmptyState,
  ConfirmDialog,
  Dialog,
  InteractiveSkillStatusBadge,
  ImportanceBadge,
  PageHeader,
  SectionNav,
  CollapsibleMarkdown,
  Textarea,
  StatCard,
} from '@/components/ui'
import type { ParentLink } from '@/components/ui/PageHeader'
import { useConfirmDialog, useToast, useSectionObserver, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type {
  Skill,
  SkillStatus,
  SkillHealth,
  SkillMembers,
  SkillActivationResult,
  SkillTriggerPattern,
  Note,
  Decision,
} from '@/types'

// ── Helpers ─────────────────────────────────────────────────────────────

function energyColor(v: number) {
  if (v >= 0.7) return 'bg-emerald-500'
  if (v >= 0.3) return 'bg-amber-500'
  return 'bg-red-500'
}

function pct(v: number) {
  return `${(v * 100).toFixed(0)}%`
}

const RECOMMENDATION_STYLES: Record<string, { bg: string; text: string }> = {
  healthy: { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  needs_attention: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  at_risk: { bg: 'bg-red-500/15', text: 'text-red-400' },
  should_archive: { bg: 'bg-gray-500/15', text: 'text-gray-400' },
}

const TRIGGER_TYPE_STYLES: Record<string, string> = {
  regex: 'bg-purple-500/15 text-purple-400',
  file_glob: 'bg-blue-500/15 text-blue-400',
  semantic: 'bg-emerald-500/15 text-emerald-400',
  mcp_action: 'bg-amber-500/15 text-amber-400',
}

// ── Sections config ─────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'metrics', label: 'Metrics' },
  { id: 'members', label: 'Members' },
  { id: 'triggers', label: 'Triggers' },
  { id: 'context', label: 'Context Template' },
  { id: 'health', label: 'Health' },
]

// ── Main component ──────────────────────────────────────────────────────

export function SkillDetailPage() {
  const { id: skillId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()
  const confirmDialog = useConfirmDialog()
  const toast = useToast()

  const [skill, setSkill] = useState<Skill | null>(null)
  const [health, setHealth] = useState<SkillHealth | null>(null)
  const [members, setMembers] = useState<SkillMembers | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Activation modal
  const [activationOpen, setActivationOpen] = useState(false)
  const [activationQuery, setActivationQuery] = useState('')
  const [activationResult, setActivationResult] = useState<SkillActivationResult | null>(null)
  const [activating, setActivating] = useState(false)

  // Context template editing
  const [editingTemplate, setEditingTemplate] = useState(false)
  const [templateDraft, setTemplateDraft] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  const activeSection = useSectionObserver(SECTIONS.map((s) => s.id))

  const fetchData = useCallback(async () => {
    if (!skillId) return
    const isInitial = !skill
    if (isInitial) setLoading(true)
    setError(null)
    try {
      const [skillData, healthData, membersData] = await Promise.all([
        skillsApi.get(skillId),
        skillsApi.getHealth(skillId).catch(() => null),
        skillsApi.getMembers(skillId).catch(() => null),
      ])
      setSkill(skillData)
      setHealth(healthData)
      setMembers(membersData)
    } catch {
      setError('Failed to load skill')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Actions ─────────────────────────────────────────────────────────

  const handleStatusChange = async (newStatus: SkillStatus) => {
    if (!skill) return
    try {
      const updated = await skillsApi.update(skill.id, { status: newStatus })
      setSkill(updated)
      toast.success(`Status changed to ${newStatus}`)
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handleDelete = () => {
    if (!skill) return
    confirmDialog.open({
      title: 'Delete Skill',
      description: `Permanently delete "${skill.name}"? This cannot be undone.`,
      onConfirm: async () => {
        await skillsApi.delete(skill.id)
        toast.success('Skill deleted')
        navigate(workspacePath(wsSlug, '/skills'))
      },
    })
  }

  const handleExport = async () => {
    if (!skill) return
    try {
      const pkg = await skillsApi.exportSkill(skill.id)
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `skill-${skill.name.toLowerCase().replace(/\s+/g, '-')}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Skill exported')
    } catch {
      toast.error('Export failed')
    }
  }

  const handleActivate = async () => {
    if (!skill || !activationQuery.trim()) return
    setActivating(true)
    try {
      const result = await skillsApi.activate(skill.id, activationQuery.trim())
      setActivationResult(result)
    } catch {
      toast.error('Activation failed')
    } finally {
      setActivating(false)
    }
  }

  const handleRemoveMember = (entityType: 'note' | 'decision', entityId: string) => {
    if (!skill) return
    confirmDialog.open({
      title: 'Remove Member',
      description: `Remove this ${entityType} from the skill?`,
      onConfirm: async () => {
        await skillsApi.removeMember(skill.id, entityType, entityId)
        // Refresh members
        const updated = await skillsApi.getMembers(skill.id)
        setMembers(updated)
        toast.success('Member removed')
      },
    })
  }

  const handleSaveTemplate = async () => {
    if (!skill) return
    setSavingTemplate(true)
    try {
      const updated = await skillsApi.update(skill.id, { context_template: templateDraft })
      setSkill(updated)
      setEditingTemplate(false)
      toast.success('Template saved')
    } catch {
      toast.error('Failed to save template')
    } finally {
      setSavingTemplate(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) return <LoadingPage />
  if (error || !skill) {
    return (
      <ErrorState
        title="Skill not found"
        description={error || 'The skill could not be loaded.'}
        onRetry={fetchData}
      />
    )
  }

  const parentLinks: ParentLink[] = [
    { icon: Brain, label: 'Skills', name: 'All Skills', href: workspacePath(wsSlug, '/skills') },
  ]

  const sectionCounts = SECTIONS.map((s) => {
    if (s.id === 'members') return { ...s, count: (members?.notes.length ?? 0) + (members?.decisions.length ?? 0) }
    if (s.id === 'triggers') return { ...s, count: skill.trigger_patterns.length }
    return s
  })

  return (
    <div className="pt-6 space-y-6">
      {/* ── Header ───────────────────────────────────────────────── */}
      <PageHeader
        title={skill.name}
        description={skill.description}
        parentLinks={parentLinks}
        status={
          <InteractiveSkillStatusBadge status={skill.status} onStatusChange={handleStatusChange} />
        }
        metadata={[
          { label: 'Energy', value: pct(skill.energy) },
          { label: 'Cohesion', value: pct(skill.cohesion) },
          { label: 'Version', value: `v${skill.version}` },
          { label: 'Activations', value: String(skill.activation_count) },
        ]}
        actions={
          <>
            <Button variant="primary" size="sm" onClick={() => { setActivationOpen(true); setActivationResult(null); setActivationQuery('') }}>
              <Zap className="w-4 h-4 mr-1.5" />
              Test Activation
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4 mr-1.5" />
              Export
            </Button>
          </>
        }
        overflowActions={[
          { label: 'Delete', variant: 'danger', onClick: handleDelete },
        ]}
      >
        {/* Tags */}
        {skill.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {skill.tags.map((tag) => (
              <Badge key={tag} variant="default">{tag}</Badge>
            ))}
          </div>
        )}
      </PageHeader>

      {/* ── Section Nav ──────────────────────────────────────────── */}
      <SectionNav sections={sectionCounts} activeSection={activeSection} />

      {/* ── Metrics Section ──────────────────────────────────────── */}
      <section id="metrics">
        <Card>
          <CardHeader>
            <CardTitle>Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Energy */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-gray-300">Energy</span>
                  <span className="text-sm font-mono text-gray-200">{pct(skill.energy)}</span>
                </div>
                <div className="h-2.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${energyColor(skill.energy)}`} style={{ width: `${Math.max(skill.energy * 100, 1)}%` }} />
                </div>
              </div>
              {/* Cohesion */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-gray-300">Cohesion</span>
                  <span className="text-sm font-mono text-gray-200">{pct(skill.cohesion)}</span>
                </div>
                <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all bg-indigo-500" style={{ width: `${Math.max(skill.cohesion * 100, 1)}%` }} />
                </div>
              </div>
              {/* Quick stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <StatCard label="Members" value={skill.note_count + skill.decision_count} icon={<Brain className="w-5 h-5" />} />
                <StatCard label="Activations" value={skill.activation_count} icon={<Zap className="w-5 h-5" />} />
                <StatCard label="Hit Rate" value={Math.round(skill.hit_rate * 100)} suffix="%" icon={<Activity className="w-5 h-5" />} />
                <StatCard label="Coverage" value={skill.coverage} icon={<Shield className="w-5 h-5" />} />
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Members Section ──────────────────────────────────────── */}
      <section id="members">
        <MembersSection
          members={members}
          onRemove={handleRemoveMember}
        />
      </section>

      {/* ── Triggers Section ─────────────────────────────────────── */}
      <section id="triggers">
        <TriggersSection patterns={skill.trigger_patterns} />
      </section>

      {/* ── Context Template Section ─────────────────────────────── */}
      <section id="context">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Context Template</CardTitle>
              {!editingTemplate ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setEditingTemplate(true); setTemplateDraft(skill.context_template || '') }}
                >
                  <Pencil className="w-3.5 h-3.5 mr-1" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditingTemplate(false)}>Cancel</Button>
                  <Button variant="primary" size="sm" onClick={handleSaveTemplate} loading={savingTemplate}>
                    <Check className="w-3.5 h-3.5 mr-1" />
                    Save
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editingTemplate ? (
              <Textarea
                value={templateDraft}
                onChange={(e) => setTemplateDraft(e.target.value)}
                rows={8}
                placeholder="Markdown template for activation context..."
              />
            ) : skill.context_template ? (
              <CollapsibleMarkdown content={skill.context_template} />
            ) : (
              <p className="text-sm text-gray-500">No context template defined.</p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Health Section ────────────────────────────────────────── */}
      <section id="health">
        <HealthSection health={health} />
      </section>

      {/* ── Activation Dialog ────────────────────────────────────── */}
      <Dialog
        open={activationOpen}
        onClose={() => setActivationOpen(false)}
        title="Test Activation"
        size="lg"
      >
        <div className="space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              className="flex-1 rounded-lg bg-white/[0.06] border border-white/[0.1] px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500/50"
              placeholder="Enter an activation query..."
              value={activationQuery}
              onChange={(e) => setActivationQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
              autoFocus
            />
            <Button onClick={handleActivate} loading={activating}>
              <Zap className="w-4 h-4 mr-1" />
              Activate
            </Button>
          </div>

          {activationResult && (
            <div className="space-y-3">
              {/* Confidence */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">Confidence</span>
                <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${energyColor(activationResult.confidence)}`}
                    style={{ width: `${activationResult.confidence * 100}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-gray-300">{pct(activationResult.confidence)}</span>
              </div>
              {/* Stats */}
              <div className="flex gap-4 text-xs text-gray-400">
                <span>{activationResult.activated_notes.length} notes activated</span>
                <span>{activationResult.relevant_decisions.length} decisions</span>
              </div>
              {/* Context text */}
              {activationResult.context_text && (
                <div className="p-3 rounded-lg bg-white/[0.04] border border-white/[0.08] max-h-64 overflow-y-auto">
                  <CollapsibleMarkdown content={activationResult.context_text} />
                </div>
              )}
            </div>
          )}
        </div>
      </Dialog>

      <ConfirmDialog {...confirmDialog.dialogProps} />
    </div>
  )
}

// ── Members Section ─────────────────────────────────────────────────────

function MembersSection({
  members,
  onRemove,
}: {
  members: SkillMembers | null
  onRemove: (type: 'note' | 'decision', id: string) => void
}) {
  const [tab, setTab] = useState<'notes' | 'decisions'>('notes')

  if (!members) {
    return (
      <Card>
        <CardHeader><CardTitle>Members</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-gray-500">Loading members...</p></CardContent>
      </Card>
    )
  }

  const notes = members.notes || []
  const decisions = members.decisions || []

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Members</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-white/[0.06] -mt-1">
          <button
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'notes' ? 'border-indigo-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
            onClick={() => setTab('notes')}
          >
            Notes <span className="text-gray-500">({notes.length})</span>
          </button>
          <button
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'decisions' ? 'border-indigo-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
            onClick={() => setTab('decisions')}
          >
            Decisions <span className="text-gray-500">({decisions.length})</span>
          </button>
        </div>

        {tab === 'notes' ? (
          notes.length === 0 ? (
            <EmptyState title="No note members" description="This skill has no note members yet." />
          ) : (
            <div className="space-y-2">
              {notes.map((note: Note) => (
                <div key={note.id} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.06] transition-colors group">
                  <FileText className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="default">{note.note_type}</Badge>
                      <ImportanceBadge importance={note.importance} />
                    </div>
                    <p className="text-sm text-gray-300 line-clamp-2">{note.content}</p>
                  </div>
                  <button
                    onClick={() => onRemove('note', note.id)}
                    className="p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          decisions.length === 0 ? (
            <EmptyState title="No decision members" description="This skill has no decision members yet." />
          ) : (
            <div className="space-y-2">
              {decisions.map((dec: Decision) => (
                <div key={dec.id} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.06] transition-colors group">
                  <Scale className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 line-clamp-2">{dec.description}</p>
                    {dec.chosen_option && (
                      <p className="text-xs text-gray-500 mt-1">Chosen: {dec.chosen_option}</p>
                    )}
                  </div>
                  <button
                    onClick={() => onRemove('decision', dec.id)}
                    className="p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </CardContent>
    </Card>
  )
}

// ── Triggers Section ────────────────────────────────────────────────────

function TriggersSection({ patterns }: { patterns: SkillTriggerPattern[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trigger Patterns</CardTitle>
      </CardHeader>
      <CardContent>
        {patterns.length === 0 ? (
          <EmptyState title="No triggers" description="This skill has no trigger patterns defined." />
        ) : (
          <div className="space-y-2">
            {patterns.map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.04]">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${TRIGGER_TYPE_STYLES[p.pattern_type] || 'bg-gray-500/15 text-gray-400'}`}>
                  {p.pattern_type}
                </span>
                <span className="font-mono text-sm text-gray-200 flex-1 truncate">{p.pattern_value}</span>
                <span className="text-xs text-gray-500 shrink-0">
                  threshold: {p.confidence_threshold.toFixed(2)}
                </span>
                {p.quality_score != null && (
                  <span className="text-xs text-gray-500 shrink-0">
                    quality: {p.quality_score.toFixed(2)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Health Section ──────────────────────────────────────────────────────

function HealthSection({ health }: { health: SkillHealth | null }) {
  if (!health) {
    return (
      <Card>
        <CardHeader><CardTitle>Health</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-gray-500">Health data unavailable.</p></CardContent>
      </Card>
    )
  }

  const recStyle = RECOMMENDATION_STYLES[health.recommendation] || RECOMMENDATION_STYLES.healthy

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Health</CardTitle>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${recStyle.bg} ${recStyle.text}`}>
            {health.recommendation.replace('_', ' ')}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Explanation */}
          <p className="text-sm text-gray-400">{health.explanation}</p>

          {/* KPI grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Notes" value={health.note_count} icon={<FileText className="w-5 h-5" />} />
            <StatCard label="Decisions" value={health.decision_count} icon={<Scale className="w-5 h-5" />} />
            <StatCard label="Hit Rate" value={Math.round(health.hit_rate * 100)} suffix="%" icon={<Zap className="w-5 h-5" />} />
            <StatCard label="Activations" value={health.activation_count} icon={<Activity className="w-5 h-5" />} />
          </div>

          {/* Probation info */}
          {health.in_probation && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Shield className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm text-amber-300">
                In probation{health.probation_days_remaining != null && ` — ${health.probation_days_remaining} days remaining`}
              </span>
            </div>
          )}

          {/* Validation status */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Validated: {health.is_validated ? 'Yes' : 'No'}</span>
            {health.days_since_import != null && (
              <span>Imported {health.days_since_import} days ago</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
