import { useState, useMemo, useCallback, useEffect } from 'react'
import { Trash2, Plus, Folder, FileCode } from 'lucide-react'
import { personasApi, workspacesApi } from '@/services'
import {
  Button,
  Dialog,
  EmptyState,
  EntityListSkeleton,
  EntityRow,
  FilterBar,
  ListGroup,
  LoadMoreSentinel,
  PageShell,
  RelativeTime,
  Select,
  StatusMenu,
  TONE_CLASSES,
  getStatusMeta,
  getStatusOptions,
  groupBy,
  pluralize,
} from '@/components/ui'
import { ConceptNote, cohesionLevel, energyLevel, fetchAllPages, dedupeById } from '@/components/registry'
import { PersonaBuilder } from '@/components/personas'
import { useToast, useInfiniteList, useWorkspaceSlug } from '@/hooks'
import type { Persona, PersonaStatus, PersonaSubgraph, PaginatedResponse } from '@/types'
import { workspacePath } from '@/utils/paths'

// ── Options ─────────────────────────────────────────────────────────────

const statusOptions = [{ value: 'all', label: 'All statuses' }, ...getStatusOptions('persona')]
const STATUS_ORDER: PersonaStatus[] = ['active', 'emerging', 'dormant', 'archived']

type Project = { id: string; name: string; slug: string }

/** `…/dir/file.rs` — keeps the two last segments. */
function shortPath(filePath: string): string {
  const parts = filePath.split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : filePath
}

// ── Main page ───────────────────────────────────────────────────────────

