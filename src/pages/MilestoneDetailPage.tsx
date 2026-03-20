import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { ChevronsUpDown, FolderKanban } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  LoadingPage,
  ErrorState,
  Badge,
  Button,
  ConfirmDialog,
  LinkEntityDialog,
  ProgressBar,
  PageHeader,
  StatusSelect,
  SectionNav,
} from '@/components/ui'
import type { ParentLink } from '@/components/ui/PageHeader'
import { ExpandableTaskRow } from '@/components/expandable'
import { UnifiedGraphSection, type GraphBreadcrumb } from '@/components/graph/UnifiedGraphSection'
import { MilestoneGraphAdapter } from '@/adapters/MilestoneGraphAdapter'
import { workspacesApi, projectsApi, tasksApi } from '@/services'
import {
  useConfirmDialog,
  useLinkDialog,
  useToast,
  useSectionObserver,
  useWorkspaceSlug,
  useViewTransition,
} from '@/hooks'
import { useMilestoneGraphData } from '@/hooks/useMilestoneGraphData'
import { workspacePath } from '@/utils/paths'
import { milestoneRefreshAtom, planRefreshAtom, taskRefreshAtom, projectRefreshAtom } from '@/atoms'
import { PlanRunHistory } from '@/components/runner/PlanRunHistory'
import type {
  MilestoneDetail,
  MilestonePlanSummary,
  MilestoneProgress,
  Plan,
  Project,
  Task,
  MilestoneStatus,
  PlanStatus,
} from '@/types'

type MilestoneScope = 'workspace' | 'project'

interface MilestoneDetailPageProps {
  scope?: MilestoneScope
}

