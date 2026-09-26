import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Brain, Box, Zap, Download, Pencil, Check, X, Trash2, ShieldAlert } from 'lucide-react'
import { skillsApi, workspacesApi } from '@/services'
import {
  Button,
  CollapsibleMarkdown,
  Dialog,
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  Facts,
  Input,
  ListGroup,
  MetaLine,
  PageContainer,
  PageHeader,
  RelativeTime,
  Section,
  SectionNav,
  SkeletonLine,
  StatusDot,
  StatusMenu,
  StatusText,
  TONE_CLASSES,
  Textarea,
  formatAbsolute,
  getStatusMeta,
  pluralize,
  type StatusTone,
} from '@/components/ui'
import type { ParentLink } from '@/components/ui'
import {
  ConceptNote,
  MetricList,
  TagChips,
  SKILL_HINTS,
  TRIGGER_TYPES,
  cohesionLevel,
  energyLevel,
  pct,
  ratioLevel,
  tagSummary,
} from '@/components/registry'
import { useSectionObserver, useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type {
  Skill,
  SkillStatus,
  SkillHealth,
  SkillHealthRecommendation,
  SkillMembers,
  SkillActivationResult,
  SkillTriggerPattern,
  Note,
  Decision,
} from '@/types'

// ── Health recommendation → tone ────────────────────────────────────────

const RECOMMENDATION: Record<SkillHealthRecommendation, { label: string; tone: StatusTone }> = {
  healthy: { label: 'Healthy', tone: 'success' },
  needs_attention: { label: 'Needs attention', tone: 'warning' },
  at_risk: { label: 'At risk', tone: 'danger' },
  should_archive: { label: 'Should be archived', tone: 'muted' },
}

/** Below this F1 score the backend skips the trigger (skills/models.rs). */
const UNRELIABLE_TRIGGER_QUALITY = 0.3

/** Section anchors (SectionNav targets). Stable array → stable observer. */
const SECTIONS = [
  { id: 'skill-vitals', label: 'Vital signs' },
  { id: 'skill-health', label: 'Health' },
  { id: 'skill-members', label: 'Members' },
  { id: 'skill-triggers', label: 'Triggers' },
  { id: 'skill-template', label: 'Template' },
  { id: 'skill-details', label: 'Details' },
]
const SECTION_IDS = SECTIONS.map((s) => s.id)

// ── Main component ──────────────────────────────────────────────────────

export function SkillDetailPage() {
  const { id: skillId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()
  const toast = useToast()
  const activeSection = useSectionObserver(SECTION_IDS)

  const [skill, setSkill] = useState<Skill | null>(null)
  const [health, setHealth] = useState<SkillHealth | null>(null)
  const [members, setMembers] = useState<SkillMembers | null>(null)
  const [project, setProject] = useState<{ name: string; slug: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Activation test dialog
  const [activationOpen, setActivationOpen] = useState(false)
  const [activationQuery, setActivationQuery] = useState('')
  const [activationResult, setActivationResult] = useState<SkillActivationResult | null>(null)
  const [activating, setActivating] = useState(false)

  // Context template editing
  const [editingTemplate, setEditingTemplate] = useState(false)
  const [templateDraft, setTemplateDraft] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  const fetchData = useCallback(async () => {
    if (!skillId) return
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
  }, [skillId])

  useEffect(() => {
    setLoading(true)
    fetchData()
  }, [fetchData])

  // Parent project (breadcrumb + details)
  const projectId = skill?.project_id
  useEffect(() => {
    if (!projectId || !wsSlug) return
    workspacesApi
      .listProjects(wsSlug)
      .then((ps) => {
        const p = ps.find((x) => x.id === projectId)
        setProject(p ? { name: p.name, slug: p.slug } : null)
      })
      .catch(() => {})
  }, [projectId, wsSlug])

  // ── Actions ─────────────────────────────────────────────────────────

  const handleStatusChange = async (newStatus: SkillStatus) => {
    if (!skill) return
    try {
      const updated = await skillsApi.update(skill.id, { status: newStatus })
      setSkill(updated)
      toast.success(`Status changed to ${getStatusMeta('skill', newStatus).label}`)
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handleDelete = async () => {
    if (!skill) return
    try {
      await skillsApi.delete(skill.id)
      toast.success('Skill deleted')
      navigate(workspacePath(wsSlug, '/skills'))
    } catch {
      toast.error('Failed to delete skill')
    }
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

  const openActivation = () => {
    setActivationOpen(true)
    setActivationResult(null)
    setActivationQuery('')
  }

  const handleActivate = async () => {
    if (!skill || !activationQuery.trim()) return
    setActivating(true)
    try {
      setActivationResult(await skillsApi.activate(skill.id, activationQuery.trim()))
    } catch {
      toast.error('Activation failed')
    } finally {
      setActivating(false)
    }
  }

  // Confirmation is asked by the row's ⋯ menu (`confirm` on the action, §9)
  const handleRemoveMember = async (entityType: 'note' | 'decision', entityId: string) => {
    if (!skill) return
    try {
      await skillsApi.removeMember(skill.id, entityType, entityId)
      setMembers(await skillsApi.getMembers(skill.id))
      toast.success('Member removed')
    } catch {
      toast.error('Failed to remove member')
    }
  }

  const removeConfirm = (entityType: 'note' | 'decision') => ({
    title: `Remove this ${entityType} from the skill?`,
    description: `The ${entityType} itself is kept; it just stops being part of “${skill?.name ?? 'this skill'}”.`,
    confirmLabel: 'Remove',
  })

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

  if (loading) {
    return (
      <PageContainer width="wide" className="space-y-6">
        <div className="space-y-2">
          <SkeletonLine width="30%" />
          <SkeletonLine width="60%" />
        </div>
        <EntityListSkeleton rows={4} />
      </PageContainer>
    )
  }
  if (error || !skill) {
    return (
      <PageContainer width="wide">
        <ErrorState title="Skill not found" description={error || 'The skill could not be loaded.'} onRetry={fetchData} />
      </PageContainer>
    )
  }

  const notes = members?.notes ?? []
  const decisions = members?.decisions ?? []
  const memberCount = members ? notes.length + decisions.length : skill.note_count + skill.decision_count

  const parentLinks: ParentLink[] = [
    { icon: Brain, label: 'Skills', name: 'All skills', href: workspacePath(wsSlug, '/skills') },
    ...(project
      ? [{ icon: Box, label: 'Project', name: project.name, href: workspacePath(wsSlug, `/projects/${project.slug}`) }]
      : []),
  ]

  const energy = energyLevel(skill.energy)
  const cohesion = cohesionLevel(skill.cohesion)
  const rec = health ? RECOMMENDATION[health.recommendation] ?? RECOMMENDATION.healthy : null

  return (
    <PageContainer width="wide" className="space-y-6">
      <PageHeader
        title={skill.name}
        description={skill.description}
        parentLinks={parentLinks}
        status={<StatusMenu kind="skill" status={skill.status} onChange={handleStatusChange} />}
        meta={[
          pluralize(memberCount, 'member'),
          pluralize(skill.activation_count, 'activation'),
          skill.last_activated ? <RelativeTime key="la" date={skill.last_activated} prefix="used " /> : 'never used',
          `v${skill.version}`,
        ]}
        actions={
          <Button size="sm" onClick={openActivation}>
            <Zap className="w-4 h-4 mr-1.5" aria-hidden="true" />
            Test activation
          </Button>
        }
        overflowActions={[
          { label: 'Export package', icon: Download, onClick: handleExport },
          {
            label: 'Edit context template',
            icon: Pencil,
            onClick: () => {
              setEditingTemplate(true)
              setTemplateDraft(skill.context_template || '')
              document.getElementById('skill-template')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            },
          },
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'danger',
            onClick: handleDelete,
            confirm: {
              title: 'Delete skill?',
              description: `Permanently delete “${skill.name}”? Its notes and decisions are kept, only the skill is removed. This cannot be undone.`,
            },
          },
        ]}
      >
        <TagChips tags={skill.tags} />
      </PageHeader>

      <ConceptNote summary="This skill groups notes and decisions about one topic. When an agent's request matches one of its triggers, its knowledge (and the context template below) is injected into the agent's context.">
        <p>
          “Test activation” simulates a request: you see which notes would be injected, with which score and which
          confidence level.
        </p>
        <p>
          Notes can be activated directly (skill members) or by propagation through the graph (neighbouring notes).
        </p>
      </ConceptNote>

      <SectionNav
        activeSection={activeSection}
        sections={SECTIONS.map((s) =>
          s.id === 'skill-members'
            ? { ...s, count: memberCount }
            : s.id === 'skill-triggers'
              ? { ...s, count: skill.trigger_patterns.length }
              : s,
        )}
      />

      {/* ── Vital signs ─────────────────────────────────────────── */}
      <Section id="skill-vitals" title="Vital signs" description="What the indicators of this skill measure.">
        <MetricList
          items={[
            { label: 'Energy', value: pct(skill.energy), level: energy, ratio: skill.energy, hint: SKILL_HINTS.energy },
            { label: 'Cohesion', value: pct(skill.cohesion), level: cohesion, ratio: skill.cohesion, hint: SKILL_HINTS.cohesion },
            {
              label: 'Hit rate',
              value: pct(skill.hit_rate),
              level: skill.activation_count > 0 ? ratioLevel(skill.hit_rate) : undefined,
              ratio: skill.hit_rate,
              hint: SKILL_HINTS.hitRate,
            },
            { label: 'Activations', value: skill.activation_count, hint: SKILL_HINTS.activations },
            { label: 'Coverage', value: skill.coverage, hint: SKILL_HINTS.coverage },
            {
              label: 'Members',
              value: `${skill.note_count} notes · ${skill.decision_count} decisions`,
              hint: SKILL_HINTS.members,
            },
          ]}
        />
      </Section>

      {/* ── Health ──────────────────────────────────────────────── */}
      <Section
        id="skill-health"
        title="Health"
        description="Diagnostic automatique : faut-il garder, surveiller ou archiver ce skill ?"
      >
        {health && rec ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 space-y-2">
            <MetaLine
              size="sm"
              items={[
                <span key="rec" className={`inline-flex items-center gap-1.5 ${TONE_CLASSES[rec.tone].text}`}>
                  <StatusDot tone={rec.tone} />
                  {rec.label}
                </span>,
                health.is_validated ? 'Validated' : 'Not validated',
                health.days_since_import != null ? `imported ${pluralize(health.days_since_import, 'day')} ago` : null,
              ]}
            />
            {health.explanation && <p className="text-sm text-gray-300 break-words">{health.explanation}</p>}
            {health.in_probation && (
              <p className="flex items-start gap-1.5 text-xs text-amber-400">
                <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  In probation
                  {health.probation_days_remaining != null && ` — ${pluralize(health.probation_days_remaining, 'day')} remaining`}
                  . An imported skill has to prove its usefulness before it is validated.
                </span>
              </p>
            )}
          </div>
        ) : (
          <EmptyState size="sm" title="Health data unavailable" />
        )}
      </Section>

      {/* ── Members ─────────────────────────────────────────────── */}
      <Section
        id="skill-members"
        title="Members"
        count={members ? notes.length + decisions.length : undefined}
        description="The knowledge this skill passes on: its notes and decisions."
      >
        {!members ? (
          <EmptyState size="sm" title="Members unavailable" description="The member list could not be loaded." />
        ) : notes.length + decisions.length === 0 ? (
          <EmptyState size="sm" title="No members yet" description="Link notes or decisions to this skill to give it content." />
        ) : (
          <div>
            {notes.length > 0 && (
              <ListGroup title="Notes" count={notes.length}>
                {notes.map((note) => (
                  <NoteMemberRow
                    key={note.id}
                    note={note}
                    onRemove={() => handleRemoveMember('note', note.id)}
                    confirm={removeConfirm('note')}
                  />
                ))}
              </ListGroup>
            )}
            {decisions.length > 0 && (
              <ListGroup title="Decisions" count={decisions.length}>
                {decisions.map((dec) => (
                  <DecisionMemberRow
                    key={dec.id}
                    decision={dec}
                    href={workspacePath(wsSlug, `/decisions/${dec.id}`)}
                    onRemove={() => handleRemoveMember('decision', dec.id)}
                    confirm={removeConfirm('decision')}
                  />
                ))}
              </ListGroup>
            )}
          </div>
        )}
      </Section>

      {/* ── Triggers ────────────────────────────────────────────── */}
      <Section
        id="skill-triggers"
        title="Triggers"
        count={skill.trigger_patterns.length}
        description="When this skill activates: each pattern is compared with what the agent is doing. The threshold is the minimum confidence to fire; quality (F1) measures its past reliability."
      >
        {skill.trigger_patterns.length === 0 ? (
          <EmptyState size="sm" title="No triggers" description="Without triggers the skill can only be activated manually." />
        ) : (
          <EntityList aria-label="Trigger patterns">
            {skill.trigger_patterns.map((p, i) => (
              <TriggerRow key={`${p.pattern_type}-${p.pattern_value}-${i}`} pattern={p} />
            ))}
          </EntityList>
        )}
      </Section>

      {/* ── Context template ────────────────────────────────────── */}
      <Section
        id="skill-template"
        title="Context template"
        description="Markdown text added to the agent's context when the skill activates."
        action={
          !editingTemplate ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditingTemplate(true)
                setTemplateDraft(skill.context_template || '')
              }}
            >
              <Pencil className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
              Edit
            </Button>
          ) : undefined
        }
      >
        {editingTemplate ? (
          <div className="space-y-2">
            <Textarea
              aria-label="Context template"
              value={templateDraft}
              onChange={(e) => setTemplateDraft(e.target.value)}
              rows={8}
              className="font-mono"
              placeholder="Markdown template for the activation context…"
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditingTemplate(false)}>
                <X className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveTemplate} loading={savingTemplate}>
                {!savingTemplate && <Check className="w-3.5 h-3.5 mr-1" aria-hidden="true" />}
                Save
              </Button>
            </div>
          </div>
        ) : skill.context_template ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <CollapsibleMarkdown content={skill.context_template} />
          </div>
        ) : (
          <EmptyState size="sm" title="No context template" description="Only the member notes are injected on activation." />
        )}
      </Section>

      {/* ── Details ─────────────────────────────────────────────── */}
      <Section id="skill-details" title="Details">
        <Facts
          items={[
            { label: 'Project', value: project?.name ?? skill.project_id },
            { label: 'Created', value: formatAbsolute(skill.created_at) },
            { label: 'Updated', value: formatAbsolute(skill.updated_at) },
            { label: 'Last used', value: skill.last_activated ? formatAbsolute(skill.last_activated) : 'Never' },
            { label: 'Imported', value: skill.imported_at ? formatAbsolute(skill.imported_at) : null },
            { label: 'Validated', value: skill.is_validated ? 'Yes' : 'No' },
            { label: 'Version', value: `v${skill.version}` },
            {
              label: 'Fingerprint',
              value: skill.fingerprint ? (
                <span className="font-mono text-xs break-all" title={skill.fingerprint}>
                  {skill.fingerprint.slice(0, 16)}…
                </span>
              ) : null,
            },
            { label: 'ID', value: <span className="font-mono text-xs break-all">{skill.id}</span> },
          ]}
        />
      </Section>

      {/* ENTITY_GRAPH_SLOT entity_type="skill" entity_id={skill.id} */}

      {/* ── Activation test dialog ──────────────────────────────── */}
      <Dialog open={activationOpen} onClose={() => setActivationOpen(false)} title="Test activation" size="lg">
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Type a request the way an agent would: the skill returns the notes it would inject and its confidence.
          </p>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              handleActivate()
            }}
          >
            <Input
              type="text"
              aria-label="Activation query"
              placeholder="e.g. how do we handle auth tokens?"
              value={activationQuery}
              onChange={(e) => setActivationQuery(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm" loading={activating} disabled={!activationQuery.trim()}>
                {!activating && <Zap className="w-4 h-4 mr-1" aria-hidden="true" />}
                Activate
              </Button>
            </div>
          </form>

          {activationResult && <ActivationResultView result={activationResult} />}
        </div>
      </Dialog>
    </PageContainer>
  )
}