export function PersonasPage() {
  const [statusFilter, setStatusFilter] = useState<PersonaStatus | 'all'>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const toast = useToast()
  const wsSlug = useWorkspaceSlug()

  // Projects of the workspace
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  useEffect(() => {
    if (!wsSlug) return
    setProjectsLoaded(false)
    workspacesApi
      .listProjects(wsSlug)
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setProjectsLoaded(true))
  }, [wsSlug])

  const projectNameById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects])

  const filters = useMemo(
    () => ({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      project_id: projectFilter !== 'all' ? projectFilter : undefined,
      _projectCount: projects.length,
    }),
    [statusFilter, projectFilter, projects.length],
  )

  const fetcher = useCallback(
    async (params: { limit: number; offset: number; status?: string; project_id?: string }): Promise<PaginatedResponse<Persona>> => {
      const { limit, offset, project_id } = params
      const status = params.status as PersonaStatus | undefined

      if (project_id) {
        return personasApi.list({ project_id, status, limit, offset })
      }

      // Workspace view — every project + global personas, each loaded in full,
      // merged and de-duplicated (single page for the hook)
      if (offset > 0) return { items: [], total: 0, limit, offset }
      const [perProject, global] = await Promise.all([
        Promise.all(
          projects.map((p) =>
            fetchAllPages<Persona>((l, o) => personasApi.list({ project_id: p.id, status, limit: l, offset: o })).catch(
              () => [] as Persona[],
            ),
          ),
        ),
        fetchAllPages<Persona>((l, o) => personasApi.listGlobal({ limit: l, offset: o })).catch(() => [] as Persona[]),
      ])
      // The global endpoint has no status filter — apply it here
      const globalFiltered = status ? global.filter((p) => p.status === status) : global
      const unique = dedupeById([...perProject.flat(), ...globalFiltered])
      return { items: unique, total: unique.length, limit, offset }
    },
    [projects],
  )

  const {
    items: personas,
    loading: listLoading,
    loadingMore,
    hasMore,
    sentinelRef,
    removeItems,
    updateItem,
  } = useInfiniteList<Persona>({ fetcher, filters, enabled: projects.length > 0 })

  const noProjects = projectsLoaded && projects.length === 0
  const loading = !projectsLoaded || (projects.length > 0 && listLoading)

  // Subgraphs of the loaded personas (what each one knows: files, skills…)
  const [subgraphs, setSubgraphs] = useState<Record<string, PersonaSubgraph>>({})
  const idsKey = personas.map((p) => p.id).join(',')
  useEffect(() => {
    const missing = personas.map((p) => p.id).filter((id) => !subgraphs[id])
    if (missing.length === 0) return
    let cancelled = false
    Promise.allSettled(missing.map((id) => personasApi.getSubgraph(id))).then((results) => {
      if (cancelled) return
      const entries: Record<string, PersonaSubgraph> = {}
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') entries[missing[i]] = r.value
      })
      if (Object.keys(entries).length > 0) setSubgraphs((prev) => ({ ...prev, ...entries }))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the id list, subgraphs is a cache
  }, [idsKey])

  // Client-side search
  const q = search.trim().toLowerCase()
  const visible = useMemo(
    () =>
      q ? personas.filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)) : personas,
    [personas, q],
  )
  const groups = useMemo(() => groupBy(visible, (p) => p.status, STATUS_ORDER), [visible])

  // ── Actions ───────────────────────────────────────────────────────────

  const handleDelete = async (persona: Persona) => {
    try {
      await personasApi.delete(persona.id)
      removeItems((p) => p.id === persona.id)
      toast.success(`Persona “${persona.name}” deleted`)
    } catch {
      toast.error('Failed to delete persona')
    }
  }

  const handleStatusChange = async (persona: Persona, status: PersonaStatus) => {
    try {
      const updated = await personasApi.update(persona.id, { status })
      updateItem((p) => p.id === persona.id, () => updated)
      toast.success(`Status changed to ${getStatusMeta('persona', status).label}`)
    } catch {
      toast.error('Failed to update status')
    }
  }

  // ── Filters ───────────────────────────────────────────────────────────

  const showProjectFilter = projects.length > 1
  const activeProjectId = projectFilter !== 'all' ? projectFilter : undefined
  const activeFilterCount = (activeProjectId ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)
  const activeLabels = [
    activeProjectId ? projectNameById[activeProjectId] ?? '' : '',
    statusFilter !== 'all' ? getStatusMeta('persona', statusFilter).label : '',
  ]
  const clearFilters = () => {
    setProjectFilter('all')
    setStatusFilter('all')
  }
  const isPristine = personas.length === 0 && statusFilter === 'all' && projectFilter === 'all' && !q

  return (
    <PageShell
      title="Personas"
      description="Expertise profiles assigned to agents, built from your code and knowledge."
      count={loading || noProjects ? undefined : visible.length}
      width="wide"
      actions={
        !noProjects ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
            New persona
          </Button>
        ) : undefined
      }
      filters={
        noProjects ? undefined : (
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search personas…"
            activeCount={activeFilterCount}
            activeLabels={activeLabels}
            onClear={clearFilters}
            filters={
              <>
                {showProjectFilter && (
                  <Select
                    options={[{ value: 'all', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
                    value={projectFilter}
                    onChange={setProjectFilter}
                    icon={<Folder className="w-3 h-3" />}
                  />
                )}
                <Select
                  options={statusOptions}
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as PersonaStatus | 'all')}
                />
              </>
            }
          />
        )
      }
    >
      <div className="space-y-3">
        <ConceptNote summary="A persona is an expert profile handed to an agent: it defines the files, notes, decisions and skills the agent knows, plus its execution settings (model, budget, timeout).">
          <p>
            When a task touches files a persona knows, the agent running it receives that knowledge first.
          </p>
          <p>
            Each link has a <span className="text-gray-300">weight</span> that strengthens when the persona succeeds and
            weakens otherwise. <span className="text-gray-300">Energy</span> = recent vitality,{' '}
            <span className="text-gray-300">success rate</span> = share of tasks that succeeded with it.
          </p>
          <p>
            A persona can be created by hand, built automatically from the code (entry point, file pattern) or emerge
            on its own; it can also inherit from another one (EXTENDS). Without a project it is{' '}
            <span className="text-gray-300">global</span> and serves the whole workspace.
          </p>
        </ConceptNote>

        {noProjects ? (
          <EmptyState
            icon={<Folder className="w-8 h-8" />}
            title="No projects in this workspace"
            description="Add a project to this workspace to manage personas."
          />
        ) : loading ? (
          <EntityListSkeleton rows={6} />
        ) : visible.length === 0 ? (
          isPristine ? (
            <EmptyState
              title="No personas yet"
              description="Create a persona to specialise an agent on a part of your codebase."
              action={
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
                  New persona
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No matching personas"
              description="Try another search or clear the filters."
              action={
                <Button variant="secondary" size="sm" onClick={() => { clearFilters(); setSearch('') }}>
                  Clear
                </Button>
              }
            />
          )
        ) : (
          <div>
            {groups.map(({ key, items }) => (
              <ListGroup
                key={key}
                title={getStatusMeta('persona', key).label}
                count={items.length}
                collapsible={key === 'archived'}
                defaultOpen={key !== 'archived'}
              >
                {items.map((persona) => (
                  <PersonaRow
                    key={persona.id}
                    persona={persona}
                    subgraph={subgraphs[persona.id]}
                    href={workspacePath(wsSlug, `/personas/${persona.id}`)}
                    projectLabel={
                      projectFilter !== 'all'
                        ? undefined
                        : persona.project_id
                          ? projectNameById[persona.project_id]
                          : 'global'
                    }
                    onStatusChange={(s) => handleStatusChange(persona, s)}
                    onDelete={() => handleDelete(persona)}
                  />
                ))}
              </ListGroup>
            ))}
            <LoadMoreSentinel sentinelRef={sentinelRef} hasMore={hasMore} loadingMore={loadingMore} />
          </div>
        )}
      </div>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create persona" size="lg">
        <PersonaBuilder
          projects={projects}
          projectId={activeProjectId ?? projects[0]?.id ?? ''}
          onClose={() => setCreateOpen(false)}
        />
      </Dialog>
    </PageShell>
  )
}

