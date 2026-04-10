import { lazy, Suspense, useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  LoadingPage,
  ErrorState,
  Badge,
  Button,
  FormDialog,
  LinkEntityDialog,
  ProgressBar,
  PageHeader,
  ConfirmDialog,
  MilestoneStatusBadge,
  MetricTooltip,
  WatcherToggle,
} from '@/components/ui'
import {
  Network,
  Loader2,
  Calendar,
  FileCode2,
  StickyNote,
  Sparkles,
  Wrench,
  Timer,
  Zap,
  Waves,
  BrainCircuit,
  Search,
  Activity,
  Check,
  AlertTriangle,
  Brain,
  GitBranch,
} from 'lucide-react'
import { workspacesApi, projectsApi } from '@/services'
import { adminApi } from '@/services/admin'
import {
  useFormDialog,
  useLinkDialog,
  useToast,
  useConfirmDialog,
  useWorkspaceSlug,
} from '@/hooks'
import { workspacePath } from '@/utils/paths'
import {
  workspaceRefreshAtom,
  projectRefreshAtom,
  milestoneRefreshAtom,
  taskRefreshAtom,
} from '@/atoms'
import {
  CreateMilestoneForm,
  CreateResourceForm,
  CreateComponentForm,
  EditWorkspaceForm,
} from '@/components/forms'
import {
  IntelHealthBreakdown,
  IntelAttention,
} from '@/components/intelligence/IntelligenceDashboard'
import { useWorkspaceIntelligenceData } from '@/components/intelligence/useWorkspaceIntelligenceData'
import type {
  Workspace,
  Project,
  WorkspaceMilestone,
  Resource,
  Component,
  MilestoneProgress,
} from '@/types'

// Lazy-load heavy intelligence components
const WorkspaceGraphPage = lazy(
  () => import('@/components/intelligence/WorkspaceGraphPage'),
)
const WorkspaceLearningTimeline = lazy(
  () => import('@/components/intelligence/WorkspaceLearningTimeline'),
)

// API response structure
interface WorkspaceOverviewResponse {
  workspace: Workspace
  projects: Project[]
  milestones: WorkspaceMilestone[]
  resources: Resource[]
  components: Component[]
  progress: {
    completed_tasks: number
    total_tasks: number
    percentage: number
  }
}

// ============================================================================
// IntelTabFallback — inline loading/error/empty for intelligence sections
// ============================================================================

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

// ============================================================================
// Maintenance Dropdown (replaces 6 visible quick-action buttons)
// ============================================================================

