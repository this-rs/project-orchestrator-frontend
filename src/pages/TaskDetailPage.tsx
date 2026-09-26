import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { useAtomValue, useSetAtom } from 'jotai'
import { ClipboardList, FileCode2, Flag, FolderKanban, Link2, Pencil, Plus, Trash2, Unlink } from 'lucide-react'
import {
  EntityList,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  Facts,
  FormDialog,
  LinkEntityDialog,
  PageContainer,
  PageHeader,
  PriorityText,
  RelativeTime,
  Section,
  StatusDot,
  StatusMenu,
  StatusText,
  formatAbsolute,
  getStatusMeta,
  ProgressLine,
  ViewToggle,
} from '@/components/ui'
import type { ParentLink } from '@/components/ui/PageHeader'
import { tasksApi, plansApi, projectsApi, workspacesApi, decisionsApi } from '@/services'
import { useFormDialog, useLinkDialog, useToast, useWorkspaceSlug, useViewTransition, useViewMode } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { taskRefreshAtom, projectRefreshAtom, planRefreshAtom, chatPanelModeAtom, chatSessionIdAtom } from '@/atoms'
import { CreateStepForm, CreateDecisionForm, EditTaskForm, EditStepForm } from '@/components/forms'
import { CommitList } from '@/components/commits'
import { UniversalKanban, createStepKanbanConfig } from '@/components/kanban'
import {
  CommitShaField,
  DecisionRow,
  DetailSkeleton,
  EmptyLine,
  SectionAddButton,
  SessionRow,
  StepRow,
} from '@/components/tasks/DetailRows'
import type { Task, Step, Decision, Commit, TaskStatus, StepStatus, DecisionStatus, Project, SessionWithLinks } from '@/types'

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
  const setChatPanelMode = useSetAtom(chatPanelModeAtom)
  const setChatSessionId = useSetAtom(chatSessionIdAtom)
  const [task, setTask] = useState<Task | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [blockers, setBlockers] = useState<Task[]>([])
  const [blocking, setBlocking] = useState<Task[]>([])
  const [commits, setCommits] = useState<Commit[]>([])
  const [commitShaInput, setCommitShaInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Chat sessions linked to this task
  const [chatSessions, setChatSessions] = useState<SessionWithLinks[]>([])
  const [chatSessionsLoading, setChatSessionsLoading] = useState(false)

  // Parent resolution state
  const [parentPlanId, setParentPlanId] = useState<string | null>(null)
  const [parentPlanTitle, setParentPlanTitle] = useState<string | null>(null)
  const [parentProject, setParentProject] = useState<Project | null>(null)
  const [parentMilestone, setParentMilestone] = useState<{ id: string; title: string; type: 'workspace' | 'project' } | null>(null)

  const fetchData = useCallback(async () => {
    if (!taskId) return
    setError(null)
    // Only show the loading skeleton on initial load, not on WS-triggered refreshes
    const isInitialLoad = !task
    if (isInitialLoad) setLoading(true)
    try {
      // The API returns { task, steps, decisions, depends_on, modifies_files }
      const response = (await tasksApi.get(taskId)) as unknown as TaskApiResponse

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

  // Linked chat sessions (was lazy-loaded with the old "Chat" tab; the page is now one scroll)
  useEffect(() => {
    if (!taskId) return
    let cancelled = false
    setChatSessionsLoading(true)
    tasksApi
      .getSessions(taskId)
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
  }, [taskId])

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
        } catch {
          /* graceful degradation */
        }
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
        } catch {
          /* graceful degradation */
        }
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
            } catch {
              /* skip */
            }
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
                } catch {
                  /* skip */
                }
              }
            } catch {
              /* graceful degradation */
            }
          }
        } catch {
          /* graceful degradation */
        }
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

  const handleDeleteDecision = async (decision: Decision) => {
    await decisionsApi.delete(decision.id)
    setDecisions((prev) => prev.filter((d) => d.id !== decision.id))
    toast.success('Decision deleted')
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

  const handleStepStatusChange = useCallback(async (stepId: string, newStatus: string) => {
    await tasksApi.updateStep(stepId, { status: newStatus })
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, status: newStatus as StepStatus } : s)))
  }, [])

  const stepKanbanConfig = useMemo(
    () => createStepKanbanConfig({ fetchFn: stepFetchFn, onStatusChange: handleStepStatusChange }),
    [stepFetchFn, handleStepStatusChange],
  )

  const stepKanbanRefreshKey = useMemo(() => steps.length + steps.reduce((acc, s) => acc + s.status, '').length, [steps])

  const editStepForm = EditStepForm({
    initialValues: { description: editingStep?.description ?? '', verification: editingStep?.verification },
    onSubmit: async (data) => {
      if (!editingStep) return
      await tasksApi.updateStep(editingStep.id, data)
      setSteps((prev) => prev.map((s) => (s.id === editingStep.id ? { ...s, ...data } : s)))
      toast.success('Step updated')
    },
  })

  const editTaskForm = EditTaskForm({
    initialValues: {
      title: task?.title,
      description: task?.description,
      priority: task?.priority,
      estimated_complexity: task?.estimated_complexity,
      tags: task?.tags,
    },
    onSubmit: async (data) => {
      if (!task) return
      await tasksApi.update(task.id, data)
      setTask({ ...task, ...data })
      toast.success('Task updated')
    },
  })

  const openAddDependency = () =>
    linkDialog.open({
      title: 'Add Dependency',
      submitLabel: 'Add',
      fetchOptions: async () => {
        const data = await tasksApi.list({ limit: 100 })
        const existingIds = new Set([taskId, ...blockers.map((b) => b.id)])
        return (data.items || [])
          .filter((t) => !existingIds.has(t.id))
          .map((t) => ({ value: t.id, label: t.title || t.description || 'Untitled', description: t.status }))
      },
      onLink: async (depId) => {
        await tasksApi.addDependencies(taskId!, [depId])
        const blockersData = await tasksApi.getBlockers(taskId!).catch(() => ({ items: [] }))
        setBlockers(blockersData.items || [])
        toast.success('Dependency added')
      },
    })

  const openLinkCommit = () => {
    setCommitShaInput('')
    commitFormDialog.open({ title: 'Link Commit', submitLabel: 'Link', size: 'sm' })
  }
  const openAddStep = () => stepFormDialog.open({ title: 'Add Step' })
  const openAddDecision = () => decisionFormDialog.open({ title: 'Add Decision', size: 'lg' })

  if (error) return <ErrorState title="Failed to load" description={error} onRetry={fetchData} />
  if (loading || !task) return <DetailSkeleton />

  const tags = task.tags || []
  const acceptanceCriteria = task.acceptance_criteria || []
  const affectedFiles = task.affected_files || []
  const completedSteps = steps.filter((s) => s.status === 'completed').length
  const stepProgress = steps.length > 0 ? (completedSteps / steps.length) * 100 : 0
  const title = task.title || task.description?.slice(0, 80) || 'Task'

  // Parent links — ascending: milestone → project → plan
  const parentLinks: ParentLink[] = []
  if (parentMilestone) {
    const msPath =
      parentMilestone.type === 'project' ? `/project-milestones/${parentMilestone.id}` : `/milestones/${parentMilestone.id}`
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

  const handleTaskStatusChange = async (newStatus: TaskStatus) => {
    try {
      await tasksApi.update(task.id, { status: newStatus })
      setTask({ ...task, status: newStatus })
      toast.success('Status updated')
    } catch {
      toast.error('Failed to update status')
    }
  }

  const complexity =
    task.estimated_complexity || task.actual_complexity
      ? `complexity ${task.estimated_complexity ?? '–'}${task.actual_complexity ? ` → ${task.actual_complexity}` : ''}`
      : null

  return (
    <PageContainer width="wide" className="space-y-6">
      <PageHeader
        title={title}
        viewTransitionName={`task-title-${task.id}`}
        description={task.title ? task.description : undefined}
        parentLinks={parentLinks.length > 0 ? parentLinks : undefined}
        status={<StatusMenu kind="task" status={task.status} onChange={handleTaskStatusChange} />}
        meta={[
          <PriorityText key="p" priority={task.priority} />,
          task.assigned_to ? <span key="a">@{task.assigned_to}</span> : null,
          steps.length > 0 ? (
            <span key="steps" className="tabular-nums">
              {completedSteps}/{steps.length} steps
            </span>
          ) : null,
          complexity,
          <RelativeTime
            key="u"
            date={task.updated_at ?? task.created_at}
            prefix={task.updated_at ? 'updated ' : 'created '}
          />,
        ]}
        overflowActions={[
          { label: 'Edit', icon: Pencil, onClick: () => editTaskDialog.open({ title: 'Edit Task' }) },
          { label: 'Add step', icon: Plus, onClick: openAddStep },
          { label: 'Add decision', icon: Plus, onClick: openAddDecision },
          { label: 'Add dependency', icon: Plus, onClick: openAddDependency },
          { label: 'Link commit', icon: Link2, onClick: openLinkCommit },
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'danger',
            onClick: async () => {
              await tasksApi.delete(task.id)
              toast.success('Task deleted')
              // Navigate to parent plan if known, otherwise task list
              const target = parentPlanId ? workspacePath(wsSlug, `/plans/${parentPlanId}`) : workspacePath(wsSlug, '/tasks')
              navigate(target, { type: 'back-button' })
            },
            confirm: {
              title: 'Delete Task',
              description: 'This will permanently delete this task and all its steps and decisions.',
            },
          },
        ]}
      >
        {tags.map((tag, index) => (
          <span key={`${tag}-${index}`} className="rounded border border-white/[0.08] px-1.5 text-[11px] leading-5 text-gray-400">
            #{tag}
          </span>
        ))}
      </PageHeader>

      {/* ── Steps ── */}
      <Section
        title="Steps"
        count={steps.length}
        description={steps.length > 0 ? `${completedSteps} of ${steps.length} completed` : undefined}
        action={
          <>
            {steps.length > 0 && <ViewToggle value={stepsViewMode} onChange={setStepsViewMode} />}
            <SectionAddButton label="Add step" onClick={openAddStep} />
          </>
        }
      >
        {steps.length > 0 && <ProgressLine value={stepProgress} label="Step progress" className="mb-2" />}
        {steps.length === 0 ? (
          <EmptyLine>No steps defined</EmptyLine>
        ) : stepsViewMode === 'kanban' ? (
          <UniversalKanban config={stepKanbanConfig} refreshTrigger={stepKanbanRefreshKey} />
        ) : (
          <EntityList aria-label="Steps">
            {steps.map((step, index) => (
              <StepRow
                key={step.id || index}
                step={step}
                index={index}
                onStatusChange={async (newStatus) => {
                  try {
                    await tasksApi.updateStep(step.id, { status: newStatus })
                    setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, status: newStatus } : s)))
                    toast.success('Step status updated')
                  } catch {
                    toast.error('Failed to update step')
                  }
                }}
                onEdit={() => {
                  setEditingStep(step)
                  editStepDialog.open({ title: 'Edit Step' })
                }}
                onDelete={async () => {
                  await tasksApi.deleteStep(step.id)
                  setSteps((prev) => prev.filter((s) => s.id !== step.id))
                  toast.success('Step deleted')
                }}
              />
            ))}
          </EntityList>
        )}
      </Section>

      {/* ── Acceptance criteria ── */}
      {acceptanceCriteria.length > 0 && (
        <Section title="Acceptance criteria" count={acceptanceCriteria.length}>
          <ul className="space-y-1.5 px-1">
            {acceptanceCriteria.map((criterion, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-gray-300">
                <span className="mt-2 w-1 h-1 rounded-full bg-gray-500 shrink-0" aria-hidden="true" />
                <span className="break-words min-w-0">{criterion}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── Affected files ── */}
      {affectedFiles.length > 0 && (
        <Section title="Affected files" count={affectedFiles.length}>
          <EntityList aria-label="Affected files">
            {affectedFiles.map((file, index) => (
              <EntityRow
                key={`${file}-${index}`}
                title={<span className="font-mono text-xs break-all">{file}</span>}
                ariaLabel={`Open ${file} in code explorer`}
                href={workspacePath(wsSlug, `/code?file=${encodeURIComponent(file)}`)}
                leading={<FileCode2 className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />}
                chevron
              />
            ))}
          </EntityList>
        </Section>
      )}

      {/* ── Dependencies ── */}
      <Section title="Blocked by" count={blockers.length} action={<SectionAddButton label="Add dependency" onClick={openAddDependency} />}>
        {blockers.length === 0 ? (
          <EmptyLine>No blockers</EmptyLine>
        ) : (
          <EntityList aria-label="Blocked by">
            {blockers.map((blocker) => (
              <DependencyRow
                key={blocker.id}
                task={blocker}
                wsSlug={wsSlug}
                onRemove={async () => {
                  await tasksApi.removeDependency(taskId!, blocker.id)
                  setBlockers((prev) => prev.filter((b) => b.id !== blocker.id))
                  toast.success('Dependency removed')
                }}
              />
            ))}
          </EntityList>
        )}
      </Section>

      <Section title="Blocking" count={blocking.length}>
        {blocking.length === 0 ? (
          <EmptyLine>Not blocking any tasks</EmptyLine>
        ) : (
          <EntityList aria-label="Blocking">
            {blocking.map((blocked) => (
              <DependencyRow key={blocked.id} task={blocked} wsSlug={wsSlug} />
            ))}
          </EntityList>
        )}
      </Section>

      {/* ── Decisions ── */}
      <Section title="Decisions" count={decisions.length} action={<SectionAddButton label="Add decision" onClick={openAddDecision} />}>
        {decisions.length === 0 ? (
          <EmptyLine>No decisions recorded</EmptyLine>
        ) : (
          <EntityList aria-label="Decisions">
            {decisions.map((decision) => (
              <DecisionRow
                key={decision.id}
                decision={decision}
                wsSlug={wsSlug}
                onStatusChange={(status) => handleDecisionStatusChange(decision, status)}
                onDelete={() => handleDeleteDecision(decision)}
              />
            ))}
          </EntityList>
        )}
      </Section>

      {/* ── Commits ── */}
      <Section title="Commits" count={commits.length} action={<SectionAddButton label="Link commit" icon={Link2} onClick={openLinkCommit} />}>
        <CommitList commits={commits} emptyMessage="No commits linked to this task yet" />
      </Section>

      {/* ── Conversations ── */}
      <Section title="Conversations" count={chatSessionsLoading ? undefined : chatSessions.length}>
        {chatSessionsLoading ? (
          <EntityListSkeleton rows={2} />
        ) : chatSessions.length === 0 ? (
          <EmptyLine>No chat sessions linked — they are linked automatically when the task runs via the runner.</EmptyLine>
        ) : (
          <EntityList aria-label="Conversations">
            {chatSessions.map((sw) => (
              <SessionRow
                key={sw.session.id}
                item={sw}
                onOpen={() => {
                  setChatSessionId(sw.session.id)
                  setChatPanelMode('open')
                }}
              />
            ))}
          </EntityList>
        )}
      </Section>

      {/* ── Details ── */}
      <Section title="Details">
        <Facts
          items={[
            { label: 'Status', value: <StatusText kind="task" status={task.status} /> },
            { label: 'Priority', value: task.priority != null ? String(task.priority) : undefined },
            { label: 'Assigned to', value: task.assigned_to },
            { label: 'Est. complexity', value: task.estimated_complexity != null ? String(task.estimated_complexity) : undefined },
            { label: 'Actual complexity', value: task.actual_complexity != null ? String(task.actual_complexity) : undefined },
            { label: 'Plan', value: parentPlanTitle ?? undefined },
            { label: 'Created', value: formatAbsolute(task.created_at) },
            { label: 'Updated', value: task.updated_at ? formatAbsolute(task.updated_at) : undefined },
            { label: 'Started', value: task.started_at ? formatAbsolute(task.started_at) : undefined },
            { label: 'Completed', value: task.completed_at ? formatAbsolute(task.completed_at) : undefined },
            { label: 'ID', value: <span className="font-mono text-xs text-gray-400 break-all">{task.id}</span> },
          ]}
        />
      </Section>

      {/* ENTITY_GRAPH_SLOT entity_type="task" entity_id={task.id} */}

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
        <CommitShaField value={commitShaInput} onChange={setCommitShaInput} entity="task" />
      </FormDialog>
      <LinkEntityDialog {...linkDialog.dialogProps} />
    </PageContainer>
  )
}

// ── Dependency row ──────────────────────────────────────────────────────

function DependencyRow({ task, wsSlug, onRemove }: { task: Task; wsSlug: string; onRemove?: () => Promise<void> }) {
  const title = task.title || task.description || 'Untitled task'
  return (
    <EntityRow
      title={title}
      href={workspacePath(wsSlug, `/tasks/${task.id}`)}
      muted={task.status === 'completed'}
      leading={<StatusDot kind="task" status={task.status} label={getStatusMeta('task', task.status).label} />}
      meta={[
        <StatusText key="s" kind="task" status={task.status} dot={false} />,
        <PriorityText key="p" priority={task.priority} />,
      ]}
      actions={
        onRemove
          ? [
              {
                label: 'Remove dependency',
                icon: Unlink,
                variant: 'danger',
                onClick: onRemove,
                confirm: {
                  title: 'Remove dependency?',
                  description: `This task will no longer be blocked by “${title}”.`,
                  confirmLabel: 'Remove',
                },
              },
            ]
          : undefined
      }
      chevron={!onRemove}
    />
  )
}
