import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Users, Box, Zap, Pencil, Trash2, Unlink } from 'lucide-react'
import { personasApi, skillsApi, notesApi, decisionsApi, protocolApi, workspacesApi } from '@/services'
import {
  Button,
  CollapsibleMarkdown,
  EmptyState,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  Facts,
  FormDialog,
  ListGroup,
  PageContainer,
  PageHeader,
  RelativeTime,
  Section,
  SkeletonLine,
  StatusMenu,
  formatAbsolute,
  formatCost,
  formatDurationMs,
  getStatusMeta,
} from '@/components/ui'
import type { ParentLink } from '@/components/ui'
import {
  MetricList,
  PERSONA_HINTS,
  cohesionLevel,
  energyLevel,
  pct,
  ratioLevel,
} from '@/components/registry'
import { EditPersonaForm, type EditPersonaFormData } from '@/components/forms'
import { Explainer } from '@/components/protocols/Explainer'
import { useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { Persona, PersonaOrigin, PersonaStatus, PersonaSubgraph, PersonaSubgraphRelation } from '@/types'
import { decisionTitle, noteTitle } from '@/components/knowledge/noteMeta'
import { activeTranslator, useT, type MessageKey } from '@/i18n'

type Translate = ReturnType<typeof useT>['t']
type Noun = 'member' | 'activation' | 'day' | 'hop'
/** `1 activation` / `2 activations`, from the `nouns` keys. */
const count = (t: Translate, n: number, noun: Noun) => t(`siteSkills.nouns.${noun}.${n === 1 ? 'one' : 'other'}`, { count: n })

// ── Relation kinds ──────────────────────────────────────────────────────

type RelationKey = 'files' | 'functions' | 'notes' | 'decisions' | 'skills' | 'protocols' | 'parents' | 'children'

interface RelationKind {
  key: RelationKey
  /** Translation key of the group title. */
  labelKey: MessageKey
  /** Detail route of the target, if any (workspace-relative). */
  route?: (id: string) => string
  /** The target id is a code path (rendered mono, not resolved). */
  code?: boolean
}

const RELATION_KINDS: RelationKind[] = [
  { key: 'files', labelKey: 'siteSkills.personaDetail.relations.files', code: true },
  { key: 'functions', labelKey: 'siteSkills.personaDetail.relations.functions', code: true },
  { key: 'notes', labelKey: 'siteSkills.personaDetail.relations.notes' },
  { key: 'decisions', labelKey: 'siteSkills.personaDetail.relations.decisions', route: (id) => `/decisions/${id}` },
  { key: 'skills', labelKey: 'siteSkills.personaDetail.relations.skills', route: (id) => `/skills/${id}` },
  { key: 'protocols', labelKey: 'siteSkills.personaDetail.relations.protocols', route: (id) => `/protocols/${id}` },
  { key: 'parents', labelKey: 'siteSkills.personaDetail.relations.parents', route: (id) => `/personas/${id}` },
  { key: 'children', labelKey: 'siteSkills.personaDetail.relations.children', route: (id) => `/personas/${id}` },
]

const ORIGIN_LABEL: Record<PersonaOrigin, MessageKey> = {
  manual: 'siteSkills.personaDetail.origin.manual',
  auto_build: 'siteSkills.personaDetail.origin.autoBuild',
  imported: 'siteSkills.personaDetail.origin.imported',
}

/** Max targets resolved to a readable name per relation kind. */
const RESOLVE_CAP = 50

/**
 * Exact seconds for a configured value (`90s` must not read as `1m`):
 * `45s`, `1m 30s`, `5m`, `1h 5m`. Measured averages keep `formatDurationMs`.
 */
function formatSecondsExact(secs: number): string {
  const t = activeTranslator().t
  const [unitS, unitM, unitH] = [t('siteRest.units.s'), t('siteRest.units.m'), t('siteRest.units.h')]
  const s = Math.max(0, Math.round(secs))
  if (s < 60) return `${s}${unitS}`
  const m = Math.floor(s / 60)
  const rest = s % 60
  if (m < 60) return rest ? `${m}${unitM} ${rest}${unitS}` : `${m}${unitM}`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h}${unitH} ${m % 60}${unitM}` : `${h}${unitH}`
}

interface Resolved {
  title: string
  /** Full text for expandable rows (notes). */
  body?: string
  sub?: string
}

// ── Main page ───────────────────────────────────────────────────────────

export function PersonaDetailPage() {
  const { id: personaId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()
  const toast = useToast()
  const { t } = useT()

  const [persona, setPersona] = useState<Persona | null>(null)
  const [subgraph, setSubgraph] = useState<PersonaSubgraph | null>(null)
  const [project, setProject] = useState<{ name: string; slug: string } | null>(null)
  const [resolved, setResolved] = useState<Record<string, Resolved>>({})
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [activating, setActivating] = useState(false)

  const loadPersona = useCallback(async () => {
    if (!personaId) return
    setFailed(false)
    try {
      // The subgraph is optional: a failure there must not hide the persona
      const [p, sg] = await Promise.all([
        personasApi.get(personaId),
        personasApi.getSubgraph(personaId).catch(() => null),
      ])
      setPersona(p)
      setSubgraph(sg)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [personaId])

  useEffect(() => {
    setLoading(true)
    loadPersona()
  }, [loadPersona])

  // Parent project
  const projectId = persona?.project_id
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

  // Resolve relation targets (UUIDs) to readable names
  useEffect(() => {
    if (!subgraph) return
    let cancelled = false
    const jobs: Promise<[string, Resolved] | null>[] = []
    const add = (rels: PersonaSubgraphRelation[] | undefined, fetch: (id: string) => Promise<Resolved>) => {
      for (const r of (rels ?? []).slice(0, RESOLVE_CAP)) {
        jobs.push(
          fetch(r.entity_id)
            .then((v): [string, Resolved] => [r.entity_id, v])
            .catch(() => null),
        )
      }
    }
    add(subgraph.skills, async (id) => {
      const s = await skillsApi.get(id)
      return { title: s.name, sub: getStatusMeta('skill', s.status).label }
    })
    add(subgraph.protocols, async (id) => ({ title: (await protocolApi.getProtocol(id)).name }))
    add(subgraph.notes, async (id) => {
      const n = await notesApi.get(id)
      return { title: noteTitle(n.content), body: n.content, sub: n.note_type }
    })
    add(subgraph.decisions, async (id) => {
      const d = await decisionsApi.get(id)
      return { title: decisionTitle(d.description), sub: d.chosen_option ? `Chosen: ${d.chosen_option}` : undefined }
    })
    const personaName = async (id: string) => ({ title: (await personasApi.get(id)).name })
    add(subgraph.parents, personaName)
    add(subgraph.children, personaName)

    Promise.all(jobs).then((entries) => {
      if (cancelled) return
      setResolved(Object.fromEntries(entries.filter((e): e is [string, Resolved] => e !== null)))
    })
    return () => {
      cancelled = true
    }
  }, [subgraph])

  // ── Actions ───────────────────────────────────────────────────────────

  const handleStatusChange = async (status: PersonaStatus) => {
    if (!persona) return
    try {
      setPersona(await personasApi.update(persona.id, { status }))
      toast.success(t('siteSkills.common.statusChanged', { status: getStatusMeta('persona', status).label }))
    } catch {
      toast.error(t('siteSkills.common.statusFailed'))
    }
  }

  const handleSave = async (data: EditPersonaFormData) => {
    if (!persona) return
    // Errors are surfaced by FormDialog (toast, dialog stays open)
    setPersona(await personasApi.update(persona.id, data))
    toast.success(t('siteSkills.personaDetail.saved'))
  }

  const handleActivate = async () => {
    if (!persona) return
    setActivating(true)
    try {
      await personasApi.activate(persona.id)
      toast.success(t('siteSkills.personaDetail.activated'))
      await loadPersona()
    } catch {
      toast.error(t('siteSkills.personaDetail.activateFailed'))
    } finally {
      setActivating(false)
    }
  }

  const handleDelete = async () => {
    if (!persona) return
    try {
      await personasApi.delete(persona.id)
      toast.success(t('siteSkills.personas.toast.deleted', { name: persona.name }))
      navigate(workspacePath(wsSlug, '/personas'))
    } catch {
      toast.error(t('siteSkills.personas.toast.deleteFailed'))
    }
  }

  const removers = useMemo((): Partial<Record<RelationKey, (id: string) => Promise<unknown>>> => {
    if (!personaId) return {}
    return {
      files: (id) => personasApi.removeFile(personaId, id),
      functions: (id) => personasApi.removeFunction(personaId, id),
      notes: (id) => personasApi.removeNote(personaId, id),
      decisions: (id) => personasApi.removeDecision(personaId, id),
      skills: (id) => personasApi.removeSkill(personaId, id),
      protocols: (id) => personasApi.removeProtocol(personaId, id),
      parents: (id) => personasApi.removeExtends(personaId, id),
    }
  }, [personaId])

  const handleRemove = async (kind: RelationKind, entityId: string) => {
    const remove = removers[kind.key]
    if (!remove) return
    try {
      await remove(entityId)
      setSubgraph((sg) => (sg ? { ...sg, [kind.key]: (sg[kind.key] ?? []).filter((r) => r.entity_id !== entityId) } : sg))
      toast.success(t('siteSkills.personaDetail.linkRemoved'))
    } catch {
      toast.error(t('siteSkills.personaDetail.linkRemoveFailed'))
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

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

  if (failed || !persona) {
    return (
      <PageContainer width="wide">
        <ErrorState
          icon={<Users className="w-8 h-8" />}
          title={t('siteSkills.personaDetail.notFound')}
          description={t('siteSkills.personaDetail.notFoundHint')}
          onRetry={loadPersona}
        />
      </PageContainer>
    )
  }

  const originLabel = ORIGIN_LABEL[persona.origin] ? t(ORIGIN_LABEL[persona.origin]) : persona.origin
  const parentLinks: ParentLink[] = [
    { icon: Users, label: t('siteSkills.personaDetail.personas'), name: t('siteSkills.personaDetail.allPersonas'), href: workspacePath(wsSlug, '/personas') },
    ...(project && persona.project_id
      ? [{ icon: Box, label: t('siteSkills.common.project'), name: project.name, href: workspacePath(wsSlug, `/projects/${project.slug}`) }]
      : []),
  ]

  const totalLinks = subgraph ? RELATION_KINDS.reduce((n, k) => n + (subgraph[k.key]?.length ?? 0), 0) : 0
  const stats = subgraph?.stats

  return (
    <PageContainer width="wide" className="space-y-6">
      <PageHeader
        title={persona.name}
        description={persona.description || undefined}
        parentLinks={parentLinks}
        status={<StatusMenu kind="persona" status={persona.status} onChange={handleStatusChange} />}
        meta={[
          originLabel,
          persona.project_id ? null : t('siteSkills.common.global'),
          count(t, persona.activation_count ?? 0, 'activation'),
          persona.last_activated ? (
            <RelativeTime key="la" date={persona.last_activated} prefix={`${t('siteSkills.personaDetail.used')} `} />
          ) : (
            t('siteSkills.common.neverUsed')
          ),
        ]}
        actions={
          <Button size="sm" onClick={handleActivate} loading={activating}>
            {!activating && <Zap className="w-4 h-4 mr-1.5" aria-hidden="true" />}
            {t('siteSkills.common.activate')}
          </Button>
        }
        overflowActions={[
          { label: t('siteSkills.common.edit'), icon: Pencil, onClick: () => setEditOpen(true) },
          {
            label: t('siteSkills.common.delete'),
            icon: Trash2,
            variant: 'danger',
            onClick: handleDelete,
            confirm: {
              title: t('siteSkills.personas.deleteTitle', { name: persona.name }),
              description: t('siteSkills.personas.deleteDescription'),
            },
          },
        ]}
      />

      <Explainer>{t('siteSkills.personaDetail.explainer')}</Explainer>

      {/* ── Vital signs ─────────────────────────────────────────── */}
      <Section title={t('siteSkills.personaDetail.vitalSigns')} description={t('siteSkills.personaDetail.vitalSignsHint')}>
        <MetricList
          items={[
            {
              label: t('siteSkills.common.energy'),
              value: pct(persona.energy),
              level: energyLevel(persona.energy ?? 0),
              ratio: persona.energy ?? 0,
              hint: PERSONA_HINTS.energy,
            },
            {
              label: t('siteSkills.common.cohesion'),
              value: pct(persona.cohesion),
              level: cohesionLevel(persona.cohesion ?? 0),
              ratio: persona.cohesion ?? 0,
              hint: PERSONA_HINTS.cohesion,
            },
            {
              label: t('siteSkills.personaDetail.metrics.successRate'),
              value: pct(persona.success_rate),
              level: (persona.activation_count ?? 0) > 0 ? ratioLevel(persona.success_rate ?? 0) : undefined,
              ratio: persona.success_rate ?? 0,
              hint: PERSONA_HINTS.successRate,
            },
            { label: t('siteSkills.personaDetail.metrics.activations'), value: persona.activation_count ?? 0, hint: PERSONA_HINTS.activations },
            {
              label: t('siteSkills.personaDetail.metrics.avgDuration'),
              value: persona.avg_duration_secs ? formatDurationMs(persona.avg_duration_secs * 1000) : '—',
              hint: PERSONA_HINTS.avgDuration,
            },
            {
              label: t('siteSkills.personaDetail.metrics.coverage'),
              value: pct(stats?.coverage_score),
              ratio: stats?.coverage_score ?? 0,
              hint: PERSONA_HINTS.coverage,
              hidden: !stats,
            },
            {
              label: t('siteSkills.personaDetail.metrics.freshness'),
              value: pct(stats?.freshness),
              level: stats ? ratioLevel(stats.freshness) : undefined,
              ratio: stats?.freshness ?? 0,
              hint: PERSONA_HINTS.freshness,
              hidden: !stats,
            },
            {
              label: t('siteSkills.personaDetail.metrics.linkedEntities'),
              value: stats?.total_entities ?? 0,
              hint: PERSONA_HINTS.entities,
              hidden: !stats,
            },
          ]}
        />
      </Section>

      {/* ── Execution settings ──────────────────────────────────── */}
      <Section
        title={t('siteSkills.personaDetail.executionSettings')}
        description={t('siteSkills.personaDetail.executionSettingsHint')}
        action={
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
            {t('siteSkills.common.edit')}
          </Button>
        }
      >
        <Facts
          items={[
            { label: t('siteSkills.personaDetail.settings.model'), value: persona.model_preference || t('siteSkills.personaDetail.settings.modelDefault') },
            { label: t('siteSkills.personaDetail.settings.complexity'), value: persona.complexity_default || t('siteSkills.personaDetail.settings.complexityAutomatic') },
            {
              label: t('siteSkills.personaDetail.settings.timeout'),
              value: persona.timeout_secs ? formatSecondsExact(persona.timeout_secs) : t('siteSkills.personaDetail.settings.timeoutDefault'),
            },
            { label: t('siteSkills.personaDetail.settings.maxCost'), value: formatCost(persona.max_cost_usd) ?? t('siteSkills.personaDetail.settings.noLimit') },
          ]}
        />
        {persona.system_prompt_override && (
          <div className="mt-3">
            <p className="mb-1 text-xs text-gray-500">{t('siteSkills.personaDetail.systemPrompt')}</p>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-sm">
              <CollapsibleMarkdown content={persona.system_prompt_override} />
            </div>
          </div>
        )}
      </Section>

      {/* ── Knowledge ───────────────────────────────────────────── */}
      <Section
        title={t('siteSkills.personaDetail.knows')}
        count={subgraph ? totalLinks : undefined}
        description={t('siteSkills.personaDetail.knowsHint')}
      >
        {!subgraph ? (
          <EmptyState
            size="sm"
            title={t('siteSkills.personaDetail.relationsUnavailable')}
            description={t('siteSkills.personaDetail.relationsUnavailableHint')}
          />
        ) : totalLinks === 0 ? (
          <EmptyState
            size="sm"
            title={t('siteSkills.personaDetail.nothingLinked')}
            description={t('siteSkills.personaDetail.nothingLinkedHint')}
          />
        ) : (
          <div>
            {RELATION_KINDS.map((kind) => {
              const rels = subgraph[kind.key] ?? []
              if (rels.length === 0) return null
              return (
                <ListGroup
                  key={kind.key}
                  title={t(kind.labelKey)}
                  count={rels.length}
                  collapsible={rels.length > 10}
                  defaultOpen={rels.length <= 10}
                >
                  {rels.map((rel) => (
                    <RelationRow
                      key={rel.entity_id}
                      kind={kind}
                      rel={rel}
                      resolved={resolved[rel.entity_id]}
                      href={kind.route ? workspacePath(wsSlug, kind.route(rel.entity_id)) : undefined}
                      onRemove={removers[kind.key] ? () => handleRemove(kind, rel.entity_id) : undefined}
                    />
                  ))}
                </ListGroup>
              )
            })}
          </div>
        )}
      </Section>

      {/* ── Details ─────────────────────────────────────────────── */}
      <Section title={t('siteSkills.personaDetail.details')}>
        <Facts
          items={[
            {
              label: t('siteSkills.common.project'),
              value: persona.project_id ? project?.name ?? persona.project_id : t('siteSkills.personaDetail.facts.projectGlobal'),
            },
            { label: t('siteSkills.personaDetail.facts.origin'), value: originLabel },
            { label: t('siteSkills.personaDetail.facts.created'), value: formatAbsolute(persona.created_at) },
            { label: t('siteSkills.personaDetail.facts.updated'), value: persona.updated_at ? formatAbsolute(persona.updated_at) : null },
            {
              label: t('siteSkills.personaDetail.facts.lastUsed'),
              value: persona.last_activated ? formatAbsolute(persona.last_activated) : t('siteSkills.common.never'),
            },
            { label: t('siteSkills.personaDetail.facts.id'), value: <span className="font-mono text-xs break-all">{persona.id}</span> },
          ]}
        />
      </Section>

      {/* ENTITY_GRAPH_SLOT entity_type="persona" entity_id={persona.id} */}

      <EditPersonaDialog open={editOpen} persona={persona} onClose={() => setEditOpen(false)} onSubmit={handleSave} />
    </PageContainer>
  )
}

// ── Relation row ────────────────────────────────────────────────────────

interface RelationRowProps {
  kind: RelationKind
  rel: PersonaSubgraphRelation
  resolved?: Resolved
  href?: string
  onRemove?: () => Promise<void>
}

function RelationRow({ kind, rel, resolved, href, onRemove }: RelationRowProps) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const expandable = Boolean(resolved?.body)
  const title = kind.code ? (
    <span className="font-mono text-[13px] break-all">{rel.entity_id}</span>
  ) : (
    resolved?.title ?? <span className="font-mono text-[13px] break-all text-gray-400">{rel.entity_id}</span>
  )
  const plainTitle = kind.code ? rel.entity_id : resolved?.title ?? rel.entity_id

  return (
    <EntityRow
      title={title}
      ariaLabel={plainTitle}
      entityRef={
        kind.key === 'decisions'
          ? { kind: 'decision', id: rel.entity_id, label: plainTitle }
          : kind.key === 'notes'
            ? { kind: 'note', id: rel.entity_id, label: plainTitle.slice(0, 80) }
            : undefined
      }
      expanded={expandable ? open : undefined}
      href={href}
      onClick={!href && expandable ? () => setOpen((v) => !v) : undefined}
      trailing={<span title={t('siteSkills.personaDetail.linkWeight', { weight: rel.weight.toFixed(2) })}>{pct(rel.weight)}</span>}
      meta={[resolved?.sub, rel.relation_type]}
      actions={
        onRemove
          ? [
              {
                label: t('siteSkills.personaDetail.unlink'),
                icon: Unlink,
                variant: 'danger',
                onClick: onRemove,
                confirm: {
                  title: t('siteSkills.personaDetail.unlinkTitle'),
                  description: t('siteSkills.personaDetail.unlinkDescription'),
                  confirmLabel: t('siteSkills.personaDetail.unlink'),
                },
              },
            ]
          : undefined
      }
    >
      {open && resolved?.body && (
        <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
          <CollapsibleMarkdown content={resolved.body} />
        </div>
      )}
    </EntityRow>
  )
}

// ── Edit dialog ─────────────────────────────────────────────────────────

function EditPersonaDialog({
  open,
  persona,
  onClose,
  onSubmit,
}: {
  open: boolean
  persona: Persona
  onClose: () => void
  onSubmit: (data: EditPersonaFormData) => Promise<void>
}) {
  const { t } = useT()
  const form = EditPersonaForm({ initial: persona, onSubmit })
  return (
    <FormDialog open={open} onClose={onClose} onSubmit={form.submit} title={t('siteSkills.personaDetail.editTitle')} submitLabel={t('siteSkills.common.save')} size="lg">
      {form.fields}
    </FormDialog>
  )
}