function MaintenanceDropdown({
  intelligence,
}: {
  intelligence: ReturnType<typeof useWorkspaceIntelligenceData>
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  // Close on Escape
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
        // Workspace-level: no single project, skip if needed
        return 'Workspace-level: use project page for fabric scores'
      },
    },
    {
      key: 'skills',
      label: 'Detect Skills',
      description: 'Auto-detect emergent skills from note clusters',
      icon: BrainCircuit,
      color: '#ec4899',
      run: async () => {
        return 'Workspace-level: use project page for skill detection'
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
                onClick={() =>
                  intelligence.runAction(action.key, action.run)
                }
                disabled={isRunning}
                className="w-full px-3 py-2 text-left hover:bg-white/[0.06] transition-colors flex items-center gap-2.5 disabled:opacity-50"
              >
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${action.color}15` }}
                >
                  {isRunning ? (
                    <Loader2
                      size={12}
                      color={action.color}
                      className="animate-spin"
                    />
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
                    <p className="text-[10px] text-emerald-500 mt-0.5">
                      {state.message}
                    </p>
                  )}
                  {isError && state.message && (
                    <p className="text-[10px] text-red-400 mt-0.5">
                      {state.message}
                    </p>
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

// ============================================================================
// MAIN PAGE — Linear vertical layout (no tabs)
// ============================================================================

export function WorkspaceDetailPage() {
  const slug = useWorkspaceSlug()
  const navigate = useNavigate()
  const editWorkspaceDialog = useFormDialog()
  const milestoneFormDialog = useFormDialog()
  const resourceFormDialog = useFormDialog()
  const componentFormDialog = useFormDialog()
  const linkDialog = useLinkDialog()
  const moveDialog = useLinkDialog()
  const confirmDialog = useConfirmDialog()
  const toast = useToast()
  const workspaceRefresh = useAtomValue(workspaceRefreshAtom)
  const projectRefresh = useAtomValue(projectRefreshAtom)
  const milestoneRefresh = useAtomValue(milestoneRefreshAtom)
  const taskRefresh = useAtomValue(taskRefreshAtom)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [milestones, setMilestones] = useState<
    (WorkspaceMilestone & { progress?: MilestoneProgress })[]
  >([])
  const [resources, setResources] = useState<Resource[]>([])
  const [components, setComponents] = useState<Component[]>([])
  const [overallProgress, setOverallProgress] = useState<{
    completed_tasks: number
    total_tasks: number
    percentage: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (signal: AbortSignal) => {
    if (!slug) return
    setError(null)
    // Only show loading spinner on initial load, not on WS-triggered refreshes
    const isInitialLoad = !workspace
    if (isInitialLoad) setLoading(true)
    try {
      const overviewData =
        (await workspacesApi.getOverview(
          slug,
          signal,
        )) as unknown as WorkspaceOverviewResponse

      if (signal.aborted) return

      setWorkspace(overviewData.workspace)
      setProjects(overviewData.projects || [])
      setResources(overviewData.resources || [])
      setComponents(overviewData.components || [])
      setOverallProgress(overviewData.progress || null)

      // Use milestones from overview and fetch progress for each
      const milestoneItems = overviewData.milestones || []
      const milestonesWithProgress = await Promise.all(
        milestoneItems.map(async (m) => {
          try {
            const progress = await workspacesApi.getMilestoneProgress(m.id, signal)
            return { ...m, progress }
          } catch {
            return { ...m, progress: undefined }
          }
        }),
      )
      if (signal.aborted) return
      setMilestones(milestonesWithProgress)
    } catch (err) {
      if (signal.aborted) return
      console.error('Failed to fetch workspace:', err)
      setError('Failed to load workspace')
    } finally {
      if (!signal.aborted && isInitialLoad) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- workspace is a data object (would cause infinite loop)
  }, [slug, workspaceRefresh, projectRefresh, milestoneRefresh, taskRefresh])

  useEffect(() => {
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData])

  const milestoneForm = CreateMilestoneForm({
    onSubmit: async (data) => {
      if (!slug) return
      const newMilestone = await workspacesApi.createMilestone(slug, data)
      setMilestones((prev) => [
        ...prev,
        { ...newMilestone, progress: undefined },
      ])
      toast.success('Milestone added')
    },
  })

  const resourceForm = CreateResourceForm({
    onSubmit: async (data) => {
      if (!slug) return
      const newResource = await workspacesApi.createResource(slug, data)
      setResources((prev) => [...prev, newResource])
      toast.success('Resource added')
    },
  })

  const componentForm = CreateComponentForm({
    onSubmit: async (data) => {
      if (!slug) return
      const newComponent = await workspacesApi.createComponent(slug, data)
      setComponents((prev) => [...prev, newComponent])
      toast.success('Component added')
    },
  })

  const editWorkspaceForm = EditWorkspaceForm({
    initialValues: {
      name: workspace?.name ?? '',
      description: workspace?.description,
      slug: workspace?.slug ?? '',
    },
    onSubmit: async (data) => {
      if (!slug) return
      const updated = await workspacesApi.update(slug, data)
      setWorkspace(updated)
      toast.success('Workspace renamed')
      if (data.slug && data.slug !== slug) {
        navigate(`/workspace/${data.slug}/overview`, { replace: true })
      }
    },
  })

  // Workspace intelligence data (aggregated across all projects)
  const intelligence = useWorkspaceIntelligenceData(slug ?? '')
  const intelReady =
    !intelligence.loading && !intelligence.error && !!intelligence.summary

  if (loading) return <LoadingPage />
  if (error || !workspace)
    return (
      <ErrorState
        title="Failed to load"
        description={error ?? 'Workspace data unavailable'}
        onRetry={() => fetchData(new AbortController().signal)}
      />
    )

  return (
    <div className="pt-6 space-y-6">
      {/* ── 1. Header ── */}
      <PageHeader
        title={workspace.name}
        description={workspace.description}
        actions={
          <MaintenanceDropdown intelligence={intelligence} />
        }
        overflowActions={[
          {
            label: 'Rename workspace',
            onClick: () =>
              editWorkspaceDialog.open({ title: 'Rename Workspace' }),
          },
          {
            label: 'Delete workspace',
            variant: 'danger',
            onClick: () => {
              confirmDialog.open({
                title: 'Delete Workspace',
                description: `This will permanently delete "${workspace.name}". Projects will not be deleted.`,
                onConfirm: async () => {
                  await workspacesApi.delete(workspace.slug)
                  toast.success('Workspace deleted')
                  navigate('/workspace-selector')
                },
              })
            },
          },
        ]}
      >
        {/* Health score badge only */}
        {intelReady && (
          <MetricTooltip term="health_score">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold w-fit"
              style={{
                backgroundColor: `${healthScoreColor(intelligence.healthScore)}15`,
                color: healthScoreColor(intelligence.healthScore),
              }}
            >
              <Activity size={12} />
              Health {intelligence.healthScore}
            </div>
          </MetricTooltip>
        )}
      </PageHeader>

      {/* Overall progress bar (if tasks exist) */}
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

      {/* ── 2. Stat cards — polished glassmorphism grid ── */}
      {intelReady && intelligence.summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            icon={<FileCode2 size={20} />}
            value={intelligence.summary.code.files + intelligence.summary.code.functions}
            label="Code Entities"
            sub={`${intelligence.summary.code.files} files \u00b7 ${intelligence.summary.code.functions} functions`}
            gradient="from-indigo-500/20 to-violet-500/20"
            iconColor="text-indigo-400"
            borderColor="border-indigo-500/20"
          />
          <StatTile
            icon={<StickyNote size={20} />}
            value={intelligence.summary.knowledge.notes + intelligence.summary.knowledge.decisions}
            label="Notes & Decisions"
            sub={`${intelligence.summary.knowledge.notes} notes \u00b7 ${intelligence.summary.knowledge.decisions} decisions`}
            gradient="from-amber-500/20 to-orange-500/20"
            iconColor="text-amber-400"
            borderColor="border-amber-500/20"
          />
          <StatTile
            icon={<Sparkles size={20} />}
            value={intelligence.summary.skills.total}
            label="Skills"
            sub={`${intelligence.summary.skills.active} active \u00b7 ${intelligence.summary.skills.emerging} emerging`}
            gradient="from-rose-500/20 to-pink-500/20"
            iconColor="text-rose-400"
            borderColor="border-rose-500/20"
          />
          <StatTile
            icon={<GitBranch size={20} />}
            value={intelligence.summary.neural.active_synapses}
            label="Synapses"
            sub={`${Math.round(intelligence.summary.neural.avg_energy * 100)}% avg energy`}
            gradient="from-cyan-500/20 to-teal-500/20"
            iconColor="text-cyan-400"
            borderColor="border-cyan-500/20"
          />
        </div>
      )}

      {/* ── 3. Health Breakdown (first intelligence section) ── */}
      {intelReady ? (
        <IntelHealthBreakdown data={intelligence} />
      ) : (
        <IntelTabFallback intelligence={intelligence} />
      )}

      {/* ── 4. Graph + Timeline ── */}
      {slug && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 min-h-[300px]">
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
                <WorkspaceGraphPage workspaceSlug={slug!} embedded />
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
                <WorkspaceLearningTimeline workspaceSlug={slug!} embedded />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 5. Attention Needed ── */}
      {intelReady && <IntelAttention data={intelligence} />}

      {/* ── 6. Projects ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Projects</CardTitle>
            <Button
              size="sm"
              onClick={() =>
                linkDialog.open({
                  title: 'Add Project to Workspace',
                  submitLabel: 'Add',
                  fetchOptions: async () => {
                    const data = await projectsApi.list()
                    const existingIds = new Set(
                      projects.map((p) => p.id),
                    )
                    return (data.items || [])
                      .filter((p) => !existingIds.has(p.id))
                      .map((p) => ({
                        value: p.id,
                        label: p.name,
                        description: p.slug,
                      }))
                  },
                  onLink: async (projectId) => {
                    await workspacesApi.addProject(
                      workspace.slug,
                      projectId,
                    )
                    const data = await projectsApi.list()
                    const proj = (data.items || []).find(
                      (p) => p.id === projectId,
                    )
                    if (proj)
                      setProjects((prev) => [...prev, proj])
                    toast.success('Project added')
                  },
                })
              }
            >
              Add Project
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No projects in this workspace
            </p>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between p-3 bg-white/[0.06] rounded-lg"
                >
                  <Link
                    to={workspacePath(
                      slug,
                      `/projects/${project.slug}`,
                    )}
                    className="font-medium text-gray-200 hover:text-indigo-400 transition-colors flex-1 min-w-0"
                  >
                    {project.name}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500 hidden sm:inline">
                      {project.slug}
                    </span>
                    {project.root_path && (
                      <WatcherToggle
                        projectId={project.id}
                        rootPath={project.root_path}
                        compact
                      />
                    )}
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        moveDialog.open({
                          title: `Move "${project.name}" to workspace`,
                          submitLabel: 'Move',
                          fetchOptions: async () => {
                            const allWorkspaces =
                              await workspacesApi.list()
                            return (allWorkspaces.items || [])
                              .filter(
                                (w) => w.slug !== workspace.slug,
                              )
                              .map((w) => ({
                                value: w.slug,
                                label: w.name,
                                description: w.slug,
                              }))
                          },
                          onLink: async (targetSlug) => {
                            await workspacesApi.removeProject(
                              workspace.slug,
                              project.id,
                            )
                            await workspacesApi.addProject(
                              targetSlug,
                              project.id,
                            )
                            setProjects((prev) =>
                              prev.filter(
                                (p) => p.id !== project.id,
                              ),
                            )
                            toast.success(
                              `Project moved to ${targetSlug}`,
                            )
                          },
                        })
                      }}
                      className="text-gray-500 hover:text-indigo-400 text-xs px-1"
                      title="Move to another workspace"
                    >
                      Move
                    </button>
                    <button
                      onClick={async (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        await workspacesApi.removeProject(
                          workspace.slug,
                          project.id,
                        )
                        setProjects((prev) =>
                          prev.filter((p) => p.id !== project.id),
                        )
                        toast.success('Project removed')
                      }}
                      className="text-gray-500 hover:text-red-400 text-sm px-1"
                      title="Remove from workspace"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 7. Milestones with progress bars ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Milestones</CardTitle>
            <Button
              size="sm"
              onClick={() =>
                milestoneFormDialog.open({ title: 'Add Milestone' })
              }
            >
              Add Milestone
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {milestones.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No milestones defined
            </p>
          ) : (
            <div className="space-y-4">
              {milestones.map((milestone) => (
                <Link
                  key={milestone.id}
                  to={workspacePath(
                    slug,
                    `/milestones/${milestone.id}`,
                  )}
                  className="block p-4 bg-white/[0.06] rounded-lg hover:bg-white/[0.08] transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-medium text-gray-200 truncate min-w-0">
                      {milestone.title}
                    </span>
                    <MilestoneStatusBadge status={milestone.status} />
                  </div>
                  {milestone.progress && (
                    <div className="space-y-1">
                      <ProgressBar
                        value={milestone.progress.percentage}
                        showLabel
                      />
                      <p className="text-xs text-gray-500">
                        {milestone.progress.completed} /{' '}
                        {milestone.progress.total} tasks completed
                      </p>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 8. Assets (resources + components) in compact grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Resources</CardTitle>
              <Button
                size="sm"
                onClick={() =>
                  resourceFormDialog.open({
                    title: 'Add Resource',
                    size: 'lg',
                  })
                }
              >
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {resources.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No resources defined
              </p>
            ) : (
              <div className="space-y-2">
                {resources.map((resource) => (
                  <div
                    key={resource.id}
                    className="flex items-center justify-between gap-2 p-2"
                  >
                    <span className="text-gray-200 truncate min-w-0">
                      {resource.name}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge>{resource.resource_type}</Badge>
                      <button
                        onClick={async () => {
                          await workspacesApi.deleteResource(resource.id)
                          setResources((prev) =>
                            prev.filter((r) => r.id !== resource.id),
                          )
                          toast.success('Resource deleted')
                        }}
                        className="text-gray-500 hover:text-red-400 text-sm px-1"
                        title="Delete resource"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Components</CardTitle>
              <Button
                size="sm"
                onClick={() =>
                  componentFormDialog.open({ title: 'Add Component' })
                }
              >
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {components.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No components defined
              </p>
            ) : (
              <div className="space-y-2">
                {components.map((component) => (
                  <div
                    key={component.id}
                    className="flex items-center justify-between gap-2 p-2"
                  >
                    <span className="text-gray-200 truncate min-w-0">
                      {component.name}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge>{component.component_type}</Badge>
                      <button
                        onClick={async () => {
                          await workspacesApi.deleteComponent(
                            component.id,
                          )
                          setComponents((prev) =>
                            prev.filter((c) => c.id !== component.id),
                          )
                          toast.success('Component deleted')
                        }}
                        className="text-gray-500 hover:text-red-400 text-sm px-1"
                        title="Delete component"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <FormDialog
        {...editWorkspaceDialog.dialogProps}
        onSubmit={editWorkspaceForm.submit}
      >
        {editWorkspaceForm.fields}
      </FormDialog>
      <FormDialog
        {...milestoneFormDialog.dialogProps}
        onSubmit={milestoneForm.submit}
      >
        {milestoneForm.fields}
      </FormDialog>
      <FormDialog
        {...resourceFormDialog.dialogProps}
        onSubmit={resourceForm.submit}
      >
        {resourceForm.fields}
      </FormDialog>
      <FormDialog
        {...componentFormDialog.dialogProps}
        onSubmit={componentForm.submit}
      >
        {componentForm.fields}
      </FormDialog>
      <LinkEntityDialog {...linkDialog.dialogProps} />
      <LinkEntityDialog {...moveDialog.dialogProps} />
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </div>
  )
}

// ============================================================================
// StatTile — polished glassmorphism stat card for the overview grid
// ============================================================================

function StatTile({
  icon,
  value,
  label,
  sub,
  gradient,
  iconColor,
  borderColor,
}: {
  icon: React.ReactNode
  value: number
  label: string
  sub: string
  gradient: string
  iconColor: string
  borderColor: string
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border ${borderColor} bg-gradient-to-br ${gradient} backdrop-blur-sm p-4`}
    >
      {/* Subtle glow */}
      <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-white/[0.03] blur-2xl" />

      <div className={`${iconColor} mb-3`}>{icon}</div>
      <div className="text-2xl font-bold text-gray-100 tracking-tight">
        {value.toLocaleString()}
      </div>
      <div className="text-sm font-medium text-gray-300 mt-0.5">{label}</div>
      <div className="text-[11px] text-gray-500 mt-1">{sub}</div>
    </div>
  )
}

// ============================================================================
// Helpers (duplicated from IntelligenceDashboard for badge use in header)
// ============================================================================

function healthScoreColor(score: number): string {
  if (score >= 80) return '#4ade80'
  if (score >= 60) return '#fbbf24'
  if (score >= 40) return '#fb923c'
  return '#f87171'
}
