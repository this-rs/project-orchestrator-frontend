import { useState, useMemo, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { Users, Trash2, Zap, Plus, Brain, CheckCircle2, FolderOpen } from 'lucide-react'
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

// ── Visual helpers ──────────────────────────────────────────────────────

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

function statusBadge(status: PersonaStatus) {
  const variants: Record<PersonaStatus, 'success' | 'warning' | 'default' | 'error'> = {
    active: 'success',
    emerging: 'warning',
    dormant: 'default',
    archived: 'error',
  }
  return <Badge variant={variants[status] ?? 'default'}>{status}</Badge>
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
      workspacesApi.listProjects(wsSlug).then(setProjects).catch(() => {})
    })
  }, [wsSlug])

  const projectOptions = useMemo(
    () => [{ value: 'all', label: 'All Projects' }, ...projects.map((p) => ({ value: p.id, label: p.name }))],
    [projects],
  )

  // Map project_id → project name for card display
  const projectNameById = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.name])),
    [projects],
  )

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
      const { limit, offset, status, project_id } = params
      const typedStatus = status as PersonaStatus | undefined

      if (project_id) {
        return personasApi.list({ project_id, status: typedStatus, limit, offset })
      }

      // Workspace mode — fetch from all projects + global, merge & dedup
      const all: Persona[] = []

      const projectResults = await Promise.allSettled(
        projects.map((p) => personasApi.list({ project_id: p.id, status: typedStatus, limit, offset })),
      )
      for (const r of projectResults) {
        if (r.status === 'fulfilled' && r.value.items) {
          all.push(...r.value.items)
        }
      }

      try {
        const globalResult = await personasApi.listGlobal({ limit, offset })
        const globalItems = Array.isArray(globalResult)
          ? (globalResult as unknown as Persona[])
          : (globalResult as PaginatedResponse<Persona>).items ?? []
        all.push(...globalItems)
      } catch {
        // silently continue
      }

      const seen = new Set<string>()
      const unique = all.filter((p) => {
        if (seen.has(p.id)) return false
        seen.add(p.id)
        return true
      })
      return { items: unique, total: unique.length, limit, offset }
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
          New Persona
        </Button>
      }
    >
      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <Select options={projectOptions} value={projectFilter} onChange={setProjectFilter} />
        <Select value={statusFilter} onChange={(v) => setStatusFilter(v as PersonaStatus | 'all')} options={statusOptions} />
        {personas.length > 0 && (
          <span className="text-xs text-zinc-500 ml-auto">{personas.length} persona{personas.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Empty state — no projects */}
      {projects.length === 0 && !loading && (
        <div className="text-center py-20 text-zinc-500">
          <Users className="h-14 w-14 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No projects found</p>
          <p className="text-sm mt-1 text-zinc-600">Add a project to this workspace to manage personas.</p>
        </div>
      )}

      {/* Card grid */}
      {projects.length > 0 && (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          variants={reducedMotion ? undefined : staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence mode="popLayout">
            {personas.map((persona) => {
              const energy = persona.energy ?? 0
              const cohesion = persona.cohesion ?? 0
              const successRate = persona.success_rate ?? 0
              const activations = persona.activation_count ?? 0
              const projectName = persona.project_id ? projectNameById[persona.project_id] : null
              const desc = persona.description || ''
              const truncatedDesc = desc.length > 80 ? `${desc.slice(0, 80)}…` : desc

              return (
                <motion.div key={persona.id} variants={reducedMotion ? undefined : fadeInUp} initial="hidden" animate="visible" exit="exit" layout>
                  <Link to={workspacePath(wsSlug, `/personas/${persona.id}`)}>
                    <Card className="group hover:border-purple-500/40 transition-all cursor-pointer h-full hover:shadow-lg hover:shadow-purple-500/5">
                      <CardContent className="p-5 space-y-3">
                        {/* Header — name + status only */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="h-9 w-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                              <Brain className="h-4.5 w-4.5 text-purple-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-sm truncate group-hover:text-purple-300 transition-colors">
                                {persona.name}
                              </h3>
                              {/* Project badge in workspace view */}
                              {projectFilter === 'all' && projectName && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 mt-0.5">
                                  <FolderOpen className="h-2.5 w-2.5" />
                                  {projectName}
                                </span>
                              )}
                              {projectFilter === 'all' && !projectName && persona.project_id == null && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500/60 mt-0.5 italic">
                                  global
                                </span>
                              )}
                            </div>
                          </div>
                          {statusBadge(persona.status)}
                        </div>

                        {/* Metric bars */}
                        <div className="space-y-2">
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-zinc-500">Energy</span>
                              <span className="text-zinc-400 font-medium">{(energy * 100).toFixed(0)}%</span>
                            </div>
                            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${energyColor(energy)}`}
                                style={{ width: `${energy * 100}%` }}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-zinc-500">Cohesion</span>
                              <span className="text-zinc-400 font-medium">{(cohesion * 100).toFixed(0)}%</span>
                            </div>
                            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${cohesionColor(cohesion)}`}
                                style={{ width: `${cohesion * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Description — below metrics, truncated */}
                        {truncatedDesc && (
                          <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">
                            {truncatedDesc}
                          </p>
                        )}

                        {/* Stats footer */}
                        <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                          <div className="flex items-center gap-3 text-xs text-zinc-500">
                            <span className="flex items-center gap-1">
                              <Zap className="h-3 w-3 text-amber-500/70" />
                              <span className="text-zinc-400">{activations}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3 text-emerald-500/70" />
                              <span className="text-zinc-400">{(successRate * 100).toFixed(0)}%</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-600">
                              {persona.last_activated ? relativeTime(persona.last_activated) : 'never'}
                            </span>
                            <button
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleDelete(persona)
                              }}
                              className="text-zinc-700 hover:text-red-400 transition-colors p-0.5 opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {loading && Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={`skel-${i}`} />)}

          {!loading && personas.length === 0 && (
            <div className="col-span-full text-center py-20 text-zinc-500">
              <Brain className="h-14 w-14 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">No personas found</p>
              <p className="text-sm mt-1 text-zinc-600">Create your first persona using the button above.</p>
            </div>
          )}
        </motion.div>
      )}

      <LoadMoreSentinel sentinelRef={sentinelRef} hasMore={hasMore} loadingMore={loadingMore} />
      <ConfirmDialog {...confirmDialog.dialogProps} />

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create Persona" size="lg">
        <PersonaBuilder
          projectId={projectFilter !== 'all' ? projectFilter : projects[0]?.id ?? ''}
          onClose={() => setCreateOpen(false)}
        />
      </Dialog>
    </PageShell>
  )
}
