import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useSetAtom, useAtomValue } from 'jotai'
import {
  AlertTriangle,
  Archive,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  Flag,
  FolderKanban,
  GitFork,
  Link2,
  ListChecks,
  MessageCircle,
  Pencil,
  Play,
  Plus,
  Trash2,
  Unlink,
  Zap,
} from 'lucide-react'
import {
  Button,
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  FormDialog,
  LinkEntityDialog,
  ListGroup,
  PageContainer,
  PageHeader,
  PriorityText,
  RelativeTime,
  Section,
  StatusDot,
  StatusMenu,
  TabLayout,
  focusRing,
  getStatusMeta,
  groupBy,
  hitArea,
  inlineLink,
  pluralize,
  rowInteractive,
  surface,
} from '@/components/ui'
import type { ParentLink } from '@/components/ui/PageHeader'
import { plansApi, tasksApi, projectsApi, workspacesApi, decisionsApi } from '@/services'
import { ApiError } from '@/services/api'
import { UniversalKanban, ViewModeToggle, createTaskKanbanConfig } from '@/components/kanban'
import { useViewMode, useFormDialog, useLinkDialog, useToast, useWorkspaceSlug, useViewTransition } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { chatSuggestedProjectIdAtom, chatPanelModeAtom, chatSessionIdAtom, planRefreshAtom, taskRefreshAtom, projectRefreshAtom } from '@/atoms'
import { CreateTaskForm, CreateConstraintForm, EditPlanForm } from '@/components/forms'
import { UnifiedGraphSection, type GraphBreadcrumb } from '@/components/graph/UnifiedGraphSection'
import { ImplementDialog } from '@/components/pipeline/ImplementDialog'
import { PlanGraphAdapter } from '@/adapters/PlanGraphAdapter'
import { usePlanGraphData } from '@/hooks/usePlanGraphData'
import { CommitList } from '@/components/commits'
import { PlanRunHistory } from '@/components/runner/PlanRunHistory'
import { StatsRow } from '@/components/runner/StatsRow'
import { runnerApi, useRunnerStatus } from '@/services/runner'
import {
  CommitShaField,
  CompactStepList,
  ConstraintRow,
  DecisionRow,
  DetailSkeleton,
  EmptyLine,
  SectionAddButton,
  SessionRow,
  TaskMetaLink,
} from '@/components/tasks/DetailRows'
import { RowStateLink } from '@/components/tasks/RowStateLink'
import { StatusBreakdown } from '@/components/tasks/StatusBreakdown'
import type { Plan, Decision, DecisionStatus, DependencyGraph, Task, Constraint, Step, Commit, PlanStatus, TaskStatus, PaginatedResponse, Project, SessionWithLinks } from '@/types'
import type { KanbanTask } from '@/components/kanban'

interface DecisionWithTask extends Decision {
  taskId: string
  taskTitle: string
}

/** Task groups in the list: active work first, finished last. */
const TASK_GROUP_ORDER: TaskStatus[] = ['in_progress', 'blocked', 'pending', 'failed', 'completed']

