import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { ClipboardList, Flag, FolderKanban, GitCommitHorizontal, Pencil } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, LoadingPage, ErrorState, Badge, Button, ConfirmDialog, FormDialog, LinkEntityDialog, TaskStatusBadge, InteractiveStepStatusBadge, InteractiveDecisionStatusBadge, ProgressBar, PageHeader, StatusSelect, TabLayout, ViewToggle } from '@/components/ui'
import type { ParentLink } from '@/components/ui/PageHeader'
import { tasksApi, plansApi, projectsApi, workspacesApi, decisionsApi } from '@/services'
import { useConfirmDialog, useFormDialog, useLinkDialog, useToast, useWorkspaceSlug, useViewTransition, useViewMode } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { taskRefreshAtom, projectRefreshAtom, planRefreshAtom } from '@/atoms'
import { CreateStepForm, CreateDecisionForm, EditTaskForm, EditStepForm } from '@/components/forms'
import { CommitList } from '@/components/commits'
import { UniversalKanban, createStepKanbanConfig } from '@/components/kanban'
import type { Task, Step, Decision, Commit, TaskStatus, StepStatus, DecisionStatus, Project } from '@/types'

// The API response structure
interface TaskApiResponse {
  task: Task
  steps: Step[]
  decisions: Decision[]
  depends_on: string[]
  modifies_files: string[]
}

// Router state passed from referring pages (PlanDetailPage, TasksPage, etc.)
interface TaskLocationState {
  planId?: string
  planTitle?: string
  projectId?: string
  projectSlug?: string
  projectName?: string
}

