import { lazy, Suspense, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAtomValue, useSetAtom } from 'jotai'
import { ArrowRightLeft, ExternalLink, Pencil, Trash2, X } from 'lucide-react'
import {
  Button,
  EmptyState,
  EntityList,
  EntityRow,
  ErrorState,
  FormDialog,
  LinkEntityDialog,
  LoadingPage,
  MetricTooltip,
  OverflowMenu,
  PageContainer,
  PageHeader,
  RelativeTime,
  Section,
  Skeleton,
  StatusText,
  WatcherToggle,
  formatAbsolute,
  formatDay,
  inlineLink,
  leadText,
  pluralize,
  rowInteractive,
  sectionTitle,
  surface,
  ProgressLine,
  TONE_CLASSES,
} from '@/components/ui'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { workspacesApi, projectsApi } from '@/services'
import { useFormDialog, useIsMobile, useLinkDialog, useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { workspaceRefreshAtom, projectRefreshAtom, milestoneRefreshAtom, taskRefreshAtom } from '@/atoms'
import { CreateMilestoneForm, CreateProjectForm, CreateResourceForm, CreateComponentForm, EditWorkspaceForm } from '@/components/forms'
import {
  IntelAttention,
  IntelFallback,
  IntelQuickActions,
  IntelRefreshButton,
  IntelPulse,
} from '@/components/intelligence/IntelligenceDashboard'
import { useWorkspaceIntelligenceData } from '@/components/intelligence/useWorkspaceIntelligenceData'
import type { Workspace, Project, WorkspaceMilestone, Resource, Component, MilestoneProgress } from '@/types'

// Lazy-load heavy intelligence components
const WorkspaceGraphPage = lazy(() => import('@/components/intelligence/WorkspaceGraphPage'))
const WorkspaceLearningTimeline = lazy(() => import('@/components/intelligence/WorkspaceLearningTimeline'))

// API response structure
interface WorkspaceOverviewResponse {
  workspace: Workspace
  projects: Project[]
  milestones: WorkspaceMilestone[]
  resources: Resource[]
  components: Component[]
  progress: {
    completed_tasks: number
    total_tasks: number
    percentage: number
  }
}

type MilestoneWithProgress = WorkspaceMilestone & { progress?: MilestoneProgress }

/** The health score reads through a status tone (DESIGN.md § 3: semantic colour only through tones). */
function healthTone(score: number): string {
  if (score >= 80) return TONE_CLASSES.success.text
  if (score >= 40) return TONE_CLASSES.warning.text
  return TONE_CLASSES.danger.text
}

/** The product's words (DESIGN.md § 0): an Objective is still a `milestone` on the wire. */
const OBJECTIVE = NOMENCLATURE.objectives
const addObjective = `Add ${OBJECTIVE.singular.toLowerCase()}`

/**
 * The first visit: the workspace holds nothing yet. Three lines say what one does here
 * (a project, a plan, an assistant) in the site's words (website/AUDIENCE.md § 1, § 2),
 * then ONE primary action. English for now; i18n after #252.
 */
const FIRST_VISIT_TEXT = {
  title: 'Start with a project',
  lines: [
    { term: NOMENCLATURE.projects.singular, text: 'holds one piece of work: an event, a budget, a codebase.' },
    { term: NOMENCLATURE.plans.singular, text: 'says how it gets done, as tasks an assistant can pick up.' },
    { term: 'Assistant', text: 'does the work, and asks you when it matters.' },
  ],
  create: 'Create a project',
  createTitle: 'Create project',
  created: 'Project created',
  addExisting: 'Add an existing project',
} as const

/**
 * The welcome of an empty workspace (DESIGN.md § 2 display scale, § 8 page-level empty
 * state): a `display-3` title, three lead lines, one primary button. No illustration,
 * nothing animated — the person asked for this screen, it is simply there.
 */
function WorkspaceWelcome({ onCreate, onAddExisting }: { onCreate: () => void; onAddExisting: () => void }) {
  return (
    <section aria-labelledby="workspace-welcome-title" className="flex flex-col items-center py-10 md:py-20 px-4 text-center">
      <h2 id="workspace-welcome-title" className={sectionTitle}>
        {FIRST_VISIT_TEXT.title}
      </h2>
      <dl className={`mt-4 mx-auto space-y-1 ${leadText}`}>
        {FIRST_VISIT_TEXT.lines.map((line) => (
          <div key={line.term} className="min-w-0 text-balance">
            <dt className="inline font-medium text-gray-200">{line.term}</dt> <dd className="inline">{line.text}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-col items-center gap-2">
        <Button onClick={onCreate}>{FIRST_VISIT_TEXT.create}</Button>
        <Button size="sm" variant="ghost" onClick={onAddExisting}>
          {FIRST_VISIT_TEXT.addExisting}
        </Button>
      </div>
    </section>
  )
}

// ============================================================================
// MAIN PAGE — hub: header (+ intro) → progress → health → graph → attention → lists → timeline → assets → maintenance
// ============================================================================

export function WorkspaceDetailPage() {
  const slug = useWorkspaceSlug()
  const navigate = useNavigate()
  const editWorkspaceDialog = useFormDialog()
  const createProjectDialog = useFormDialog()
  const milestoneFormDialog = useFormDialog()
  const resourceFormDialog = useFormDialog()
  const componentFormDialog = useFormDialog()
  const linkDialog = useLinkDialog()
  const moveDialog = useLinkDialog()
  const toast = useToast()
  const isMobile = useIsMobile()
  const workspaceRefresh = useAtomValue(workspaceRefreshAtom)
  const projectRefresh = useAtomValue(projectRefreshAtom)
  const milestoneRefresh = useAtomValue(milestoneRefreshAtom)
  const taskRefresh = useAtomValue(taskRefreshAtom)
  const bumpProjectRefresh = useSetAtom(projectRefreshAtom)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [milestones, setMilestones] = useState<MilestoneWithProgress[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [components, setComponents] = useState<Component[]>([])
  const [overallProgress, setOverallProgress] = useState<{
    completed_tasks: number
    total_tasks: number
    percentage: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (signal: AbortSignal) => {
    if (!slug) return
    setError(null)
    // Only show loading spinner on initial load, not on WS-triggered refreshes
    const isInitialLoad = !workspace
    if (isInitialLoad) setLoading(true)
    try {
      const overviewData = (await workspacesApi.getOverview(slug, signal)) as unknown as WorkspaceOverviewResponse

      if (signal.aborted) return

      setWorkspace(overviewData.workspace)
      setProjects(overviewData.projects || [])
      setResources(overviewData.resources || [])
      setComponents(overviewData.components || [])
      setOverallProgress(overviewData.progress || null)

      // Use milestones from overview and fetch progress for each
      const milestoneItems = overviewData.milestones || []
      const milestonesWithProgress = await Promise.all(
        milestoneItems.map(async (m) => {
          try {
            const progress = await workspacesApi.getMilestoneProgress(m.id, signal)
            return { ...m, progress }
          } catch {
            return { ...m, progress: undefined }
          }
        }),
      )
      if (signal.aborted) return
      setMilestones(milestonesWithProgress)
    } catch (err) {
      if (signal.aborted) return
      console.error('Failed to fetch workspace:', err)
      setError('Failed to load workspace')
    } finally {
      if (!signal.aborted && isInitialLoad) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- workspace is a data object (would cause infinite loop)
  }, [slug, workspaceRefresh, projectRefresh, milestoneRefresh, taskRefresh])

  useEffect(() => {
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData])

  const milestoneForm = CreateMilestoneForm({
    onSubmit: async (data) => {
      if (!slug) return
      const newMilestone = await workspacesApi.createMilestone(slug, data)
      setMilestones((prev) => [...prev, { ...newMilestone, progress: undefined }])
      toast.success(`${OBJECTIVE.singular} added`)
    },
  })

  const createProjectForm = CreateProjectForm({
    workspaceName: workspace?.name,
    onSubmit: async (data) => {
      if (!slug) return
      const created = await projectsApi.create(data)
      await workspacesApi.addProject(slug, created.id)
      setProjects((prev) => [...prev, created])
      // Other listeners (ChatPanel's project select, the sidebar) re-read the list now, not on the WS event.
      bumpProjectRefresh((c) => c + 1)
      toast.success(FIRST_VISIT_TEXT.created)
    },
  })

  const resourceForm = CreateResourceForm({
    onSubmit: async (data) => {
      if (!slug) return
      const newResource = await workspacesApi.createResource(slug, data)
      setResources((prev) => [...prev, newResource])
      toast.success('Resource added')
    },
  })

  const componentForm = CreateComponentForm({
    onSubmit: async (data) => {
      if (!slug) return
      const newComponent = await workspacesApi.createComponent(slug, data)
      setComponents((prev) => [...prev, newComponent])
      toast.success('Component added')
    },
  })

  const editWorkspaceForm = EditWorkspaceForm({
    initialValues: {
      name: workspace?.name ?? '',
      description: workspace?.description,
      slug: workspace?.slug ?? '',
    },
    onSubmit: async (data) => {
      if (!slug) return
      const updated = await workspacesApi.update(slug, data)
      setWorkspace(updated)
      toast.success('Workspace renamed')
      if (data.slug && data.slug !== slug) {
        navigate(`/workspace/${data.slug}/overview`, { replace: true })
      }
    },
  })

  // Workspace intelligence data (aggregated across all projects)
  const intelligence = useWorkspaceIntelligenceData(slug ?? '')
  const intelReady = !intelligence.loading && !intelligence.error && !!intelligence.summary

  if (loading) return <LoadingPage />
  if (error || !workspace)
    return (
      <ErrorState
        title="Failed to load"
        description={error ?? 'Workspace data unavailable'}
        onRetry={() => fetchData(new AbortController().signal)}
      />
    )

  // ── Actions ────────────────────────────────────────────────────────────

  const openAddProject = () =>
    linkDialog.open({
      title: 'Add project',
      submitLabel: 'Add',
      fetchOptions: async () => {
        const data = await projectsApi.list()
        const existingIds = new Set(projects.map((p) => p.id))
        return (data.items || [])
          .filter((p) => !existingIds.has(p.id))
          .map((p) => ({ value: p.id, label: p.name, description: p.slug }))
      },
      onLink: async (projectId) => {
        await workspacesApi.addProject(workspace.slug, projectId)
        const data = await projectsApi.list()
        const proj = (data.items || []).find((p) => p.id === projectId)
        if (proj) setProjects((prev) => [...prev, proj])
        toast.success('Project added')
      },
    })

  const openMoveProject = (project: Project) =>
    moveDialog.open({
      title: `Move "${project.name}" to workspace`,
      submitLabel: 'Move',
      fetchOptions: async () => {
        const allWorkspaces = await workspacesApi.list()
        return (allWorkspaces.items || [])
          .filter((w) => w.slug !== workspace.slug)
          .map((w) => ({ value: w.slug, label: w.name, description: w.slug }))
      },
      onLink: async (targetSlug) => {
        await workspacesApi.removeProject(workspace.slug, project.id)
        await workspacesApi.addProject(targetSlug, project.id)
        setProjects((prev) => prev.filter((p) => p.id !== project.id))
        toast.success(`Project moved to ${targetSlug}`)
      },
    })

  const removeProject = async (project: Project) => {
    await workspacesApi.removeProject(workspace.slug, project.id)
    setProjects((prev) => prev.filter((p) => p.id !== project.id))
    toast.success('Project removed')
  }

  const deleteResource = async (resource: Resource) => {
    await workspacesApi.deleteResource(resource.id)
    setResources((prev) => prev.filter((r) => r.id !== resource.id))
    toast.success('Resource deleted')
  }

  const deleteComponent = async (component: Component) => {
    await workspacesApi.deleteComponent(component.id)
    setComponents((prev) => prev.filter((c) => c.id !== component.id))
    toast.success('Component deleted')
  }

  const graphFallback = <Skeleton className="w-full h-[300px] sm:h-[450px] rounded-xl!" />

  const header = (
    <PageHeader
      title={workspace.name}
      description={workspace.description}
      intro="overview"
      meta={[
        intelReady ? (
          <MetricTooltip key="health" term="health_score">
            <span className={`tabular-nums ${healthTone(intelligence.healthScore)}`}>Health {intelligence.healthScore}</span>
          </MetricTooltip>
        ) : null,
        pluralize(projects.length, 'project'),
        pluralize(milestones.length, OBJECTIVE.singular.toLowerCase()),
        workspace.updated_at ? <RelativeTime key="upd" date={workspace.updated_at} prefix="updated " /> : null,
      ]}
      overflowActions={[
        {
          label: 'Edit',
          icon: Pencil,
          onClick: () => editWorkspaceDialog.open({ title: 'Edit workspace' }),
        },
        {
          label: 'Delete',
          icon: Trash2,
          variant: 'danger',
          onClick: async () => {
            await workspacesApi.delete(workspace.slug)
            toast.success('Workspace deleted')
            navigate('/workspace-selector')
          },
          confirm: {
            title: 'Delete workspace?',
            description: `This will permanently delete "${workspace.name}". Projects will not be deleted.`,
            confirmLabel: 'Delete',
          },
        },
      ]}
    />
  )

  const dialogs = (
    <>
      <FormDialog {...createProjectDialog.dialogProps} onSubmit={createProjectForm.submit}>
        {createProjectForm.fields}
      </FormDialog>
      <FormDialog {...editWorkspaceDialog.dialogProps} onSubmit={editWorkspaceForm.submit}>
        {editWorkspaceForm.fields}
      </FormDialog>
      <FormDialog {...milestoneFormDialog.dialogProps} onSubmit={milestoneForm.submit}>
        {milestoneForm.fields}
      </FormDialog>
      <FormDialog {...resourceFormDialog.dialogProps} onSubmit={resourceForm.submit}>
        {resourceForm.fields}
      </FormDialog>
      <FormDialog {...componentFormDialog.dialogProps} onSubmit={componentForm.submit}>
        {componentForm.fields}
      </FormDialog>
      <LinkEntityDialog {...linkDialog.dialogProps} />
      <LinkEntityDialog {...moveDialog.dialogProps} />
    </>
  )

  // First visit: nothing was added yet — the screen says what one does here and offers one thing to do.
  const firstVisit = projects.length === 0 && milestones.length === 0 && resources.length === 0 && components.length === 0
  if (firstVisit) {
    return (
      <PageContainer width="wide" className="space-y-6">
        {header}
        <WorkspaceWelcome onCreate={() => createProjectDialog.open({ title: FIRST_VISIT_TEXT.createTitle })} onAddExisting={openAddProject} />
        {dialogs}
      </PageContainer>
    )
  }

  return (
    <PageContainer width="wide" className="space-y-6">
      {/* ── Header ── */}
      {header}

      {/* ── Progress (only when tasks exist) ── */}
      {overallProgress && overallProgress.total_tasks > 0 && (
        <section aria-label="Workspace progress" className="space-y-1.5">
          <ProgressLine value={overallProgress.percentage} size="md" label="Workspace progress" />
          <p className="text-[11px] leading-4 text-gray-500 tabular-nums">
            {overallProgress.completed_tasks} / {overallProgress.total_tasks} tasks completed · {Math.round(overallProgress.percentage)}%
          </p>
        </section>
      )}

      {/* ── Health: key numbers + breakdown ── */}
      <Section title="Health" action={intelReady ? <IntelRefreshButton data={intelligence} /> : undefined}>
        {intelReady && intelligence.summary ? (
          <IntelPulse data={intelligence} />
        ) : (
          <IntelFallback intelligence={intelligence} />
        )}
      </Section>

      {/* ── Graph (visual, collapsed on phones — heavy WebGL) ── */}
      {slug && (
        <Section title="Graph" collapsible defaultOpen={!isMobile}>
          <div className={`${surface} overflow-hidden`}>
            <Suspense fallback={graphFallback}>
              <WorkspaceGraphPage workspaceSlug={slug} embedded />
            </Suspense>
          </div>
        </Section>
      )}

      {/* ── Attention needed ── */}
      {intelReady && <IntelAttention data={intelligence} />}

      {/* ── Projects ── */}
      <Section
        title={NOMENCLATURE.projects.plural}
        count={projects.length}
        action={
          <Button size="sm" variant="ghost" onClick={openAddProject}>
            Add
          </Button>
        }
      >
        {projects.length === 0 ? (
          <EmptyState
            size="sm"
            title="No projects yet"
            description="Add an existing project or create one from the Projects page."
            action={
              <Button size="sm" variant="secondary" onClick={openAddProject}>
                Add
              </Button>
            }
          />
        ) : (
          <EntityList aria-label="Projects">
            {projects.map((project) => (
              <EntityRow
                key={project.id}
                title={project.name}
                href={workspacePath(slug, `/projects/${project.slug}`)}
                description={project.description || undefined}
                trailing={project.last_synced ? <RelativeTime date={project.last_synced} prefix="synced " /> : undefined}
                meta={[
                  <span key="slug" className="font-mono">
                    {project.slug}
                  </span>,
                  project.root_path ? (
                    <span key="path" className="font-mono truncate max-w-[16rem]" title={project.root_path}>
                      {project.root_path}
                    </span>
                  ) : null,
                ]}
                actions={
                  <div className="flex items-center">
                    {project.root_path && (
                      <WatcherToggle
                        projectId={project.id}
                        rootPath={project.root_path}
                        compact
                        className="w-9 h-9 md:w-8 md:h-8 inline-flex items-center justify-center"
                      />
                    )}
                    <OverflowMenu
                      size="sm"
                      label={`Actions for ${project.name}`}
                      actions={[
                        { label: 'Move to another workspace', icon: ArrowRightLeft, onClick: () => openMoveProject(project) },
                        {
                          label: 'Remove',
                          icon: X,
                          variant: 'danger',
                          onClick: () => removeProject(project),
                          confirm: {
                            title: 'Remove project from workspace?',
                            description: `“${project.name}” stays intact; it is only detached from this workspace.`,
                            confirmLabel: 'Remove',
                          },
                        },
                      ]}
                    />
                  </div>
                }
              />
            ))}
          </EntityList>
        )}
      </Section>

      {/* ── Objectives (milestones on the wire) ── */}
      <Section
        title={OBJECTIVE.plural}
        count={milestones.length}
        action={
          <Button size="sm" variant="ghost" onClick={() => milestoneFormDialog.open({ title: addObjective })}>
            Add
          </Button>
        }
      >
        {milestones.length === 0 ? (
          <EmptyState
            size="sm"
            title={`No ${OBJECTIVE.plural.toLowerCase()} yet`}
            description={OBJECTIVE.description}
            action={
              <Button size="sm" variant="secondary" onClick={() => milestoneFormDialog.open({ title: addObjective })}>
                Add
              </Button>
            }
          />
        ) : (
          <EntityList aria-label={OBJECTIVE.plural}>
            {milestones.map((milestone) => {
              const p = milestone.progress
              return (
                <EntityRow
                  key={milestone.id}
                  title={milestone.title}
                  href={workspacePath(slug, `/milestones/${milestone.id}`)}
                  muted={milestone.status === 'completed' || milestone.status === 'closed'}
                  trailing={p && p.total > 0 ? `${Math.round(p.percentage)}%` : undefined}
                  meta={[
                    <StatusText key="s" kind="milestone" status={milestone.status} />,
                    p && p.total > 0 ? (
                      <span key="p" className="tabular-nums">
                        {p.completed}/{pluralize(p.total, 'task')}
                      </span>
                    ) : null,
                    milestone.target_date ? (
                      <span key="t" title={formatAbsolute(milestone.target_date)}>
                        due {formatDay(milestone.target_date)}
                      </span>
                    ) : null,
                    milestone.tags?.length ? (
                      <span key="tags" className="text-gray-500">
                        {milestone.tags.map((t) => `#${t}`).join(' ')}
                      </span>
                    ) : null,
                  ]}
                  context={p && p.total > 0 ? <ProgressLine value={p.percentage} label={`${milestone.title} progress`} /> : undefined}
                />
              )
            })}
          </EntityList>
        )}
      </Section>

      {/* ── Timeline (collapsed on phones) ── */}
      {slug && (
        <Section title="Timeline" collapsible defaultOpen={!isMobile}>
          <div className={`${surface} px-3 md:px-4`}>
            <Suspense fallback={graphFallback}>
              <WorkspaceLearningTimeline workspaceSlug={slug} embedded />
            </Suspense>
          </div>
        </Section>
      )}

      {/* ── Resources ── */}
      <Section
        title="Resources"
        count={resources.length}
        action={
          <Button size="sm" variant="ghost" onClick={() => resourceFormDialog.open({ title: 'Add resource', size: 'lg' })}>
            Add
          </Button>
        }
      >
        {resources.length === 0 ? (
          <EmptyState
            size="sm"
            title="No resources yet"
            description="API contracts, schemas and specs shared by projects."
            action={
              <Button size="sm" variant="secondary" onClick={() => resourceFormDialog.open({ title: 'Add resource', size: 'lg' })}>
                Add
              </Button>
            }
          />
        ) : (
          <EntityList aria-label="Resources">
            {resources.map((resource) => (
              <EntityRow
                key={resource.id}
                title={resource.name}
                description={resource.description || undefined}
                meta={[
                  <span key="type">{resource.resource_type}</span>,
                  resource.format,
                  resource.version ? `v${resource.version}` : null,
                  resource.file_path ? (
                    <span key="path" className="font-mono truncate max-w-[16rem]" title={resource.file_path}>
                      {resource.file_path}
                    </span>
                  ) : null,
                  resource.url ? (
                    <a
                      key="url"
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`inline-flex items-center gap-1 ${inlineLink} ${rowInteractive}`}
                    >
                      Open <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  ) : null,
                ]}
                actions={[
                  {
                    label: 'Delete',
                    icon: Trash2,
                    variant: 'danger',
                    onClick: () => deleteResource(resource),
                    confirm: { title: 'Delete resource?', description: `“${resource.name}” will be permanently deleted.` },
                  },
                ]}
              />
            ))}
          </EntityList>
        )}
      </Section>

      {/* ── Components ── */}
      <Section
        title="Components"
        count={components.length}
        action={
          <Button size="sm" variant="ghost" onClick={() => componentFormDialog.open({ title: 'Add component' })}>
            Add
          </Button>
        }
      >
        {components.length === 0 ? (
          <EmptyState
            size="sm"
            title="No components yet"
            description="Services, frontends, databases… of the deployed system."
            action={
              <Button size="sm" variant="secondary" onClick={() => componentFormDialog.open({ title: 'Add component' })}>
                Add
              </Button>
            }
          />
        ) : (
          <EntityList aria-label="Components">
            {components.map((component) => (
              <EntityRow
                key={component.id}
                title={component.name}
                description={component.description || undefined}
                meta={[
                  <span key="type">{component.component_type}</span>,
                  component.runtime,
                  component.tags?.length ? component.tags.map((t) => `#${t}`).join(' ') : null,
                ]}
                actions={[
                  {
                    label: 'Delete',
                    icon: Trash2,
                    variant: 'danger',
                    onClick: () => deleteComponent(component),
                    confirm: { title: 'Delete component?', description: `“${component.name}” will be permanently deleted.` },
                  },
                ]}
              />
            ))}
          </EntityList>
        )}
      </Section>

      {/* ── Knowledge graph maintenance (collapsed) ── */}
      {intelReady && <IntelQuickActions data={intelligence} />}

      {/* Dialogs */}
      {dialogs}
    </PageContainer>
  )
}