export function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>()
  const { navigate } = useViewTransition()
  const wsSlug = useWorkspaceSlug()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [constraints, setConstraints] = useState<Constraint[]>([])
  const [decisions, setDecisions] = useState<DecisionWithTask[]>([])
  const [commits, setCommits] = useState<Commit[]>([])
  const [commitShaInput, setCommitShaInput] = useState('')
  // graph state kept for fetchData compatibility — data consumed via planGraphData hook
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_graph, setGraph] = useState<DependencyGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useViewMode()
  const taskFormDialog = useFormDialog()
  const constraintFormDialog = useFormDialog()
  const commitFormDialog = useFormDialog()
  const editPlanDialog = useFormDialog()
  const linkDialog = useLinkDialog()
  const toast = useToast()
  const setSuggestedProjectId = useSetAtom(chatSuggestedProjectIdAtom)
  const setChatPanelMode = useSetAtom(chatPanelModeAtom)
  const setChatSessionId = useSetAtom(chatSessionIdAtom)
  const planRefresh = useAtomValue(planRefreshAtom)
  const taskRefresh = useAtomValue(taskRefreshAtom)
  const projectRefresh = useAtomValue(projectRefreshAtom)
  const [linkedProject, setLinkedProject] = useState<Project | null>(null)
  // Expand / collapse every task row's steps (signals consumed by PlanTaskRow)
  const [tasksExpandAll, setTasksExpandAll] = useState(0)
  const [tasksCollapseAll, setTasksCollapseAll] = useState(0)
  const [tasksAllExpanded, setTasksAllExpanded] = useState(false)
  const [linkedMilestones, setLinkedMilestones] = useState<Array<{ id: string; title: string; href: string; type: 'workspace' | 'project' }>>([])
  const [implementDialogOpen, setImplementDialogOpen] = useState(false)
  const [implementLoading, setImplementLoading] = useState(false)
  // Chat sessions linked to this plan
  const [chatSessions, setChatSessions] = useState<SessionWithLinks[]>([])
  const [chatSessionsLoading, setChatSessionsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('tasks')
  // Detect active pipeline run — used to hide/disable implement button + runner tab
  const { isRunning: hasPipelineRunning, snapshot: runnerSnapshot } = useRunnerStatus(planId)
  // Plan graph data for UnifiedGraphSection
  const planGraphData = usePlanGraphData(planId, plan?.title, linkedProject?.slug)

  const runnerPath = workspacePath(wsSlug, `/plans/${planId}/runner`)
  const goToRunner = useCallback(() => navigate(runnerPath, { type: 'card-click' }), [navigate, runnerPath])

  // Fractal drill-down: navigate to task detail page
  const handleDrillDown = useCallback((target: { level: string; id: string }) => {
    if (target.level === 'task') {
      navigate(workspacePath(wsSlug, `/tasks/${target.id}#graph`))
    }
  }, [navigate, wsSlug])

  // Breadcrumb trail for graph section
  const graphBreadcrumbs = useMemo<GraphBreadcrumb[]>(() => {
    const crumbs: GraphBreadcrumb[] = []
    if (linkedMilestones.length > 0) {
      const ms = linkedMilestones[0]
      crumbs.push({ label: `Milestone: ${ms.title}`, href: ms.href })
    }
    if (plan) {
      crumbs.push({ label: `Plan: ${plan.title || plan.id.slice(0, 8)}` })
    }
    return crumbs
  }, [linkedMilestones, plan])

  const fetchData = useCallback(async () => {
    if (!planId) return
    setError(null)
    // Only show the skeleton on initial load, not on WS-triggered refreshes
    const isInitialLoad = !plan
    if (isInitialLoad) setLoading(true)
    try {
      const [planResponse, tasksData, constraintsData, graphData, commitsData] = await Promise.all([
        plansApi.get(planId),
        tasksApi.list({ plan_id: planId, limit: 100 }),
        plansApi.listConstraints(planId),
        plansApi.getDependencyGraph(planId).catch(() => null),
        plansApi.getCommits(planId).catch(() => ({ items: [] })),
      ])
      const planData = (planResponse as unknown as { plan: Plan }).plan || planResponse
      setPlan(planData)
      setTasks(tasksData.items || [])
      setConstraints(Array.isArray(constraintsData) ? constraintsData : [])
      setGraph(graphData)
      setCommits(commitsData.items || [])

      // Decisions come nested in the PlanDetails response: tasks[].decisions[]
      const rawTasks = (planResponse as unknown as { tasks?: { task?: Task; decisions?: Decision[] }[] }).tasks || []
      const allDecisions: DecisionWithTask[] = rawTasks.flatMap((td) => {
        const taskInfo = td.task
        return (td.decisions || []).map((d) => ({
          ...d,
          taskId: taskInfo?.id || '',
          taskTitle: taskInfo?.title || taskInfo?.description || 'Untitled task',
        }))
      })
      setDecisions(allDecisions)

      // Linked project
      if (planData.project_id) {
        try {
          const allProjects = await projectsApi.list()
          const proj = (allProjects.items || []).find((p) => p.id === planData.project_id)
          setLinkedProject(proj || null)
          if (proj) setSuggestedProjectId(proj.id)
        } catch {
          setLinkedProject(null)
        }
      } else {
        setLinkedProject(null)
      }
    } catch (error) {
      console.error('Failed to fetch plan:', error)
      setError('Failed to load plan')
    } finally {
      if (isInitialLoad) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plan and setSuggestedProjectId: plan is a data object (would cause loop), Jotai setter is stable
  }, [planId, planRefresh, taskRefresh, projectRefresh])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Lazy-load chat sessions when the Conversations tab opens
  useEffect(() => {
    if (activeTab !== 'chat' || !planId) return
    let cancelled = false
    setChatSessionsLoading(true)
    plansApi
      .getSessions(planId)
      .then((data) => {
        if (!cancelled) setChatSessions(data || [])
      })
      .catch(() => {
        if (!cancelled) setChatSessions([])
      })
      .finally(() => {
        if (!cancelled) setChatSessionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeTab, planId])

  // Resolve linked milestones (workspace + project milestones that reference this plan)
  useEffect(() => {
    if (!planId) return
    const controller = new AbortController()

    async function resolveMilestones() {
      const milestones: Array<{ id: string; title: string; href: string; type: 'workspace' | 'project' }> = []
      try {
        const wsMilestones = await workspacesApi.listMilestones(wsSlug, { limit: 100 })
        const wsDetails = await Promise.allSettled((wsMilestones.items || []).map((ms) => workspacesApi.getMilestone(ms.id)))
        for (const result of wsDetails) {
          if (result.status === 'fulfilled') {
            const detail = result.value
            if (Array.isArray(detail.plans) && detail.plans.some((p) => p.id === planId)) {
              milestones.push({
                id: detail.id,
                title: detail.title,
                href: workspacePath(wsSlug, `/milestones/${detail.id}`),
                type: 'workspace',
              })
            }
          }
        }

        if (plan?.project_id) {
          try {
            const projMilestones = await projectsApi.listMilestones(plan.project_id, { limit: 100 })
            const projDetails = await Promise.allSettled((projMilestones.items || []).map((ms) => projectsApi.getMilestone(ms.id)))
            for (const result of projDetails) {
              if (result.status === 'fulfilled') {
                const detail = result.value
                if (Array.isArray(detail.plans) && detail.plans.some((p) => p.id === planId)) {
                  milestones.push({
                    id: detail.milestone.id,
                    title: detail.milestone.title,
                    href: workspacePath(wsSlug, `/project-milestones/${detail.milestone.id}`),
                    type: 'project',
                  })
                }
              }
            }
          } catch {
            /* graceful degradation */
          }
        }
      } catch {
        /* graceful degradation — milestone links simply won't appear */
      }
      if (!controller.signal.aborted) {
        setLinkedMilestones(milestones)
      }
    }

    resolveMilestones()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- planId, wsSlug and plan?.project_id are stable
  }, [planId, wsSlug, plan?.project_id])

  /** List rows: optimistic update + rollback. */
  const handleTaskStatusChange = useCallback(
    async (taskId: string, newStatus: TaskStatus) => {
      const original = tasks.find((t) => t.id === taskId)
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)))
      try {
        await tasksApi.update(taskId, { status: newStatus })
        toast.success('Status updated')
      } catch (error) {
        if (original) {
          setTasks((prev) => prev.map((t) => (t.id === taskId ? original : t)))
        }
        console.error('Failed to update task status:', error)
        toast.error('Failed to update task status')
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable
    [tasks],
  )

  /** Board: the board moves the card optimistically; rethrow so it can roll back. */
  const handleBoardStatusChange = useCallback(
    async (taskId: string, newStatus: string) => {
      try {
        await tasksApi.update(taskId, { status: newStatus as TaskStatus })
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus as TaskStatus } : t)))
        toast.success('Status updated')
      } catch (err) {
        toast.error('Failed to update task status')
        throw err
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable
    [],
  )

  // Stable fetchFn for kanban — fetches tasks scoped to this plan
  const kanbanFetchFn = useCallback(
    (params: Record<string, unknown>): Promise<PaginatedResponse<KanbanTask>> => {
      return tasksApi.list({ plan_id: planId, ...params } as Record<string, string | number | undefined>)
    },
    [planId],
  )

  const planTaskKanbanConfig = useMemo(
    () => createTaskKanbanConfig({ fetchFn: kanbanFetchFn, onStatusChange: handleBoardStatusChange }),
    [kanbanFetchFn, handleBoardStatusChange],
  )

  const taskForm = CreateTaskForm({
    onSubmit: async (data) => {
      if (!planId) return
      const newTask = await plansApi.createTask(planId, data)
      setTasks((prev) => [...prev, newTask])
      toast.success('Task added')
    },
  })

  const constraintForm = CreateConstraintForm({
    onSubmit: async (data) => {
      if (!planId) return
      const newConstraint = await plansApi.addConstraint(planId, data)
      setConstraints((prev) => [...prev, newConstraint])
      toast.success('Constraint added')
    },
  })

  const handleDecisionStatusChange = async (decision: DecisionWithTask, newStatus: DecisionStatus) => {
    try {
      await decisionsApi.update(decision.id, { status: newStatus })
      setDecisions((prev) => prev.map((d) => (d.id === decision.id ? { ...d, status: newStatus } : d)))
      toast.success(`Decision status → ${newStatus}`)
    } catch {
      toast.error('Failed to update decision status')
    }
  }

  const handleDeleteDecision = async (decision: DecisionWithTask) => {
    await decisionsApi.delete(decision.id)
    setDecisions((prev) => prev.filter((d) => d.id !== decision.id))
    toast.success('Decision deleted')
  }

  // Fresh status map from local tasks state (includes optimistic updates)
  const taskStatusMap = useMemo(() => new Map(tasks.map((t) => [t.id, t.status])), [tasks])
  const taskGroups = useMemo(() => groupBy(tasks, (t) => t.status, TASK_GROUP_ORDER), [tasks])
  const statusCounts = useMemo(
    () => TASK_GROUP_ORDER.map((status) => ({ status, count: tasks.filter((t) => t.status === status).length })),
    [tasks],
  )

  const editPlanForm = EditPlanForm({
    initialValues: { title: plan?.title ?? '', description: plan?.description, priority: plan?.priority, project_id: plan?.project_id },
    workspaceSlug: wsSlug,
    onSubmit: async (data) => {
      if (!plan) return
      const { project_id, ...updateData } = data
      await plansApi.update(plan.id, updateData)
      if (project_id && project_id !== plan.project_id) {
        await plansApi.linkToProject(plan.id, project_id)
      } else if (!project_id && plan.project_id) {
        await plansApi.unlinkFromProject(plan.id)
      }
      setPlan({ ...plan, ...updateData, project_id } as Plan)
      toast.success('Plan updated')
    },
  })

  const openAddTask = () => taskFormDialog.open({ title: 'Add Task', size: 'lg' })
  const openAddConstraint = () => constraintFormDialog.open({ title: 'Add Constraint' })
  const openLinkCommit = () => {
    setCommitShaInput('')
    commitFormDialog.open({ title: 'Link Commit', submitLabel: 'Link', size: 'sm' })
  }
  const openLinkProject = () =>
    linkDialog.open({
      title: 'Link to Project',
      submitLabel: 'Link',
      fetchOptions: async () => {
        const data = await projectsApi.list()
        return (data.items || []).map((p) => ({ value: p.id, label: p.name, description: p.slug }))
      },
      onLink: async (projectId) => {
        if (!plan) return
        await plansApi.linkToProject(plan.id, projectId)
        const data = await projectsApi.list()
        const proj = (data.items || []).find((p) => p.id === projectId)
        setLinkedProject(proj || null)
        setPlan({ ...plan, project_id: projectId } as Plan)
        toast.success('Project linked')
      },
    })

  if (error) return <ErrorState title="Failed to load" description={error} onRetry={fetchData} />
  if (loading || !plan) return <DetailSkeleton />

  const completedTasks = statusCounts.find((c) => c.status === 'completed')?.count ?? 0

  // Parents: milestones, then the linked project (unlink lives in the ⋯ menu)
  const parentLinks: ParentLink[] = linkedMilestones.map((ms) => ({
    icon: ms.type === 'project' ? FolderKanban : Flag,
    label: ms.type === 'project' ? 'Project Milestone' : 'Milestone',
    name: ms.title,
    href: ms.href,
  }))
  if (linkedProject) {
    parentLinks.push({
      icon: FolderKanban,
      label: 'Project',
      name: linkedProject.name,
      href: workspacePath(wsSlug, `/projects/${linkedProject.slug}`),
    })
  }

  const canLaunch = !hasPipelineRunning && plan.status === 'approved'
  // Stuck detection: run reports as running but every task / agent is done
  const isStuck =
    hasPipelineRunning &&
    runnerSnapshot != null &&
    runnerSnapshot.tasks_total > 0 &&
    runnerSnapshot.tasks_completed >= runnerSnapshot.tasks_total &&
    runnerSnapshot.active_agents.every((a) => a.status === 'completed' || a.status === 'failed')

  const hasGraphNodes = Boolean(planGraphData.data && (planGraphData.graph?.nodes || []).length > 0)
  const tabs = [
    { id: 'tasks', label: 'Tasks', icon: <ListChecks className="w-4 h-4" />, count: tasks.length },
    ...(hasGraphNodes ? [{ id: 'graph', label: 'Graph', icon: <GitFork className="w-4 h-4" />, count: (planGraphData.graph?.nodes || []).length }] : []),
    { id: 'runner', label: 'Runner', icon: <Play className="w-4 h-4" /> },
    { id: 'chat', label: 'Conversations', icon: <MessageCircle className="w-4 h-4" />, count: chatSessions.length || undefined },
    { id: 'artefacts', label: 'Artefacts', icon: <Archive className="w-4 h-4" />, count: commits.length + decisions.length + constraints.length },
  ]

  const handlePlanStatusChange = async (newStatus: PlanStatus) => {
    try {
      await plansApi.updateStatus(plan.id, newStatus)
      setPlan({ ...plan, status: newStatus })
      toast.success('Status updated')
    } catch {
      toast.error('Failed to update status')
    }
  }

  const toggleAllTasks = () => {
    if (tasksAllExpanded) setTasksCollapseAll((s) => s + 1)
    else setTasksExpandAll((s) => s + 1)
    setTasksAllExpanded(!tasksAllExpanded)
  }

  return (
    <PageContainer width="wide" className="space-y-6">
      <PageHeader
        title={plan.title}
        parentLinks={parentLinks.length > 0 ? parentLinks : undefined}
        viewTransitionName={`plan-title-${plan.id}`}
        description={plan.description}
        status={<StatusMenu kind="plan" status={plan.status} onChange={handlePlanStatusChange} />}
        meta={[
          <PriorityText key="p" priority={plan.priority} />,
          plan.created_by ? (
            <span key="by" className="truncate max-w-[10rem]" title={`Created by ${plan.created_by}`}>
              {plan.created_by}
            </span>
          ) : null,
          <RelativeTime key="c" date={plan.created_at} prefix="created " />,
          pluralize(tasks.length, 'task'),
          tasks.length > 0 ? (
            <span key="done" className="tabular-nums">
              {completedTasks}/{tasks.length} done
            </span>
          ) : null,
          hasPipelineRunning ? (
            <button
              key="run"
              type="button"
              onClick={goToRunner}
              className={`${hitArea} ${inlineLink} inline-flex items-center gap-1.5 text-indigo-300`}
            >
              <StatusDot tone="progress" pulse label="Pipeline running" />
              Run in progress
            </button>
          ) : null,
        ]}
        actions={
          canLaunch ? (
            <Button size="sm" onClick={() => setImplementDialogOpen(true)}>
              <Play className="w-4 h-4 mr-1 -ml-0.5" aria-hidden="true" />
              Launch pipeline
            </Button>
          ) : hasPipelineRunning ? (
            <Button size="sm" variant="secondary" onClick={goToRunner}>
              <ExternalLink className="w-4 h-4 mr-1 -ml-0.5" aria-hidden="true" />
              Runner
            </Button>
          ) : undefined
        }
        overflowActions={[
          { label: 'Edit', icon: Pencil, onClick: () => editPlanDialog.open({ title: 'Edit Plan' }) },
          { label: 'Add task', icon: Plus, onClick: openAddTask },
          { label: 'Add constraint', icon: Plus, onClick: openAddConstraint },
          { label: 'Link commit', icon: Link2, onClick: openLinkCommit },
          { label: 'Link to project', icon: Link2, onClick: openLinkProject, hidden: Boolean(linkedProject) },
          {
            label: 'Unlink project',
            icon: Unlink,
            hidden: !linkedProject,
            onClick: async () => {
              await plansApi.unlinkFromProject(plan.id)
              setLinkedProject(null)
              setPlan({ ...plan, project_id: undefined } as Plan)
              toast.success('Project unlinked')
            },
            confirm: {
              title: 'Unlink project?',
              description: `This plan will no longer belong to “${linkedProject?.name ?? 'the project'}”.`,
              confirmLabel: 'Unlink',
            },
          },
          { label: 'Runner dashboard', icon: ExternalLink, onClick: goToRunner },
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'danger',
            onClick: async () => {
              await plansApi.delete(plan.id)
              toast.success('Plan deleted')
              navigate(workspacePath(wsSlug, '/plans'), { type: 'back-button' })
            },
            confirm: {
              title: 'Delete Plan',
              description: 'This will permanently delete this plan and all its tasks, steps, decisions, and constraints.',
            },
          },
        ]}
      >
        <StatusBreakdown kind="task" counts={statusCounts} className="w-full" />
      </PageHeader>

      {/* Tab strip scrolls horizontally on phones (TabLayout's own nav does not) */}
      <div className="[&_[role=tablist]]:overflow-x-auto [&_[role=tablist]]:overscroll-x-contain">
        <TabLayout tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} className="pt-4">
          {/* ── Tasks ── */}
          {activeTab === 'tasks' && (
            <Section
              title="Tasks"
              count={tasks.length}
              action={
                <>
                  {tasks.length > 0 && viewMode === 'list' && (
                    <button
                      type="button"
                      onClick={toggleAllTasks}
                      aria-label={tasksAllExpanded ? 'Collapse all steps' : 'Expand all steps'}
                      title={tasksAllExpanded ? 'Collapse all steps' : 'Expand all steps'}
                      className={`w-9 h-9 md:w-8 md:h-8 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-200 hover:bg-white/[0.05] ${focusRing}`}
                    >
                      {tasksAllExpanded ? (
                        <ChevronsDownUp className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <ChevronsUpDown className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  )}
                  {tasks.length > 0 && <ViewModeToggle value={viewMode} onChange={setViewMode} />}
                  <SectionAddButton label="Add task" onClick={openAddTask} />
                </>
              }
            >
              {tasks.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon={<ListChecks />}
                  title="No tasks in this plan"
                  description="Add the first task to start planning the work."
                  action={
                    <Button size="sm" variant="secondary" onClick={openAddTask}>
                      Add task
                    </Button>
                  }
                />
              ) : viewMode === 'kanban' ? (
                <UniversalKanban
                  config={planTaskKanbanConfig}
                  onItemClick={(taskId) => navigate(workspacePath(wsSlug, `/tasks/${taskId}`), { type: 'card-click' })}
                  refreshTrigger={taskRefresh}
                />
              ) : (
                <div>
                  {taskGroups.map(({ key, items }) => (
                    <ListGroup key={key} title={getStatusMeta('task', key).label} count={items.length}>
                      {items.map((task) => (
                        <PlanTaskRow
                          key={task.id}
                          task={task}
                          wsSlug={wsSlug}
                          onStatusChange={(newStatus) => handleTaskStatusChange(task.id, newStatus)}
                          refreshTrigger={taskRefresh}
                          expandAllSignal={tasksExpandAll}
                          collapseAllSignal={tasksCollapseAll}
                          planId={plan.id}
                          planTitle={plan.title}
                          projectId={plan.project_id}
                        />
                      ))}
                    </ListGroup>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* ── Graph ── */}
          {activeTab === 'graph' && hasGraphNodes && (
            <UnifiedGraphSection
              adapter={PlanGraphAdapter}
              data={planGraphData.data}
              graph={planGraphData.graph}
              taskStatuses={taskStatusMap}
              waves={planGraphData.waves}
              fetchWaves={planGraphData.fetchWaves}
              wavesLoading={planGraphData.wavesLoading}
              planId={plan.id}
              planStatus={plan.status}
              onLaunch={() => setImplementDialogOpen(true)}
              isRunning={hasPipelineRunning}
              availableViews={['dag', 'waves']}
              defaultView="dag"
              onDrillDown={handleDrillDown}
              breadcrumbs={graphBreadcrumbs}
              projectSlug={linkedProject?.slug}
            />
          )}

          {/* ── Runner ── */}
          {activeTab === 'runner' && (
            <div className="space-y-6">
              {isStuck && runnerSnapshot && (
                <div role="alert" className={`${surface} flex items-start gap-3 p-4 border-amber-500/25`}>
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <p className="text-sm font-medium text-amber-300">Run stuck</p>
                      <p className="text-xs text-amber-400/80 mt-0.5">
                        Every task is done ({runnerSnapshot.tasks_completed}/{runnerSnapshot.tasks_total}) but the run is still marked as active. The runner did not finalise properly.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          try {
                            await runnerApi.forceCancelRun(plan.id)
                            toast.success('Run finalised')
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : 'Failed to finalise the run')
                          }
                        }}
                      >
                        <Zap className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                        Force finalisation
                      </Button>
                      <Button size="sm" variant="ghost" onClick={goToRunner}>
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                        Full dashboard
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {hasPipelineRunning && runnerSnapshot && !isStuck && (
                <Section
                  title={
                    <span className="inline-flex items-center gap-2">
                      <StatusDot tone="progress" pulse size="md" label="Running" />
                      Active run
                    </span>
                  }
                  action={
                    <Button size="sm" variant="ghost" onClick={goToRunner}>
                      <ExternalLink className="w-4 h-4 mr-1 -ml-1" aria-hidden="true" />
                      Dashboard
                    </Button>
                  }
                >
                  <StatsRow
                    effectiveSnapshot={runnerSnapshot}
                    isRunning={hasPipelineRunning}
                    resolvedAgents={runnerSnapshot.active_agents || []}
                    wavesTotal={runnerSnapshot.current_wave}
                    planId={plan.id}
                    onBudgetSave={async (pid, value) => {
                      await runnerApi.updateBudget(pid, value)
                    }}
                  />
                </Section>
              )}

              {!hasPipelineRunning && (
                <EmptyState
                  size="sm"
                  icon={<Play />}
                  title="No active pipeline run"
                  description={
                    plan.status === 'approved'
                      ? 'Launch a run to implement the tasks of this plan.'
                      : 'Approve the plan to launch a pipeline run.'
                  }
                  action={
                    <>
                      {canLaunch && (
                        <Button size="sm" onClick={() => setImplementDialogOpen(true)}>
                          <Play className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                          Launch pipeline
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={goToRunner}>
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                        Runner dashboard
                      </Button>
                    </>
                  }
                />
              )}

              <Section title="Run history">
                <PlanRunHistory planIds={plan.id} maxRuns={10} />
              </Section>
            </div>
          )}

          {/* ── Conversations ── */}
          {activeTab === 'chat' && (
            <Section title="Conversations" count={chatSessionsLoading ? undefined : chatSessions.length}>
              {chatSessionsLoading ? (
                <EntityListSkeleton rows={3} />
              ) : chatSessions.length === 0 ? (
                <EmptyLine>
                  No conversations linked — they are linked automatically when tasks run via the runner, or manually from the chat panel.
                </EmptyLine>
              ) : (
                <EntityList aria-label="Conversations">
                  {chatSessions.map((sw) => (
                    <SessionRow
                      key={sw.session.id}
                      item={sw}
                      showTasks
                      onOpen={() => {
                        setChatSessionId(sw.session.id)
                        setChatPanelMode('open')
                      }}
                    />
                  ))}
                </EntityList>
              )}
            </Section>
          )}

          {/* ── Artefacts ── */}
          {activeTab === 'artefacts' && (
            <div className="space-y-6">
              <Section title="Commits" count={commits.length} action={<SectionAddButton label="Link commit" icon={Link2} onClick={openLinkCommit} />}>
                <CommitList commits={commits} emptyMessage="No commits linked to this plan yet" />
              </Section>

              <Section title="Constraints" count={constraints.length} action={<SectionAddButton label="Add constraint" onClick={openAddConstraint} />}>
                {constraints.length === 0 ? (
                  <EmptyLine>No constraints defined</EmptyLine>
                ) : (
                  <EntityList aria-label="Constraints">
                    {constraints.map((constraint) => (
                      <ConstraintRow
                        key={constraint.id}
                        constraint={constraint}
                        onDelete={async () => {
                          await plansApi.deleteConstraint(constraint.id)
                          setConstraints((prev) => prev.filter((c) => c.id !== constraint.id))
                          toast.success('Constraint deleted')
                        }}
                      />
                    ))}
                  </EntityList>
                )}
              </Section>

              <Section title="Decisions" count={decisions.length}>
                {decisions.length === 0 ? (
                  <EmptyLine>No decisions recorded — decisions are added from task pages.</EmptyLine>
                ) : (
                  <EntityList aria-label="Decisions">
                    {decisions.map((decision) => (
                      <DecisionRow
                        key={decision.id}
                        decision={decision}
                        wsSlug={wsSlug}
                        onStatusChange={(status) => handleDecisionStatusChange(decision, status)}
                        onDelete={() => handleDeleteDecision(decision)}
                        source={
                          decision.taskId ? (
                            <TaskMetaLink
                              to={workspacePath(wsSlug, `/tasks/${decision.taskId}`)}
                              state={{ planId: plan.id, planTitle: plan.title, projectId: plan.project_id }}
                              label={decision.taskTitle}
                            />
                          ) : null
                        }
                      />
                    ))}
                  </EntityList>
                )}
              </Section>
            </div>
          )}
        </TabLayout>
      </div>

      <FormDialog {...editPlanDialog.dialogProps} onSubmit={editPlanForm.submit}>
        {editPlanForm.fields}
      </FormDialog>
      <FormDialog {...taskFormDialog.dialogProps} onSubmit={taskForm.submit}>
        {taskForm.fields}
      </FormDialog>
      <FormDialog {...constraintFormDialog.dialogProps} onSubmit={constraintForm.submit}>
        {constraintForm.fields}
      </FormDialog>
      <FormDialog
        {...commitFormDialog.dialogProps}
        onSubmit={async () => {
          const sha = commitShaInput.trim()
          if (!sha || !planId) return false
          await plansApi.linkCommit(planId, sha)
          toast.success('Commit linked')
          setCommitShaInput('')
          fetchData()
        }}
      >
        <CommitShaField value={commitShaInput} onChange={setCommitShaInput} entity="plan" />
      </FormDialog>
      <LinkEntityDialog {...linkDialog.dialogProps} />
      <ImplementDialog
        open={implementDialogOpen}
        onClose={() => setImplementDialogOpen(false)}
        onConfirm={async (maxCostUsd: number) => {
          setImplementLoading(true)
          try {
            const cwd = linkedProject?.root_path || '.'
            await runnerApi.startRun(plan.id, cwd, linkedProject?.slug, maxCostUsd)
            navigate(runnerPath, { type: 'card-click' })
          } catch (err) {
            // 409 = already running — go to the dashboard anyway
            if (err instanceof ApiError && err.status === 409) {
              navigate(runnerPath, { type: 'card-click' })
            } else {
              console.error('Failed to start plan run:', err)
              toast.error(err instanceof Error ? err.message : 'Failed to start run')
            }
          } finally {
            setImplementLoading(false)
            setImplementDialogOpen(false)
          }
        }}
        mode="plan"
        entityTitle={plan.title || 'Untitled Plan'}
        loading={implementLoading}
      />
    </PageContainer>
  )
}

// ── Task row (with inline steps) ────────────────────────────────────────

interface PlanTaskRowProps {
  task: Task
  wsSlug: string
  onStatusChange: (status: TaskStatus) => Promise<void>
  refreshTrigger?: number
  expandAllSignal?: number
  collapseAllSignal?: number
  planId?: string
  planTitle?: string
  projectId?: string
}

/**
 * Task row on the plan page: the row opens the task; the leading chevron
 * expands its steps in place (lazy-loaded, refreshed on WS events).
 */
function PlanTaskRow({
  task,
  wsSlug,
  onStatusChange,
  refreshTrigger,
  expandAllSignal,
  collapseAllSignal,
  planId,
  planTitle,
  projectId,
}: PlanTaskRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [loadingSteps, setLoadingSteps] = useState(false)
  const title = task.title || task.description || 'Untitled task'
  const tags = task.tags || []

  const fetchSteps = useCallback(async () => {
    try {
      const response = await tasksApi.listSteps(task.id)
      setSteps(Array.isArray(response) ? response : [])
    } catch {
      setSteps([])
    }
  }, [task.id])

  // Re-fetch steps on WS refresh if already loaded
  useEffect(() => {
    if (steps !== null) fetchSteps()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- steps intentionally excluded to avoid loop
  }, [refreshTrigger, fetchSteps])

  useEffect(() => {
    if (expandAllSignal) {
      if (steps === null) {
        setLoadingSteps(true)
        fetchSteps().then(() => setLoadingSteps(false))
      }
      setExpanded(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signal-driven, steps/fetchSteps intentionally excluded
  }, [expandAllSignal])

  useEffect(() => {
    if (collapseAllSignal) setExpanded(false)
  }, [collapseAllSignal])

  const toggleExpand = async () => {
    if (!expanded && steps === null) {
      setLoadingSteps(true)
      await fetchSteps()
      setLoadingSteps(false)
    }
    setExpanded((v) => !v)
  }

  const completedSteps = steps?.filter((s) => s.status === 'completed').length ?? 0
  const totalSteps = steps?.length ?? 0

  return (
    <EntityRow
      title={
        <RowStateLink to={workspacePath(wsSlug, `/tasks/${task.id}`)} state={{ planId, planTitle, projectId }}>
          {title}
        </RowStateLink>
      }
      ariaLabel={title}
      viewTransitionName={`task-title-${task.id}`}
      className="hover:bg-white/[0.03] active:bg-white/[0.05]"
      muted={task.status === 'completed'}
      leading={
        <button
          type="button"
          onClick={toggleExpand}
          aria-expanded={expanded}
          aria-label={expanded ? `Hide steps of ${title}` : `Show steps of ${title}`}
          className={`-m-2 p-2 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-200 ${focusRing}`}
        >
          <ChevronRight className={`w-4 h-4 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} aria-hidden="true" />
        </button>
      }
      trailing={<RelativeTime date={task.updated_at ?? task.created_at} />}
      description={task.title ? task.description : undefined}
      meta={[
        <StatusMenu key="status" kind="task" status={task.status} onChange={onStatusChange} />,
        <PriorityText key="p" priority={task.priority} />,
        task.assigned_to ? (
          <span key="assignee" className="truncate max-w-[10rem]" title={`Assigned to ${task.assigned_to}`}>
            @{task.assigned_to}
          </span>
        ) : null,
        steps !== null && totalSteps > 0 ? (
          <span key="steps" className="tabular-nums">
            {completedSteps}/{totalSteps} steps
          </span>
        ) : null,
        tags.length > 0 ? (
          <span key="tags" className="break-words">
            {tags.map((t) => `#${t}`).join(' ')}
          </span>
        ) : null,
      ]}
    >
      {expanded && (
        <div className={`${rowInteractive} pl-1`}>
          <CompactStepList steps={steps} loading={loadingSteps} />
        </div>
      )}
    </EntityRow>
  )
}