export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const { navigate } = useViewTransition()
  const location = useLocation()
  const wsSlug = useWorkspaceSlug()
  const confirmDialog = useConfirmDialog()
  const editTaskDialog = useFormDialog()
  const editStepDialog = useFormDialog()
  const stepFormDialog = useFormDialog()
  const [editingStep, setEditingStep] = useState<Step | null>(null)
  const decisionFormDialog = useFormDialog()
  const commitFormDialog = useFormDialog()
  const linkDialog = useLinkDialog()
  const toast = useToast()
  const taskRefresh = useAtomValue(taskRefreshAtom)
  const projectRefresh = useAtomValue(projectRefreshAtom)
  const planRefresh = useAtomValue(planRefreshAtom)
  const [task, setTask] = useState<Task | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [blockers, setBlockers] = useState<Task[]>([])
  const [blocking, setBlocking] = useState<Task[]>([])
  const [commits, setCommits] = useState<Commit[]>([])
  const [commitShaInput, setCommitShaInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('steps')

  // Parent resolution state
  const [parentPlanId, setParentPlanId] = useState<string | null>(null)
  const [parentPlanTitle, setParentPlanTitle] = useState<string | null>(null)
  const [parentProject, setParentProject] = useState<Project | null>(null)
  const [parentMilestone, setParentMilestone] = useState<{ id: string; title: string; type: 'workspace' | 'project' } | null>(null)

  const fetchData = useCallback(async () => {
    if (!taskId) return
    setError(null)
    // Only show loading spinner on initial load, not on WS-triggered refreshes
    const isInitialLoad = !task
    if (isInitialLoad) setLoading(true)
    try {
        // The API returns { task, steps, decisions, depends_on, modifies_files }
        const response = await tasksApi.get(taskId) as unknown as TaskApiResponse

        // Handle both nested and flat response structures
        const taskData = response.task || response
        setTask(taskData)
        setDecisions(response.decisions || [])

        // Fetch steps via dedicated endpoint (task.steps can have stale statuses)
        // Also fetch blockers, blocking, and commits in parallel
        const [stepsData, blockersData, blockingData, commitsData] = await Promise.all([
          tasksApi.listSteps(taskId).catch(() => [] as Step[]),
          tasksApi.getBlockers(taskId).catch(() => ({ items: [] })),
          tasksApi.getBlocking(taskId).catch(() => ({ items: [] })),
          tasksApi.getCommits(taskId).catch(() => ({ items: [] })),
        ])
        setSteps(stepsData)
        setBlockers(blockersData.items || [])
        setBlocking(blockingData.items || [])
        setCommits(commitsData.items || [])
      } catch (error) {
      console.error('Failed to fetch task:', error)
      setError('Failed to load task')
    } finally {
      if (isInitialLoad) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- task is a data object (would cause infinite loop)
  }, [taskId, taskRefresh, projectRefresh, planRefresh])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Resolve parent plan & project
  useEffect(() => {
    if (!taskId) return
    const state = location.state as TaskLocationState | null
    const controller = new AbortController()

    async function resolveParents() {
      // 1. Resolve plan — fast-path from Router state, fallback via task list
      let planId = state?.planId ?? null
      let planTitle = state?.planTitle ?? null

      if (!planId) {
        try {
          const allTasks = await tasksApi.list({ limit: 100, workspace_slug: wsSlug })
          const match = (allTasks.items || []).find((t) => t.id === taskId)
          if (match && 'plan_id' in match) {
            planId = (match as { plan_id?: string }).plan_id ?? null
            planTitle = (match as { plan_title?: string }).plan_title ?? null
          }
        } catch { /* graceful degradation */ }
      }

      if (controller.signal.aborted) return
      setParentPlanId(planId)
      setParentPlanTitle(planTitle)

      // 2. Resolve project — fast-path from state, fallback via plan detail
      let project: Project | null = null

      if (state?.projectSlug && state?.projectName) {
        project = { slug: state.projectSlug, name: state.projectName } as Project
      } else if (planId) {
        try {
          const planResponse = await plansApi.get(planId)
          const planData = (planResponse as unknown as { plan?: { project_id?: string } }).plan || planResponse
          if (planData.project_id) {
            const allProjects = await projectsApi.list()
            project = (allProjects.items || []).find((p) => p.id === planData.project_id) ?? null
          }
        } catch { /* graceful degradation */ }
      }

      if (controller.signal.aborted) return
      setParentProject(project)

      // 3. Resolve milestone — find if this plan belongs to a milestone
      if (planId) {
        try {
          // Check workspace milestones
          const wsMilestones = await workspacesApi.listMilestones(wsSlug, { limit: 100 })
          for (const ms of wsMilestones.items || []) {
            try {
              const detail = await workspacesApi.getMilestone(ms.id)
              if (Array.isArray(detail.plans) && detail.plans.some((p: { id: string }) => p.id === planId)) {
                if (!controller.signal.aborted) {
                  setParentMilestone({ id: detail.id, title: detail.title, type: 'workspace' })
                }
                return
              }
            } catch { /* skip */ }
          }

          // Check project milestones
          const planData = (await plansApi.get(planId)) as unknown as { plan?: { project_id?: string } }
          const projId = planData.plan?.project_id || (planData as unknown as { project_id?: string }).project_id
          if (projId) {
            try {
              const projMilestones = await projectsApi.listMilestones(projId, { limit: 100 })
              for (const ms of projMilestones.items || []) {
                try {
                  const detail = await projectsApi.getMilestone(ms.id)
                  if (Array.isArray(detail.plans) && detail.plans.some((p: { id: string }) => p.id === planId)) {
                    if (!controller.signal.aborted) {
                      setParentMilestone({ id: detail.milestone.id, title: detail.milestone.title, type: 'project' })
                    }
                    return
                  }
                } catch { /* skip */ }
              }
            } catch { /* graceful degradation */ }
          }
        } catch { /* graceful degradation */ }
      }
    }

    resolveParents()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount + when taskId changes
  }, [taskId, wsSlug])

  const stepForm = CreateStepForm({
    onSubmit: async (data) => {
      if (!taskId) return
      const newStep = await tasksApi.addStep(taskId, data)
      setSteps((prev) => [...prev, newStep])
      toast.success('Step added')
    },
  })

  const decisionForm = CreateDecisionForm({
    onSubmit: async (data) => {
      if (!taskId) return
      const newDecision = await tasksApi.addDecision(taskId, data)
      setDecisions((prev) => [...prev, newDecision])
      toast.success('Decision added')
    },
  })

  const handleDecisionStatusChange = async (decision: Decision, newStatus: DecisionStatus) => {
    try {
      await decisionsApi.update(decision.id, { status: newStatus })
      setDecisions((prev) => prev.map((d) => (d.id === decision.id ? { ...d, status: newStatus } : d)))
      toast.success(`Decision status → ${newStatus}`)
    } catch {
      toast.error('Failed to update decision status')
    }
  }

  const handleDeleteDecision = (decision: Decision) => {
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

  const [stepsViewMode, setStepsViewMode] = useViewMode()

  // Step kanban config — wraps local steps data as a fetchFn
  const stepFetchFn = useCallback(
    async (params: Record<string, unknown>) => {
      const status = params.status as string
      const items = steps.filter((s) => s.status === status)
      return { items, total: items.length, limit: 100, offset: 0 }
    },
    [steps],
  )

  const handleStepStatusChange = useCallback(
    async (stepId: string, newStatus: string) => {
      await tasksApi.updateStep(stepId, { status: newStatus })
      setSteps((prev) => prev.map((s) => s.id === stepId ? { ...s, status: newStatus as StepStatus } : s))
    },
    [],
  )

  const stepKanbanConfig = useMemo(
    () =>
      createStepKanbanConfig({
        fetchFn: stepFetchFn,
        onStatusChange: handleStepStatusChange,
      }),
    [stepFetchFn, handleStepStatusChange],
  )

  const stepKanbanRefreshKey = useMemo(() => steps.length + steps.reduce((acc, s) => acc + s.status, '').length, [steps])

  const editStepForm = EditStepForm({
    initialValues: { description: editingStep?.description ?? '', verification: editingStep?.verification },
    onSubmit: async (data) => {
      if (!editingStep) return
      await tasksApi.updateStep(editingStep.id, data)
      setSteps(prev => prev.map(s => s.id === editingStep.id ? { ...s, ...data } : s))
      toast.success('Step updated')
    },
  })

  const editTaskForm = EditTaskForm({
    initialValues: { title: task?.title, description: task?.description, priority: task?.priority, estimated_complexity: task?.estimated_complexity, tags: task?.tags },
    onSubmit: async (data) => {
      if (!task) return
      await tasksApi.update(task.id, data)
      setTask({ ...task, ...data })
      toast.success('Task updated')
    },
  })

  if (error) return <ErrorState title="Failed to load" description={error} onRetry={fetchData} />
  if (loading || !task) return <LoadingPage />

  // Use state variables for arrays
  const tags = task.tags || []
  const acceptanceCriteria = task.acceptance_criteria || []
  const affectedFiles = task.affected_files || []

  const completedSteps = steps.filter((s) => s.status === 'completed').length
  const stepProgress = steps.length > 0 ? (completedSteps / steps.length) * 100 : 0

  // Tab definitions
  const tabs = [
    { id: 'steps', label: 'Steps', count: steps.length },
    { id: 'dependencies', label: 'Dependencies', count: blockers.length + blocking.length },
    { id: 'artefacts', label: 'Artefacts', count: decisions.length + commits.length },
  ]

  // Build parent links for navigation — ascending: milestone → project → plan
  const parentLinks: ParentLink[] = []
  if (parentMilestone) {
    const msPath = parentMilestone.type === 'project'
      ? `/project-milestones/${parentMilestone.id}`
      : `/milestones/${parentMilestone.id}`
    parentLinks.push({
      icon: Flag,
      label: parentMilestone.type === 'project' ? 'Project Milestone' : 'Milestone',
      name: parentMilestone.title,
      href: workspacePath(wsSlug, msPath),
    })
  }
  if (parentProject) {
    parentLinks.push({
      icon: FolderKanban,
      label: 'Project',
      name: parentProject.name,
      href: workspacePath(wsSlug, `/projects/${parentProject.slug}`),
    })
  }
  if (parentPlanId && parentPlanTitle) {
    parentLinks.push({
      icon: ClipboardList,
      label: 'Plan',
      name: parentPlanTitle,
      href: workspacePath(wsSlug, `/plans/${parentPlanId}`),
    })
  }

  return (
    <div className="pt-6 space-y-6">
      <PageHeader
        title={task.title || 'Task'}
        viewTransitionName={`task-title-${task.id}`}
        description={task.description}
        parentLinks={parentLinks.length > 0 ? parentLinks : undefined}
        status={
          <StatusSelect
            status={task.status}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'blocked', label: 'Blocked' },
              { value: 'completed', label: 'Completed' },
              { value: 'failed', label: 'Failed' },
            ]}
            colorMap={{
              pending: { bg: 'bg-white/[0.08]', text: 'text-gray-200', dot: 'bg-gray-400' },
              in_progress: { bg: 'bg-blue-900/50', text: 'text-blue-400', dot: 'bg-blue-400' },
              blocked: { bg: 'bg-yellow-900/50', text: 'text-yellow-400', dot: 'bg-yellow-400' },
              completed: { bg: 'bg-green-900/50', text: 'text-green-400', dot: 'bg-green-400' },
              failed: { bg: 'bg-red-900/50', text: 'text-red-400', dot: 'bg-red-400' },
            }}
            onStatusChange={async (newStatus: TaskStatus) => {
              await tasksApi.update(task.id, { status: newStatus })
              setTask({ ...task, status: newStatus })
              toast.success('Status updated')
            }}
          />
        }
        metadata={[
          ...(task.priority !== undefined ? [{ label: 'Priority', value: String(task.priority) }] : []),
          ...(task.assigned_to ? [{ label: 'Assigned to', value: task.assigned_to }] : []),
          ...(task.estimated_complexity ? [{ label: 'Est. complexity', value: String(task.estimated_complexity) }] : []),
          ...(task.actual_complexity ? [{ label: 'Actual complexity', value: String(task.actual_complexity) }] : []),
        ]}
        actions={
          tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag, index) => (
                <Badge key={`${tag}-${index}`}>{tag}</Badge>
              ))}
            </div>
          ) : undefined
        }
        overflowActions={[
          { label: 'Edit', onClick: () => editTaskDialog.open({ title: 'Edit Task' }) },
          { label: 'Delete', variant: 'danger', onClick: () => confirmDialog.open({
            title: 'Delete Task',
            description: 'This will permanently delete this task and all its steps and decisions.',
            onConfirm: async () => {
              await tasksApi.delete(task.id)
              toast.success('Task deleted')
              // Navigate to parent plan if known, otherwise task list
              const target = parentPlanId
                ? workspacePath(wsSlug, `/plans/${parentPlanId}`)
                : workspacePath(wsSlug, '/tasks')
              navigate(target, { type: 'back-button' })
            }
          }) }
        ]}
      />

      {/* Affected files — compact chips under header */}
      {affectedFiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-500 mr-1">Files:</span>
          {affectedFiles.map((file, index) => (
            <button
              key={`${file}-${index}`}
              onClick={() => navigate(workspacePath(wsSlug, `/code?file=${encodeURIComponent(file)}`), { type: 'card-click' })}
              className="inline-flex items-center bg-white/[0.06] border border-white/[0.08] rounded-full px-2 py-0.5 text-[11px] font-mono text-gray-400 hover:bg-white/[0.10] hover:text-gray-200 hover:border-white/[0.14] transition-colors truncate max-w-[240px]"
              title={file}
            >
              {file.split('/').pop()}
            </button>
          ))}
        </div>
      )}

      {/* Tabbed body: Steps | Dependencies | Artefacts */}
      <TabLayout
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {/* Tab: Steps */}
        {activeTab === 'steps' && (
          <div className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Steps ({steps.length})</CardTitle>
                  <div className="flex items-center gap-2">
                    {steps.length > 0 && (
                      <span className="text-sm text-gray-400">{completedSteps}/{steps.length} completed</span>
                    )}
                    <Button size="sm" onClick={() => stepFormDialog.open({ title: 'Add Step' })}>Add Step</Button>
                    <ViewToggle value={stepsViewMode} onChange={setStepsViewMode} />
                  </div>
                </div>
                {steps.length > 0 && <ProgressBar value={stepProgress} size="sm" className="mt-2" />}
              </CardHeader>
              <CardContent>
                {steps.length === 0 ? (
                  <p className="text-gray-500 text-sm">No steps defined</p>
                ) : stepsViewMode === 'kanban' ? (
                  <UniversalKanban
                    config={stepKanbanConfig}
                    refreshTrigger={stepKanbanRefreshKey}
                  />
                ) : (
                  <div className="space-y-2">
                    {steps.map((step, index) => (
                      <StepRow
                        key={step.id || index}
                        step={step}
                        index={index}
                        onStatusChange={async (newStatus) => {
                          await tasksApi.updateStep(step.id, { status: newStatus })
                          setSteps(prev => prev.map(s => s.id === step.id ? { ...s, status: newStatus } : s))
                          toast.success('Step status updated')
                        }}
                        onEdit={() => {
                          setEditingStep(step)
                          editStepDialog.open({ title: 'Edit Step' })
                        }}
                        onDelete={async () => {
                          await tasksApi.deleteStep(step.id)
                          setSteps(prev => prev.filter(s => s.id !== step.id))
                          toast.success('Step deleted')
                        }}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Acceptance Criteria — inside Steps tab */}
            {acceptanceCriteria.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Acceptance Criteria</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {acceptanceCriteria.map((criterion, index) => (
                      <li key={index} className="flex items-start gap-2 text-gray-300">
                        <span className="text-indigo-400 mt-0.5 shrink-0">•</span>
                        <span className="break-words min-w-0">{criterion}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Tab: Dependencies */}
        {activeTab === 'dependencies' && (
          <div className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Blocked By ({blockers.length})</CardTitle>
                    <Button size="sm" onClick={() => linkDialog.open({
                      title: 'Add Dependency',
                      submitLabel: 'Add',
                      fetchOptions: async () => {
                        const data = await tasksApi.list({ limit: 100 })
                        const existingIds = new Set([taskId, ...blockers.map(b => b.id)])
                        return (data.items || [])
                          .filter(t => !existingIds.has(t.id))
                          .map(t => ({ value: t.id, label: t.title || t.description || 'Untitled', description: t.status }))
                      },
                      onLink: async (depId) => {
                        await tasksApi.addDependencies(taskId!, [depId])
                        const blockersData = await tasksApi.getBlockers(taskId!).catch(() => ({ items: [] }))
                        setBlockers(blockersData.items || [])
                        toast.success('Dependency added')
                      },
                    })}>Add</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {blockers.length === 0 ? (
                    <p className="text-gray-500 text-sm">No blockers</p>
                  ) : (
                    <div className="space-y-2">
                      {blockers.map((blocker) => (
                        <div key={blocker.id} className="flex items-center justify-between gap-2 p-2 bg-white/[0.06] rounded">
                          <Link to={workspacePath(wsSlug, `/tasks/${blocker.id}`)} className="text-gray-200 truncate min-w-0 hover:text-indigo-400 transition-colors">
                            {blocker.title || blocker.description}
                          </Link>
                          <div className="flex items-center gap-2 shrink-0">
                            <TaskStatusBadge status={blocker.status} />
                            <button
                              onClick={async () => {
                                await tasksApi.removeDependency(taskId!, blocker.id)
                                setBlockers(prev => prev.filter(b => b.id !== blocker.id))
                                toast.success('Dependency removed')
                              }}
                              className="text-gray-500 hover:text-red-400 text-sm px-1"
                              title="Remove dependency"
                            >
                              &times;
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Blocking ({blocking.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {blocking.length === 0 ? (
                    <p className="text-gray-500 text-sm">Not blocking any tasks</p>
                  ) : (
                    <div className="space-y-2">
                      {blocking.map((blocked) => (
                        <div key={blocked.id} className="flex items-center justify-between gap-2 p-2 bg-white/[0.06] rounded">
                          <Link to={workspacePath(wsSlug, `/tasks/${blocked.id}`)} className="text-gray-200 truncate min-w-0 hover:text-indigo-400 transition-colors">
                            {blocked.title || blocked.description}
                          </Link>
                          <TaskStatusBadge status={blocked.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Tab: Artefacts (Decisions + Commits) */}
        {activeTab === 'artefacts' && (
          <div className="space-y-4 pt-4">
            {/* Decisions */}
            <Card>
              <CardHeader>
                <CardTitle>Decisions ({decisions.length})</CardTitle>
                <Button size="sm" onClick={() => decisionFormDialog.open({ title: 'Add Decision', size: 'lg' })}>Add Decision</Button>
              </CardHeader>
              <CardContent>
                {decisions.length === 0 ? (
                  <p className="text-gray-500 text-sm">No decisions recorded</p>
                ) : (
                  <div className="space-y-2">
                    {decisions.map((decision) => (
                      <DecisionRow
                        key={decision.id}
                        decision={decision}
                        wsSlug={wsSlug}
                        onStatusChange={(status) => handleDecisionStatusChange(decision, status)}
                        onDelete={() => handleDeleteDecision(decision)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

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
                  <p className="text-sm text-gray-500 py-4 text-center">No commits linked to this task yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </TabLayout>

      <FormDialog {...editStepDialog.dialogProps} onSubmit={editStepForm.submit}>
        {editStepForm.fields}
      </FormDialog>
      <FormDialog {...editTaskDialog.dialogProps} onSubmit={editTaskForm.submit}>
        {editTaskForm.fields}
      </FormDialog>
      <FormDialog {...stepFormDialog.dialogProps} onSubmit={stepForm.submit}>
        {stepForm.fields}
      </FormDialog>
      <FormDialog {...decisionFormDialog.dialogProps} onSubmit={decisionForm.submit}>
        {decisionForm.fields}
      </FormDialog>
      <FormDialog
        {...commitFormDialog.dialogProps}
        onSubmit={async () => {
          const sha = commitShaInput.trim()
          if (!sha || !taskId) return false
          await tasksApi.linkCommit(taskId, sha)
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
          <p className="text-xs text-gray-500">Enter a 7–40 character hex commit hash to link to this task.</p>
        </div>
      </FormDialog>
      <LinkEntityDialog {...linkDialog.dialogProps} />
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </div>
  )
}

function StepRow({
  step,
  index,
  onStatusChange,
  onEdit,
  onDelete,
}: {
  step: Step
  index: number
  onStatusChange: (status: StepStatus) => Promise<void>
  onEdit: () => void
  onDelete: () => void
}) {
  const statusColors: Record<string, string> = {
    pending: 'bg-white/[0.15]',
    in_progress: 'bg-blue-600',
    completed: 'bg-green-600',
    skipped: 'bg-yellow-600',
  }

  return (
    <div className="flex items-start gap-3 p-3 bg-white/[0.06] rounded-lg">
      <div className={`w-6 h-6 rounded-full shrink-0 ${statusColors[step.status]} flex items-center justify-center text-xs font-medium text-white`}>
        {step.status === 'completed' ? '✓' : index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-gray-200 break-words">{step.description}</p>
        {step.verification && (
          <p className="text-xs text-gray-500 mt-1 break-words">Verification: {step.verification}</p>
        )}
      </div>
      <InteractiveStepStatusBadge
        status={step.status}
        onStatusChange={onStatusChange}
      />
      <button
        onClick={onEdit}
        className="text-gray-500 hover:text-indigo-400 text-sm px-1"
        title="Edit step"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onDelete}
        className="text-gray-500 hover:text-red-400 text-sm px-1"
        title="Delete step"
      >
        &times;
      </button>
    </div>
  )
}

interface DecisionRowProps {
  decision: Decision
  wsSlug: string
  onStatusChange: (status: DecisionStatus) => Promise<void>
  onDelete: () => void
}

function DecisionRow({ decision, wsSlug, onStatusChange, onDelete }: DecisionRowProps) {
  const alternatives = decision.alternatives || []
  return (
    <Link
      to={workspacePath(wsSlug, `/decisions/${decision.id}`)}
      className="block p-3 bg-white/[0.06] rounded-lg overflow-hidden hover:bg-white/[0.09] transition-colors group/dec"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-200 mb-1 break-words line-clamp-2">{decision.description}</p>
          {decision.rationale && (
            <p className="text-sm text-gray-400 mb-2 break-words line-clamp-2">{decision.rationale}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {decision.chosen_option && (
              <Badge variant="success">Chosen: {decision.chosen_option}</Badge>
            )}
            {alternatives.length > 0 && (
              <span className="text-xs text-gray-500">
                {alternatives.length} alternative{alternatives.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.preventDefault()}>
          <InteractiveDecisionStatusBadge status={decision.status} onStatusChange={onStatusChange} />
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDelete()
            }}
            className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover/dec:opacity-100 transition-all"
            title="Delete decision"
          >
            &times;
          </button>
        </div>
      </div>
    </Link>
  )
}
