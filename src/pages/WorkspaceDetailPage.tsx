import { lazy, Suspense, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
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
  rowInteractive,
  surface,
  ProgressLine,
  TONE_CLASSES,
} from '@/components/ui'
import { useT, type MessageKey } from '@/i18n'
import { workspacesApi, projectsApi } from '@/services'
import { useFormDialog, useIsMobile, useLinkDialog, useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { workspaceRefreshAtom, projectRefreshAtom, milestoneRefreshAtom, taskRefreshAtom } from '@/atoms'
import { CreateMilestoneForm, CreateResourceForm, CreateComponentForm, EditWorkspaceForm } from '@/components/forms'
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

// ============================================================================
// MAIN PAGE — hub: header (+ intro) → progress → health → graph → attention → lists → timeline → assets → maintenance
// ============================================================================

export function WorkspaceDetailPage() {
  const { t } = useT()
  const count = (n: number, key: 'project' | 'objective' | 'task') =>
    t(`projects.counts.${key}.${n === 1 ? 'one' : 'other'}` as MessageKey, { n })
  const addObjective = t('projects.workspace.addObjective')
  const slug = useWorkspaceSlug()
  const navigate = useNavigate()
  const editWorkspaceDialog = useFormDialog()
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
      setError(t('projects.workspace.loadFailed'))
    } finally {
      if (!signal.aborted && isInitialLoad) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- workspace is a data object (would cause infinite loop)
  }, [slug, t, workspaceRefresh, projectRefresh, milestoneRefresh, taskRefresh])

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
      toast.success(t('projects.workspace.objectiveAdded'))
    },
  })

  const resourceForm = CreateResourceForm({
    onSubmit: async (data) => {
      if (!slug) return
      const newResource = await workspacesApi.createResource(slug, data)
      setResources((prev) => [...prev, newResource])
      toast.success(t('projects.workspace.resourceAdded'))
    },
  })

  const componentForm = CreateComponentForm({
    onSubmit: async (data) => {
      if (!slug) return
      const newComponent = await workspacesApi.createComponent(slug, data)
      setComponents((prev) => [...prev, newComponent])
      toast.success(t('projects.workspace.componentAdded'))
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
      toast.success(t('projects.workspace.renamed'))
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
        title={t('projects.common.failedTitle')}
        description={error ?? t('projects.workspace.unavailable')}
        onRetry={() => fetchData(new AbortController().signal)}
      />
    )

  // ── Actions ────────────────────────────────────────────────────────────

  const openAddProject = () =>
    linkDialog.open({
      title: t('projects.workspace.addProject'),
      submitLabel: t('projects.common.add'),
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
        toast.success(t('projects.workspace.projectAdded'))
      },
    })

  const openMoveProject = (project: Project) =>
    moveDialog.open({
      title: t('projects.workspace.moveTitle', { name: project.name }),
      submitLabel: t('projects.workspace.move'),
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
        toast.success(t('projects.workspace.projectMoved', { slug: targetSlug }))
      },
    })

  const removeProject = async (project: Project) => {
    await workspacesApi.removeProject(workspace.slug, project.id)
    setProjects((prev) => prev.filter((p) => p.id !== project.id))
    toast.success(t('projects.workspace.projectRemoved'))
  }

  const deleteResource = async (resource: Resource) => {
    await workspacesApi.deleteResource(resource.id)
    setResources((prev) => prev.filter((r) => r.id !== resource.id))
    toast.success(t('projects.workspace.resourceDeleted'))
  }

  const deleteComponent = async (component: Component) => {
    await workspacesApi.deleteComponent(component.id)
    setComponents((prev) => prev.filter((c) => c.id !== component.id))
    toast.success(t('projects.workspace.componentDeleted'))
  }

  const graphFallback = <Skeleton className="w-full h-[300px] sm:h-[450px] rounded-xl!" />

  return (
    <PageContainer width="wide" className="space-y-6">
      {/* ── Header ── */}
      <PageHeader
        title={workspace.name}
        description={workspace.description}
        intro="overview"
        meta={[
          intelReady ? (
            <MetricTooltip key="health" term="health_score">
              <span className={`tabular-nums ${healthTone(intelligence.healthScore)}`}>{t('projects.workspace.healthScore', { score: intelligence.healthScore })}</span>
            </MetricTooltip>
          ) : null,
          count(projects.length, 'project'),
          count(milestones.length, 'objective'),
          workspace.updated_at ? <RelativeTime key="upd" date={workspace.updated_at} prefix={`${t('projects.common.updated')} `} /> : null,
        ]}
        overflowActions={[
          {
            label: t('projects.common.edit'),
            icon: Pencil,
            onClick: () => editWorkspaceDialog.open({ title: t('projects.workspace.editTitle') }),
          },
          {
            label: t('projects.common.delete'),
            icon: Trash2,
            variant: 'danger',
            onClick: async () => {
              await workspacesApi.delete(workspace.slug)
              toast.success(t('projects.workspace.deleted'))
              navigate('/workspace-selector')
            },
            confirm: {
              title: t('projects.workspace.deleteTitle'),
              description: t('projects.workspace.deleteDescription', { name: workspace.name }),
              confirmLabel: t('projects.common.delete'),
            },
          },
        ]}
      />

      {/* ── Progress (only when tasks exist) ── */}
      {overallProgress && overallProgress.total_tasks > 0 && (
        <section aria-label={t('projects.workspace.progress')} className="space-y-1.5">
          <ProgressLine value={overallProgress.percentage} size="md" label={t('projects.workspace.progress')} />
          <p className="text-[11px] leading-4 text-gray-500 tabular-nums">
            {t('projects.workspace.tasksCompleted', {
              done: overallProgress.completed_tasks,
              total: overallProgress.total_tasks,
              percent: Math.round(overallProgress.percentage),
            })}
          </p>
        </section>
      )}

      {/* ── Health: key numbers + breakdown ── */}
      <Section title={t('projects.common.health')} action={intelReady ? <IntelRefreshButton data={intelligence} /> : undefined}>
        {intelReady && intelligence.summary ? (
          <IntelPulse data={intelligence} />
        ) : (
          <IntelFallback intelligence={intelligence} />
        )}
      </Section>

      {/* ── Graph (visual, collapsed on phones — heavy WebGL) ── */}
      {slug && (
        <Section title={t('projects.workspace.graph')} collapsible defaultOpen={!isMobile}>
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
        title={t('nav.concepts.projects')}
        count={projects.length}
        action={
          <Button size="sm" variant="ghost" onClick={openAddProject}>
            {t('projects.common.add')}
          </Button>
        }
      >
        {projects.length === 0 ? (
          <EmptyState
            size="sm"
            title={t('projects.list.emptyTitle')}
            description={t('projects.workspace.noProjectsDescription')}
            action={
              <Button size="sm" variant="secondary" onClick={openAddProject}>
                {t('projects.common.add')}
              </Button>
            }
          />
        ) : (
          <EntityList aria-label={t('nav.concepts.projects')}>
            {projects.map((project) => (
              <EntityRow
                key={project.id}
                title={project.name}
                href={workspacePath(slug, `/projects/${project.slug}`)}
                description={project.description || undefined}
                trailing={project.last_synced ? <RelativeTime date={project.last_synced} prefix={`${t('projects.common.synced')} `} /> : undefined}
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
                      label={t('projects.workspace.actionsFor', { name: project.name })}
                      actions={[
                        { label: t('projects.workspace.moveToAnother'), icon: ArrowRightLeft, onClick: () => openMoveProject(project) },
                        {
                          label: t('projects.common.remove'),
                          icon: X,
                          variant: 'danger',
                          onClick: () => removeProject(project),
                          confirm: {
                            title: t('projects.workspace.removeTitle'),
                            description: t('projects.workspace.removeDescription', { name: project.name }),
                            confirmLabel: t('projects.common.remove'),
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
        title={t('nav.concepts.objectives')}
        count={milestones.length}
        action={
          <Button size="sm" variant="ghost" onClick={() => milestoneFormDialog.open({ title: addObjective })}>
            {t('projects.common.add')}
          </Button>
        }
      >
        {milestones.length === 0 ? (
          <EmptyState
            size="sm"
            title={t('projects.workspace.noObjectives')}
            description={t('projects.workspace.objectivesDescription')}
            action={
              <Button size="sm" variant="secondary" onClick={() => milestoneFormDialog.open({ title: addObjective })}>
                {t('projects.common.add')}
              </Button>
            }
          />
        ) : (
          <EntityList aria-label={t('nav.concepts.objectives')}>
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
                        {p.completed}/{count(p.total, 'task')}
                      </span>
                    ) : null,
                    milestone.target_date ? (
                      <span key="t" title={formatAbsolute(milestone.target_date)}>
                        {t('projects.common.due', { date: formatDay(milestone.target_date) })}
                      </span>
                    ) : null,
                    milestone.tags?.length ? (
                      <span key="tags" className="text-gray-500">
                        {milestone.tags.map((tag) => `#${tag}`).join(' ')}
                      </span>
                    ) : null,
                  ]}
                  context={p && p.total > 0 ? <ProgressLine value={p.percentage} label={t('projects.workspace.progressOf', { title: milestone.title })} /> : undefined}
                />
              )
            })}
          </EntityList>
        )}
      </Section>

      {/* ── Timeline (collapsed on phones) ── */}
      {slug && (
        <Section title={t('projects.workspace.timeline')} collapsible defaultOpen={!isMobile}>
          <div className={`${surface} px-3 md:px-4`}>
            <Suspense fallback={graphFallback}>
              <WorkspaceLearningTimeline workspaceSlug={slug} embedded />
            </Suspense>
          </div>
        </Section>
      )}

      {/* ── Resources ── */}
      <Section
        title={t('projects.workspace.resources')}
        count={resources.length}
        action={
          <Button size="sm" variant="ghost" onClick={() => resourceFormDialog.open({ title: t('projects.workspace.addResource'), size: 'lg' })}>
            {t('projects.common.add')}
          </Button>
        }
      >
        {resources.length === 0 ? (
          <EmptyState
            size="sm"
            title={t('projects.workspace.noResources')}
            description={t('projects.workspace.noResourcesDescription')}
            action={
              <Button size="sm" variant="secondary" onClick={() => resourceFormDialog.open({ title: t('projects.workspace.addResource'), size: 'lg' })}>
                {t('projects.common.add')}
              </Button>
            }
          />
        ) : (
          <EntityList aria-label={t('projects.workspace.resources')}>
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
                      {t('projects.common.open')} <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  ) : null,
                ]}
                actions={[
                  {
                    label: t('projects.common.delete'),
                    icon: Trash2,
                    variant: 'danger',
                    onClick: () => deleteResource(resource),
                    confirm: {
                      title: t('projects.workspace.deleteResourceTitle'),
                      description: t('projects.workspace.deleteResourceDescription', { name: resource.name }),
                    },
                  },
                ]}
              />
            ))}
          </EntityList>
        )}
      </Section>

      {/* ── Components ── */}
      <Section
        title={t('projects.workspace.components')}
        count={components.length}
        action={
          <Button size="sm" variant="ghost" onClick={() => componentFormDialog.open({ title: t('projects.workspace.addComponent') })}>
            {t('projects.common.add')}
          </Button>
        }
      >
        {components.length === 0 ? (
          <EmptyState
            size="sm"
            title={t('projects.workspace.noComponents')}
            description={t('projects.workspace.noComponentsDescription')}
            action={
              <Button size="sm" variant="secondary" onClick={() => componentFormDialog.open({ title: t('projects.workspace.addComponent') })}>
                {t('projects.common.add')}
              </Button>
            }
          />
        ) : (
          <EntityList aria-label={t('projects.workspace.components')}>
            {components.map((component) => (
              <EntityRow
                key={component.id}
                title={component.name}
                description={component.description || undefined}
                meta={[
                  <span key="type">{component.component_type}</span>,
                  component.runtime,
                  component.tags?.length ? component.tags.map((tag) => `#${tag}`).join(' ') : null,
                ]}
                actions={[
                  {
                    label: t('projects.common.delete'),
                    icon: Trash2,
                    variant: 'danger',
                    onClick: () => deleteComponent(component),
                    confirm: {
                      title: t('projects.workspace.deleteComponentTitle'),
                      description: t('projects.workspace.deleteComponentDescription', { name: component.name }),
                    },
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
    </PageContainer>
  )
}
