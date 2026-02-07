import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  LoadingPage,
  Button,
  ConfirmDialog,
  LinkEntityDialog,
  ProgressBar,
  InteractivePlanStatusBadge,
  TaskStatusBadge,
  ViewToggle,
  PageHeader,
  StatusSelect,
  SectionNav,
} from '@/components/ui'
import { projectsApi, plansApi, tasksApi } from '@/services'
import { PlanKanbanBoard } from '@/components/kanban'
import { useViewMode, useConfirmDialog, useLinkDialog, useToast, useSectionObserver } from '@/hooks'
import { milestoneRefreshAtom, planRefreshAtom, taskRefreshAtom } from '@/atoms'
import type {
  Milestone,
  MilestoneProgress,
  Plan,
  Project,
  Task,
  Step,
  MilestoneStatus,
  PlanStatus,
  StepStatus,
  PaginatedResponse,
} from '@/types'

export function ProjectMilestoneDetailPage() {
  const { milestoneId } = useParams<{ milestoneId: string }>()
  const navigate = useNavigate()
  const [milestone, setMilestone] = useState<Milestone | null>(null)
  const [progress, setProgress] = useState<MilestoneProgress | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [milestoneTasks, setMilestoneTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useViewMode()
  const confirmDialog = useConfirmDialog()
  const linkDialog = useLinkDialog()
  const toast = useToast()
  const milestoneRefresh = useAtomValue(milestoneRefreshAtom)
  const planRefresh = useAtomValue(planRefreshAtom)
  const taskRefresh = useAtomValue(taskRefreshAtom)

  const refreshData = useCallback(async () => {
    if (!milestoneId) return
    setLoading(true)
    try {
      const [response, progressData] = await Promise.all([
        projectsApi.getMilestone(milestoneId),
        projectsApi.getMilestoneProgress(milestoneId).catch(() => null),
      ])

      // API returns { milestone: {...}, tasks: [...] }
      setMilestone(response.milestone)
      setMilestoneTasks(response.tasks || [])
      setProgress(progressData)

      // Fetch the parent project
      if (response.milestone.project_id) {
        try {
          const projectsData = await projectsApi.list({ limit: 100 })
          const proj = (projectsData.items || []).find(
            (p) => p.id === response.milestone.project_id,
          )
          if (proj) {
            setProject(proj)

            // Fetch plans for this project
            const allPlansData = await plansApi.list({ limit: 100 })
            const projectPlans = (allPlansData.items || []).filter(
              (plan) => plan.project_id === proj.id,
            )
            setPlans(projectPlans)
          }
        } catch {
          // Project lookup failed
        }
      }
    } catch (error) {
      console.error('Failed to fetch milestone:', error)
    } finally {
      setLoading(false)
    }
  }, [milestoneId, milestoneRefresh, planRefresh, taskRefresh])

  useEffect(() => {
    refreshData()
  }, [refreshData])

  const handlePlanStatusChange = useCallback(
    async (planId: string, newStatus: PlanStatus) => {
      const original = plans.find((p) => p.id === planId)
      setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, status: newStatus } : p)))
      try {
        await plansApi.updateStatus(planId, newStatus)
        toast.success('Status updated')
      } catch (error) {
        if (original) {
          setPlans((prev) => prev.map((p) => (p.id === planId ? original : p)))
        }
        console.error('Failed to update plan status:', error)
        toast.error('Failed to update plan status')
      }
    },
    [plans],
  )

  // Kanban fetchFn: fetches plans for this project, filters by status
  const projectId = project?.id
  const kanbanFetchFn = useCallback(
    async (params: Record<string, unknown>): Promise<PaginatedResponse<Plan>> => {
      if (!projectId) return { items: [], total: 0, limit: 0, offset: 0 }
      const status = params.status as string
      const allPlansData = await plansApi.list({ limit: 100 })
      const filtered = (allPlansData.items || []).filter(
        (p) => p.project_id === projectId && p.status === status,
      )
      return { items: filtered, total: filtered.length, limit: filtered.length, offset: 0 }
    },
    [projectId],
  )

  const handleAddTask = useCallback(async (taskId: string) => {
    if (!milestoneId) return
    await projectsApi.addTaskToMilestone(milestoneId, taskId)
    // Re-fetch milestone to get updated tasks list + progress
    const [response, newProgress] = await Promise.all([
      projectsApi.getMilestone(milestoneId),
      projectsApi.getMilestoneProgress(milestoneId).catch(() => null),
    ])
    setMilestoneTasks(response.tasks || [])
    setProgress(newProgress)
    toast.success('Task added')
  }, [milestoneId, toast])

  const sectionIds = ['progress', 'plans', 'tasks']
  const activeSection = useSectionObserver(sectionIds)

  if (loading || !milestone) return <LoadingPage />

  const sections = [
    { id: 'progress', label: 'Progress' },
    { id: 'plans', label: 'Plans', count: plans.length },
    { id: 'tasks', label: 'Tasks', count: milestoneTasks.length },
  ]

  return (
    <div className="pt-6 space-y-6">
      <PageHeader
        title={milestone.title}
        description={milestone.description}
        status={
          <StatusSelect
            status={milestone.status?.toLowerCase() as MilestoneStatus}
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
            onStatusChange={async (newStatus: MilestoneStatus) => {
              await projectsApi.updateMilestone(milestone.id, { status: newStatus })
              setMilestone({ ...milestone, status: newStatus })
              toast.success('Status updated')
            }}
          />
        }
        metadata={[
          { label: 'Created', value: new Date(milestone.created_at).toLocaleDateString() },
          ...(milestone.target_date
            ? [{ label: 'Target', value: new Date(milestone.target_date).toLocaleDateString() }]
            : []),
          ...(milestone.closed_at
            ? [{ label: 'Closed', value: new Date(milestone.closed_at).toLocaleDateString() }]
            : []),
          ...(project ? [{ label: 'Project', value: project.name }] : []),
        ]}
        overflowActions={[
          {
            label: 'Delete',
            variant: 'danger',
            onClick: () =>
              confirmDialog.open({
                title: 'Delete Milestone',
                description:
                  'This will permanently delete this milestone. Tasks linked to it will not be deleted.',
                onConfirm: async () => {
                  await projectsApi.updateMilestone(milestone.id, { status: 'closed' })
                  toast.success('Milestone deleted')
                  navigate(project ? `/projects/${project.slug}` : '/projects')
                },
              }),
          },
        ]}
      />

      <SectionNav sections={sections} activeSection={activeSection} />

      {/* Progress */}
      <section id="progress" className="scroll-mt-20">
        {progress && (
          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressBar value={progress.percentage} showLabel size="lg" />
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <div className="text-center p-3 bg-white/[0.06] rounded-lg">
                  <div className="text-2xl font-bold text-green-400">{progress.completed}</div>
                  <div className="text-xs text-gray-500">Completed</div>
                </div>
                <div className="text-center p-3 bg-white/[0.06] rounded-lg">
                  <div className="text-2xl font-bold text-gray-400">
                    {progress.total - progress.completed}
                  </div>
                  <div className="text-xs text-gray-500">Remaining</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Plans */}
      <section id="plans" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Plans ({plans.length})</CardTitle>
              {plans.length > 0 && <ViewToggle value={viewMode} onChange={setViewMode} />}
            </div>
          </CardHeader>
          <CardContent>
            {plans.length === 0 ? (
              <p className="text-gray-500 text-sm">No plans for this project</p>
            ) : viewMode === 'kanban' ? (
              <PlanKanbanBoard
                fetchFn={kanbanFetchFn}
                onPlanStatusChange={handlePlanStatusChange}
                onPlanClick={(planId) => navigate(`/plans/${planId}`)}
                refreshTrigger={planRefresh}
              />
            ) : (
              <div className="space-y-2">
                {plans.map((plan) => (
                  <ExpandablePlanRow
                    key={plan.id}
                    plan={plan}
                    onStatusChange={async (newStatus: PlanStatus) => {
                      await plansApi.updateStatus(plan.id, newStatus)
                      setPlans((prev) =>
                        prev.map((p) => (p.id === plan.id ? { ...p, status: newStatus } : p)),
                      )
                      toast.success('Status updated')
                    }}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Tasks */}
      <section id="tasks" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Tasks ({milestoneTasks.length})</CardTitle>
              <Button
                size="sm"
                onClick={() =>
                  linkDialog.open({
                    title: 'Add Task to Milestone',
                    submitLabel: 'Add',
                    fetchOptions: async () => {
                      const data = await tasksApi.list({ limit: 100 })
                      const existingIds = new Set(milestoneTasks.map((t) => t.id))
                      return (data.items || [])
                        .filter((t) => !existingIds.has(t.id))
                        .map((t) => ({
                          value: t.id,
                          label: t.title || t.description || 'Untitled',
                          description: t.status,
                        }))
                    },
                    onLink: handleAddTask,
                  })
                }
              >
                Add Task
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {milestoneTasks.length === 0 ? (
              <p className="text-gray-500 text-sm">No tasks linked to this milestone</p>
            ) : (
              <div className="space-y-2">
                {milestoneTasks.map((task) => (
                  <ExpandableTaskRow key={task.id} task={task} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <LinkEntityDialog {...linkDialog.dialogProps} />
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </div>
  )
}

// ── Chevron icon ──────────────────────────────────────────────────────────────

function ChevronIcon({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform duration-150 ${expanded ? 'rotate-90' : ''} ${className || ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

// ── Expandable Plan Row (Plan -> Tasks -> Steps) ────────────────────────────

function ExpandablePlanRow({
  plan,
  onStatusChange,
}: {
  plan: Plan
  onStatusChange: (newStatus: PlanStatus) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [loadingTasks, setLoadingTasks] = useState(false)

  const toggleExpand = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!expanded && tasks === null) {
      setLoadingTasks(true)
      try {
        const data = await tasksApi.list({ plan_id: plan.id, limit: 100 })
        setTasks(data.items || [])
      } catch {
        setTasks([])
      } finally {
        setLoadingTasks(false)
      }
    }
    setExpanded(!expanded)
  }

  const taskCount = tasks?.length ?? null

  return (
    <div className="bg-white/[0.06] rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={toggleExpand}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
          title={expanded ? 'Collapse' : 'Show tasks'}
        >
          <ChevronIcon expanded={expanded} />
        </button>
        <Link
          to={`/plans/${plan.id}`}
          className="flex-1 min-w-0 hover:text-indigo-400 transition-colors"
        >
          <span className="font-medium text-gray-200">{plan.title}</span>
          {plan.description && (
            <p className="text-sm text-gray-400 line-clamp-1 mt-1">{plan.description}</p>
          )}
        </Link>
        {taskCount !== null && taskCount > 0 && (
          <span className="text-xs text-gray-500 flex-shrink-0">{taskCount} tasks</span>
        )}
        <InteractivePlanStatusBadge status={plan.status} onStatusChange={onStatusChange} />
      </div>
      {expanded && (
        <div className="pl-8 pr-3 pb-3 space-y-1.5">
          {loadingTasks ? (
            <div className="text-xs text-gray-500 py-2">Loading tasks...</div>
          ) : tasks && tasks.length > 0 ? (
            tasks.map((task) => <NestedTaskRow key={task.id} task={task} />)
          ) : (
            <div className="text-xs text-gray-500 py-1">No tasks</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Nested Task Row (inside a plan, expandable to show steps) ────────────────

function NestedTaskRow({ task }: { task: Task }) {
  const [expanded, setExpanded] = useState(false)
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [loadingSteps, setLoadingSteps] = useState(false)

  const toggleExpand = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!expanded && steps === null) {
      setLoadingSteps(true)
      try {
        const response = (await tasksApi.get(task.id)) as unknown as { steps?: Step[] }
        setSteps(response.steps || [])
      } catch {
        setSteps([])
      } finally {
        setLoadingSteps(false)
      }
    }
    setExpanded(!expanded)
  }

  const completedSteps = steps?.filter((s) => s.status === 'completed').length ?? 0
  const totalSteps = steps?.length ?? 0

  return (
    <div className="bg-white/[0.04] rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 p-2">
        <button
          onClick={toggleExpand}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
          title={expanded ? 'Collapse' : 'Show steps'}
        >
          <ChevronIcon expanded={expanded} className="!w-3 !h-3" />
        </button>
        <Link
          to={`/tasks/${task.id}`}
          className="flex-1 min-w-0 text-sm text-gray-300 hover:text-indigo-400 transition-colors truncate"
        >
          {task.title || task.description}
        </Link>
        {steps !== null && totalSteps > 0 && (
          <span className="text-[10px] text-gray-500 flex-shrink-0">
            {completedSteps}/{totalSteps}
          </span>
        )}
        <TaskStatusBadge status={task.status} />
      </div>
      {expanded && (
        <div className="pl-9 pr-2 pb-2 space-y-1">
          {loadingSteps ? (
            <div className="text-xs text-gray-500 py-1">Loading...</div>
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

// ── Expandable Task Row (top-level tasks section) ────────────────────────────

function ExpandableTaskRow({ task }: { task: Task }) {
  const [expanded, setExpanded] = useState(false)
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [loadingSteps, setLoadingSteps] = useState(false)

  const toggleExpand = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!expanded && steps === null) {
      setLoadingSteps(true)
      try {
        const response = (await tasksApi.get(task.id)) as unknown as { steps?: Step[] }
        setSteps(response.steps || [])
      } catch {
        setSteps([])
      } finally {
        setLoadingSteps(false)
      }
    }
    setExpanded(!expanded)
  }

  const completedSteps = steps?.filter((s) => s.status === 'completed').length ?? 0
  const totalSteps = steps?.length ?? 0

  return (
    <div className="bg-white/[0.06] rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={toggleExpand}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
          title={expanded ? 'Collapse' : 'Show steps'}
        >
          <ChevronIcon expanded={expanded} />
        </button>
        <Link
          to={`/tasks/${task.id}`}
          className="flex-1 min-w-0 hover:text-indigo-400 transition-colors"
        >
          <span className="font-medium text-gray-200">{task.title || task.description}</span>
        </Link>
        {steps !== null && totalSteps > 0 && (
          <span className="text-xs text-gray-500 flex-shrink-0">
            {completedSteps}/{totalSteps}
          </span>
        )}
        <TaskStatusBadge status={task.status} />
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

// ── Compact Step Row (read-only) ─────────────────────────────────────────────

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
        {step.status === 'completed' ? '\u2713' : index + 1}
      </div>
      <p className="text-sm text-gray-300 flex-1 min-w-0">{step.description}</p>
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
          step.status === 'completed'
            ? 'bg-green-500/20 text-green-400'
            : step.status === 'in_progress'
              ? 'bg-blue-500/20 text-blue-400'
              : step.status === 'skipped'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-white/[0.08] text-gray-500'
        }`}
      >
        {stepStatusLabels[step.status]}
      </span>
    </div>
  )
}
