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
  pluralize,
} from '@/components/ui'
import type { ParentLink } from '@/components/ui'
import {
  ConceptNote,
  MetricList,
  PERSONA_HINTS,
  cohesionLevel,
  energyLevel,
  pct,
  ratioLevel,
} from '@/components/registry'
import { EditPersonaForm, type EditPersonaFormData } from '@/components/forms'
import { useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { Persona, PersonaOrigin, PersonaStatus, PersonaSubgraph, PersonaSubgraphRelation } from '@/types'
import { decisionTitle, noteTitle } from '@/components/knowledge/noteMeta'

// ── Relation kinds ──────────────────────────────────────────────────────

type RelationKey = 'files' | 'functions' | 'notes' | 'decisions' | 'skills' | 'protocols' | 'parents' | 'children'

interface RelationKind {
  key: RelationKey
  label: string
  /** Detail route of the target, if any (workspace-relative). */
  route?: (id: string) => string
  /** The target id is a code path (rendered mono, not resolved). */
  code?: boolean
}

const RELATION_KINDS: RelationKind[] = [
  { key: 'files', label: 'Files', code: true },
  { key: 'functions', label: 'Functions', code: true },
  { key: 'notes', label: 'Notes' },
  { key: 'decisions', label: 'Decisions', route: (id) => `/decisions/${id}` },
  { key: 'skills', label: 'Skills', route: (id) => `/skills/${id}` },
  { key: 'protocols', label: 'Protocols', route: (id) => `/protocols/${id}` },
  { key: 'parents', label: 'Extends (inherits from)', route: (id) => `/personas/${id}` },
  { key: 'children', label: 'Extended by', route: (id) => `/personas/${id}` },
]

const ORIGIN_LABEL: Record<PersonaOrigin, string> = {
  manual: 'Manual',
  auto_build: 'Auto-built',
  imported: 'Imported',
}

/** Max targets resolved to a readable name per relation kind. */
const RESOLVE_CAP = 50

/**
 * Exact seconds for a configured value (`90s` must not read as `1m`):
 * `45s`, `1m 30s`, `5m`, `1h 5m`. Measured averages keep `formatDurationMs`.
 */
function formatSecondsExact(secs: number): string {
  const s = Math.max(0, Math.round(secs))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  if (m < 60) return rest ? `${m}m ${rest}s` : `${m}m`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
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
      toast.success(`Status changed to ${getStatusMeta('persona', status).label}`)
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handleSave = async (data: EditPersonaFormData) => {
    if (!persona) return
    // Errors are surfaced by FormDialog (toast, dialog stays open)
    setPersona(await personasApi.update(persona.id, data))
    toast.success('Persona updated')
  }

  const handleActivate = async () => {
    if (!persona) return
    setActivating(true)
    try {
      await personasApi.activate(persona.id)
      toast.success('Persona activated')
      await loadPersona()
    } catch {
      toast.error('Failed to activate persona')
    } finally {
      setActivating(false)
    }
  }

  const handleDelete = async () => {
    if (!persona) return
    try {
      await personasApi.delete(persona.id)
      toast.success(`Persona “${persona.name}” deleted`)
      navigate(workspacePath(wsSlug, '/personas'))
    } catch {
      toast.error('Failed to delete persona')
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
      toast.success('Link removed')
    } catch {
      toast.error('Failed to remove link')
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
          title="Persona not found"
          description="The persona could not be loaded."
          onRetry={loadPersona}
        />
      </PageContainer>
    )
  }

  const parentLinks: ParentLink[] = [
    { icon: Users, label: 'Personas', name: 'All personas', href: workspacePath(wsSlug, '/personas') },
    ...(project && persona.project_id
      ? [{ icon: Box, label: 'Project', name: project.name, href: workspacePath(wsSlug, `/projects/${project.slug}`) }]
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
          ORIGIN_LABEL[persona.origin] ?? persona.origin,
          persona.project_id ? null : 'global',
          pluralize(persona.activation_count ?? 0, 'activation'),
          persona.last_activated ? <RelativeTime key="la" date={persona.last_activated} prefix="used " /> : 'never used',
        ]}
        actions={
          <Button size="sm" onClick={handleActivate} loading={activating}>
            {!activating && <Zap className="w-4 h-4 mr-1.5" aria-hidden="true" />}
            Activate
          </Button>
        }
        overflowActions={[
          { label: 'Edit', icon: Pencil, onClick: () => setEditOpen(true) },
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'danger',
            onClick: handleDelete,
            confirm: {
              title: `Delete “${persona.name}”?`,
              description: 'This removes the persona and all its relations. This action cannot be undone.',
            },
          },
        ]}
      />

      <ConceptNote summary="This persona is an expert profile: an agent that takes it on receives the knowledge listed under “What it knows” first and runs with the settings below.">
        <p>“Activate” loads it manually (counts as an activation and revives its energy).</p>
        <p>
          The <span className="text-gray-300">weight</span> of a link (0–100%) says how much that knowledge matters to
          it; it evolves with use. Removing a link does not delete the element itself.
        </p>
      </ConceptNote>

      {/* ── Vital signs ─────────────────────────────────────────── */}
      <Section title="Vital signs" description="What the indicators of this persona measure.">
        <MetricList
          items={[
            {
              label: 'Energy',
              value: pct(persona.energy),
              level: energyLevel(persona.energy ?? 0),
              ratio: persona.energy ?? 0,
              hint: PERSONA_HINTS.energy,
            },
            {
              label: 'Cohesion',
              value: pct(persona.cohesion),
              level: cohesionLevel(persona.cohesion ?? 0),
              ratio: persona.cohesion ?? 0,
              hint: PERSONA_HINTS.cohesion,
            },
            {
              label: 'Success rate',
              value: pct(persona.success_rate),
              level: (persona.activation_count ?? 0) > 0 ? ratioLevel(persona.success_rate ?? 0) : undefined,
              ratio: persona.success_rate ?? 0,
              hint: PERSONA_HINTS.successRate,
            },
            { label: 'Activations', value: persona.activation_count ?? 0, hint: PERSONA_HINTS.activations },
            {
              label: 'Avg. duration',
              value: persona.avg_duration_secs ? formatDurationMs(persona.avg_duration_secs * 1000) : '—',
              hint: PERSONA_HINTS.avgDuration,
            },
            {
              label: 'Coverage',
              value: pct(stats?.coverage_score),
              ratio: stats?.coverage_score ?? 0,
              hint: PERSONA_HINTS.coverage,
              hidden: !stats,
            },
            {
              label: 'Freshness',
              value: pct(stats?.freshness),
              level: stats ? ratioLevel(stats.freshness) : undefined,
              ratio: stats?.freshness ?? 0,
              hint: PERSONA_HINTS.freshness,
              hidden: !stats,
            },
            { label: 'Linked entities', value: stats?.total_entities ?? 0, hint: PERSONA_HINTS.entities, hidden: !stats },
          ]}
        />
      </Section>

      {/* ── Execution settings ──────────────────────────────────── */}
      <Section
        title="Execution settings"
        description="Settings applied when an agent runs a task with this persona (empty = runner default)."
        action={
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
            Edit
          </Button>
        }
      >
        <Facts
          items={[
            { label: 'Model', value: persona.model_preference || 'Default' },
            { label: 'Complexity', value: persona.complexity_default || 'Automatic' },
            { label: 'Timeout', value: persona.timeout_secs ? formatSecondsExact(persona.timeout_secs) : 'Default' },
            { label: 'Max cost', value: formatCost(persona.max_cost_usd) ?? 'No limit' },
          ]}
        />
        {persona.system_prompt_override && (
          <div className="mt-3">
            <p className="mb-1 text-xs text-gray-500">System prompt override</p>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-sm">
              <CollapsibleMarkdown content={persona.system_prompt_override} />
            </div>
          </div>
        )}
      </Section>

      {/* ── Knowledge ───────────────────────────────────────────── */}
      <Section
        title="What it knows"
        count={subgraph ? totalLinks : undefined}
        description="Files, functions, notes, decisions, skills and protocols linked to this persona, with the weight of each link."
      >
        {!subgraph ? (
          <EmptyState size="sm" title="Relations unavailable" description="The persona subgraph could not be loaded." />
        ) : totalLinks === 0 ? (
          <EmptyState
            size="sm"
            title="Nothing linked yet"
            description="Link files, notes or skills to this persona (MCP tools or auto-build) to give it knowledge."
          />
        ) : (
          <div>
            {RELATION_KINDS.map((kind) => {
              const rels = subgraph[kind.key] ?? []
              if (rels.length === 0) return null
              return (
                <ListGroup
                  key={kind.key}
                  title={kind.label}
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
      <Section title="Details">
        <Facts
          items={[
            { label: 'Project', value: persona.project_id ? project?.name ?? persona.project_id : 'Global (whole workspace)' },
            { label: 'Origin', value: ORIGIN_LABEL[persona.origin] ?? persona.origin },
            { label: 'Created', value: formatAbsolute(persona.created_at) },
            { label: 'Updated', value: persona.updated_at ? formatAbsolute(persona.updated_at) : null },
            { label: 'Last used', value: persona.last_activated ? formatAbsolute(persona.last_activated) : 'Never' },
            { label: 'ID', value: <span className="font-mono text-xs break-all">{persona.id}</span> },
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
      expanded={expandable ? open : undefined}
      href={href}
      onClick={!href && expandable ? () => setOpen((v) => !v) : undefined}
      trailing={<span title={`Link weight ${rel.weight.toFixed(2)}`}>{pct(rel.weight)}</span>}
      meta={[resolved?.sub, rel.relation_type]}
      actions={
        onRemove
          ? [
              {
                label: 'Unlink',
                icon: Unlink,
                variant: 'danger',
                onClick: onRemove,
                confirm: {
                  title: 'Unlink this element?',
                  description: 'The persona forgets this element; the element itself is not deleted.',
                  confirmLabel: 'Unlink',
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
  const form = EditPersonaForm({ initial: persona, onSubmit })
  return (
    <FormDialog open={open} onClose={onClose} onSubmit={form.submit} title="Edit persona" submitLabel="Save" size="lg">
      {form.fields}
    </FormDialog>
  )
}
