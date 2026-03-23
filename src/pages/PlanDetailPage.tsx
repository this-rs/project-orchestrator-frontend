import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useSetAtom, useAtomValue } from 'jotai'
import React from 'react'
import { ChevronsUpDown, ChevronRight, Flag, FolderKanban, GitCommitHorizontal, ListChecks, GitFork, Archive, Play, ExternalLink, AlertTriangle, Zap } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, LoadingPage, ErrorState, Badge, Button, ConfirmDialog, FormDialog, LinkEntityDialog, LinkedEntityBadge, InteractiveTaskStatusBadge, InteractiveDecisionStatusBadge, ViewToggle, PageHeader, StatusSelect, TabLayout } from '@/components/ui'
import type { ParentLink } from '@/components/ui/PageHeader'
import { plansApi, tasksApi, projectsApi, workspacesApi, decisionsApi } from '@/services'
import { ApiError } from '@/services/api'
import { UniversalKanban, createTaskKanbanConfig } from '@/components/kanban'
import { useViewMode, useConfirmDialog, useFormDialog, useLinkDialog, useToast, useWorkspaceSlug, useViewTransition } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { chatSuggestedProjectIdAtom, planRefreshAtom, taskRefreshAtom, projectRefreshAtom } from '@/atoms'
import { CreateTaskForm, CreateConstraintForm, EditPlanForm } from '@/components/forms'
import { UnifiedGraphSection, type GraphBreadcrumb } from '@/components/graph/UnifiedGraphSection'
import { ImplementDialog } from '@/components/pipeline/ImplementDialog'
import { PlanGraphAdapter } from '@/adapters/PlanGraphAdapter'
import { usePlanGraphData } from '@/hooks/usePlanGraphData'
import { CommitList } from '@/components/commits'
import { PlanRunHistory } from '@/components/runner/PlanRunHistory'
import { StatsRow } from '@/components/runner/StatsRow'
import { runnerApi, useRunnerStatus } from '@/services/runner'
import type { Plan, Decision, DecisionStatus, DependencyGraph, Task, Constraint, Step, Commit, PlanStatus, TaskStatus, StepStatus, PaginatedResponse, Project } from '@/types'
import type { KanbanTask } from '@/components/kanban'

