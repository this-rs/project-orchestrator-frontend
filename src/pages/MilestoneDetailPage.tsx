import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { Card, CardHeader, CardTitle, CardContent, LoadingPage, Badge, Button, ConfirmDialog, LinkEntityDialog, ProgressBar, ViewToggle, PageHeader, StatusSelect, SectionNav } from '@/components/ui'
import { ExpandablePlanRow, ExpandableTaskRow } from '@/components/expandable'
import { api, workspacesApi, plansApi, tasksApi } from '@/services'
import { PlanKanbanBoard } from '@/components/kanban'
import { useViewMode, useConfirmDialog, useLinkDialog, useToast, useSectionObserver } from '@/hooks'
import { milestoneRefreshAtom, planRefreshAtom, taskRefreshAtom, projectRefreshAtom } from '@/atoms'
import type { WorkspaceMilestone, MilestoneProgress, Plan, Project, Task, MilestoneStatus, PlanStatus, PaginatedResponse } from '@/types'

export function MilestoneDetailPage() {
  const { milestoneId } = useParams<{ milestoneId: string }>()
  const navigate = useNavigate()
  const [milestone, setMilestone] = useState<WorkspaceMilestone | null>(null)
  const [progress, setProgress] = useState<MilestoneProgress | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
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
  const projectRefresh = useAtomValue(projectRefreshAtom)

  useEffect(() => {
    async function fetchData() {
      if (!milestoneId) return
      // Only show loading spinner on initial load, not on WS-triggered refreshes
      const isInitialLoad = !milestone
      if (isInitialLoad) setLoading(true)
      try {
        const [milestoneData, progressData] = await Promise.all([
          workspacesApi.getMilestone(milestoneId),
          workspacesApi.getMilestoneProgress(milestoneId).catch(() => null),
        ])

        setMilestone(milestoneData)
        setProgress(progressData)

        if (milestoneData.workspace_id) {
          const workspacesData = await workspacesApi.list()
          const workspace = (workspacesData.items || []).find(w => w.id === milestoneData.workspace_id)

          if (workspace) {
            const projectsResponse = await workspacesApi.listProjects(workspace.slug)
            const workspaceProjects = Array.isArray(projectsResponse)
              ? projectsResponse
              : (projectsResponse.items || [])
            setProjects(workspaceProjects as Project[])

            // Fetch plans per project via /projects/{slug}/plans (returns Plan[])
            // The global /plans listing doesn't include project_id, so we use per-project endpoints
            const planResults = await Promise.all(
              (workspaceProjects as Project[]).map(p =>
                api.get<Plan[]>(`/projects/${p.slug}/plans`).catch(() => [] as Plan[])
              )
            )
            const allPlans = planResults.flat()
            // Deduplicate by id
            const seenPlan = new Set<string>()
            const uniquePlans = allPlans.filter(p => {
              if (seenPlan.has(p.id)) return false
              seenPlan.add(p.id)
              return true
            })
            setPlans(uniquePlans)

            // Fetch tasks via plans (backend has no GET for milestone tasks)
            const planIds = uniquePlans.map(p => p.id)
            if (planIds.length > 0) {
              const taskResults = await Promise.all(
                planIds.map(pid => tasksApi.list({ plan_id: pid, limit: 100 }))
              )
              const allTasks = taskResults.flatMap(r => r.items || [])
              const seenTask = new Set<string>()
              const uniqueTasks = allTasks.filter(t => {
                if (seenTask.has(t.id)) return false
                seenTask.add(t.id)
                return true
              })
              setMilestoneTasks(uniqueTasks)
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch milestone:', error)
      } finally {
        if (isInitialLoad) setLoading(false)
      }
    }
    fetchData()
  }, [milestoneId, milestoneRefresh, planRefresh, taskRefresh, projectRefresh])

  // Helper: fetch tasks via workspace plans (no GET endpoint for milestone tasks)
  const refreshTasksFromPlans = useCallback(async (workspacePlans: Plan[]) => {
    const planIds = workspacePlans.map(p => p.id)
    if (planIds.length === 0) { setMilestoneTasks([]); return }
    const taskResults = await Promise.all(
      planIds.map(pid => tasksApi.list({ plan_id: pid, limit: 100 }))
    )
    const allTasks = taskResults.flatMap(r => r.items || [])
    const seen = new Set<string>()
    const uniqueTasks = allTasks.filter(t => {
      if (seen.has(t.id)) return false
      seen.add(t.id)
      return true
    })
    setMilestoneTasks(uniqueTasks)
  }, [])

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

  // Kanban fetchFn: fetches plans per project via /projects/{slug}/plans, then filters by status
  const projectSlugs = useMemo(() => projects.map((p) => p.slug), [projects])

  const kanbanFetchFn = useCallback(
    async (params: Record<string, unknown>): Promise<PaginatedResponse<Plan>> => {
      const status = params.status as string
      // Fetch all plans from each project endpoint (returns full Plan[] with project_id)
      const results = await Promise.all(
        projectSlugs.map(slug =>
          api.get<Plan[]>(`/projects/${slug}/plans`).catch(() => [] as Plan[])
        )
      )
      const allPlans = results.flat()
      // Deduplicate and filter by status
      const seen = new Set<string>()
      const filtered = allPlans.filter(p => {
        if (seen.has(p.id)) return false
        seen.add(p.id)
        return p.status === status
      })
      return { items: filtered, total: filtered.length, limit: filtered.length, offset: 0 }
    },
    [projectSlugs],
  )

  const sectionIds = ['progress', 'plans', 'tasks', 'projects']
  const activeSection = useSectionObserver(sectionIds)

  if (loading || !milestone) return <LoadingPage />

  const tags = milestone.tags || []
  const sections = [
    { id: 'progress', label: 'Progress' },
    { id: 'plans', label: 'Plans', count: plans.length },
    { id: 'tasks', label: 'Tasks', count: milestoneTasks.length },
    { id: 'projects', label: 'Projects', count: projects.length },
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
              await workspacesApi.updateMilestone(milestone.id, { status: newStatus })
              setMilestone({ ...milestone, status: newStatus })
              toast.success('Status updated')
            }}
          />
        }
        metadata={[
          { label: 'Created', value: new Date(milestone.created_at).toLocaleDateString() },
          ...(milestone.target_date ? [{ label: 'Target', value: new Date(milestone.target_date).toLocaleDateString() }] : []),
          ...(milestone.closed_at ? [{ label: 'Closed', value: new Date(milestone.closed_at).toLocaleDateString() }] : []),
        ]}
        overflowActions={[
          { label: 'Delete', variant: 'danger', onClick: () => confirmDialog.open({
            title: 'Delete Milestone',
            description: 'This will permanently delete this milestone. Tasks linked to it will not be deleted.',
            onConfirm: async () => { await workspacesApi.deleteMilestone(milestone.id); toast.success('Milestone deleted'); navigate('/milestones') }
          }) }
        ]}
      >
        {tags.length > 0 && (
          <div className="flex gap-1">
            {tags.map((tag, index) => (
              <Badge key={`${tag}-${index}`} variant="default">{tag}</Badge>
            ))}
          </div>
        )}
      </PageHeader>

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
                <div className="text-2xl font-bold text-gray-400">{progress.total - progress.completed}</div>
                <div className="text-xs text-gray-500">Remaining</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      </section>

      {/* Plans section with view toggle */}
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
            <p className="text-gray-500 text-sm">No plans for projects in this workspace</p>
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
                    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, status: newStatus } : p))
                    toast.success('Status updated')
                  }}
                  refreshTrigger={taskRefresh}
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
            <Button size="sm" onClick={() => linkDialog.open({
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
                await workspacesApi.addTaskToMilestone(milestoneId!, taskId)
                await refreshTasksFromPlans(plans)
                const newProgress = await workspacesApi.getMilestoneProgress(milestoneId!).catch(() => null)
                setProgress(newProgress)
                toast.success('Task added')
              },
            })}>Add Task</Button>
          </div>
        </CardHeader>
        <CardContent>
          {milestoneTasks.length === 0 ? (
            <p className="text-gray-500 text-sm">No tasks linked to this milestone</p>
          ) : (
            <div className="space-y-2">
              {milestoneTasks.map((task) => (
                <ExpandableTaskRow key={task.id} task={task} refreshTrigger={taskRefresh} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </section>

      {/* Projects (always visible) */}
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
              {projects.map((project) => (
                <Link
                  key={project.id}
                  to={`/projects/${project.slug}`}
                  className="flex items-center justify-between p-3 bg-white/[0.06] rounded-lg hover:bg-white/[0.06] transition-colors"
                >
                  <span className="font-medium text-gray-200">{project.name}</span>
                  <span className="text-xs text-gray-500">{project.slug}</span>
                </Link>
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