// ── Member rows ─────────────────────────────────────────────────────────

type RemoveConfirm = { title: string; description?: string; confirmLabel?: string }

function NoteMemberRow({ note, onRemove, confirm }: { note: Note; onRemove: () => Promise<void>; confirm: RemoveConfirm }) {
  const [open, setOpen] = useState(false)
  return (
    <EntityRow
      title={note.content}
      onClick={() => setOpen((v) => !v)}
      ariaLabel={`Note: ${note.content.slice(0, 60)}`}
      expanded={open}
      trailing={<RelativeTime date={note.created_at} />}
      meta={[
        note.note_type,
        <StatusText key="imp" kind="importance" status={note.importance} />,
        note.status !== 'active' ? <StatusText key="st" kind="note" status={note.status} /> : null,
        tagSummary(note.tags),
      ]}
      actions={[{ label: 'Remove from skill', icon: X, variant: 'danger', onClick: onRemove, confirm }]}
    >
      {open && (
        <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
          <CollapsibleMarkdown content={note.content} />
        </div>
      )}
    </EntityRow>
  )
}

function DecisionMemberRow({
  decision,
  href,
  onRemove,
  confirm,
}: {
  decision: Decision
  href: string
  onRemove: () => Promise<void>
  confirm: RemoveConfirm
}) {
  return (
    <EntityRow
      title={decision.description}
      href={href}
      trailing={<RelativeTime date={decision.decided_at} />}
      meta={[
        <StatusText key="st" kind="decision" status={decision.status} />,
        decision.chosen_option ? (
          <span key="ch" className="truncate max-w-[16rem]" title={`Chosen: ${decision.chosen_option}`}>
            Chosen: {decision.chosen_option}
          </span>
        ) : null,
      ]}
      actions={[{ label: 'Remove from skill', icon: X, variant: 'danger', onClick: onRemove, confirm }]}
    />
  )
}

