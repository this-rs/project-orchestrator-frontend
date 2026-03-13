import { useState, useMemo, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { Users, Trash2, Zap, Plus } from 'lucide-react'
import { personasApi } from '@/services'
import {
  Card,
  CardContent,
  Badge,
  Button,
  Select,
  ConfirmDialog,
  Dialog,
  PageShell,
  SkeletonCard,
  LoadMoreSentinel,
} from '@/components/ui'
import { PersonaBuilder } from '@/components/personas'
import { useConfirmDialog, useToast, useInfiniteList, useWorkspaceSlug } from '@/hooks'
import { fadeInUp, staggerContainer, useReducedMotion } from '@/utils/motion'
import type { Persona, PersonaStatus, PaginatedResponse } from '@/types'
import { workspacePath } from '@/utils/paths'

// ── Filter options ──────────────────────────────────────────────────────

const statusOptions = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'emerging', label: 'Emerging' },
  { value: 'dormant', label: 'Dormant' },
  { value: 'archived', label: 'Archived' },
]

// ── Energy bar colors ───────────────────────────────────────────────────

function energyColor(energy: number): string {
  if (energy >= 0.7) return 'bg-emerald-500'
  if (energy >= 0.3) return 'bg-amber-500'
  return 'bg-red-500'
}

function cohesionColor(cohesion: number): string {
  if (cohesion >= 0.7) return 'bg-indigo-500'
  if (cohesion >= 0.4) return 'bg-indigo-400'
  return 'bg-indigo-300/60'
}

function originBadge(origin: string) {
  switch (origin) {
    case 'auto_build':
      return <Badge variant="info">auto</Badge>
    case 'imported':
      return <Badge variant="purple">imported</Badge>
    default:
      return <Badge>manual</Badge>
  }
}

