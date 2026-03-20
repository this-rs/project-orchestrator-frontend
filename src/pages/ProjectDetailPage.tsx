import { useEffect, useState, useCallback, useRef } from 'react'
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
} from '@/components/ui'
import { MetricTooltip } from '@/components/ui/MetricTooltip'
import { ExpandableMilestoneRow } from '@/components/expandable'
import {
  useIntelligenceData,
  IntelQuickActions,
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

// ─── Health Badge with Popover ──────────────────────────────────────────────

function HealthBadgeWithAlerts({
  healthScore,
  intelligence,
}: {
  healthScore: number
  intelligence: ReturnType<typeof useIntelligenceData>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const color =
    healthScore >= 0.7
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
      : healthScore >= 0.4
        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
        : 'bg-red-500/20 text-red-400 border-red-500/40'

  // Collect alerts
  const s = intelligence.summary
  const alerts: { label: string; color: string }[] = []
  if (s) {
    if (s.knowledge.stale_count > 0)
      alerts.push({ label: `${s.knowledge.stale_count} stale notes`, color: 'text-amber-400' })
    if (s.neural.dead_notes_count > 0)
      alerts.push({ label: `${s.neural.dead_notes_count} dead notes`, color: 'text-slate-400' })
    if (s.code.orphans > 5)
      alerts.push({ label: `${s.code.orphans} orphan files`, color: 'text-amber-400' })
  }
  if (intelligence.health?.risk_assessment?.critical_count && intelligence.health.risk_assessment.critical_count > 0)
    alerts.push({
      label: `${intelligence.health.risk_assessment.critical_count} critical risk files`,
      color: 'text-red-400',
    })
  if (intelligence.health && intelligence.health.god_function_count > 0)
    alerts.push({
      label: `${intelligence.health.god_function_count} god functions`,
      color: 'text-orange-400',
    })

  return (
    <div className="relative" ref={ref}>
      <MetricTooltip term="health_score">
        <button
          onClick={() => setOpen(!open)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${color}`}
        >
          {Math.round(healthScore * 100)}%
          {alerts.length > 0 && (
            <AlertTriangle size={12} className="text-amber-400" />
          )}
        </button>
      </MetricTooltip>

      {open && alerts.length > 0 && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-slate-900 border border-white/10 rounded-lg shadow-xl p-3 space-y-1.5">
          <div className="text-[11px] font-medium text-slate-400 mb-1">Attention Needed</div>
          {alerts.map((a) => (
            <div
              key={a.label}
              className={`flex items-center gap-2 text-[11px] ${a.color}`}
            >
              <AlertTriangle size={10} />
              {a.label}
            </div>
          ))}
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
  const intelReady = !intelligence.loading && !intelligence.error && !!intelligence.summary

  return (
    <div className="pt-6 space-y-6">
      {/* ── Header: name, description, health badge, sync status ──────── */}
      <PageHeader
        title={project.name}
        description={project.description}
        status={intelReady ? (
          <HealthBadgeWithAlerts
            healthScore={intelligence.healthScore}
            intelligence={intelligence}
          />
        ) : undefined}
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
        </div>
      </PageHeader>


      {/* ── Section 1: Active Milestones ────────────────────────────────── */}
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

      {/* ── Section 2: Quick Actions / Intelligence fallback ──────────── */}
      {intelReady ? (
        <section>
          <IntelQuickActions data={intelligence} />
        </section>
      ) : (
        <IntelTabFallback intelligence={intelligence} />
      )}

      {/* ── Section 3: Releases (collapsible) ──────────────────────────── */}
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

      {/* ── Links to dedicated pages (Intelligence, Skills, Feature Graphs) */}
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