// ── Trigger row ─────────────────────────────────────────────────────────

function TriggerRow({ pattern }: { pattern: SkillTriggerPattern }) {
  const type = TRIGGER_TYPES[pattern.pattern_type] ?? { label: pattern.pattern_type, hint: '' }
  const unreliable = pattern.quality_score != null && pattern.quality_score < UNRELIABLE_TRIGGER_QUALITY
  return (
    <EntityRow
      title={<span className="font-mono text-[13px] break-all">{pattern.pattern_value}</span>}
      ariaLabel={`${type.label} trigger ${pattern.pattern_value}`}
      description={type.hint || undefined}
      meta={[
        <span key="type" className="text-gray-300">{type.label}</span>,
        `threshold ${pattern.confidence_threshold.toFixed(2)}`,
        pattern.quality_score != null ? (
          <span key="q" className={unreliable ? 'text-amber-400' : undefined}>
            quality {pattern.quality_score.toFixed(2)}
            {unreliable && ' · unreliable, skipped'}
          </span>
        ) : null,
      ]}
    />
  )
}

// ── Activation result ───────────────────────────────────────────────────

function ActivationResultView({ result }: { result: SkillActivationResult }) {
  const confidence = ratioLevel(result.confidence)
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between gap-3 text-xs mb-1">
          <span className="text-gray-400">Confidence</span>
          <span className={`tabular-nums ${TONE_CLASSES[confidence.tone].text}`}>{pct(result.confidence)}</span>
        </div>
        <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden" aria-hidden="true">
          <div
            className={`h-full rounded-full ${TONE_CLASSES[confidence.tone].dot}`}
            style={{ width: `${Math.max(result.confidence * 100, 1)}%` }}
          />
        </div>
      </div>
      <MetaLine
        size="sm"
        items={[
          `${pluralize(result.activated_notes.length, 'note')} activated`,
          pluralize(result.relevant_decisions.length, 'decision'),
        ]}
      />
      {result.activated_notes.length > 0 && (
        <EntityList aria-label="Activated notes">
          {result.activated_notes.map((a) => (
            <EntityRow
              key={a.note.id}
              title={a.note.content}
              trailing={<span className="tabular-nums">{pct(a.activation_score)}</span>}
              meta={[
                a.note.note_type,
                a.source === 'direct'
                  ? 'direct member'
                  : `propagated via ${a.source.propagated.via} (${pluralize(a.source.propagated.hops, 'hop')})`,
              ]}
            />
          ))}
        </EntityList>
      )}
      {result.context_text && (
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 max-h-64 overflow-y-auto">
          <CollapsibleMarkdown content={result.context_text} />
        </div>
      )}
    </div>
  )
}
