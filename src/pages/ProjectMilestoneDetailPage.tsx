import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
  ViewToggle,
  PageHeader,
  StatusSelect,
  SectionNav,
} from '@/components/ui'
import { ExpandablePlanRow, ExpandableTaskRow } from '@/components/expandable'
import { projectsApi, plansApi, tasksApi } from '@/services'
import { PlanKanbanBoard } from '@/components/kanban'
import { useViewMode, useConfirmDialog, useLinkDialog, useToast, useSectionObserver, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { milestoneRefreshAtom, planRefreshAtom, taskRefreshAtom, projectRefreshAtom } from '@/atoms'
import type {
  Milestone,
  MilestoneProgress,
  Plan,
  Project,
  Task,
  MilestoneStatus,
  PlanStatus,
  PaginatedResponse,
} from '@/types'

export function ProjectMilestoneDetailPage() {
  const { milestoneId } = useParams<{ milestoneId: string }>()
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()
  const [milestone, setMilestone] = useState<Milestone | null>(null)
  const [progress, setProgress] = useState<MilestoneProgress | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [milestonePlanIds, setMilestonePlanIds] = useState<Set<string>>(new Set())
  const [milestoneTasks, setMilestoneTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useViewMode()
  const confirmDialog = useConfirmDialog()
  const linkDialog = useLinkDialog()
  const toast = useToast()
  const milestoneRefresh = useAtomValue(milestoneRefreshAtom)
  const planRefresh = useAtomValue(planRefreshAtom)
  const taskRefresh = useAtomValue(taskRefreshAtom)
  const projectRefresh = useAtomValue(projectRefreshAtom)
  const [plansExpandAll, setPlansExpandAll] = useState(0)
  const [plansCollapseAll, setPlansCollapseAll] = useState(0)
  const [plansAllExpanded, setPlansAllExpanded] = useState(false)
  const [tasksExpandAll, setTasksExpandAll] = useState(0)
  const [tasksCollapseAll, setTasksCollapseAll] = useState(0)
  const [tasksAllExpanded, setTasksAllExpanded] = useState(false)

  const refreshData = useCallback(async () => {
    if (!milestoneId) return
    // Only show loading spinner on initial load, not on WS-triggered refreshes
    const isInitialLoad = !milestone
    if (isInitialLoad) setLoading(true)
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

            // Backend doesn't return plan_id in milestone tasks, so we need to cross-reference
            // Get task IDs from this milestone
            const milestoneTaskIds = new Set((response.tasks || []).map((t) => t.id))

            if (milestoneTaskIds.size > 0) {
              // Fetch all tasks with plan_id to find which plans these tasks belong to
              const allTasksData = await tasksApi.list({ limit: 100 })
              const planIds = new Set(
                (allTasksData.items || [])
                  .filter((t) => milestoneTaskIds.has(t.id) && t.plan_id)
                  .map((t) => t.plan_id),
              )
              setMilestonePlanIds(planIds)

              // Fetch only plans that have tasks in this milestone
              if (planIds.size > 0) {
                const allPlansData = await plansApi.list({ limit: 100 })
                const milestonePlans = (allPlansData.items || []).filter((plan) =>
                  planIds.has(plan.id),
                )
                setPlans(milestonePlans)
              } else {
                setPlans([])
              }
            } else {
              setMilestonePlanIds(new Set())
              setPlans([])
            }
          }
        } catch {
          // Project lookup failed
        }
      }
    } catch (error) {
      console.error('Failed to fetch milestone:', error)
    } finally {
      if (isInitialLoad) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- milestone is a data object (would cause infinite loop)
  }, [milestoneId, milestoneRefresh, planRefresh, taskRefresh, projectRefresh])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable
    [plans],
  )

  // Kanban fetchFn: fetches plans for this milestone, filters by status
  const kanbanFetchFn = useCallback(
    async (params: Record<string, unknown>): Promise<PaginatedResponse<Plan>> => {
      if (milestonePlanIds.size === 0) return { items: [], total: 0, limit: 0, offset: 0 }
      const status = params.status as string
      const allPlansData = await plansApi.list({ limit: 100 })
      const filtered = (allPlansData.items || []).filter(
        (p) => milestonePlanIds.has(p.id) && p.status === status,
      )
      return { items: filtered, total: filtered.length, limit: filtered.length, offset: 0 }
    },
    [milestonePlanIds],
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
                  navigate(workspacePath(wsSlug, project ? `/projects/${project.slug}` : '/projects'))
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
              <div className="flex items-center gap-2">
                <CardTitle>Plans ({plans.length})</CardTitle>
                {plans.length > 0 && viewMode === 'list' && (
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
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {plansAllExpanded ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4-4 4 4M4 10l4-4 4 4" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8l4 4 4-4M4 14l4 4 4-4" />
                      )}
                    </svg>
                  </button>
                )}
              </div>
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
                onPlanClick={(planId) => navigate(workspacePath(wsSlug, `/plans/${planId}`))}
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
                    refreshTrigger={taskRefresh}
                    expandAllSignal={plansExpandAll}
                    collapseAllSignal={plansCollapseAll}
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
              <div className="flex items-center gap-2">
                <CardTitle>Tasks ({milestoneTasks.length})</CardTitle>
                {milestoneTasks.length > 0 && (
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
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {tasksAllExpanded ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4-4 4 4M4 10l4-4 4 4" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8l4 4 4-4M4 14l4 4 4-4" />
                      )}
                    </svg>
                  </button>
                )}
              </div>
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
                  <ExpandableTaskRow key={task.id} task={task} refreshTrigger={taskRefresh} expandAllSignal={tasksExpandAll} collapseAllSignal={tasksCollapseAll} />
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
