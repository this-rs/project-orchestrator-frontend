import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useSetAtom, useAtomValue } from 'jotai'
import {
  FolderOpen,
  Clipboard,
  RefreshCw,
  ChevronRight,
  Brain,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Network,
  Loader2,
  FileCode2,
  StickyNote,
  GitBranch,
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
  PageHeader,
  ProgressBar,
  WatcherToggle,
} from '@/components/ui'
import { MetricTooltip } from '@/components/ui/MetricTooltip'
import { ExpandableMilestoneRow } from '@/components/expandable'
import {
  useIntelligenceData,
  IntelQuickActions,
  IntelHealthBreakdown,
  IntelAttention,
} from '@/components/intelligence/IntelligenceDashboard'
import { projectsApi } from '@/services'
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

// ─── Health Badge removed (score % was not actionable) ──────────────────────

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

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!slug) return
    setError(null)
    const isInitialLoad = !project
    if (isInitialLoad) setLoading(true)
    try {
      const projectData = await projectsApi.get(slug, signal)
      if (signal?.aborted) return
      setProject(projectData)
      setSuggestedProjectId(projectData.id)

      try {
        const roadmapData = await projectsApi.getRoadmap(projectData.id, signal)
        if (signal?.aborted) return
        setRoadmap(roadmapData)
      } catch {
        // Roadmap might not be available (or aborted)
      }
    } catch (err) {
      if (signal?.aborted) return
      console.error('Failed to fetch project:', err)
      setError('Failed to load project')
    } finally {
      if (!signal?.aborted && isInitialLoad) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- project is a data object (would cause loop); setSuggestedProjectId is a stable Jotai setter
  }, [slug, projectRefresh, planRefresh, milestoneRefresh, taskRefresh])

  useEffect(() => {
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
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
  const intelReady = !intelligence.loading && !intelligence.error && !!intelligence.summary

  // Roadmap progress
  const roadmapProgress = roadmap?.progress

  return (
    <div className="pt-6 space-y-6">
      {/* ── 1. Header: name, description, health badge, sync status ──── */}
      <PageHeader
        title={project.name}
        description={project.description}
        status={undefined}
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
        {/* Inline metadata: path + sync button */}
        <div className="flex items-center gap-1.5">
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
          {project.root_path && (
            <WatcherToggle
              projectId={project.id}
              rootPath={project.root_path}
              compact
            />
          )}
        </div>
      </PageHeader>

      {/* ── 2. Overall progress bar ──────────────────────────────────── */}
      {roadmapProgress && roadmapProgress.total_tasks > 0 && (
        <div className="px-1">
          <ProgressBar
            value={roadmapProgress.percentage}
            showLabel
            size="lg"
            gradient
            shimmer={roadmapProgress.percentage < 100}
          />
          <p className="mt-1 text-xs text-gray-500">
            {roadmapProgress.completed_tasks} / {roadmapProgress.total_tasks} tasks completed
          </p>
        </div>
      )}

      {/* ── 3. Stat tiles grid (glassmorphism, matching workspace) ──── */}
      {intelReady && intelligence.summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ProjectStatTile
            icon={<FileCode2 size={20} />}
            value={intelligence.summary.code.files + intelligence.summary.code.functions}
            label="Code Entities"
            sub={`${intelligence.summary.code.files} files \u00b7 ${intelligence.summary.code.functions} functions`}
            gradient="from-indigo-500/20 to-violet-500/20"
            iconColor="text-indigo-400"
            borderColor="border-indigo-500/20"
          />
          <ProjectStatTile
            icon={<StickyNote size={20} />}
            value={intelligence.summary.knowledge.notes + intelligence.summary.knowledge.decisions}
            label="Notes & Decisions"
            sub={`${intelligence.summary.knowledge.notes} notes \u00b7 ${intelligence.summary.knowledge.decisions} decisions`}
            gradient="from-amber-500/20 to-orange-500/20"
            iconColor="text-amber-400"
            borderColor="border-amber-500/20"
          />
          <ProjectStatTile
            icon={<Sparkles size={20} />}
            value={intelligence.summary.skills.total}
            label="Skills"
            sub={`${intelligence.summary.skills.active} active \u00b7 ${intelligence.summary.skills.emerging} emerging`}
            gradient="from-rose-500/20 to-pink-500/20"
            iconColor="text-rose-400"
            borderColor="border-rose-500/20"
          />
          <ProjectStatTile
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

      {/* ── 4. Health Breakdown (first intel section) ─────────────────── */}
      {intelReady ? (
        <IntelHealthBreakdown
          data={intelligence}
          progress={roadmapProgress ? { percentage: roadmapProgress.percentage } : undefined}
        />
      ) : (
        <IntelTabFallback intelligence={intelligence} />
      )}

      {/* ── 5. Active Milestones ─────────────────────────────────────── */}
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
            {milestoneCount === 0 ? (
              <p className="text-gray-500 text-sm">No milestones defined</p>
            ) : (
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
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── 6. Attention Needed + Quick Actions ──────────────────────── */}
      {intelReady && (
        <>
          <IntelAttention data={intelligence} />
          <IntelQuickActions data={intelligence} />
        </>
      )}

      {/* ── 7. Releases (collapsible) ────────────────────────────────── */}
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

      {/* ── 8. Links to dedicated pages ──────────────────────────────── */}
      <DedicatedPageLinks wsSlug={wsSlug} projectSlug={slug ?? ''} />

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
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

// ============================================================================
// ProjectStatTile — glassmorphism stat card (same design as workspace)
// ============================================================================

function ProjectStatTile({
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
