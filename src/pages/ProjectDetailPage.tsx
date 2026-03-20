import { lazy, Suspense, useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useSetAtom, useAtomValue } from 'jotai'
import {
  FolderOpen,
  Clipboard,
  RefreshCw,
  ChevronRight,
  Brain,
  ArrowRight,
  Sparkles,
  Network,
  Activity,
  Calendar,
  Wrench,
  Timer,
  Zap,
  Waves,
  BrainCircuit,
  Search,
  Loader2,
  Check,
  AlertTriangle,
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  ConfirmDialog,
  FormDialog,
  LoadingPage,
  ErrorState,
  Badge,
  ProgressBar,
  PageHeader,
  MetricTooltip,
} from '@/components/ui'
import { ExpandableMilestoneRow } from '@/components/expandable'
import {
  useIntelligenceData,
  IntelHealthBreakdown,
  IntelAttention,
  IntelQuickActions,
} from '@/components/intelligence/IntelligenceDashboard'
import { projectsApi } from '@/services'
import { adminApi } from '@/services/admin'
import { useConfirmDialog, useFormDialog, useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import {
  chatSuggestedProjectIdAtom,
  projectRefreshAtom,
  planRefreshAtom,
  milestoneRefreshAtom,
  taskRefreshAtom,
} from '@/atoms'
import { CreateMilestoneForm, CreateReleaseForm, EditProjectForm } from '@/components/forms'
import type { Project, ProjectRoadmap } from '@/types'

// Lazy-load heavy intelligence components (project-level)
const IntelligenceGraphPage = lazy(
  () => import('@/components/intelligence/IntelligenceGraphPage'),
)
const LearningTimeline = lazy(
  () => import('@/components/intelligence/LearningTimeline'),
)

// ─── IntelTabFallback — inline loading/error/empty for intelligence sections ─

function IntelTabFallback({
  intelligence,
}: {
  intelligence: { loading: boolean; error: string | null; summary: unknown | null; handleRefresh: () => void }
}) {
  if (intelligence.loading) {
    return (
      <div data-testid="intel-loading" className="flex flex-col items-center justify-center py-16 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500 mb-3" />
        <span className="text-sm text-slate-400">Loading intelligence data…</span>
      </div>
    )
  }

  if (intelligence.error) {
    return (
      <div data-testid="intel-error" className="flex flex-col items-center justify-center py-16 text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mb-3" />
        <p className="text-sm text-slate-400 mb-3">{intelligence.error}</p>
        <button
          onClick={intelligence.handleRefresh}
          className="text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
        >
          Retry
        </button>
      </div>
    )
  }

  // No summary available (empty state)
  return (
    <div data-testid="intel-empty" className="flex flex-col items-center justify-center py-16 text-center">
      <Brain className="w-8 h-8 text-slate-600 mb-3" />
      <p className="text-sm text-slate-500">No intelligence data available. Sync your projects first.</p>
    </div>
  )
}

// ─── Maintenance Dropdown (project-level) ───────────────────────────────────

function MaintenanceDropdown({
  intelligence,
  projectId,
}: {
  intelligence: ReturnType<typeof useIntelligenceData>
  projectId?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen])

  if (!intelligence.summary) return null

  const actions = [
    {
      key: 'staleness',
      label: 'Update Staleness',
      description: 'Recalculate staleness scores for all notes',
      icon: Timer,
      color: '#fb923c',
      run: async () => {
        const r = await adminApi.updateStaleness()
        await intelligence.handleRefresh()
        return `${r.notes_updated} notes updated`
      },
    },
    {
      key: 'energy',
      label: 'Recalculate Energy',
      description: 'Update neural energy scores based on activity',
      icon: Zap,
      color: '#22d3ee',
      run: async () => {
        const r = await adminApi.updateEnergy()
        await intelligence.handleRefresh()
        return `${r.notes_updated} notes updated`
      },
    },
    {
      key: 'decay',
      label: 'Decay Synapses',
      description: 'Decay weak synapses and prune dead connections',
      icon: Waves,
      color: '#a78bfa',
      run: async () => {
        const r = await adminApi.decayNeurons()
        await intelligence.handleRefresh()
        return `${r.synapses_decayed} decayed, ${r.synapses_pruned} pruned`
      },
    },
    {
      key: 'fabric',
      label: 'Update Fabric Scores',
      description: 'Recalculate graph metrics (PageRank, communities)',
      icon: Network,
      color: '#94a3b8',
      run: async () => {
        if (projectId) {
          await adminApi.updateFabricScores({ project_id: projectId })
          await intelligence.handleRefresh()
          return 'Fabric scores updated'
        }
        return 'No project ID available'
      },
    },
    {
      key: 'skills',
      label: 'Detect Skills',
      description: 'Auto-detect emergent skills from note clusters',
      icon: BrainCircuit,
      color: '#ec4899',
      run: async () => {
        if (projectId) {
          await adminApi.detectSkills(projectId)
          await intelligence.handleRefresh()
          return 'Skills detection completed'
        }
        return 'No project ID available'
      },
    },
    {
      key: 'backfill',
      label: 'Backfill Synapses',
      description: 'Create missing synapses from semantic similarity',
      icon: Search,
      color: '#06b6d4',
      run: async () => {
        await adminApi.startBackfillSynapses()
        return 'Backfill job started'
      },
    },
  ]

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
        title="Maintenance actions"
      >
        <Wrench size={14} />
        Maintenance
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-lg border border-white/[0.08] bg-[var(--surface-popover,#232733)] shadow-xl py-1">
          <div className="px-3 py-1.5 text-[10px] text-slate-500 uppercase tracking-wider font-medium">
            Knowledge Graph Maintenance
          </div>
          {actions.map((action) => {
            const state = intelligence.getAction(action.key)
            const isRunning = state.status === 'running'
            const isDone = state.status === 'success'
            const isError = state.status === 'error'
            const Icon = action.icon

            return (
              <button
                key={action.key}
                onClick={() => intelligence.runAction(action.key, action.run)}
                disabled={isRunning}
                className="w-full px-3 py-2 text-left hover:bg-white/[0.06] transition-colors flex items-center gap-2.5 disabled:opacity-50"
              >
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${action.color}15` }}
                >
                  {isRunning ? (
                    <Loader2 size={12} color={action.color} className="animate-spin" />
                  ) : isDone ? (
                    <Check size={12} className="text-emerald-400" />
                  ) : (
                    <Icon size={12} color={action.color} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-300">{action.label}</p>
                  <p className="text-[10px] text-slate-600 leading-tight">
                    {action.description}
                  </p>
                  {isDone && state.message && (
                    <p className="text-[10px] text-emerald-500 mt-0.5">{state.message}</p>
                  )}
                  {isError && state.message && (
                    <p className="text-[10px] text-red-400 mt-0.5">{state.message}</p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Quick Links to Dedicated Pages ─────────────────────────────────────────

function DedicatedPageLinks({ wsSlug, projectSlug }: { wsSlug: string; projectSlug: string }) {
  const links = [
    { to: workspacePath(wsSlug, `/projects/${projectSlug}/intelligence`), icon: Brain, label: 'Intelligence', desc: 'Layers, neural, behavioral' },
    { to: workspacePath(wsSlug, '/skills'), icon: Sparkles, label: 'Skills', desc: 'Skill maturity & profiles' },
    { to: workspacePath(wsSlug, '/feature-graphs'), icon: Network, label: 'Feature Graphs', desc: 'Entity graphs & flows' },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {links.map((l) => (
        <Link
          key={l.label}
          to={l.to}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.10] transition-colors group"
        >
          <l.icon size={16} className="text-slate-500 group-hover:text-indigo-400 transition-colors shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-slate-300 font-medium">{l.label}</div>
            <div className="text-[11px] text-slate-500">{l.desc}</div>
          </div>
          <ArrowRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" />
        </Link>
      ))}
    </div>
  )
}

// ─── Health Score Color Helper ──────────────────────────────────────────────

function healthScoreColor(score: number): string {
  if (score >= 80) return '#4ade80'
  if (score >= 60) return '#fbbf24'
  if (score >= 40) return '#fb923c'
  return '#f87171'
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export function ProjectDetailPage() {
  const { projectSlug: slug } = useParams<{ projectSlug: string }>()
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()
  const confirmDialog = useConfirmDialog()
  const editProjectDialog = useFormDialog()
  const milestoneFormDialog = useFormDialog()
  const releaseFormDialog = useFormDialog()
  const toast = useToast()
  const setSuggestedProjectId = useSetAtom(chatSuggestedProjectIdAtom)
  const projectRefresh = useAtomValue(projectRefreshAtom)
  const planRefresh = useAtomValue(planRefreshAtom)
  const milestoneRefresh = useAtomValue(milestoneRefreshAtom)
  const taskRefresh = useAtomValue(taskRefreshAtom)
  const [project, setProject] = useState<Project | null>(null)
  const [roadmap, setRoadmap] = useState<ProjectRoadmap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  // Expandable sections
  const [releasesExpanded, setReleasesExpanded] = useState(false)

  // Intelligence data
  const intelligence = useIntelligenceData(slug ?? '')
  const intelReady = !intelligence.loading && !intelligence.error && !!intelligence.summary

  const fetchData = useCallback(async () => {
    if (!slug) return
    setError(null)
    const isInitialLoad = !project
    if (isInitialLoad) setLoading(true)
    try {
      const projectData = await projectsApi.get(slug)
      setProject(projectData)
      setSuggestedProjectId(projectData.id)

      try {
        const roadmapData = await projectsApi.getRoadmap(projectData.id)
        setRoadmap(roadmapData)
      } catch {
        // Roadmap might not be available
      }
    } catch (err) {
      console.error('Failed to fetch project:', err)
      setError('Failed to load project')
    } finally {
      if (isInitialLoad) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- project is a data object (would cause loop); setSuggestedProjectId is a stable Jotai setter
  }, [slug, projectRefresh, planRefresh, milestoneRefresh, taskRefresh])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSync = async () => {
    if (!slug) return
    setSyncing(true)
    try {
      await projectsApi.sync(slug)
      const projectData = await projectsApi.get(slug)
      setProject(projectData)
      toast.success('Codebase synced')
    } catch (err) {
      console.error('Failed to sync project:', err)
      toast.error('Failed to sync project')
    } finally {
      setSyncing(false)
    }
  }

  const milestoneForm = CreateMilestoneForm({
    onSubmit: async (data) => {
      if (!project) return
      await projectsApi.createMilestone(project.id, data)
      toast.success('Milestone added')
      try {
        const roadmapData = await projectsApi.getRoadmap(project.id)
        setRoadmap(roadmapData)
      } catch { /* ignore */ }
    },
  })

  const releaseForm = CreateReleaseForm({
    onSubmit: async (data) => {
      if (!project) return
      await projectsApi.createRelease(project.id, data)
      toast.success('Release added')
      try {
        const roadmapData = await projectsApi.getRoadmap(project.id)
        setRoadmap(roadmapData)
      } catch { /* ignore */ }
    },
  })

  const editProjectForm = EditProjectForm({
    initialValues: {
      name: project?.name ?? '',
      slug: project?.slug,
      description: project?.description,
      root_path: project?.root_path,
    },
    onSubmit: async (data) => {
      if (!project) return
      await projectsApi.update(project.slug, data)
      setProject({ ...project, ...data })
      toast.success('Project updated')
    },
  })

  if (error) return <ErrorState title="Failed to load" description={error} onRetry={fetchData} />
  if (loading || !project) return <LoadingPage />

  const milestoneCount = (roadmap?.milestones || []).length
  const releaseCount = roadmap?.releases.length ?? 0

  // Compute overall progress from roadmap milestones
  const overallProgress = (() => {
    const milestones = roadmap?.milestones || []
    if (milestones.length === 0) return null
    let completed = 0
    let total = 0
    for (const { progress } of milestones) {
      if (progress) {
        completed += progress.completed ?? 0
        total += progress.total ?? 0
      }
    }
    if (total === 0) return null
    return { completed_tasks: completed, total_tasks: total, percentage: Math.round((completed / total) * 100) }
  })()

  return (
    <div className="pt-6 space-y-6">
      {/* ── 1. Header: name, description, health badge, sync, maintenance ── */}
      <PageHeader
        title={project.name}
        description={project.description}
        actions={
          <MaintenanceDropdown intelligence={intelligence} projectId={project.id} />
        }
        overflowActions={[
          {
            label: 'Rename',
            onClick: () => editProjectDialog.open({ title: 'Edit Project' }),
          },
          {
            label: 'Delete',
            variant: 'danger',
            onClick: () =>
              confirmDialog.open({
                title: 'Delete Project',
                description:
                  'This will permanently delete this project and all associated data.',
                onConfirm: async () => {
                  await projectsApi.delete(project.slug)
                  toast.success('Project deleted')
                  navigate(workspacePath(wsSlug, '/projects'))
                },
              }),
          },
        ]}
      >
        {/* Inline metadata: health badge + path + sync button */}
        <div className="flex items-center gap-1.5">
          {intelReady && (
            <MetricTooltip term="health_score">
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{
                  backgroundColor: `${healthScoreColor(intelligence.healthScore)}15`,
                  color: healthScoreColor(intelligence.healthScore),
                }}
              >
                <Activity size={12} />
                {intelligence.healthScore}
              </div>
            </MetricTooltip>
          )}
          {project.root_path && (
            <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-md px-2.5 py-1 group">
              <FolderOpen className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              <span
                className="text-xs text-gray-400 font-mono truncate max-w-[120px] md:max-w-[200px]"
                title={project.root_path}
              >
                {project.root_path}
              </span>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(project.root_path!)
                  toast.success('Path copied')
                }}
                className="ml-0.5 p-0.5 rounded text-gray-600 opacity-0 group-hover:opacity-100 hover:text-gray-300 hover:bg-white/[0.08] transition-all"
                title="Copy path"
              >
                <Clipboard className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="p-1.5 rounded-md text-gray-500 hover:text-indigo-400 hover:bg-white/[0.08] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              syncing
                ? 'Syncing...'
                : `Sync codebase${project.last_synced ? `\nLast sync: ${new Date(project.last_synced).toLocaleString()}` : ''}`
            }
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </PageHeader>

      {/* ── 2. Health Breakdown (top priority — full overview) ────────── */}
      {intelReady ? <IntelHealthBreakdown data={intelligence} progress={overallProgress ? { percentage: overallProgress.percentage } : undefined} /> : <IntelTabFallback intelligence={intelligence} />}

      {/* ── 3. Overall progress bar (if tasks exist) ──────────────────── */}
      {overallProgress && overallProgress.total_tasks > 0 && (
        <div className="px-1">
          <ProgressBar
            value={overallProgress.percentage}
            showLabel
            size="lg"
            gradient
            shimmer={overallProgress.percentage < 100}
          />
          <p className="mt-1 text-xs text-gray-500">
            {overallProgress.completed_tasks} / {overallProgress.total_tasks}{' '}
            tasks completed
          </p>
        </div>
      )}

      {/* ── 4. Alerts (only if issues detected) ───────────────────────── */}
      {intelReady && <IntelAttention data={intelligence} />}

      {/* ── 5. Graph + Timeline (always visible, not gated by intelligence) */}
      {slug && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network size={16} />
                Graph
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense
                fallback={
                  <div className="h-[400px] rounded-lg bg-slate-800/50 animate-pulse" />
                }
              >
                <IntelligenceGraphPage projectSlug={slug} embedded />
              </Suspense>
            </CardContent>
          </Card>
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar size={16} />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense
                fallback={
                  <div className="h-[400px] rounded-lg bg-slate-800/50 animate-pulse" />
                }
              >
                <LearningTimeline projectSlug={slug} embedded />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 6. Milestones ─────────────────────────────────────────────── */}
      {milestoneCount > 0 && (
        <section>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Milestones ({milestoneCount})</CardTitle>
              <Button
                size="sm"
                onClick={() => milestoneFormDialog.open({ title: 'Add Milestone' })}
              >
                Add
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(roadmap!.milestones || []).map(({ milestone, progress }) => (
                  <ExpandableMilestoneRow
                    key={milestone.id}
                    milestone={milestone}
                    progress={progress}
                    refreshTrigger={taskRefresh}
                    linkState={{
                      projectId: project.id,
                      projectSlug: project.slug,
                      projectName: project.name,
                    }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── 7. Quick Actions (plans in progress) ─────────────────────── */}
      {intelReady ? (
        <section>
          <IntelQuickActions data={intelligence} />
        </section>
      ) : null}
      {/* Quick Actions only shown when ready — Health Breakdown already shows fallback */}

      {/* ── 8. Releases (collapsible) ─────────────────────────────────── */}
      {releaseCount > 0 && (
        <section>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <button
                onClick={() => setReleasesExpanded(!releasesExpanded)}
                className="flex items-center gap-2 flex-1 text-left"
              >
                <ChevronRight
                  className={`w-4 h-4 text-gray-500 transition-transform duration-150 ${releasesExpanded ? 'rotate-90' : ''}`}
                />
                <CardTitle className="text-sm">
                  <MetricTooltip term="release">
                    Releases ({releaseCount})
                  </MetricTooltip>
                </CardTitle>
              </button>
              <Button
                size="sm"
                onClick={() => releaseFormDialog.open({ title: 'Add Release' })}
              >
                Add
              </Button>
            </CardHeader>
            {releasesExpanded && (
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {roadmap!.releases.map(({ release }) => (
                    <div
                      key={release.id}
                      className="flex items-center justify-between gap-2 p-2.5 bg-white/[0.04] rounded-lg"
                    >
                      <div className="min-w-0 truncate">
                        <span className="text-sm text-gray-300">v{release.version}</span>
                        {release.title && (
                          <span className="ml-2 text-gray-500 text-sm">{release.title}</span>
                        )}
                      </div>
                      <Badge variant={release.status === 'released' ? 'success' : 'default'}>
                        {release.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </section>
      )}

      {/* ── 9. Links to dedicated pages (Intelligence, Skills, Feature Graphs) */}
      <DedicatedPageLinks wsSlug={wsSlug} projectSlug={slug ?? ''} />

      {/* ── Dialogs ───────────────────────────────────────────────────── */}
      <FormDialog {...milestoneFormDialog.dialogProps} onSubmit={milestoneForm.submit}>
        {milestoneForm.fields}
      </FormDialog>
      <FormDialog {...releaseFormDialog.dialogProps} onSubmit={releaseForm.submit}>
        {releaseForm.fields}
      </FormDialog>
      <FormDialog {...editProjectDialog.dialogProps} onSubmit={editProjectForm.submit}>
        {editProjectForm.fields}
      </FormDialog>
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </div>
  )
}