export function MilestoneDetailPage({ scope = 'workspace' }: MilestoneDetailPageProps) {
  const { milestoneId } = useParams<{ milestoneId: string }>()
  const navigateRR = useNavigate()
  const { navigate } = useViewTransition()
  const wsSlug = useWorkspaceSlug()

  // Core state
  const [milestoneTitle, setMilestoneTitle] = useState('')
  const [milestoneDescription, setMilestoneDescription] = useState('')
  const [milestoneStatus, setMilestoneStatus] = useState<MilestoneStatus>('planned')
  const [milestoneId_, setMilestoneId_] = useState('')
  const [milestoneCreatedAt, setMilestoneCreatedAt] = useState('')
  const [milestoneTargetDate, setMilestoneTargetDate] = useState<string | undefined>()
  const [milestoneClosedAt, setMilestoneClosedAt] = useState<string | undefined>()
  const [milestoneTags, setMilestoneTags] = useState<string[]>([])


  const [progress, setProgress] = useState<MilestoneProgress | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [enrichedPlans, setEnrichedPlans] = useState<MilestonePlanSummary[]>([])
  const [milestoneTasks, setMilestoneTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showGraph, setShowGraph] = useState(false)

  const confirmDialog = useConfirmDialog()
  const linkDialog = useLinkDialog()
  const toast = useToast()

  const milestoneRefresh = useAtomValue(milestoneRefreshAtom)
  const planRefresh = useAtomValue(planRefreshAtom)
  const taskRefresh = useAtomValue(taskRefreshAtom)
  const projectRefresh = useAtomValue(projectRefreshAtom)

  const [tasksExpandAll, setTasksExpandAll] = useState(0)
  const [tasksCollapseAll, setTasksCollapseAll] = useState(0)
  const [tasksAllExpanded, setTasksAllExpanded] = useState(false)

  const refreshData = useCallback(async () => {
    if (!milestoneId) return
    setError(null)
    const isInitialLoad = milestoneId_ === ''
    if (isInitialLoad) setLoading(true)

    try {
      if (scope === 'workspace') {
        const data = await workspacesApi.getMilestone(milestoneId) as MilestoneDetail
        setMilestoneId_(data.id)
        setMilestoneTitle(data.title)
        setMilestoneDescription(data.description || '')
        setMilestoneStatus((data.status?.toLowerCase() || 'planned') as MilestoneStatus)
        setMilestoneCreatedAt(data.created_at)
        setMilestoneTargetDate(data.target_date)
        setMilestoneClosedAt(data.closed_at)
        setMilestoneTags(data.tags || [])

        setProgress(data.progress || null)

        const enrichedPlansData = data.plans || []
        setEnrichedPlans(enrichedPlansData)
        setPlans(enrichedPlansData.map(p => ({
          id: p.id,
          title: p.title,
          description: '',
          status: (p.status || 'draft') as PlanStatus,
          created_at: '',
          created_by: '',
          priority: 0,
        })))

        // Flatten tasks from plans
        setMilestoneTasks(enrichedPlansData.flatMap(p =>
          (p.tasks || []).map(t => ({
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status as Task['status'],
            priority: t.priority,
            tags: t.tags || [],
            acceptance_criteria: [],
            affected_files: [],
            created_at: t.created_at,
            completed_at: t.completed_at,
          } as Task)),
        ))

        // Fetch workspace projects
        if (data.workspace_id) {
          const workspacesData = await workspacesApi.list()
          const workspace = (workspacesData.items || []).find(w => w.id === data.workspace_id)
          if (workspace) {
            const projectsResponse = await workspacesApi.listProjects(workspace.slug)
            const workspaceProjects = Array.isArray(projectsResponse) ? projectsResponse : []
            setProjects(workspaceProjects as Project[])
          }
        }
      } else {
        // project scope
        const response = await projectsApi.getMilestone(milestoneId)
        const ms = response.milestone
        setMilestoneId_(ms.id)
        setMilestoneTitle(ms.title)
        setMilestoneDescription(ms.description || '')
        setMilestoneStatus((ms.status?.toLowerCase() || 'planned') as MilestoneStatus)
        setMilestoneCreatedAt(ms.created_at)
        setMilestoneTargetDate(ms.target_date)
        setMilestoneClosedAt(ms.closed_at)
        setMilestoneTags([])
        setProgress(response.progress || null)

        const enrichedPlansData = response.plans || []
        setEnrichedPlans(enrichedPlansData)
        setPlans(enrichedPlansData.map(p => ({
          id: p.id,
          title: p.title,
          description: '',
          status: (p.status || 'draft') as PlanStatus,
          created_at: '',
          created_by: '',
          priority: 0,
        })))

        setMilestoneTasks(enrichedPlansData.flatMap(p =>
          (p.tasks || []).map(t => ({
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status as Task['status'],
            priority: t.priority,
            tags: t.tags || [],
            acceptance_criteria: [],
            affected_files: [],
            created_at: t.created_at,
            completed_at: t.completed_at,
          } as Task)),
        ))

        // Fetch parent project
        if (ms.project_id) {
          try {
            const projectsData = await projectsApi.list({ limit: 100 })
            const proj = (projectsData.items || []).find(p => p.id === ms.project_id)
            if (proj) setProject(proj)
          } catch {
            // Project lookup failed
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch milestone:', err)
      setError('Failed to load milestone')
    } finally {
      if (isInitialLoad) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- milestoneId_ is a data tracking field
  }, [milestoneId, scope, milestoneRefresh, planRefresh, taskRefresh, projectRefresh])

  useEffect(() => {
    refreshData()
  }, [refreshData])

  // Derive primary project for graph enrichment
  const primaryProject = scope === 'project' ? project : (projects.length > 0 ? projects[0] : null)

  const milestoneGraphData = useMilestoneGraphData({
    milestoneId,
    milestoneTitle: milestoneTitle || 'Milestone',
    milestoneStatus: milestoneStatus || 'planned',
    plans: enrichedPlans,
    progress,
    projectSlug: primaryProject?.slug,
    projectId: primaryProject?.id,
  })

  const handleDrillDown = useCallback((target: { level: string; id: string }) => {
    if (target.level === 'plan') {
      navigate(workspacePath(wsSlug, `/plans/${target.id}#graph`))
    } else if (target.level === 'task') {
      navigate(workspacePath(wsSlug, `/tasks/${target.id}#graph`))
    }
  }, [navigate, wsSlug])

  const graphBreadcrumbs = useMemo<GraphBreadcrumb[]>(() => {
    const crumbs: GraphBreadcrumb[] = []
    if (scope === 'project' && project) {
      crumbs.push({ label: `Project: ${project.name}`, href: workspacePath(wsSlug, `/projects/${project.slug}`) })
    }
    crumbs.push({ label: `Milestone: ${milestoneTitle || milestoneId_?.slice(0, 8) || ''}` })
    return crumbs
  }, [scope, project, milestoneTitle, milestoneId_, wsSlug])

  // Build plan title map for run history
  const planTitleMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of plans) { map[p.id] = p.title }
    return map
  }, [plans])

  // Section IDs depend on scope
  const sectionIds = useMemo(() => {
    const ids = ['progress', 'tasks']
    if (scope === 'workspace') {
      ids.push('runs', 'projects')
    }
    return ids
  }, [scope])

  const activeSection = useSectionObserver(sectionIds)

  if (error) return <ErrorState title="Failed to load" description={error} onRetry={refreshData} />
  if (loading || !milestoneId_) return <LoadingPage />

  const sections = [
    { id: 'progress', label: 'Progress' },
    { id: 'tasks', label: 'Tasks', count: milestoneTasks.length },
    ...(scope === 'workspace' ? [
      { id: 'runs', label: 'Runs' },
      { id: 'projects', label: 'Projects', count: projects.length },
    ] : []),
  ]

  // Parent links for project scope
  const parentLinks: ParentLink[] = []
  if (scope === 'project' && project) {
    parentLinks.push({
      icon: FolderKanban,
      label: 'Project',
      name: project.name,
      href: workspacePath(wsSlug, `/projects/${project.slug}`),
    })
  }

  const handleDelete = () => confirmDialog.open({
    title: 'Delete Milestone',
    description: 'This will permanently delete this milestone. Tasks linked to it will not be deleted.',
    onConfirm: async () => {
      if (scope === 'workspace') {
        await workspacesApi.deleteMilestone(milestoneId_)
        toast.success('Milestone deleted')
        navigate(workspacePath(wsSlug, '/milestones'), { type: 'back-button' })
      } else {
        await projectsApi.updateMilestone(milestoneId_, { status: 'closed' })
        toast.success('Milestone deleted')
        navigateRR(workspacePath(wsSlug, project ? `/projects/${project.slug}` : '/projects'))
      }
    },
  })

  const handleStatusChange = async (newStatus: MilestoneStatus) => {
    if (scope === 'workspace') {
      await workspacesApi.updateMilestone(milestoneId_, { status: newStatus })
    } else {
      await projectsApi.updateMilestone(milestoneId_, { status: newStatus })
    }
    setMilestoneStatus(newStatus)
    toast.success('Status updated')
  }

  const handleAddTask = () => linkDialog.open({
    title: 'Add Task to Milestone',
    submitLabel: 'Add',
    fetchOptions: async () => {
      const data = await tasksApi.list({ limit: 100 })
      const existingIds = new Set(milestoneTasks.map(t => t.id))
      return (data.items || [])
        .filter(t => !existingIds.has(t.id))
        .map(t => ({ value: t.id, label: t.title || t.description || 'Untitled', description: t.status }))
    },
    onLink: async (taskId) => {
      if (scope === 'workspace') {
        await workspacesApi.addTaskToMilestone(milestoneId!, taskId)
      } else {
        await projectsApi.addTaskToMilestone(milestoneId!, taskId)
      }
      await refreshData()
      toast.success('Task added')
    },
  })

  return (
    <div className="pt-6 space-y-6">
      <PageHeader
        title={milestoneTitle}
        viewTransitionName={scope === 'workspace' ? `milestone-title-${milestoneId_}` : undefined}
        description={milestoneDescription}
        parentLinks={parentLinks.length > 0 ? parentLinks : undefined}
        status={
          <StatusSelect
            status={milestoneStatus}
            options={[
              { value: 'planned', label: 'Planned' },
              { value: 'open', label: 'Open' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'completed', label: 'Completed' },
              { value: 'closed', label: 'Closed' },
            ]}
            colorMap={{
              planned: { bg: 'bg-white/[0.08]', text: 'text-gray-200', dot: 'bg-gray-400' },
              open: { bg: 'bg-blue-900/50', text: 'text-blue-400', dot: 'bg-blue-400' },
              in_progress: { bg: 'bg-yellow-900/50', text: 'text-yellow-400', dot: 'bg-yellow-400' },
              completed: { bg: 'bg-green-900/50', text: 'text-green-400', dot: 'bg-green-400' },
              closed: { bg: 'bg-purple-900/50', text: 'text-purple-400', dot: 'bg-purple-400' },
            }}
            onStatusChange={handleStatusChange}
          />
        }
        metadata={[
          { label: 'Created', value: new Date(milestoneCreatedAt).toLocaleDateString() },
          ...(milestoneTargetDate ? [{ label: 'Target', value: new Date(milestoneTargetDate).toLocaleDateString() }] : []),
          ...(milestoneClosedAt ? [{ label: 'Closed', value: new Date(milestoneClosedAt).toLocaleDateString() }] : []),
          ...(scope === 'project' && project ? [{ label: 'Project', value: <Link to={workspacePath(wsSlug, `/projects/${project.slug}`)} className="text-indigo-400 hover:text-indigo-300 transition-colors">{project.name}</Link> }] : []),
        ]}
        overflowActions={[
          {
            label: showGraph ? 'Hide Graph' : 'Show Graph',
            onClick: () => setShowGraph(v => !v),
          },
          { label: 'Delete', variant: 'danger', onClick: handleDelete },
        ]}
      >
        {milestoneTags.length > 0 && (
          <div className="flex gap-1">
            {milestoneTags.map((tag, index) => (
              <Badge key={`${tag}-${index}`} variant="default">{tag}</Badge>
            ))}
          </div>
        )}
      </PageHeader>

      <SectionNav sections={sections} activeSection={activeSection} />

      {/* Graph — toggled via header button, not a permanent section */}
      {showGraph && milestoneGraphData.data && (
        <section className="scroll-mt-20">
          <UnifiedGraphSection
            adapter={MilestoneGraphAdapter}
            data={milestoneGraphData.data}
            availableViews={['3d']}
            defaultView="3d"
            onDrillDown={handleDrillDown}
            breadcrumbs={graphBreadcrumbs}
            projectSlug={primaryProject?.slug}
          />
        </section>
      )}

      {/* Progress */}
      <section id="progress" className="scroll-mt-20">
        {progress && (
          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressBar value={progress.percentage} showLabel size="lg" gradient shimmer={progress.percentage < 100} />
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <div className="text-center p-3 bg-white/[0.06] rounded-lg">
                  <div className="text-2xl font-bold text-green-400">{progress.completed}</div>
                  <div className="text-xs text-gray-500">Completed</div>
                </div>
                <div className="text-center p-3 bg-white/[0.06] rounded-lg">
                  <div className="text-2xl font-bold text-gray-400">{progress.total - progress.completed}</div>
                  <div className="text-xs text-gray-500">Remaining</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Tasks — flat list */}
      <section id="tasks" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle>Tasks ({milestoneTasks.length})</CardTitle>
                {milestoneTasks.length > 0 && (
                  <button
                    onClick={() => {
                      if (tasksAllExpanded) {
                        setTasksCollapseAll(s => s + 1)
                      } else {
                        setTasksExpandAll(s => s + 1)
                      }
                      setTasksAllExpanded(!tasksAllExpanded)
                    }}
                    className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                    title={tasksAllExpanded ? 'Collapse all' : 'Expand all'}
                  >
                    <ChevronsUpDown className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Button size="sm" onClick={handleAddTask}>Add Task</Button>
            </div>
          </CardHeader>
          <CardContent>
            {milestoneTasks.length === 0 ? (
              <p className="text-gray-500 text-sm">No tasks linked to this milestone</p>
            ) : (
              <div className="space-y-2">
                {milestoneTasks.map(task => (
                  <ExpandableTaskRow
                    key={task.id}
                    task={task}
                    refreshTrigger={taskRefresh}
                    expandAllSignal={tasksExpandAll}
                    collapseAllSignal={tasksCollapseAll}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Pipeline Runs — workspace scope only */}
      {scope === 'workspace' && (
        <section id="runs" className="scroll-mt-20">
          <Card>
            <CardHeader>
              <CardTitle>Pipeline Runs</CardTitle>
            </CardHeader>
            <CardContent>
              {plans.length > 0 ? (
                <PlanRunHistory
                  planIds={plans.map(p => p.id)}
                  maxRuns={10}
                  showPlanTitle
                  planTitleMap={planTitleMap}
                />
              ) : (
                <p className="text-sm text-gray-500 py-4 text-center">
                  No plans linked — no runs to display
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Projects — workspace scope only */}
      {scope === 'workspace' && (
        <section id="projects" className="scroll-mt-20">
          <Card>
            <CardHeader>
              <CardTitle>Projects ({projects.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <p className="text-gray-500 text-sm">No projects in this workspace</p>
              ) : (
                <div className="space-y-2">
                  {projects.map(project => (
                    <Link
                      key={project.id}
                      to={workspacePath(wsSlug, `/projects/${project.slug}`)}
                      className="flex items-center justify-between gap-2 p-3 bg-white/[0.06] rounded-lg hover:bg-white/[0.08] transition-colors"
                    >
                      <span className="font-medium text-gray-200 truncate min-w-0">{project.name}</span>
                      <span className="text-xs text-gray-500 shrink-0">{project.slug}</span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <LinkEntityDialog {...linkDialog.dialogProps} />
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </div>
  )
}
