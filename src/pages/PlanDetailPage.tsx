import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useSetAtom, useAtomValue } from 'jotai'
import { ChevronsUpDown, ChevronRight } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, LoadingPage, ErrorState, Badge, Button, ConfirmDialog, FormDialog, LinkEntityDialog, LinkedEntityBadge, InteractiveTaskStatusBadge, ViewToggle, PageHeader, StatusSelect, SectionNav } from '@/components/ui'
import { plansApi, tasksApi, projectsApi } from '@/services'
import { KanbanBoard } from '@/components/kanban'
import { useViewMode, useConfirmDialog, useFormDialog, useLinkDialog, useToast, useSectionObserver, useWorkspaceSlug, useViewTransition } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { chatSuggestedProjectIdAtom, planRefreshAtom, taskRefreshAtom, projectRefreshAtom } from '@/atoms'
import { CreateTaskForm, CreateConstraintForm } from '@/components/forms'
import { DependencyGraphView } from '@/components/DependencyGraphView'
import type { Plan, Decision, DependencyGraph, Task, Constraint, Step, PlanStatus, TaskStatus, StepStatus, PaginatedResponse, Project } from '@/types'
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
  const [graph, setGraph] = useState<DependencyGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useViewMode()
  const confirmDialog = useConfirmDialog()
  const taskFormDialog = useFormDialog()
  const constraintFormDialog = useFormDialog()
  const linkDialog = useLinkDialog()
  const toast = useToast()
  const setSuggestedProjectId = useSetAtom(chatSuggestedProjectIdAtom)
  const planRefresh = useAtomValue(planRefreshAtom)
  const taskRefresh = useAtomValue(taskRefreshAtom)
  const projectRefresh = useAtomValue(projectRefreshAtom)
  const [linkedProject, setLinkedProject] = useState<Project | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [tasksExpandAll, setTasksExpandAll] = useState(0)
  const [tasksCollapseAll, setTasksCollapseAll] = useState(0)
  const [tasksAllExpanded, setTasksAllExpanded] = useState(false)

  const fetchData = useCallback(async () => {
    if (!planId) return
    setError(null)
    // Only show loading spinner on initial load, not on WS-triggered refreshes
    const isInitialLoad = !plan
    if (isInitialLoad) setLoading(true)
    try {
      const [planResponse, tasksData, constraintsData, graphData] = await Promise.all([
        plansApi.get(planId),
        tasksApi.list({ plan_id: planId, limit: 100 }),
        plansApi.listConstraints(planId),
        plansApi.getDependencyGraph(planId).catch(() => null),
      ])
      const planData = (planResponse as unknown as { plan: Plan }).plan || planResponse
      setPlan(planData)
      setTasks(tasksData.items || [])
      setConstraints(Array.isArray(constraintsData) ? constraintsData : [])
      setGraph(graphData)

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

  // Stable fetchFn for KanbanBoard — fetches tasks scoped to this plan
  const kanbanFetchFn = useCallback(
    (params: Record<string, unknown>): Promise<PaginatedResponse<KanbanTask>> => {
      return tasksApi.list({ plan_id: planId, ...params } as Record<string, string | number | undefined>)
    },
    [planId],
  )

  const taskForm = CreateTaskForm({
    onSubmit: async (data) => {
      if (!planId) return
      setFormLoading(true)
      try {
        const newTask = await plansApi.createTask(planId, data)
        setTasks((prev) => [...prev, newTask])
        taskFormDialog.close()
        toast.success('Task added')
      } finally {
        setFormLoading(false)
      }
    },
    loading: formLoading,
  })

  const constraintForm = CreateConstraintForm({
    onSubmit: async (data) => {
      if (!planId) return
      setFormLoading(true)
      try {
        const newConstraint = await plansApi.addConstraint(planId, data)
        setConstraints((prev) => [...prev, newConstraint])
        constraintFormDialog.close()
        toast.success('Constraint added')
      } finally {
        setFormLoading(false)
      }
    },
    loading: formLoading,
  })

  const sectionIds = ['overview', 'tasks', 'constraints', 'decisions', ...(graph && (graph.nodes || []).length > 0 ? ['graph'] : [])]
  const activeSection = useSectionObserver(sectionIds)

  // Build a fresh status map from local tasks state (includes optimistic updates)
  // Must be before early return to respect Rules of Hooks
  const taskStatusMap = useMemo(
    () => new Map(tasks.map((t) => [t.id, t.status])),
    [tasks],
  )

  if (error) return <ErrorState title="Failed to load" description={error} onRetry={fetchData} />
  if (loading || !plan) return <LoadingPage />

  const tasksByStatus = {
    pending: tasks.filter((t) => t.status === 'pending'),
    in_progress: tasks.filter((t) => t.status === 'in_progress'),
    blocked: tasks.filter((t) => t.status === 'blocked'),
    completed: tasks.filter((t) => t.status === 'completed'),
    failed: tasks.filter((t) => t.status === 'failed'),
  }

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: 'Tasks', count: tasks.length },
    { id: 'constraints', label: 'Constraints', count: constraints.length },
    { id: 'decisions', label: 'Decisions', count: decisions.length },
    ...(graph && (graph.nodes || []).length > 0 ? [{ id: 'graph', label: 'Graph', count: (graph.nodes || []).length }] : []),
  ]

  return (
    <div className="pt-6 space-y-6">
      <PageHeader
        title={plan.title}
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
        overflowActions={[
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

      <SectionNav sections={sections} activeSection={activeSection} />

      {/* Task Stats */}
      <section id="overview" className="scroll-mt-20">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
        <StatCard label="Pending" value={tasksByStatus.pending.length} color="gray" />
        <StatCard label="In Progress" value={tasksByStatus.in_progress.length} color="blue" />
        <StatCard label="Blocked" value={tasksByStatus.blocked.length} color="yellow" />
        <StatCard label="Completed" value={tasksByStatus.completed.length} color="green" />
        <StatCard label="Failed" value={tasksByStatus.failed.length} color="red" />
      </div>

      </section>

      {/* Tasks */}
      <section id="tasks" className="scroll-mt-20">
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
            <KanbanBoard
              fetchFn={kanbanFetchFn}
              onTaskStatusChange={handleTaskStatusChange}
              onTaskClick={(taskId) => navigate(workspacePath(wsSlug, `/tasks/${taskId}`), { type: 'card-click' })}
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
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      </section>

      {/* Constraints & Decisions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <section id="constraints" className="scroll-mt-20">
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
        </section>

        <section id="decisions" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle>Decisions ({decisions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {decisions.length === 0 ? (
              <p className="text-gray-500 text-sm">No decisions recorded</p>
            ) : (
              <div className="space-y-3">
                {decisions.map((decision) => (
                  <div key={decision.id} className="p-3 bg-white/[0.06] rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-gray-200 break-words min-w-0">{decision.description}</p>
                    </div>
                    <p className="text-sm text-gray-400 break-words">{decision.rationale}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {decision.chosen_option && (
                        <Badge variant="success">{decision.chosen_option}</Badge>
                      )}
                      <Link
                        to={workspacePath(wsSlug, `/tasks/${decision.taskId}`)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        ← {decision.taskTitle}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </section>
      </div>

      {/* Dependency Graph */}
      {graph && (graph.nodes || []).length > 0 && (
        <section id="graph" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <CardTitle>Dependency Graph</CardTitle>
              <span className="text-sm text-gray-500">
                {(graph.nodes || []).length} tasks &middot; {(graph.edges || []).length} dependencies
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <DependencyGraphView graph={graph} taskStatuses={taskStatusMap} />
          </CardContent>
        </Card>
        </section>
      )}

      <FormDialog {...taskFormDialog.dialogProps} onSubmit={taskForm.submit} loading={formLoading}>
        {taskForm.fields}
      </FormDialog>
      <FormDialog {...constraintFormDialog.dialogProps} onSubmit={constraintForm.submit} loading={formLoading}>
        {constraintForm.fields}
      </FormDialog>
      <LinkEntityDialog {...linkDialog.dialogProps} />
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </div>
  )
}

function TaskRow({
  task,
  onStatusChange,
  refreshTrigger,
  expandAllSignal,
  collapseAllSignal,
}: {
  task: Task
  onStatusChange: (status: TaskStatus) => Promise<void>
  refreshTrigger?: number
  expandAllSignal?: number
  collapseAllSignal?: number
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
    <div className="bg-white/[0.06] rounded-lg overflow-hidden">
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