// ── Persona row ─────────────────────────────────────────────────────────

interface PersonaRowProps {
  persona: Persona
  subgraph?: PersonaSubgraph
  href: string
  projectLabel?: string
  onStatusChange: (status: PersonaStatus) => Promise<void>
  onDelete: () => Promise<void>
}

function PersonaRow({ persona, subgraph, href, projectLabel, onStatusChange, onDelete }: PersonaRowProps) {
  const energy = energyLevel(persona.energy ?? 0)
  const cohesion = cohesionLevel(persona.cohesion ?? 0)
  const files = subgraph?.files ?? []
  const skills = subgraph?.skills?.length ?? 0
  return (
    <EntityRow
      title={persona.name}
      href={href}
      description={persona.description || undefined}
      muted={persona.status === 'archived'}
      trailing={persona.last_activated ? <RelativeTime date={persona.last_activated} /> : <span>never used</span>}
      meta={[
        <StatusMenu key="status" kind="persona" status={persona.status} onChange={onStatusChange} />,
        projectLabel,
        <span key="energy" title={`Energy ${Math.round((persona.energy ?? 0) * 100)}% — recent vitality`}>
          <span className={TONE_CLASSES[energy.tone].text}>{energy.label}</span> energy
        </span>,
        <span key="cohesion" title={`Cohesion ${Math.round((persona.cohesion ?? 0) * 100)}%`}>
          <span className={TONE_CLASSES[cohesion.tone].text}>{cohesion.label}</span> cohesion
        </span>,
        `${Math.round((persona.success_rate ?? 0) * 100)}% success`,
        pluralize(persona.activation_count ?? 0, 'activation'),
        subgraph ? pluralize(files.length, 'file') : null,
        subgraph && skills > 0 ? pluralize(skills, 'skill') : null,
      ]}
      context={
        files.length > 0 ? (
          <p className="flex items-center gap-1 min-w-0 text-[11px] leading-4 text-gray-500">
            <FileCode className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="truncate font-mono" title={files.map((f) => f.entity_id).join('\n')}>
              {files.slice(0, 3).map((f) => shortPath(f.entity_id)).join('  ')}
              {files.length > 3 && `  +${files.length - 3}`}
            </span>
          </p>
        ) : undefined
      }
      actions={[
        {
          label: 'Delete',
          icon: Trash2,
          variant: 'danger',
          onClick: onDelete,
          confirm: {
            title: `Delete “${persona.name}”?`,
            description: 'This removes the persona and all its relations. This action cannot be undone.',
          },
        },
      ]}
    />
  )
}
