import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { Archive, FolderKanban, Link2, Network, Pencil, Trash2 } from 'lucide-react'
import {
  Button,
  EmptyState,
  EntityList,
  EntityRow,
  ErrorState,
  Facts,
  FormDialog,
  LinkEntityDialog,
  LoadingPage,
  PageContainer,
  PageHeader,
  RelativeTime,
  Section,
  StatusMenu,
  formatAbsolute,
  formatDay,
  ProgressLine,
} from '@/components/ui'
import type { ParentLink } from '@/components/ui/PageHeader'
import { MilestonePlanRow } from '@/components/expandable'
import { UnifiedGraphSection, type GraphBreadcrumb } from '@/components/graph/UnifiedGraphSection'
import { EditMilestoneForm } from '@/components/forms/EditMilestoneForm'
import { MilestoneGraphAdapter } from '@/adapters/MilestoneGraphAdapter'
import { workspacesApi, projectsApi, plansApi } from '@/services'
import { useFormDialog, useLinkDialog, useToast, useWorkspaceSlug, useViewTransition } from '@/hooks'
import { useMilestoneGraphData } from '@/hooks/useMilestoneGraphData'
import { workspacePath } from '@/utils/paths'
import { useT } from '@/i18n'
import { milestoneRefreshAtom, planRefreshAtom, taskRefreshAtom, projectRefreshAtom } from '@/atoms'
import { PlanRunHistory } from '@/components/runner/PlanRunHistory'
import type { MilestoneDetail, MilestonePlanSummary, MilestoneProgress, Plan, Project, MilestoneStatus, PlanStatus } from '@/types'

type MilestoneScope = 'workspace' | 'project'

interface MilestoneDetailPageProps {
  scope?: MilestoneScope
}