interface DecisionWithTask extends Decision {
  taskId: string
  taskTitle: string
}

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
  const confirmDialog = useConfirmDialog()
  const taskFormDialog = useFormDialog()
  const constraintFormDialog = useFormDialog()
  const commitFormDialog = useFormDialog()
  const editPlanDialog = useFormDialog()
  const linkDialog = useLinkDialog()
  const toast = useToast()
  const setSuggestedProjectId = useSetAtom(chatSuggestedProjectIdAtom)
  const planRefresh = useAtomValue(planRefreshAtom)
  const taskRefresh = useAtomValue(taskRefreshAtom)
  const projectRefresh = useAtomValue(projectRefreshAtom)
  const [linkedProject, setLinkedProject] = useState<Project | null>(null)
  const [tasksExpandAll, setTasksExpandAll] = useState(0)
  const [tasksCollapseAll, setTasksCollapseAll] = useState(0)
  const [tasksAllExpanded, setTasksAllExpanded] = useState(false)
  const [linkedMilestones, setLinkedMilestones] = useState<Array<{ id: string; title: string; href: string; type: 'workspace' | 'project' }>>([])
  const [implementDialogOpen, setImplementDialogOpen] = useState(false)
  const [implementLoading, setImplementLoading] = useState(false)
  // Active tab state — default to "tasks"
  const [activeTab, setActiveTab] = useState('tasks')
  // Detect active pipeline run — used to hide/disable implement button + runner tab
  const { isRunning: hasPipelineRunning, snapshot: runnerSnapshot } = useRunnerStatus(planId)
  // Plan graph data for UnifiedGraphSection (replaces inline graph section)
  const planGraphData = usePlanGraphData(planId, plan?.title, linkedProject?.slug)

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
    // Only show loading spinner on initial load, not on WS-triggered refreshes
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

      // Extract decisions from PlanDetails response — backend nests them in tasks[].decisions[]
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

      // Load linked project if exists
      if (planData.project_id) {
        try {
          const allProjects = await projectsApi.list()
          const proj = (allProjects.items || []).find(p => p.id === planData.project_id)
          setLinkedProject(proj || null)
          if (proj) setSuggestedProjectId(proj.id)
        } catch { setLinkedProject(null) }
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

  // Resolve linked milestones (workspace + project milestones that reference this plan)
  useEffect(() => {
    if (!planId) return
    const controller = new AbortController()

    async function resolveMilestones() {
      const milestones: Array<{ id: string; title: string; href: string; type: 'workspace' | 'project' }> = []
      try {
        // 1. Workspace milestones
        const wsMilestones = await workspacesApi.listMilestones(wsSlug, { limit: 100 })
        const wsDetails = await Promise.allSettled(
          (wsMilestones.items || []).map((ms) => workspacesApi.getMilestone(ms.id))
        )
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

        // 2. Project milestones (if the plan is linked to a project)
        if (plan?.project_id) {
          try {
            const projMilestones = await projectsApi.listMilestones(plan.project_id, { limit: 100 })
            const projDetails = await Promise.allSettled(
              (projMilestones.items || []).map((ms) => projectsApi.getMilestone(ms.id))
            )
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
        /* graceful degradation — milestone chips simply won't appear */
      }
      if (!controller.signal.aborted) {
        setLinkedMilestones(milestones)
      }
    }

    resolveMilestones()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- planId, wsSlug and plan?.project_id are stable
  }, [planId, wsSlug, plan?.project_id])

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

  // Stable fetchFn for kanban — fetches tasks scoped to this plan
  const kanbanFetchFn = useCallback(
    (params: Record<string, unknown>): Promise<PaginatedResponse<KanbanTask>> => {
      return tasksApi.list({ plan_id: planId, ...params } as Record<string, string | number | undefined>)
    },
    [planId],
  )

  // UniversalKanban config for plan detail tasks
  const planTaskKanbanConfig = useMemo(
    () =>
      createTaskKanbanConfig({
        fetchFn: kanbanFetchFn,
        onStatusChange: (id, status) => handleTaskStatusChange(id, status as TaskStatus),
      }),
    [kanbanFetchFn, handleTaskStatusChange],
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

  const handleDeleteDecision = (decision: DecisionWithTask) => {
    confirmDialog.open({
      title: 'Delete Decision',
      description: 'Permanently delete this decision? This cannot be undone.',
      onConfirm: async () => {
        await decisionsApi.delete(decision.id)
        setDecisions((prev) => prev.filter((d) => d.id !== decision.id))
        toast.success('Decision deleted')
      },
    })
  }

  // Build a fresh status map from local tasks state (includes optimistic updates)
  // Must be before early return to respect Rules of Hooks
  const taskStatusMap = useMemo(
    () => new Map(tasks.map((t) => [t.id, t.status])),
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

  if (error) return <ErrorState title="Failed to load" description={error} onRetry={fetchData} />
  if (loading || !plan) return <LoadingPage />

  const tasksByStatus = {
    pending: tasks.filter((t) => t.status === 'pending'),
    in_progress: tasks.filter((t) => t.status === 'in_progress'),
    blocked: tasks.filter((t) => t.status === 'blocked'),
    completed: tasks.filter((t) => t.status === 'completed'),
    failed: tasks.filter((t) => t.status === 'failed'),
  }

  // Build parent links for milestone navigation
  const parentLinks: ParentLink[] = linkedMilestones.map((ms) => ({
    icon: ms.type === 'project' ? FolderKanban : Flag,
    label: ms.type === 'project' ? 'Project Milestone' : 'Milestone',
    name: ms.title,
    href: ms.href,
  }))

  // Tab definitions
  const hasGraphNodes = planGraphData.data && (planGraphData.graph?.nodes || []).length > 0
  const tabs = [
    { id: 'tasks', label: 'Tasks', icon: <ListChecks className="w-4 h-4" />, count: tasks.length },
    ...(hasGraphNodes ? [{ id: 'graph', label: 'Graph', icon: <GitFork className="w-4 h-4" />, count: (planGraphData.graph?.nodes || []).length }] : []),
    { id: 'runner', label: 'Runner', icon: <Play className="w-4 h-4" /> },
    { id: 'artefacts', label: 'Artefacts', icon: <Archive className="w-4 h-4" />, count: commits.length + decisions.length + constraints.length },
  ]

  return (
    <div className="pt-6 space-y-6">
      <PageHeader
        title={plan.title}
        parentLinks={parentLinks.length > 0 ? parentLinks : undefined}
        viewTransitionName={`plan-title-${plan.id}`}
        description={plan.description}
        status={
          <StatusSelect
            status={plan.status}
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'approved', label: 'Approved' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'completed', label: 'Completed' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
            colorMap={{
              draft: { bg: 'bg-white/[0.08]', text: 'text-gray-200', dot: 'bg-gray-400' },
              approved: { bg: 'bg-blue-900/50', text: 'text-blue-400', dot: 'bg-blue-400' },
              in_progress: { bg: 'bg-purple-900/50', text: 'text-purple-400', dot: 'bg-purple-400' },
              completed: { bg: 'bg-green-900/50', text: 'text-green-400', dot: 'bg-green-400' },
              cancelled: { bg: 'bg-red-900/50', text: 'text-red-400', dot: 'bg-red-400' },
            }}
            onStatusChange={async (newStatus: PlanStatus) => {
              await plansApi.updateStatus(plan.id, newStatus)
              setPlan({ ...plan, status: newStatus })
              toast.success('Status updated')
            }}
          />
        }
        metadata={[
          { label: 'Priority', value: String(plan.priority) },
          { label: 'Created by', value: plan.created_by },
          { label: 'Created', value: new Date(plan.created_at).toLocaleDateString() },
        ]}
        actions={undefined}
        overflowActions={[
          { label: 'Runner Dashboard', onClick: () => navigate(workspacePath(wsSlug, `/plans/${plan.id}/runner`), { type: 'card-click' }) },
          { label: 'Edit', onClick: () => editPlanDialog.open({ title: 'Edit Plan' }) },
          { label: 'Delete', variant: 'danger', onClick: () => confirmDialog.open({
            title: 'Delete Plan',
            description: 'This will permanently delete this plan and all its tasks, steps, decisions, and constraints.',
            onConfirm: async () => { await plansApi.delete(plan.id); toast.success('Plan deleted'); navigate(workspacePath(wsSlug, '/plans'), { type: 'back-button' }) }
          }) }
        ]}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Project:</span>
          {linkedProject ? (
            <LinkedEntityBadge
              label={linkedProject.name}
              linkTo={workspacePath(wsSlug, `/projects/${linkedProject.slug}`)}
              onUnlink={async () => {
                await plansApi.unlinkFromProject(plan.id)
                setLinkedProject(null)
                setPlan({ ...plan, project_id: undefined } as Plan)
                toast.success('Project unlinked')
              }}
            />
          ) : (
            <Button variant="ghost" size="sm" onClick={() => linkDialog.open({
              title: 'Link to Project',
              submitLabel: 'Link',
              fetchOptions: async () => {
                const data = await projectsApi.list()
                return (data.items || []).map(p => ({ value: p.id, label: p.name, description: p.slug }))
              },
              onLink: async (projectId) => {
                await plansApi.linkToProject(plan.id, projectId)
                const data = await projectsApi.list()
                const proj = (data.items || []).find(p => p.id === projectId)
                setLinkedProject(proj || null)
                setPlan({ ...plan, project_id: projectId } as Plan)
                toast.success('Project linked')
              },
            })}>Link to Project</Button>
          )}
        </div>
      </PageHeader>

      {/* Task Stats — 5 stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
        <StatCard label="Pending" value={tasksByStatus.pending.length} color="gray" />
        <StatCard label="In Progress" value={tasksByStatus.in_progress.length} color="blue" />
        <StatCard label="Blocked" value={tasksByStatus.blocked.length} color="yellow" />
        <StatCard label="Completed" value={tasksByStatus.completed.length} color="green" />
        <StatCard label="Failed" value={tasksByStatus.failed.length} color="red" />
      </div>

      {/* 3-tab layout: Tasks | Graph | Artefacts */}
      <TabLayout
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {/* ── Tab: Tasks ── */}
        {activeTab === 'tasks' && (
          <div className="pt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle>Tasks ({tasks.length})</CardTitle>
                    {tasks.length > 0 && viewMode === 'list' && (
                      <button
                        onClick={() => {
                          if (tasksAllExpanded) {
                            setTasksCollapseAll((s) => s + 1)
                          } else {
                            setTasksExpandAll((s) => s + 1)
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
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => taskFormDialog.open({ title: 'Add Task', size: 'lg' })}>Add Task</Button>
                    <ViewToggle value={viewMode} onChange={setViewMode} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {tasks.length === 0 ? (
                  <p className="text-gray-500 text-sm">No tasks in this plan</p>
                ) : viewMode === 'kanban' ? (
                  <UniversalKanban
                    config={planTaskKanbanConfig}
                    onItemClick={(taskId) => navigate(workspacePath(wsSlug, `/tasks/${taskId}`), { type: 'card-click' })}
                    refreshTrigger={taskRefresh}
                  />
                ) : (
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onStatusChange={(newStatus) => handleTaskStatusChange(task.id, newStatus)}
                        refreshTrigger={taskRefresh}
                        expandAllSignal={tasksExpandAll}
                        collapseAllSignal={tasksCollapseAll}
                        planId={plan.id}
                        planTitle={plan.title}
                        projectId={plan.project_id}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Tab: Graph (DAG only, with waves toggle) ── */}
        {activeTab === 'graph' && hasGraphNodes && (
          <div className="pt-4">
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
          </div>
        )}

        {/* ── Tab: Runner (active run + history + launch) ── */}
        {activeTab === 'runner' && plan && (() => {
          // Stuck detection: run reports as running but all tasks are done
          const isStuck = hasPipelineRunning && runnerSnapshot != null
            && runnerSnapshot.tasks_total > 0
            && runnerSnapshot.tasks_completed >= runnerSnapshot.tasks_total
            && runnerSnapshot.active_agents.every(a => a.status === 'completed' || a.status === 'failed')

          return (
            <div className="pt-4 space-y-4">
              {/* Stuck run warning + recovery */}
              {isStuck && runnerSnapshot && (
                <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl">
                  <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <div>
                      <p className="text-sm font-medium text-amber-300">Run bloqué</p>
                      <p className="text-xs text-amber-400/80 mt-0.5">
                        Toutes les tâches sont terminées ({runnerSnapshot.tasks_completed}/{runnerSnapshot.tasks_total}) mais le run est toujours marqué comme actif. Le runner ne s'est pas finalisé correctement.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            await runnerApi.forceCancelRun(plan.id)
                            toast.success('Run finalisé avec succès')
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : 'Échec de la finalisation')
                          }
                        }}
                        className="bg-amber-600 hover:bg-amber-500 text-white"
                      >
                        <Zap className="w-3.5 h-3.5 mr-1.5" />
                        Forcer la finalisation
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => navigate(workspacePath(wsSlug, `/plans/${plan.id}/runner`), { type: 'card-click' })}
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        Full Dashboard
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Active run status (normal, not stuck) */}
              {hasPipelineRunning && runnerSnapshot && !isStuck && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        <CardTitle>Active Run</CardTitle>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => navigate(workspacePath(wsSlug, `/plans/${plan.id}/runner`), { type: 'card-click' })}
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        Full Dashboard
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </Card>
              )}

              {/* Launch actions — only when plan is approved AND no run is active */}
              {!hasPipelineRunning && plan.status === 'approved' && (
                <Card>
                  <CardContent className="py-6">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <Play className="w-8 h-8 text-gray-500" />
                      <p className="text-sm text-gray-400">No active pipeline run for this plan</p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => setImplementDialogOpen(true)}
                        >
                          <Play className="w-3.5 h-3.5 mr-1.5" />
                          Launch Pipeline
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => navigate(workspacePath(wsSlug, `/plans/${plan.id}/runner`), { type: 'card-click' })}
                        >
                          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                          Runner Dashboard
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Run history */}
              <Card>
                <CardHeader>
                  <CardTitle>Run History</CardTitle>
                </CardHeader>
                <CardContent>
                  <PlanRunHistory planIds={plan.id} maxRuns={10} />
                </CardContent>
              </Card>
            </div>
          )
        })()}

        {/* ── Tab: Artefacts (commits + decisions + constraints) ── */}
        {activeTab === 'artefacts' && (
          <div className="pt-4 space-y-4">
            {/* Commits */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <GitCommitHorizontal className="w-4 h-4 text-gray-500" />
                    <CardTitle>Commits ({commits.length})</CardTitle>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => { setCommitShaInput(''); commitFormDialog.open({ title: 'Link Commit', submitLabel: 'Link', size: 'sm' }) }}
                  >
                    Link Commit
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {commits.length > 0 ? (
                  <CommitList commits={commits} />
                ) : (
                  <p className="text-sm text-gray-500 py-4 text-center">No commits linked to this plan yet</p>
                )}
              </CardContent>
            </Card>

            {/* Constraints & Decisions side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between w-full">
                    <CardTitle>Constraints ({constraints.length})</CardTitle>
                    <Button size="sm" onClick={() => constraintFormDialog.open({ title: 'Add Constraint' })}>Add</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {constraints.length === 0 ? (
                    <p className="text-gray-500 text-sm">No constraints defined</p>
                  ) : (
                    <div className="space-y-2">
                      {constraints.map((constraint) => (
                        <ConstraintRow key={constraint.id} constraint={constraint} onDelete={async () => {
                          await plansApi.deleteConstraint(constraint.id)
                          setConstraints(prev => prev.filter(c => c.id !== constraint.id))
                        }} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Decisions ({decisions.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {decisions.length === 0 ? (
                    <p className="text-gray-500 text-sm">No decisions recorded</p>
                  ) : (
                    <div className="space-y-2">
                      {decisions.map((decision) => (
                        <Link
                          key={decision.id}
                          to={workspacePath(wsSlug, `/decisions/${decision.id}`)}
                          className="block p-3 bg-white/[0.06] rounded-lg overflow-hidden hover:bg-white/[0.09] transition-colors group/dec"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-gray-200 break-words line-clamp-2 mb-1">{decision.description}</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                {decision.chosen_option && (
                                  <Badge variant="success">{decision.chosen_option}</Badge>
                                )}
                                <span
                                  role="link"
                                  tabIndex={0}
                                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    navigate(workspacePath(wsSlug, `/tasks/${decision.taskId}`), {
                                      state: { planId: plan.id, planTitle: plan.title, projectId: plan.project_id }
                                    })
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      navigate(workspacePath(wsSlug, `/tasks/${decision.taskId}`), {
                                        state: { planId: plan.id, planTitle: plan.title, projectId: plan.project_id }
                                      })
                                    }
                                  }}
                                >
                                  ← {decision.taskTitle}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.preventDefault()}>
                              <InteractiveDecisionStatusBadge status={decision.status} onStatusChange={(status) => handleDecisionStatusChange(decision, status)} />
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  handleDeleteDecision(decision)
                                }}
                                className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover/dec:opacity-100 transition-all"
                                title="Delete decision"
                              >
                                &times;
                              </button>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </TabLayout>

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
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-300">Commit SHA</label>
          <input
            type="text"
            value={commitShaInput}
            onChange={(e) => setCommitShaInput(e.target.value)}
            placeholder="e.g. a1b2c3d or full 40-char SHA"
            pattern="[a-f0-9]{7,40}"
            className="w-full px-3 py-2 bg-white/[0.06] border border-white/[0.08] rounded-lg text-sm text-gray-200 placeholder:text-gray-500 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50"
            autoFocus
          />
          <p className="text-xs text-gray-500">Enter a 7–40 character hex commit hash to link to this plan.</p>
        </div>
      </FormDialog>
      <LinkEntityDialog {...linkDialog.dialogProps} />
      <ConfirmDialog {...confirmDialog.dialogProps} />
      <ImplementDialog
        open={implementDialogOpen}
        onClose={() => setImplementDialogOpen(false)}
        onConfirm={async (maxCostUsd: number) => {
          setImplementLoading(true)
          try {
            const cwd = linkedProject?.root_path || '.'
            await runnerApi.startRun(plan.id, cwd, linkedProject?.slug, maxCostUsd)
            // Navigate to runner dashboard to monitor the run
            navigate(workspacePath(wsSlug, `/plans/${plan.id}/runner`), { type: 'card-click' })
          } catch (err) {
            // 409 = already running — navigate to dashboard anyway
            if (err instanceof ApiError && err.status === 409) {
              navigate(workspacePath(wsSlug, `/plans/${plan.id}/runner`), { type: 'card-click' })
            } else {
              const msg = err instanceof Error ? err.message : 'Failed to start run'
              console.error('Failed to start plan run:', err)
              alert(msg)
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

    </div>
  )
}

function TaskRow({
  task,
  onStatusChange,
  refreshTrigger,
  expandAllSignal,
  collapseAllSignal,
  planId,
  planTitle,
  projectId,
}: {
  task: Task
  onStatusChange: (status: TaskStatus) => Promise<void>
  refreshTrigger?: number
  expandAllSignal?: number
  collapseAllSignal?: number
  planId?: string
  planTitle?: string
  projectId?: string
}) {
  const wsSlug = useWorkspaceSlug()
  const [expanded, setExpanded] = useState(false)
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [loadingSteps, setLoadingSteps] = useState(false)
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
    if (steps !== null) {
      fetchSteps()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- steps intentionally excluded to avoid loop
  }, [refreshTrigger, fetchSteps])

  // Expand/Collapse all signals
  useEffect(() => {
    if (expandAllSignal) {
      // Trigger fetch if steps not yet loaded
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

  const toggleExpand = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!expanded && steps === null) {
      setLoadingSteps(true)
      await fetchSteps()
      setLoadingSteps(false)
    }
    setExpanded(!expanded)
  }

  const completedSteps = steps?.filter(s => s.status === 'completed').length ?? 0
  const totalSteps = steps?.length ?? 0

  return (
    <div
      id={`task-row-${task.id}`}
      className="rounded-lg overflow-hidden transition-all duration-200 bg-white/[0.06]"
    >
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={toggleExpand}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
          title={expanded ? 'Replier' : 'Voir les steps'}
        >
          <ChevronRight className={`w-4 h-4 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} />
        </button>
        <Link
          to={workspacePath(wsSlug, `/tasks/${task.id}`)}
          state={{ planId, planTitle, projectId }}
          className="flex-1 min-w-0 hover:text-indigo-400 transition-colors overflow-hidden"
        >
          <span className="font-medium text-gray-200 block truncate">{task.title || task.description}</span>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {tags.slice(0, 3).map((tag, index) => (
                <Badge key={`${tag}-${index}`} variant="default">{tag}</Badge>
              ))}
            </div>
          )}
        </Link>
        {steps !== null && totalSteps > 0 && (
          <span className="text-xs text-gray-500 flex-shrink-0">
            {completedSteps}/{totalSteps}
          </span>
        )}
        <InteractiveTaskStatusBadge
          status={task.status}
          onStatusChange={onStatusChange}
        />
      </div>
      {expanded && (
        <div className="pl-11 pr-3 pb-3 space-y-1.5">
          {loadingSteps ? (
            <div className="text-xs text-gray-500 py-2">Loading steps...</div>
          ) : steps && steps.length > 0 ? (
            steps.map((step, index) => (
              <CompactStepRow key={step.id || index} step={step} index={index} />
            ))
          ) : (
            <div className="text-xs text-gray-500 py-1">No steps</div>
          )}
        </div>
      )}
    </div>
  )
}

const stepStatusColors: Record<StepStatus, string> = {
  pending: 'bg-white/[0.15]',
  in_progress: 'bg-blue-600',
  completed: 'bg-green-600',
  skipped: 'bg-yellow-600',
}

const stepStatusLabels: Record<StepStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Done',
  skipped: 'Skipped',
}

function CompactStepRow({ step, index }: { step: Step; index: number }) {
  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded bg-white/[0.03]">
      <div
        className={`w-5 h-5 rounded-full ${stepStatusColors[step.status]} flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0 mt-0.5`}
      >
        {step.status === 'completed' ? '✓' : index + 1}
      </div>
      <p className="text-sm text-gray-300 flex-1 min-w-0">{step.description}</p>
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
        step.status === 'completed' ? 'bg-green-500/20 text-green-400' :
        step.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
        step.status === 'skipped' ? 'bg-yellow-500/20 text-yellow-400' :
        'bg-white/[0.08] text-gray-500'
      }`}>
        {stepStatusLabels[step.status]}
      </span>
    </div>
  )
}

function ConstraintRow({ constraint, onDelete }: { constraint: Constraint; onDelete: () => void }) {
  const typeBadgeColors: Record<string, string> = {
    performance: 'bg-yellow-500/15 text-yellow-400',
    security: 'bg-red-500/15 text-red-400',
    style: 'bg-purple-500/15 text-purple-400',
    compatibility: 'bg-blue-500/15 text-blue-400',
    testing: 'bg-green-500/15 text-green-400',
    other: 'bg-white/[0.08] text-gray-400',
  }

  return (
    <div className="p-2.5 rounded-lg bg-white/[0.03] space-y-1.5">
      <div className="flex items-center justify-between">
        <span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded-full ${typeBadgeColors[constraint.constraint_type] || typeBadgeColors.other}`}>
          {constraint.constraint_type}
        </span>
        <button
          onClick={onDelete}
          className="text-gray-500 hover:text-red-400 text-sm px-1 cursor-pointer"
          title="Delete constraint"
        >
          &times;
        </button>
      </div>
      <p className="text-sm text-gray-300 break-words">{constraint.description}</p>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorClasses: Record<string, string> = {
    gray: 'text-gray-400',
    blue: 'text-blue-400',
    yellow: 'text-yellow-400',
    green: 'text-green-400',
    red: 'text-red-400',
  }

  return (
    <Card>
      <CardContent className="text-center py-3">
        <div className={`text-2xl font-bold ${colorClasses[color]}`}>{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </CardContent>
    </Card>
  )
}