function statusBadge(status: PersonaStatus) {
  const colors: Record<PersonaStatus, string> = {
    active: 'bg-emerald-500/20 text-emerald-400',
    emerging: 'bg-amber-500/20 text-amber-400',
    dormant: 'bg-zinc-500/20 text-zinc-400',
    archived: 'bg-red-500/20 text-red-400',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[status]}`}>
      {status}
    </span>
  )
}

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

export function PersonasPage() {
  const [statusFilter, setStatusFilter] = useState<PersonaStatus | 'all'>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const confirmDialog = useConfirmDialog()
  const toast = useToast()
  const wsSlug = useWorkspaceSlug()
  const reducedMotion = useReducedMotion()

  // Load projects for filter dropdown
  const [projects, setProjects] = useState<{ id: string; name: string; slug: string }[]>([])
  useEffect(() => {
    if (!wsSlug) return
    import('@/services').then(({ workspacesApi }) => {
      workspacesApi
        .listProjects(wsSlug)
        .then(setProjects)
        .catch(() => {})
    })
  }, [wsSlug])

  const projectOptions = useMemo(
    () => [{ value: 'all', label: 'All Projects' }, ...projects.map((p) => ({ value: p.id, label: p.name }))],
    [projects],
  )

  const filters = useMemo(
    () => ({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      project_id: projectFilter !== 'all' ? projectFilter : undefined,
      _projectCount: projects.length, // force re-fetch when projects load (fetcher depends on projects)
    }),
    [statusFilter, projectFilter, projects.length],
  )

  const fetcher = useCallback(
    (params: { limit: number; offset: number; status?: string; project_id?: string }): Promise<PaginatedResponse<Persona>> => {
      const typedParams = {
        limit: params.limit,
        offset: params.offset,
        status: params.status as PersonaStatus | undefined,
      }
      if (params.project_id) {
        // Single project selected
        return personasApi.list({ ...typedParams, project_id: params.project_id })
      }
      // Workspace mode: fetch from all projects in parallel + global personas
      if (projects.length === 0) {
        return Promise.resolve({ items: [], total: 0, limit: params.limit, offset: params.offset })
      }
      const projectFetches = projects.map((p) =>
        personasApi.list({ ...typedParams, project_id: p.id }).catch(() => ({ items: [] as Persona[], total: 0, limit: params.limit, offset: params.offset })),
      )
      const globalFetch = personasApi.listGlobal({ limit: params.limit, offset: params.offset })
        .then((items) => ({ items: Array.isArray(items) ? items : [], total: 0, limit: params.limit, offset: params.offset }))
        .catch(() => ({ items: [] as Persona[], total: 0, limit: params.limit, offset: params.offset }))
      return Promise.all([...projectFetches, globalFetch]).then((results) => {
        const merged = results.flatMap((r) => r.items)
        const seen = new Set<string>()
        const unique = merged.filter((s) => { if (seen.has(s.id)) return false; seen.add(s.id); return true })
        return { items: unique, total: unique.length, limit: params.limit, offset: params.offset }
      })
    },
    [projects],
  )

  const {
    items: personas,
    loading,
    loadingMore,
    hasMore,
    sentinelRef,
    removeItems,
  } = useInfiniteList<Persona>({ fetcher, filters, enabled: projects.length > 0 })

  const handleDelete = (persona: Persona) => {
    confirmDialog.open({
      title: `Delete "${persona.name}"?`,
      description: 'This will remove the persona and all its relations. This action cannot be undone.',
      onConfirm: async () => {
        await personasApi.delete(persona.id)
        removeItems((p) => p.id === persona.id)
        toast.success(`Persona "${persona.name}" deleted`)
      },
    })
  }

  return (
    <PageShell
      title="Personas"
      description="Living knowledge agents scoped to code regions"
      actions={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Create
        </Button>
      }
    >
      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <Select
          options={projectOptions}
          value={projectFilter}
          onChange={setProjectFilter}
        />
        <Select
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as PersonaStatus | 'all')}
          options={statusOptions}
        />
      </div>

      {/* Empty state when no projects loaded yet */}
      {projects.length === 0 && !loading && (
        <div className="text-center py-16 text-zinc-500">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium">No projects found</p>
          <p className="text-sm mt-1">Add a project to this workspace to manage personas.</p>
        </div>
      )}

      {/* Card grid */}
      {projects.length > 0 && (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          {...(reducedMotion ? {} : staggerContainer)}
        >
          <AnimatePresence mode="popLayout">
            {personas.map((persona) => (
              <motion.div key={persona.id} {...(reducedMotion ? {} : fadeInUp)} layout>
                <Link to={workspacePath(wsSlug, `/personas/${persona.id}`)}>
                  <Card className="hover:border-purple-500/40 transition-colors cursor-pointer h-full">
                    <CardContent className="p-4 space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm truncate">{persona.name}</h3>
                          <p className="text-xs text-zinc-500 truncate mt-0.5">
                            {persona.description || 'No description'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 ml-2 shrink-0">
                          {originBadge(persona.origin)}
                          {statusBadge(persona.status)}
                        </div>
                      </div>

                      {/* Energy bar */}
                      <div>
                        <div className="flex justify-between text-xs text-zinc-500 mb-1">
                          <span>Energy</span>
                          <span>{((persona.energy ?? 0) * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${energyColor(persona.energy ?? 0)}`}
                            style={{ width: `${(persona.energy ?? 0) * 100}%` }}
                          />
                        </div>
                      </div>

                      {/* Cohesion bar */}
                      <div>
                        <div className="flex justify-between text-xs text-zinc-500 mb-1">
                          <span>Cohesion</span>
                          <span>{((persona.cohesion ?? 0) * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${cohesionColor(persona.cohesion ?? 0)}`}
                            style={{ width: `${(persona.cohesion ?? 0) * 100}%` }}
                          />
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="flex items-center justify-between text-xs text-zinc-500 pt-1">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            {persona.activation_count ?? 0}
                          </span>
                          <span>{((persona.success_rate ?? 0) * 100).toFixed(0)}% success</span>
                        </div>
                        <span>
                          {persona.last_activated ? relativeTime(persona.last_activated) : 'never'}
                        </span>
                      </div>

                      {/* Delete button (stop propagation) */}
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleDelete(persona)
                          }}
                          className="text-zinc-600 hover:text-red-400 transition-colors p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={`skel-${i}`} />)}

          {!loading && personas.length === 0 && (
            <div className="col-span-full text-center py-16 text-zinc-500">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="text-lg font-medium">No personas found</p>
              <p className="text-sm mt-1">Create your first persona using the button above.</p>
            </div>
          )}
        </motion.div>
      )}

      <LoadMoreSentinel sentinelRef={sentinelRef} hasMore={hasMore} loadingMore={loadingMore} />

      <ConfirmDialog {...confirmDialog.dialogProps} />

      {/* Create persona wizard */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create Persona" size="lg">
        <PersonaBuilder
          projectId={projectFilter !== 'all' ? projectFilter : projects[0]?.id ?? ''}
          onClose={() => setCreateOpen(false)}
        />
      </Dialog>
    </PageShell>
  )
}
