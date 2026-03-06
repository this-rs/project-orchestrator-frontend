import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useSetAtom, useAtomValue } from 'jotai'
import { FolderOpen, Clipboard, RefreshCw, ChevronsUpDown, Trash2, Loader2, ChevronRight, Orbit, Calendar, Network } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, Button, ConfirmDialog, FormDialog, LinkEntityDialog, LoadingPage, ErrorState, Badge, PageHeader, SectionNav } from '@/components/ui'
import { ExpandablePlanRow } from '@/components/expandable'
import { projectsApi, plansApi, featureGraphsApi } from '@/services'
import { useConfirmDialog, useFormDialog, useLinkDialog, useToast, useSectionObserver, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { chatSuggestedProjectIdAtom, projectRefreshAtom, planRefreshAtom, milestoneRefreshAtom, taskRefreshAtom } from '@/atoms'
import { CreateMilestoneForm, CreateReleaseForm } from '@/components/forms'
import type { Project, Plan, ProjectRoadmap, PlanStatus, FeatureGraph } from '@/types'

const IntelligenceDashboard = lazy(() => import('@/components/intelligence/IntelligenceDashboard'))

export function ProjectDetailPage() {
  const { projectSlug: slug } = useParams<{ projectSlug: string }>()
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()
  const confirmDialog = useConfirmDialog()
  const milestoneFormDialog = useFormDialog()
  const releaseFormDialog = useFormDialog()
  const linkDialog = useLinkDialog()
  const toast = useToast()
  const setSuggestedProjectId = useSetAtom(chatSuggestedProjectIdAtom)
  const projectRefresh = useAtomValue(projectRefreshAtom)
  const planRefresh = useAtomValue(planRefreshAtom)
  const milestoneRefresh = useAtomValue(milestoneRefreshAtom)
  const taskRefresh = useAtomValue(taskRefreshAtom)
  const [project, setProject] = useState<Project | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [roadmap, setRoadmap] = useState<ProjectRoadmap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [featureGraphs, setFeatureGraphs] = useState<FeatureGraph[]>([])
  const [plansExpandAll, setPlansExpandAll] = useState(0)
  const [plansCollapseAll, setPlansCollapseAll] = useState(0)
  const [plansAllExpanded, setPlansAllExpanded] = useState(false)

  // Expandable sections
  const [milestonesExpanded, setMilestonesExpanded] = useState(false)
  const [releasesExpanded, setReleasesExpanded] = useState(false)
  const [fgExpanded, setFgExpanded] = useState(false)

  const fetchData = useCallback(async () => {
    if (!slug) return
    setError(null)
    const isInitialLoad = !project
    if (isInitialLoad) setLoading(true)
    try {
      const projectData = await projectsApi.get(slug)
      setProject(projectData)
      setSuggestedProjectId(projectData.id)

      const allPlansData = await plansApi.list({ limit: 100 })
      const projectPlans = (allPlansData.items || []).filter(
        (plan) => plan.project_id === projectData.id
      )
      setPlans(projectPlans)

      try {
        const roadmapData = await projectsApi.getRoadmap(projectData.id)
        setRoadmap(roadmapData)
      } catch {
        // Roadmap might not be available
      }

      try {
        const fgData = await featureGraphsApi.list({ project_id: projectData.id })
        setFeatureGraphs(fgData.feature_graphs || [])
      } catch (fgError) {
        console.error('Failed to fetch feature graphs:', fgError)
      }
    } catch (error) {
      console.error('Failed to fetch project:', error)
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
    } catch (error) {
      console.error('Failed to sync project:', error)
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

  const milestoneCount = (roadmap?.milestones || []).length
  const releaseCount = roadmap?.releases.length ?? 0
  const hasRoadmap = milestoneCount > 0 || releaseCount > 0

  const sectionIds = ['intelligence', 'plans', ...(hasRoadmap ? ['roadmap'] : []), ...(featureGraphs.length > 0 ? ['feature-graphs'] : [])]
  const activeSection = useSectionObserver(sectionIds)

  if (error) return <ErrorState title="Failed to load" description={error} onRetry={fetchData} />
  if (loading || !project) return <LoadingPage />

  const sections = [
    { id: 'intelligence', label: 'Intelligence' },
    { id: 'plans', label: 'Plans', count: plans.length },
    ...(hasRoadmap ? [{ id: 'roadmap', label: 'Roadmap', count: milestoneCount + releaseCount }] : []),
    ...(featureGraphs.length > 0 ? [{ id: 'feature-graphs', label: 'Feature Graphs', count: featureGraphs.length }] : []),
  ]

  return (
    <div className="pt-6 space-y-6">
      <PageHeader
        title={project.name}
        description={project.description}
        overflowActions={[
          { label: 'Delete', variant: 'danger', onClick: () => confirmDialog.open({
            title: 'Delete Project',
            description: 'This will permanently delete this project and all associated data.',
            onConfirm: async () => { await projectsApi.delete(project.slug); toast.success('Project deleted'); navigate(workspacePath(wsSlug, '/projects')) }
          }) }
        ]}
      />

      <SectionNav
        sections={sections}
        activeSection={activeSection}
        rightContent={
          <div className="flex items-center gap-1.5">
            {/* Sub-view buttons */}
            <button
              onClick={() => navigate(workspacePath(wsSlug, `/projects/${slug}/intelligence/vector-space`))}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-violet-400 hover:bg-violet-500/10 transition-colors"
              title="Vector Space"
            >
              <Orbit size={12} />
              <span className="hidden md:inline">Vector Space</span>
            </button>
            <button
              onClick={() => navigate(workspacePath(wsSlug, `/projects/${slug}/intelligence/timeline`))}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors"
              title="Timeline"
            >
              <Calendar size={12} />
              <span className="hidden md:inline">Timeline</span>
            </button>
            <button
              onClick={() => navigate(workspacePath(wsSlug, `/projects/${slug}/intelligence/graph`))}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-cyan-400 hover:bg-cyan-500/10 transition-colors"
              title="Graph"
            >
              <Network size={12} />
              <span className="hidden md:inline">Graph</span>
            </button>
            <div className="w-px h-4 bg-white/[0.08] mx-0.5" />
            {project.root_path && (
              <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-md px-2.5 py-1 group">
                <FolderOpen className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                <span className="text-xs text-gray-400 font-mono truncate max-w-[120px] md:max-w-[200px]" title={project.root_path}>
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
              title={syncing ? 'Syncing...' : `Sync codebase${project.last_synced ? `\nLast sync: ${new Date(project.last_synced).toLocaleString()}` : ''}`}
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      />

      {/* ── Intelligence Dashboard ─────────────────────────────────────── */}
      <section id="intelligence" className="scroll-mt-20">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
            </div>
          }
        >
          <IntelligenceDashboard
            projectSlug={slug!}
            progress={roadmap ? { percentage: roadmap.progress.percentage } : undefined}
          />
        </Suspense>
      </section>

      {/* ── Plans ──────────────────────────────────────────────────────── */}
      <section id="plans" className="scroll-mt-20">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Plans ({plans.length})</CardTitle>
              {plans.length > 0 && (
                <button
                  onClick={() => {
                    if (plansAllExpanded) {
                      setPlansCollapseAll((s) => s + 1)
                    } else {
                      setPlansExpandAll((s) => s + 1)
                    }
                    setPlansAllExpanded(!plansAllExpanded)
                  }}
                  className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                  title={plansAllExpanded ? 'Collapse all' : 'Expand all'}
                >
                  <ChevronsUpDown className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => linkDialog.open({
                title: 'Link Existing Plan',
                submitLabel: 'Link',
                fetchOptions: async () => {
                  const data = await plansApi.list({ limit: 100 })
                  return (data.items || [])
                    .filter(p => !p.project_id)
                    .map(p => ({ value: p.id, label: p.title, description: p.status }))
                },
                onLink: async (planId) => {
                  await plansApi.linkToProject(planId, project.id)
                  const allPlansData = await plansApi.list({ limit: 100 })
                  const projectPlans = (allPlansData.items || []).filter(p => p.project_id === project.id)
                  setPlans(projectPlans)
                  toast.success('Plan linked')
                },
              })}>Link Plan</Button>
              <Link to={workspacePath(wsSlug, '/plans')}>
                <Button variant="ghost" size="sm">View All</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {plans.length === 0 ? (
              <p className="text-gray-500 text-sm">No plans for this project</p>
            ) : (
              <div className="space-y-2">
                {plans.map((plan) => (
                  <ExpandablePlanRow
                    key={plan.id}
                    plan={plan}
                    onStatusChange={async (newStatus: PlanStatus) => {
                      await plansApi.updateStatus(plan.id, newStatus)
                      setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, status: newStatus } : p)))
                      toast.success('Status updated')
                    }}
                    refreshTrigger={taskRefresh}
                    expandAllSignal={plansExpandAll}
                    collapseAllSignal={plansCollapseAll}
                    linkState={{ projectId: project.id, projectSlug: project.slug, projectName: project.name }}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Roadmap (expandable milestones + releases) ─────────────────── */}
      {hasRoadmap && (
        <section id="roadmap" className="scroll-mt-20 space-y-3">
          {/* Milestones */}
          {milestoneCount > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <button
                  onClick={() => setMilestonesExpanded(!milestonesExpanded)}
                  className="flex items-center gap-2 flex-1 text-left"
                >
                  <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform duration-150 ${milestonesExpanded ? 'rotate-90' : ''}`} />
                  <CardTitle className="text-sm">Milestones ({milestoneCount})</CardTitle>
                </button>
                <Button size="sm" onClick={() => milestoneFormDialog.open({ title: 'Add Milestone' })}>Add</Button>
              </CardHeader>
              {milestonesExpanded && (
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {(roadmap!.milestones || []).map(({ milestone }) => (
                      <Link
                        key={milestone.id}
                        to={workspacePath(wsSlug, `/project-milestones/${milestone.id}`)}
                        state={{ projectId: project.id, projectSlug: project.slug, projectName: project.name }}
                        className="flex items-center justify-between gap-2 p-2.5 bg-white/[0.04] rounded-lg hover:bg-white/[0.06] transition-colors"
                      >
                        <span className="text-sm text-gray-300 truncate min-w-0">{milestone.title}</span>
                        <Badge variant={milestone.status?.toLowerCase() === 'open' ? 'info' : 'success'}>
                          {milestone.status}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Releases */}
          {releaseCount > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <button
                  onClick={() => setReleasesExpanded(!releasesExpanded)}
                  className="flex items-center gap-2 flex-1 text-left"
                >
                  <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform duration-150 ${releasesExpanded ? 'rotate-90' : ''}`} />
                  <CardTitle className="text-sm">Releases ({releaseCount})</CardTitle>
                </button>
                <Button size="sm" onClick={() => releaseFormDialog.open({ title: 'Add Release' })}>Add</Button>
              </CardHeader>
              {releasesExpanded && (
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {roadmap!.releases.map(({ release }) => (
                      <div key={release.id} className="flex items-center justify-between gap-2 p-2.5 bg-white/[0.04] rounded-lg">
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
          )}
        </section>
      )}

      {/* ── Feature Graphs (expandable) ────────────────────────────────── */}
      {featureGraphs.length > 0 && (
        <section id="feature-graphs" className="scroll-mt-20">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <button
                onClick={() => setFgExpanded(!fgExpanded)}
                className="flex items-center gap-2 flex-1 text-left"
              >
                <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform duration-150 ${fgExpanded ? 'rotate-90' : ''}`} />
                <CardTitle className="text-sm">Feature Graphs ({featureGraphs.length})</CardTitle>
              </button>
            </CardHeader>
            {fgExpanded && (
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {featureGraphs.map((fg) => (
                    <Link
                      key={fg.id}
                      to={workspacePath(wsSlug, `/feature-graphs/${fg.id}`)}
                      state={{ projectId: project.id, projectSlug: project.slug, projectName: project.name }}
                      className="flex items-center justify-between gap-3 p-2.5 bg-white/[0.04] rounded-lg hover:bg-white/[0.06] transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-300 truncate">{fg.name}</span>
                          {fg.entity_count != null && (
                            <Badge variant="default">{fg.entity_count} entities</Badge>
                          )}
                          {fg.entry_function && (
                            <Badge variant="info">{fg.entry_function}</Badge>
                          )}
                        </div>
                        {fg.description && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {fg.description.length > 80 ? `${fg.description.slice(0, 80)}...` : fg.description}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          confirmDialog.open({
                            title: 'Delete Feature Graph',
                            description: `Delete "${fg.name}"? This cannot be undone.`,
                            onConfirm: async () => {
                              await featureGraphsApi.delete(fg.id)
                              setFeatureGraphs((prev) => prev.filter((g) => g.id !== fg.id))
                              toast.success('Feature graph deleted')
                            },
                          })
                        }}
                        className="p-1 rounded text-gray-600 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-white/[0.08] transition-all shrink-0"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </Link>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </section>
      )}

      <FormDialog {...milestoneFormDialog.dialogProps} onSubmit={milestoneForm.submit}>
        {milestoneForm.fields}
      </FormDialog>
      <FormDialog {...releaseFormDialog.dialogProps} onSubmit={releaseForm.submit}>
        {releaseForm.fields}
      </FormDialog>
      <LinkEntityDialog {...linkDialog.dialogProps} />
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </div>
  )
}