export function MilestoneDetailPage({ scope = 'workspace' }: MilestoneDetailPageProps) {
  const { t } = useT()
  const { milestoneId } = useParams<{ milestoneId: string }>()
  const { navigate } = useViewTransition()
  const wsSlug = useWorkspaceSlug()

  // Core state
  const [milestoneTitle, setMilestoneTitle] = useState('')
  const [milestoneDescription, setMilestoneDescription] = useState('')
  const [milestoneStatus, setMilestoneStatus] = useState<MilestoneStatus>('planned')
  const [milestoneId_, setMilestoneId_] = useState('')
  const [milestoneCreatedAt, setMilestoneCreatedAt] = useState('')
  const [milestoneTargetDate, setMilestoneTargetDate] = useState<string | undefined>()
  const [milestoneClosedAt, setMilestoneClosedAt] = useState<string | undefined>()
  const [milestoneTags, setMilestoneTags] = useState<string[]>([])

  const [progress, setProgress] = useState<MilestoneProgress | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [enrichedPlans, setEnrichedPlans] = useState<MilestonePlanSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showGraph, setShowGraph] = useState(false)

  const linkDialog = useLinkDialog()
  const editDialog = useFormDialog()
  const toast = useToast()

  const milestoneRefresh = useAtomValue(milestoneRefreshAtom)
  const planRefresh = useAtomValue(planRefreshAtom)
  const taskRefresh = useAtomValue(taskRefreshAtom)
  const projectRefresh = useAtomValue(projectRefreshAtom)

  const refreshData = useCallback(async () => {
    if (!milestoneId) return
    setError(null)
    const isInitialLoad = milestoneId_ === ''
    if (isInitialLoad) setLoading(true)

    const toPlans = (enriched: MilestonePlanSummary[]): Plan[] =>
      enriched.map((p) => ({
        id: p.id,
        title: p.title,
        description: '',
        status: (p.status || 'draft') as PlanStatus,
        created_at: '',
        created_by: '',
        priority: 0,
      }))

    try {
      if (scope === 'workspace') {
        const data = (await workspacesApi.getMilestone(milestoneId)) as MilestoneDetail
        setMilestoneId_(data.id)
        setMilestoneTitle(data.title)
        setMilestoneDescription(data.description || '')
        setMilestoneStatus((data.status?.toLowerCase() || 'planned') as MilestoneStatus)
        setMilestoneCreatedAt(data.created_at)
        setMilestoneTargetDate(data.target_date)
        setMilestoneClosedAt(data.closed_at)
        setMilestoneTags(data.tags || [])
        setProgress(data.progress || null)

        const enrichedPlansData = data.plans || []
        setEnrichedPlans(enrichedPlansData)
        setPlans(toPlans(enrichedPlansData))

        // Fetch workspace projects
        if (data.workspace_id) {
          const workspacesData = await workspacesApi.list()
          const workspace = (workspacesData.items || []).find((w) => w.id === data.workspace_id)
          if (workspace) {
            const projectsResponse = await workspacesApi.listProjects(workspace.slug)
            const workspaceProjects = Array.isArray(projectsResponse) ? projectsResponse : []
            setProjects(workspaceProjects as Project[])
          }
        }
      } else {
        // project scope
        const response = await projectsApi.getMilestone(milestoneId)
        const ms = response.milestone
        setMilestoneId_(ms.id)
        setMilestoneTitle(ms.title)
        setMilestoneDescription(ms.description || '')
        setMilestoneStatus((ms.status?.toLowerCase() || 'planned') as MilestoneStatus)
        setMilestoneCreatedAt(ms.created_at)
        setMilestoneTargetDate(ms.target_date)
        setMilestoneClosedAt(ms.closed_at)
        setMilestoneTags([])
        setProgress(response.progress || null)

        const enrichedPlansData = response.plans || []
        setEnrichedPlans(enrichedPlansData)
        setPlans(toPlans(enrichedPlansData))

        // Fetch parent project
        if (ms.project_id) {
          try {
            const projectsData = await projectsApi.list({ limit: 100 })
            const proj = (projectsData.items || []).find((p) => p.id === ms.project_id)
            if (proj) setProject(proj)
          } catch {
            // Project lookup failed
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch milestone:', err)
      setError('Failed to load milestone')
    } finally {
      if (isInitialLoad) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- milestoneId_ is a data tracking field
  }, [milestoneId, scope, milestoneRefresh, planRefresh, taskRefresh, projectRefresh])

  useEffect(() => {
    refreshData()
  }, [refreshData])

  // Derive primary project for graph enrichment
  const primaryProject = scope === 'project' ? project : projects.length > 0 ? projects[0] : null

  const milestoneGraphData = useMilestoneGraphData({
    milestoneId,
    milestoneTitle: milestoneTitle || t('milestones.detail.fallbackTitle'),
    milestoneStatus: milestoneStatus || 'planned',
    plans: enrichedPlans,
    progress,
    projectSlug: primaryProject?.slug,
    projectId: primaryProject?.id,
  })

  const handleDrillDown = useCallback(
    (target: { level: string; id: string }) => {
      if (target.level === 'plan') {
        navigate(workspacePath(wsSlug, `/plans/${target.id}#graph`))
      } else if (target.level === 'task') {
        navigate(workspacePath(wsSlug, `/tasks/${target.id}#graph`))
      }
    },
    [navigate, wsSlug],
  )

  const graphBreadcrumbs = useMemo<GraphBreadcrumb[]>(() => {
    const crumbs: GraphBreadcrumb[] = []
    if (scope === 'project' && project) {
      crumbs.push({ label: t('milestones.detail.projectCrumb', { name: project.name }), href: workspacePath(wsSlug, `/projects/${project.slug}`) })
    }
    crumbs.push({ label: t('milestones.detail.milestoneCrumb', { title: milestoneTitle || milestoneId_?.slice(0, 8) || '' }) })
    return crumbs
  }, [scope, project, milestoneTitle, milestoneId_, wsSlug, t])

  // Build plan title map for run history
  const planTitleMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of plans) map[p.id] = p.title
    return map
  }, [plans])

  const updateMilestone = (data: Partial<{ title: string; description: string; status: string; target_date: string }>) =>
    scope === 'workspace' ? workspacesApi.updateMilestone(milestoneId_, data) : projectsApi.updateMilestone(milestoneId_, data)

  const editForm = EditMilestoneForm({
    initialValues: { title: milestoneTitle, description: milestoneDescription, target_date: milestoneTargetDate },
    onSubmit: async (data) => {
      await updateMilestone({
        title: data.title,
        description: data.description,
        ...(data.target_date ? { target_date: data.target_date } : {}),
      })
      setMilestoneTitle(data.title)
      setMilestoneDescription(data.description)
      if (data.target_date) setMilestoneTargetDate(data.target_date)
      toast.success(t('milestones.toast.updated'))
    },
  })

  if (error) return <ErrorState title={t('milestones.loadFailedTitle')} description={t('milestones.detail.loadFailed')} onRetry={refreshData} />
  if (loading || !milestoneId_) return <LoadingPage />

  // Parent links for project scope
  const parentLinks: ParentLink[] = []
  if (scope === 'project' && project) {
    parentLinks.push({
      icon: FolderKanban,
      label: t('milestones.detail.project'),
      name: project.name,
      href: workspacePath(wsSlug, `/projects/${project.slug}`),
    })
  }

  const handleDelete = async () => {
    await workspacesApi.deleteMilestone(milestoneId_)
    toast.success(t('milestones.toast.deleted'))
    navigate(workspacePath(wsSlug, '/milestones'), { type: 'back-button' })
  }

  // Project milestones have no delete endpoint: the action closes them.
  const handleClose = async () => {
    await projectsApi.updateMilestone(milestoneId_, { status: 'closed' })
    setMilestoneStatus('closed')
    toast.success(t('milestones.toast.closed'))
  }

  const handleStatusChange = async (newStatus: MilestoneStatus) => {
    try {
      await updateMilestone({ status: newStatus })
      setMilestoneStatus(newStatus)
      toast.success(t('tasks.toast.statusUpdated'))
    } catch {
      toast.error(t('tasks.toast.statusFailed'))
    }
  }

  const handleLinkPlan = () =>
    linkDialog.open({
      title: t('milestones.detail.linkPlan'),
      submitLabel: t('milestones.detail.link'),
      fetchOptions: async () => {
        const data = await plansApi.list({ limit: 100 })
        const existingIds = new Set(enrichedPlans.map((p) => p.id))
        return (data.items || [])
          .filter((p) => !existingIds.has(p.id))
          .map((p) => ({ value: p.id, label: p.title || t('milestones.detail.untitled'), description: p.status }))
      },
      onLink: async (planId) => {
        if (scope === 'workspace') {
          await workspacesApi.linkPlanToMilestone(milestoneId!, planId)
        } else {
          await projectsApi.linkPlanToMilestone(milestoneId!, planId)
        }
        await refreshData()
        toast.success(t('milestones.toast.planLinked'))
      },
    })

  const remaining = progress ? progress.total - progress.completed : 0

  return (
    <PageContainer width="wide" className="space-y-6">
      <PageHeader
        title={milestoneTitle}
        viewTransitionName={scope === 'workspace' ? `milestone-title-${milestoneId_}` : undefined}
        description={milestoneDescription}
        parentLinks={parentLinks.length > 0 ? parentLinks : undefined}
        status={<StatusMenu kind="milestone" status={milestoneStatus} onChange={handleStatusChange} />}
        meta={[
          progress && progress.total > 0 ? (
            <span key="prog" className="tabular-nums">
              {t(progress.total === 1 ? 'milestones.detail.tasksProgressOne' : 'milestones.detail.tasksProgress', { completed: progress.completed, total: progress.total, percent: Math.round(progress.percentage) })}
            </span>
          ) : null,
          t(enrichedPlans.length === 1 ? 'milestones.detail.plans.one' : 'milestones.detail.plans.other', { count: enrichedPlans.length }),
          milestoneTargetDate ? (
            <span key="target" title={formatAbsolute(milestoneTargetDate)}>
              {t('milestones.due', { date: formatDay(milestoneTargetDate) })}
            </span>
          ) : null,
          milestoneClosedAt ? <RelativeTime key="closed" date={milestoneClosedAt} prefix={t('milestones.detail.closedPrefix')} /> : null,
        ]}
        overflowActions={[
          { label: t('milestones.detail.edit'), icon: Pencil, onClick: () => editDialog.open({ title: t('milestones.detail.editTitle') }) },
          {
            label: showGraph ? t('milestones.detail.hideGraph') : t('milestones.detail.showGraph'),
            icon: Network,
            onClick: () => setShowGraph((v) => !v),
          },
          scope === 'workspace'
            ? {
                label: t('milestones.detail.delete'),
                icon: Trash2,
                variant: 'danger' as const,
                onClick: handleDelete,
                confirm: {
                  title: t('milestones.detail.deleteTitle'),
                  description: t('milestones.detail.deleteBody'),
                  confirmLabel: t('milestones.detail.delete'),
                },
              }
            : {
                label: t('milestones.detail.closeAction'),
                icon: Archive,
                variant: 'danger' as const,
                hidden: milestoneStatus === 'closed',
                onClick: handleClose,
                confirm: {
                  title: t('milestones.detail.closeTitle'),
                  description: t('milestones.detail.closeBody'),
                  confirmLabel: t('milestones.detail.close'),
                },
              },
        ]}
      >
        {milestoneTags.map((tag, index) => (
          <span key={`${tag}-${index}`} className="rounded border border-white/[0.08] px-1.5 text-[11px] leading-5 text-gray-400">
            #{tag}
          </span>
        ))}
      </PageHeader>

      {/* Progress */}
      {progress && (
        <section aria-label={t('milestones.detail.progressAria')} className="space-y-1.5">
          <ProgressLine value={progress.percentage} size="md" label={t('milestones.detail.progressAria')} />
          <p className="text-[11px] leading-4 text-gray-500 tabular-nums">
            {t('milestones.detail.breakdown', { completed: progress.completed, remaining })}
            {progress.in_progress > 0 && t('milestones.detail.breakdownInProgress', { count: progress.in_progress })}
            {progress.pending > 0 && t('milestones.detail.breakdownPending', { count: progress.pending })}
          </p>
        </section>
      )}

      {/* Plans — expandable list (Plan -> Tasks -> Steps) */}
      <Section
        id="plans"
        title={t('milestones.detail.plansTitle')}
        count={enrichedPlans.length}
        action={
          <Button size="sm" variant="ghost" onClick={handleLinkPlan}>
            <Link2 className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
            {t('milestones.detail.link')}
          </Button>
        }
      >
        {enrichedPlans.length === 0 ? (
          <EmptyState
            size="sm"
            title={t('milestones.detail.noPlansTitle')}
            description={t('milestones.detail.noPlansBody')}
            action={
              <Button size="sm" variant="secondary" onClick={handleLinkPlan}>
                {t('milestones.detail.link')}
              </Button>
            }
          />
        ) : (
          <EntityList aria-label={t('milestones.detail.plansTitle')}>
            {enrichedPlans.map((plan) => (
              <MilestonePlanRow key={plan.id} plan={plan} wsSlug={wsSlug} />
            ))}
          </EntityList>
        )}
      </Section>

      {/* Pipeline Runs — workspace scope only */}
      {scope === 'workspace' && (
        <Section id="runs" title={t('milestones.detail.runs')}>
          {plans.length > 0 ? (
            <PlanRunHistory planIds={plans.map((p) => p.id)} maxRuns={10} showPlanTitle planTitleMap={planTitleMap} />
          ) : (
            <EmptyState size="sm" title={t('milestones.detail.noRuns')} />
          )}
        </Section>
      )}

      {/* Projects — workspace scope only */}
      {scope === 'workspace' && (
        <Section id="projects" title={t('milestones.detail.projects')} count={projects.length}>
          {projects.length === 0 ? (
            <EmptyState size="sm" title={t('milestones.detail.noProjects')} />
          ) : (
            <EntityList aria-label={t('milestones.detail.projects')}>
              {projects.map((p) => (
                <EntityRow
                  key={p.id}
                  title={p.name}
                  href={workspacePath(wsSlug, `/projects/${p.slug}`)}
                  meta={[
                    <span key="slug" className="font-mono">
                      {p.slug}
                    </span>,
                  ]}
                  chevron
                />
              ))}
            </EntityList>
          )}
        </Section>
      )}

      {/* Details */}
      <Section title={t('milestones.detail.details')}>
        <Facts
          items={[
            { label: t('milestones.detail.scope'), value: scope === 'workspace' ? t('milestones.detail.workspaceMilestone') : t('milestones.detail.projectMilestone') },
            { label: t('milestones.detail.project'), value: scope === 'project' ? project?.name : null },
            { label: t('milestones.detail.created'), value: milestoneCreatedAt ? formatAbsolute(milestoneCreatedAt) : null },
            { label: t('milestones.detail.targetDate'), value: milestoneTargetDate ? formatAbsolute(milestoneTargetDate) : null },
            { label: t('milestones.detail.closedAt'), value: milestoneClosedAt ? formatAbsolute(milestoneClosedAt) : null },
          ]}
        />
      </Section>

      {/* Hierarchy graph (milestone → plans → tasks) — toggled from the ⋯ menu */}
      {showGraph && milestoneGraphData.data && (
        <Section
          title={t('milestones.detail.graph')}
          action={
            <Button size="sm" variant="ghost" onClick={() => setShowGraph(false)}>
              {t('milestones.detail.hide')}
            </Button>
          }
        >
          <UnifiedGraphSection
            adapter={MilestoneGraphAdapter}
            data={milestoneGraphData.data}
            availableViews={['3d']}
            defaultView="3d"
            onDrillDown={handleDrillDown}
            breadcrumbs={graphBreadcrumbs}
            projectSlug={primaryProject?.slug}
          />
        </Section>
      )}

      {/* ENTITY_GRAPH_SLOT entity_type="milestone" entity_id={milestoneId_} */}

      <FormDialog {...editDialog.dialogProps} onSubmit={editForm.submit}>
        {editForm.fields}
      </FormDialog>
      <LinkEntityDialog {...linkDialog.dialogProps} />
    </PageContainer>
  )
}
