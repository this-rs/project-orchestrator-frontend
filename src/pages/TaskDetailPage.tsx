import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { ClipboardList, FolderKanban } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, LoadingPage, ErrorState, Badge, Button, ConfirmDialog, FormDialog, LinkEntityDialog, TaskStatusBadge, InteractiveStepStatusBadge, ProgressBar, PageHeader, StatusSelect, SectionNav } from '@/components/ui'
import type { ParentLink } from '@/components/ui/PageHeader'
import { tasksApi, plansApi, projectsApi } from '@/services'
import { useConfirmDialog, useFormDialog, useLinkDialog, useToast, useSectionObserver, useWorkspaceSlug, useViewTransition } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { taskRefreshAtom, projectRefreshAtom, planRefreshAtom } from '@/atoms'
import { CreateStepForm, CreateDecisionForm } from '@/components/forms'
import type { Task, Step, Decision, Commit, TaskStatus, StepStatus, Project } from '@/types'

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
  const stepFormDialog = useFormDialog()
  const decisionFormDialog = useFormDialog()
  const linkDialog = useLinkDialog()
  const toast = useToast()
  const taskRefresh = useAtomValue(taskRefreshAtom)
  const projectRefresh = useAtomValue(projectRefreshAtom)
  const planRefresh = useAtomValue(planRefreshAtom)
  const [formLoading, setFormLoading] = useState(false)
  const [task, setTask] = useState<Task | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [blockers, setBlockers] = useState<Task[]>([])
  const [blocking, setBlocking] = useState<Task[]>([])
  const [commits, setCommits] = useState<Commit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Parent resolution state
  const [parentPlanId, setParentPlanId] = useState<string | null>(null)
  const [parentPlanTitle, setParentPlanTitle] = useState<string | null>(null)
  const [parentProject, setParentProject] = useState<Project | null>(null)

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
        setSteps(response.steps || [])
        setDecisions(response.decisions || [])

        // Fetch blockers and blocking separately
        const [blockersData, blockingData, commitsData] = await Promise.all([
          tasksApi.getBlockers(taskId).catch(() => ({ items: [] })),
          tasksApi.getBlocking(taskId).catch(() => ({ items: [] })),
          tasksApi.getCommits(taskId).catch(() => ({ items: [] })),
        ])
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
    }

    resolveParents()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount + when taskId changes
  }, [taskId, wsSlug])

  const stepForm = CreateStepForm({
    onSubmit: async (data) => {
      if (!taskId) return
      setFormLoading(true)
      try {
        const newStep = await tasksApi.addStep(taskId, data)
        setSteps((prev) => [...prev, newStep])
        stepFormDialog.close()
        toast.success('Step added')
      } finally {
        setFormLoading(false)
      }
    },
    loading: formLoading,
  })

  const decisionForm = CreateDecisionForm({
    onSubmit: async (data) => {
      if (!taskId) return
      setFormLoading(true)
      try {
        const newDecision = await tasksApi.addDecision(taskId, data)
        setDecisions((prev) => [...prev, newDecision])
        decisionFormDialog.close()
        toast.success('Decision added')
      } finally {
        setFormLoading(false)
      }
    },
    loading: formLoading,
  })

  const sectionIds = ['steps', 'dependencies', 'decisions']
  const activeSection = useSectionObserver(sectionIds)

  if (error) return <ErrorState title="Failed to load" description={error} onRetry={fetchData} />
  if (loading || !task) return <LoadingPage />

  // Use state variables for arrays
  const tags = task.tags || []
  const acceptanceCriteria = task.acceptance_criteria || []
  const affectedFiles = task.affected_files || []

  const completedSteps = steps.filter((s) => s.status === 'completed').length
  const stepProgress = steps.length > 0 ? (completedSteps / steps.length) * 100 : 0

  const sections = [
    { id: 'steps', label: 'Steps', count: steps.length },
    { id: 'dependencies', label: 'Dependencies', count: blockers.length + blocking.length },
    { id: 'decisions', label: 'Decisions', count: decisions.length },
  ]

  // Build parent links for navigation
  const parentLinks: ParentLink[] = []
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
        overflowActions={[
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
      >
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag, index) => (
              <Badge key={`${tag}-${index}`}>{tag}</Badge>
            ))}
          </div>
        )}
      </PageHeader>

      <SectionNav sections={sections} activeSection={activeSection} />

      {/* Steps */}
      <section id="steps" className="scroll-mt-20">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Steps ({steps.length})</CardTitle>
            <div className="flex items-center gap-2">
              {steps.length > 0 && (
                <span className="text-sm text-gray-400">{completedSteps}/{steps.length} completed</span>
              )}
              <Button size="sm" onClick={() => stepFormDialog.open({ title: 'Add Step' })}>Add Step</Button>
            </div>
          </div>
          {steps.length > 0 && <ProgressBar value={stepProgress} size="sm" className="mt-2" />}
        </CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <p className="text-gray-500 text-sm">No steps defined</p>
          ) : (
            <div className="space-y-2">
              {steps.map((step, index) => (
                <StepRow
                  key={step.id || index}
                  step={step}
                  index={index}
                  onStatusChange={async (newStatus) => {
                    await tasksApi.updateStep(step.id, newStatus)
                    setSteps(prev => prev.map(s => s.id === step.id ? { ...s, status: newStatus } : s))
                    toast.success('Step status updated')
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

      </section>

      {/* Acceptance Criteria */}
      {acceptanceCriteria.length > 0 && (
        <section id="criteria" className="scroll-mt-20">
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
        </section>
      )}

      {/* Blockers & Blocking */}
      <section id="dependencies" className="scroll-mt-20">
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
      </section>

      {/* Decisions */}
      <section id="decisions" className="scroll-mt-20">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Decisions ({decisions.length})</CardTitle>
            <Button size="sm" onClick={() => decisionFormDialog.open({ title: 'Add Decision', size: 'lg' })}>Add Decision</Button>
          </div>
        </CardHeader>
        <CardContent>
          {decisions.length === 0 ? (
            <p className="text-gray-500 text-sm">No decisions recorded</p>
          ) : (
            <div className="space-y-3">
              {decisions.map((decision, index) => (
                <DecisionRow key={decision.id || index} decision={decision} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      </section>

      {/* Affected Files */}
      {affectedFiles.length > 0 && (
        <section id="files" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle>Affected Files</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {affectedFiles.map((file, index) => (
                <div key={`${file}-${index}`} className="font-mono text-sm text-gray-300 p-1 truncate" title={file}>{file}</div>
              ))}
            </div>
          </CardContent>
        </Card>
        </section>
      )}

      {/* Commits */}
      {commits.length > 0 && (
        <section id="commits" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle>Commits ({commits.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {commits.map((commit) => (
                <div key={commit.sha} className="p-2 bg-white/[0.06] rounded">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs text-indigo-400 shrink-0">{commit.sha.slice(0, 7)}</span>
                    <span className="text-gray-200 truncate min-w-0">{commit.message}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        </section>
      )}

      <FormDialog {...stepFormDialog.dialogProps} onSubmit={stepForm.submit} loading={formLoading}>
        {stepForm.fields}
      </FormDialog>
      <FormDialog {...decisionFormDialog.dialogProps} onSubmit={decisionForm.submit} loading={formLoading}>
        {decisionForm.fields}
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
  onDelete,
}: {
  step: Step
  index: number
  onStatusChange: (status: StepStatus) => Promise<void>
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
        onClick={onDelete}
        className="text-gray-500 hover:text-red-400 text-sm px-1"
        title="Delete step"
      >
        &times;
      </button>
    </div>
  )
}

function DecisionRow({ decision }: { decision: Decision }) {
  const alternatives = decision.alternatives || []
  return (
    <div className="p-3 bg-white/[0.06] rounded-lg overflow-hidden">
      <p className="font-medium text-gray-200 mb-1 break-words">{decision.description}</p>
      <p className="text-sm text-gray-400 mb-2 break-words">{decision.rationale}</p>
      {alternatives.length > 0 && (
        <div className="text-xs text-gray-500 mb-2">
          Alternatives: {alternatives.join(', ')}
        </div>
      )}
      {decision.chosen_option && (
        <Badge variant="success">Chosen: {decision.chosen_option}</Badge>
      )}
    </div>
  )
}
