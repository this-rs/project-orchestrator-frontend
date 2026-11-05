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
  Meter,
  SkeletonLine,
  StatusMenu,
  StatusText,
  TONE_CLASSES,
  Textarea,
  ToneText,
  formatAbsolute,
  getStatusMeta,
  type StatusTone,
} from '@/components/ui'
import type { ParentLink } from '@/components/ui'
import {
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
import { decisionTitle } from '@/components/knowledge/noteMeta'
import { Explainer } from '@/components/protocols/Explainer'
import { useT, type MessageKey } from '@/i18n'
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

type Translate = ReturnType<typeof useT>['t']
type Noun = 'member' | 'activation' | 'note' | 'decision' | 'day' | 'hop'
/** `1 note` / `2 notes`, from the `nouns` keys. */
const count = (t: Translate, n: number, noun: Noun) => t(`siteSkills.nouns.${noun}.${n === 1 ? 'one' : 'other'}`, { count: n })

// ── Health recommendation → tone ────────────────────────────────────────

const RECOMMENDATION: Record<SkillHealthRecommendation, { labelKey: MessageKey; tone: StatusTone }> = {
  healthy: { labelKey: 'siteSkills.skillDetail.recommendation.healthy', tone: 'success' },
  needs_attention: { labelKey: 'siteSkills.skillDetail.recommendation.needsAttention', tone: 'warning' },
  at_risk: { labelKey: 'siteSkills.skillDetail.recommendation.atRisk', tone: 'danger' },
  should_archive: { labelKey: 'siteSkills.skillDetail.recommendation.shouldArchive', tone: 'muted' },
}

/** Below this F1 score the backend skips the trigger (skills/models.rs). */
const UNRELIABLE_TRIGGER_QUALITY = 0.3

/** Section anchors (SectionNav targets). Stable array → stable observer. */
const SECTIONS: { id: string; labelKey: MessageKey }[] = [
  { id: 'skill-vitals', labelKey: 'siteSkills.skillDetail.sections.vitalSigns' },
  { id: 'skill-health', labelKey: 'siteSkills.skillDetail.sections.health' },
  { id: 'skill-members', labelKey: 'siteSkills.skillDetail.sections.members' },
  { id: 'skill-triggers', labelKey: 'siteSkills.skillDetail.sections.triggers' },
  { id: 'skill-template', labelKey: 'siteSkills.skillDetail.sections.template' },
  { id: 'skill-details', labelKey: 'siteSkills.skillDetail.sections.details' },
]
const SECTION_IDS = SECTIONS.map((s) => s.id)

// ── Main component ──────────────────────────────────────────────────────

export function SkillDetailPage() {
  const { id: skillId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()
  const toast = useToast()
  const { t } = useT()
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
      setError(t('siteSkills.skillDetail.loadFailed'))
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
      toast.success(t('siteSkills.common.statusChanged', { status: getStatusMeta('skill', newStatus).label }))
    } catch {
      toast.error(t('siteSkills.common.statusFailed'))
    }
  }

  const handleDelete = async () => {
    if (!skill) return
    try {
      await skillsApi.delete(skill.id)
      toast.success(t('siteSkills.skillDetail.deleted'))
      navigate(workspacePath(wsSlug, '/skills'))
    } catch {
      toast.error(t('siteSkills.skillDetail.deleteFailed'))
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
      toast.success(t('siteSkills.skillDetail.exported'))
    } catch {
      toast.error(t('siteSkills.skillDetail.exportFailed'))
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
      toast.error(t('siteSkills.skillDetail.activationFailed'))
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
      toast.success(t('siteSkills.skillDetail.members.memberRemoved'))
    } catch {
      toast.error(t('siteSkills.skillDetail.members.memberRemoveFailed'))
    }
  }

  const removeConfirm = (entityType: 'note' | 'decision') => {
    const name = skill?.name ?? t('siteSkills.skillDetail.members.thisSkill')
    return entityType === 'note'
      ? {
          title: t('siteSkills.skillDetail.members.removeNoteTitle'),
          description: t('siteSkills.skillDetail.members.removeNoteDescription', { name }),
          confirmLabel: t('siteSkills.common.remove'),
        }
      : {
          title: t('siteSkills.skillDetail.members.removeDecisionTitle'),
          description: t('siteSkills.skillDetail.members.removeDecisionDescription', { name }),
          confirmLabel: t('siteSkills.common.remove'),
        }
  }

  const handleSaveTemplate = async () => {
    if (!skill) return
    setSavingTemplate(true)
    try {
      const updated = await skillsApi.update(skill.id, { context_template: templateDraft })
      setSkill(updated)
      setEditingTemplate(false)
      toast.success(t('siteSkills.skillDetail.template.templateSaved'))
    } catch {
      toast.error(t('siteSkills.skillDetail.template.templateSaveFailed'))
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
        <ErrorState
          title={t('siteSkills.skillDetail.notFound')}
          description={error || t('siteSkills.skillDetail.loadFailedHint')}
          onRetry={fetchData}
        />
      </PageContainer>
    )
  }

  const notes = members?.notes ?? []
  const decisions = members?.decisions ?? []
  const memberCount = members ? notes.length + decisions.length : skill.note_count + skill.decision_count

  const parentLinks: ParentLink[] = [
    { icon: Brain, label: t('siteSkills.skillDetail.parent.skills'), name: t('siteSkills.skillDetail.parent.allSkills'), href: workspacePath(wsSlug, '/skills') },
    ...(project
      ? [{ icon: Box, label: t('siteSkills.common.project'), name: project.name, href: workspacePath(wsSlug, `/projects/${project.slug}`) }]
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
          count(t, memberCount, 'member'),
          count(t, skill.activation_count, 'activation'),
          skill.last_activated ? (
            <RelativeTime key="la" date={skill.last_activated} prefix={`${t('siteSkills.skillDetail.used')} `} />
          ) : (
            t('siteSkills.common.neverUsed')
          ),
          `v${skill.version}`,
        ]}
        actions={
          <Button size="sm" onClick={openActivation}>
            <Zap className="w-4 h-4 mr-1.5" aria-hidden="true" />
            {t('siteSkills.skillDetail.testActivation')}
          </Button>
        }
        overflowActions={[
          { label: t('siteSkills.skillDetail.exportPackage'), icon: Download, onClick: handleExport },
          {
            label: t('siteSkills.common.delete'),
            icon: Trash2,
            variant: 'danger',
            onClick: handleDelete,
            confirm: {
              title: t('siteSkills.skills.deleteTitle'),
              description: t('siteSkills.skills.deleteDescription', { name: skill.name }),
            },
          },
        ]}
      >
        <TagChips tags={skill.tags} />
      </PageHeader>

      <Explainer>{t('siteSkills.skillDetail.explainer')}</Explainer>

      <SectionNav
        activeSection={activeSection}
        sections={SECTIONS.map((s) => {
          const section = { id: s.id, label: t(s.labelKey) }
          return s.id === 'skill-members'
            ? { ...section, count: memberCount }
            : s.id === 'skill-triggers'
              ? { ...section, count: skill.trigger_patterns.length }
              : section
        })}
      />

      {/* ── Vital signs ─────────────────────────────────────────── */}
      <Section id="skill-vitals" title={t('siteSkills.skillDetail.sections.vitalSigns')} description={t('siteSkills.skillDetail.vitals.hint')}>
        <MetricList
          items={[
            { label: t('siteSkills.skillDetail.vitals.energy'), value: pct(skill.energy), level: energy, ratio: skill.energy, hint: SKILL_HINTS.energy },
            { label: t('siteSkills.skillDetail.vitals.cohesion'), value: pct(skill.cohesion), level: cohesion, ratio: skill.cohesion, hint: SKILL_HINTS.cohesion },
            {
              label: t('siteSkills.skillDetail.vitals.hitRate'),
              value: pct(skill.hit_rate),
              level: skill.activation_count > 0 ? ratioLevel(skill.hit_rate) : undefined,
              ratio: skill.hit_rate,
              hint: SKILL_HINTS.hitRate,
            },
            { label: t('siteSkills.skillDetail.vitals.activations'), value: skill.activation_count, hint: SKILL_HINTS.activations },
            { label: t('siteSkills.skillDetail.vitals.coverage'), value: skill.coverage, hint: SKILL_HINTS.coverage },
            {
              label: t('siteSkills.skillDetail.vitals.members'),
              value: t('siteSkills.skillDetail.vitals.membersValue', { notes: skill.note_count, decisions: skill.decision_count }),
              hint: SKILL_HINTS.members,
            },
          ]}
        />
      </Section>

      {/* ── Health ──────────────────────────────────────────────── */}
      <Section
        id="skill-health"
        title={t('siteSkills.skillDetail.sections.health')}
        description={t('siteSkills.skillDetail.health.hint')}
      >
        {health && rec ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 space-y-2">
            <MetaLine
              size="sm"
              items={[
                <ToneText key="rec" tone={rec.tone} label={t(rec.labelKey)} />,
                health.is_validated ? t('siteSkills.skillDetail.details.validated') : t('siteSkills.skillDetail.health.notValidated'),
                health.days_since_import != null
                  ? t('siteSkills.skillDetail.health.importedAgo', { days: count(t, health.days_since_import, 'day') })
                  : null,
              ]}
            />
            {health.explanation && <p className="text-sm text-gray-300 break-words">{health.explanation}</p>}
            {health.in_probation && (
              <p className="flex items-start gap-1.5 text-xs text-amber-400">
                <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  {t('siteSkills.skillDetail.health.inProbation')}
                  {health.probation_days_remaining != null &&
                    t('siteSkills.skillDetail.health.probationRemaining', { days: count(t, health.probation_days_remaining, 'day') })}
                  {t('siteSkills.skillDetail.health.probationExplain')}
                </span>
              </p>
            )}
          </div>
        ) : (
          <EmptyState size="sm" title={t('siteSkills.skillDetail.health.unavailable')} />
        )}
      </Section>

      {/* ── Members ─────────────────────────────────────────────── */}
      <Section
        id="skill-members"
        title={t('siteSkills.skillDetail.sections.members')}
        count={members ? notes.length + decisions.length : undefined}
        description={t('siteSkills.skillDetail.members.hint')}
      >
        {!members ? (
          <EmptyState
            size="sm"
            title={t('siteSkills.skillDetail.members.unavailable')}
            description={t('siteSkills.skillDetail.members.unavailableHint')}
          />
        ) : notes.length + decisions.length === 0 ? (
          <EmptyState
            size="sm"
            title={t('siteSkills.skillDetail.members.none')}
            description={t('siteSkills.skillDetail.members.noneHint')}
          />
        ) : (
          <div>
            {notes.length > 0 && (
              <ListGroup title={t('siteSkills.skillDetail.members.notes')} count={notes.length}>
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
              <ListGroup title={t('siteSkills.skillDetail.members.decisions')} count={decisions.length}>
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
        title={t('siteSkills.skillDetail.sections.triggers')}
        count={skill.trigger_patterns.length}
        description={t('siteSkills.skillDetail.triggers.hint')}
      >
        {skill.trigger_patterns.length === 0 ? (
          <EmptyState
            size="sm"
            title={t('siteSkills.skillDetail.triggers.none')}
            description={t('siteSkills.skillDetail.triggers.noneHint')}
          />
        ) : (
          <EntityList aria-label={t('siteSkills.skillDetail.triggers.listLabel')}>
            {skill.trigger_patterns.map((p, i) => (
              <TriggerRow key={`${p.pattern_type}-${p.pattern_value}-${i}`} pattern={p} />
            ))}
          </EntityList>
        )}
      </Section>

      {/* ── Context template ────────────────────────────────────── */}
      <Section
        id="skill-template"
        title={t('siteSkills.skillDetail.template.title')}
        description={t('siteSkills.skillDetail.template.hint')}
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
              {t('siteSkills.common.edit')}
            </Button>
          ) : undefined
        }
      >
        {editingTemplate ? (
          <div className="space-y-2">
            <Textarea
              aria-label={t('siteSkills.skillDetail.template.ariaLabel')}
              value={templateDraft}
              onChange={(e) => setTemplateDraft(e.target.value)}
              rows={8}
              className="font-mono"
              placeholder={t('siteSkills.skillDetail.template.placeholder')}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditingTemplate(false)}>
                <X className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                {t('siteSkills.common.cancel')}
              </Button>
              <Button size="sm" onClick={handleSaveTemplate} loading={savingTemplate}>
                {!savingTemplate && <Check className="w-3.5 h-3.5 mr-1" aria-hidden="true" />}
                {t('siteSkills.common.save')}
              </Button>
            </div>
          </div>
        ) : skill.context_template ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <CollapsibleMarkdown content={skill.context_template} />
          </div>
        ) : (
          <EmptyState
            size="sm"
            title={t('siteSkills.skillDetail.template.none')}
            description={t('siteSkills.skillDetail.template.noneHint')}
          />
        )}
      </Section>

      {/* ── Details ─────────────────────────────────────────────── */}
      <Section id="skill-details" title={t('siteSkills.skillDetail.sections.details')}>
        <Facts
          items={[
            { label: t('siteSkills.common.project'), value: project?.name ?? skill.project_id },
            { label: t('siteSkills.skillDetail.details.created'), value: formatAbsolute(skill.created_at) },
            { label: t('siteSkills.skillDetail.details.updated'), value: formatAbsolute(skill.updated_at) },
            {
              label: t('siteSkills.skillDetail.details.lastUsed'),
              value: skill.last_activated ? formatAbsolute(skill.last_activated) : t('siteSkills.common.never'),
            },
            {
              label: t('siteSkills.skillDetail.details.imported'),
              value: skill.imported_at ? formatAbsolute(skill.imported_at) : null,
            },
            { label: t('siteSkills.skillDetail.details.validated'), value: skill.is_validated ? t('siteSkills.common.yes') : t('siteSkills.common.no') },
            { label: t('siteSkills.skillDetail.details.version'), value: `v${skill.version}` },
            {
              label: t('siteSkills.skillDetail.details.fingerprint'),
              value: skill.fingerprint ? (
                <span className="font-mono text-xs break-all" title={skill.fingerprint}>
                  {skill.fingerprint.slice(0, 16)}…
                </span>
              ) : null,
            },
            { label: t('siteSkills.skillDetail.details.id'), value: <span className="font-mono text-xs break-all">{skill.id}</span> },
          ]}
        />
      </Section>

      {/* ENTITY_GRAPH_SLOT entity_type="skill" entity_id={skill.id} */}

      {/* ── Activation test dialog ──────────────────────────────── */}
      <Dialog open={activationOpen} onClose={() => setActivationOpen(false)} title={t('siteSkills.skillDetail.testActivation')} size="lg">
        <div className="space-y-4">
          <p className="text-xs text-gray-500">{t('siteSkills.skillDetail.activation.hint')}</p>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              handleActivate()
            }}
          >
            <Input
              type="text"
              aria-label={t('siteSkills.skillDetail.activation.queryAria')}
              placeholder={t('siteSkills.skillDetail.activation.queryPlaceholder')}
              value={activationQuery}
              onChange={(e) => setActivationQuery(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm" loading={activating} disabled={!activationQuery.trim()}>
                {!activating && <Zap className="w-4 h-4 mr-1" aria-hidden="true" />}
                {t('siteSkills.common.activate')}
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
  const { t } = useT()
  const [open, setOpen] = useState(false)
  return (
    <EntityRow
      title={note.content}
      entityRef={{ kind: 'note', id: note.id, label: note.content.slice(0, 80) }}
      onClick={() => setOpen((v) => !v)}
      ariaLabel={t('siteSkills.skillDetail.members.noteAria', { content: note.content.slice(0, 60) })}
      expanded={open}
      trailing={<RelativeTime date={note.created_at} />}
      meta={[
        note.status !== 'active' ? <StatusText key="st" kind="note" status={note.status} /> : null,
        <StatusText key="imp" kind="importance" status={note.importance} />,
        note.note_type,
        tagSummary(note.tags),
      ]}
      actions={[{ label: t('siteSkills.common.remove'), icon: X, variant: 'danger', onClick: onRemove, confirm }]}
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
  const { t } = useT()
  return (
    <EntityRow
      title={decisionTitle(decision.description)}
      entityRef={{ kind: 'decision', id: decision.id }}
      href={href}
      trailing={<RelativeTime date={decision.decided_at} />}
      meta={[
        <StatusText key="st" kind="decision" status={decision.status} />,
        decision.chosen_option ? (
          <span key="ch" className="truncate max-w-[16rem]" title={t('siteSkills.skillDetail.members.chosen', { option: decision.chosen_option })}>
            {t('siteSkills.skillDetail.members.chosen', { option: decision.chosen_option })}
          </span>
        ) : null,
      ]}
      actions={[{ label: t('siteSkills.common.remove'), icon: X, variant: 'danger', onClick: onRemove, confirm }]}
    />
  )
}

// ── Trigger row ─────────────────────────────────────────────────────────

function TriggerRow({ pattern }: { pattern: SkillTriggerPattern }) {
  const { t } = useT()
  const type = TRIGGER_TYPES[pattern.pattern_type] ?? { label: pattern.pattern_type, hint: '' }
  const unreliable = pattern.quality_score != null && pattern.quality_score < UNRELIABLE_TRIGGER_QUALITY
  return (
    <EntityRow
      title={<span className="font-mono text-[13px] break-all">{pattern.pattern_value}</span>}
      ariaLabel={t('siteSkills.skillDetail.triggers.triggerAria', { type: type.label, value: pattern.pattern_value })}
      description={type.hint || undefined}
      meta={[
        <span key="type" className="text-gray-300">{type.label}</span>,
        t('siteSkills.skillDetail.triggers.threshold', { value: pattern.confidence_threshold.toFixed(2) }),
        pattern.quality_score != null ? (
          <span key="q" className={unreliable ? 'text-amber-400' : undefined}>
            {t('siteSkills.skillDetail.triggers.quality', { value: pattern.quality_score.toFixed(2) })}
            {unreliable && ` · ${t('siteSkills.skillDetail.triggers.unreliable')}`}
          </span>
        ) : null,
      ]}
    />
  )
}

// ── Activation result ───────────────────────────────────────────────────

function ActivationResultView({ result }: { result: SkillActivationResult }) {
  const { t } = useT()
  const confidence = ratioLevel(result.confidence)
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between gap-3 text-xs mb-1">
          <span className="text-gray-400">{t('siteSkills.skillDetail.activation.confidence')}</span>
          <span className={`tabular-nums ${TONE_CLASSES[confidence.tone].text}`}>{pct(result.confidence)}</span>
        </div>
        <Meter size="bar" value={result.confidence} tone={confidence.tone} />
      </div>
      <MetaLine
        size="sm"
        items={[
          t('siteSkills.skillDetail.activation.activated', { notes: count(t, result.activated_notes.length, 'note') }),
          count(t, result.relevant_decisions.length, 'decision'),
        ]}
      />
      {result.activated_notes.length > 0 && (
        <EntityList aria-label={t('siteSkills.skillDetail.activation.activatedNotesAria')}>
          {result.activated_notes.map((a) => (
            <EntityRow
              key={a.note.id}
              title={a.note.content}
              trailing={<span className="tabular-nums">{pct(a.activation_score)}</span>}
              meta={[
                a.note.note_type,
                a.source === 'direct'
                  ? t('siteSkills.skillDetail.activation.directMember')
                  : t('siteSkills.skillDetail.activation.propagated', {
                      via: a.source.propagated.via,
                      hops: count(t, a.source.propagated.hops, 'hop'),
                    }),
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
