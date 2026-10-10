import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSetAtom, useAtomValue } from 'jotai'
import { Brain, Clipboard, Network, Pencil, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import {
  Button,
  EmptyState,
  EntityList,
  EntityRow,
  ErrorState,
  Fact,
  Facts,
  FormDialog,
  LoadingPage,
  MetricTooltip,
  PageContainer,
  PageHeader,
  RelativeTime,
  Section,
  StatusText,
  ToneText,
  WatcherToggle,
  formatAbsolute,
  formatDay,
  ProgressLine,
} from '@/components/ui'
import { glassFlat, iconButton } from '@/components/ui/classes'
import { ExpandableMilestoneRow } from '@/components/expandable'
import {
  useIntelligenceData,
  IntelAttention,
  IntelFallback,
  IntelQuickActions,
  IntelRefreshButton,
  IntelPulse,
} from '@/components/intelligence/IntelligenceDashboard'
import { projectsApi } from '@/services'
import { useT, type MessageKey } from '@/i18n'
import { useFormDialog, useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import {
  chatSuggestedProjectIdAtom,
  projectRefreshAtom,
  planRefreshAtom,
  milestoneRefreshAtom,
  taskRefreshAtom,
} from '@/atoms'
import { CreateMilestoneForm, CreateReleaseForm, EditProjectForm } from '@/components/forms'
import type { Project, ProjectRoadmap } from '@/types'
import { PROJECT_PROFILE_TEXT, hasCodebase, profileIcon, profileLabel, profileOf } from '@/constants/projectProfile'

// ─── Main Page ──────────────────────────────────────────────────────────────

export function ProjectDetailPage() {
  const { t } = useT()
  const count = (n: number, key: 'milestone' | 'release' | 'task' | 'commit') =>
    t(`projects.counts.${key}.${n === 1 ? 'one' : 'other'}` as MessageKey, { n })
  const { projectSlug: slug } = useParams<{ projectSlug: string }>()
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()
  const editProjectDialog = useFormDialog()
  const milestoneFormDialog = useFormDialog()
  const releaseFormDialog = useFormDialog()
  const toast = useToast()
  const setSuggestedProjectId = useSetAtom(chatSuggestedProjectIdAtom)
  const projectRefresh = useAtomValue(projectRefreshAtom)
  const planRefresh = useAtomValue(planRefreshAtom)
  const milestoneRefresh = useAtomValue(milestoneRefreshAtom)
  const taskRefresh = useAtomValue(taskRefreshAtom)
  const [project, setProject] = useState<Project | null>(null)
  const [roadmap, setRoadmap] = useState<ProjectRoadmap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  // Intelligence data
  const intelligence = useIntelligenceData(slug ?? '')

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!slug) return
    setError(null)
    const isInitialLoad = !project
    if (isInitialLoad) setLoading(true)
    try {
      const projectData = await projectsApi.get(slug, signal)
      if (signal?.aborted) return
      setProject(projectData)
      setSuggestedProjectId(projectData.id)

      try {
        const roadmapData = await projectsApi.getRoadmap(projectData.id, signal)
        if (signal?.aborted) return
        setRoadmap(roadmapData)
      } catch {
        // Roadmap might not be available (or aborted)
      }
    } catch (err) {
      if (signal?.aborted) return
      console.error('Failed to fetch project:', err)
      setError(t('projects.detail.loadFailed'))
    } finally {
      if (!signal?.aborted && isInitialLoad) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- project is a data object (would cause loop); setSuggestedProjectId is a stable Jotai setter
  }, [slug, t, projectRefresh, planRefresh, milestoneRefresh, taskRefresh])

  useEffect(() => {
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData])

  const reloadRoadmap = async (projectId: string) => {
    try {
      setRoadmap(await projectsApi.getRoadmap(projectId))
    } catch {
      /* ignore */
    }
  }

  const handleSync = async () => {
    if (!slug) return
    setSyncing(true)
    try {
      await projectsApi.sync(slug)
      const projectData = await projectsApi.get(slug)
      setProject(projectData)
      toast.success(t('projects.detail.codebaseSynced'))
    } catch (err) {
      console.error('Failed to sync project:', err)
      toast.error(t('projects.detail.syncFailed'))
    } finally {
      setSyncing(false)
    }
  }

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
      toast.success(t('projects.detail.pathCopied'))
    } catch {
      toast.error(t('projects.detail.pathCopyFailed'))
    }
  }

  const milestoneForm = CreateMilestoneForm({
    onSubmit: async (data) => {
      if (!project) return
      await projectsApi.createMilestone(project.id, data)
      toast.success(t('projects.detail.milestoneAdded'))
      await reloadRoadmap(project.id)
    },
  })

  const releaseForm = CreateReleaseForm({
    onSubmit: async (data) => {
      if (!project) return
      await projectsApi.createRelease(project.id, data)
      toast.success(t('projects.detail.releaseAdded'))
      await reloadRoadmap(project.id)
    },
  })

  const editProjectForm = EditProjectForm({
    initialValues: {
      name: project?.name ?? '',
      slug: project?.slug,
      description: project?.description,
      root_path: project?.root_path,
      profile: project?.profile,
    },
    onSubmit: async (data) => {
      if (!project) return
      await projectsApi.update(project.slug, data)
      setProject({ ...project, ...data, root_path: data.root_path || undefined })
      toast.success(t('projects.detail.updated'))
    },
  })

  if (error) return <ErrorState title={t('projects.common.failedTitle')} description={error} onRetry={fetchData} />
  if (loading || !project) return <LoadingPage />

  const milestones = roadmap?.milestones ?? []
  const releases = roadmap?.releases ?? []
  const progress = roadmap?.progress
  const intelReady = !intelligence.loading && !intelligence.error && !!intelligence.summary
  const profile = profileOf(project)
  // Only a codebase is synced or watched; a project without code has nothing to index.
  const codebase = hasCodebase(project)

  const exploreLinks = [
    {
      to: workspacePath(wsSlug, `/projects/${project.slug}/intelligence`),
      icon: Brain,
      label: 'Intelligence',
      desc: t('projects.detail.intelligenceDesc'),
    },
    { to: workspacePath(wsSlug, '/skills'), icon: Sparkles, label: t('nav.concepts.skills'), desc: t('projects.detail.skillsDesc') },
    { to: workspacePath(wsSlug, '/feature-graphs'), icon: Network, label: t('nav.concepts.featureGraphs'), desc: t('projects.detail.featureGraphsDesc') },
  ]

  return (
    <PageContainer width="wide" className="space-y-6">
      {/* ── Header: name, key facts, sync / watch, ⋯ ─────────────────────── */}
      <PageHeader
        title={project.name}
        description={project.description}
        meta={[
          <Fact key="type" icon={profileIcon(profile)} title={PROJECT_PROFILE_TEXT.type}>
            {profileLabel(profile)}
          </Fact>,
          <span key="slug" className="font-mono">
            {project.slug}
          </span>,
          !codebase ? null : project.last_synced ? (
            <RelativeTime key="sync" date={project.last_synced} prefix={`${t('projects.common.synced')} `} />
          ) : (
            <ToneText key="sync" tone="warning" label={t('projects.common.neverSynced')} />
          ),
          count(milestones.length, 'milestone'),
          releases.length > 0 ? count(releases.length, 'release') : null,
        ]}
        actions={
          <>
            {codebase && (
              <Button size="sm" variant="secondary" onClick={handleSync} loading={syncing} aria-label={t('projects.detail.syncAria')}>
                {!syncing && <RefreshCw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />}
                {syncing ? t('projects.detail.syncing') : t('projects.detail.sync')}
              </Button>
            )}
            {codebase && project.root_path && <WatcherToggle projectId={project.id} rootPath={project.root_path} className="min-h-9" />}
          </>
        }
        overflowActions={[
          { label: t('projects.common.edit'), icon: Pencil, onClick: () => editProjectDialog.open({ title: t('projects.detail.editTitle') }) },
          {
            label: t('projects.detail.copyRootPath'),
            icon: Clipboard,
            hidden: !project.root_path,
            onClick: () => { if (project.root_path) copyPath(project.root_path) },
          },
          {
            label: t('projects.common.delete'),
            icon: Trash2,
            variant: 'danger',
            onClick: async () => {
              await projectsApi.delete(project.slug)
              toast.success(t('projects.detail.deleted'))
              navigate(workspacePath(wsSlug, '/projects'))
            },
            confirm: {
              title: t('projects.detail.deleteTitle'),
              description: t('projects.detail.deleteDescription'),
              confirmLabel: t('projects.common.delete'),
            },
          },
        ]}
      />

      {/* ── Progress (only when the roadmap has tasks) ───────────────────── */}
      {progress && progress.total_tasks > 0 && (
        <section aria-label={t('projects.detail.progress')} className="space-y-1.5">
          <ProgressLine value={progress.percentage} size="md" label={t('projects.detail.progress')} />
          <p className="text-[11px] leading-4 text-gray-500 tabular-nums">
            {t('projects.detail.tasksCompleted', {
              done: progress.completed_tasks,
              total: progress.total_tasks,
              percent: Math.round(progress.percentage),
            })}
            {progress.in_progress_tasks > 0 && ` · ${t('projects.detail.inProgress', { n: progress.in_progress_tasks })}`}
            {progress.pending_tasks > 0 && ` · ${t('projects.detail.pending', { n: progress.pending_tasks })}`}
          </p>
        </section>
      )}

      {/* ── Health: key numbers + breakdown ──────────────────────────────── */}
      <Section title={t('projects.common.health')} action={intelReady ? <IntelRefreshButton data={intelligence} /> : undefined}>
        {intelReady && intelligence.summary ? (
          <IntelPulse data={intelligence} />
        ) : (
          <IntelFallback intelligence={intelligence} />
        )}
      </Section>

      {/* ── Attention needed (actionable, short) ─────────────────────────── */}
      {intelReady && <IntelAttention data={intelligence} />}

      {/* ── Milestones ───────────────────────────────────────────────────── */}
      <Section
        title={t('projects.detail.milestones')}
        count={milestones.length}
        action={
          <Button size="sm" variant="ghost" onClick={() => milestoneFormDialog.open({ title: t('projects.detail.addMilestone') })}>
            {t('projects.common.add')}
          </Button>
        }
      >
        {milestones.length === 0 ? (
          <EmptyState
            size="sm"
            title={t('projects.detail.noMilestones')}
            description={t('projects.detail.noMilestonesDescription')}
            action={
              <Button size="sm" variant="secondary" onClick={() => milestoneFormDialog.open({ title: t('projects.detail.addMilestone') })}>
                {t('projects.common.add')}
              </Button>
            }
          />
        ) : (
          <EntityList aria-label={t('projects.detail.milestones')}>
            {milestones.map(({ milestone, progress: msProgress }) => (
              <ExpandableMilestoneRow key={milestone.id} milestone={milestone} progress={msProgress} refreshTrigger={taskRefresh} />
            ))}
          </EntityList>
        )}
      </Section>

      {/* ── Releases (collapsed by default) ──────────────────────────────── */}
      <Section
        title={<MetricTooltip term="release">{t('projects.detail.releases')}</MetricTooltip>}
        count={releases.length}
        collapsible
        defaultOpen={false}
        action={
          <Button size="sm" variant="ghost" onClick={() => releaseFormDialog.open({ title: t('projects.detail.addRelease') })}>
            {t('projects.common.add')}
          </Button>
        }
      >
        {releases.length === 0 ? (
          <EmptyState size="sm" title={t('projects.detail.noReleases')} />
        ) : (
          <EntityList aria-label={t('projects.detail.releases')}>
            {releases.map(({ release, tasks, commits }) => (
              <EntityRow
                key={release.id}
                title={`v${release.version}${release.title ? ` — ${release.title}` : ''}`}
                description={release.description || undefined}
                muted={release.status === 'cancelled'}
                trailing={
                  release.released_at ? (
                    <RelativeTime date={release.released_at} />
                  ) : release.target_date ? (
                    <span title={formatAbsolute(release.target_date)}>{t('projects.common.due', { date: formatDay(release.target_date) })}</span>
                  ) : undefined
                }
                meta={[
                  <StatusText key="s" kind="release" status={release.status} />,
                  tasks.length > 0 ? count(tasks.length, 'task') : null,
                  commits.length > 0 ? count(commits.length, 'commit') : null,
                ]}
              />
            ))}
          </EntityList>
        )}
      </Section>

      {/* ── Knowledge graph maintenance (collapsed) ──────────────────────── */}
      {intelReady && <IntelQuickActions data={intelligence} />}

      {/* ── Details ──────────────────────────────────────────────────────── */}
      <Section title={t('projects.detail.details')}>
        <Facts
          items={[
            { label: PROJECT_PROFILE_TEXT.type, value: profileLabel(profile) },
            {
              label: t('projects.detail.rootPath'),
              value: project.root_path ? (
                <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
                  <span className="font-mono text-xs text-gray-300 break-all min-w-0">{project.root_path}</span>
                  <button
                    type="button"
                    onClick={() => project.root_path && copyPath(project.root_path)}
                    title={t('projects.detail.copyPath')}
                    aria-label={t('projects.detail.copyPath')}
                    className={`${iconButton('ghost', 'size-9 md:size-8')} ${glassFlat} -my-2 text-gray-500`}
                  >
                    <Clipboard className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </span>
              ) : null,
            },
            { label: t('projects.detail.created'), value: project.created_at ? formatAbsolute(project.created_at) : null },
            {
              label: t('projects.detail.lastSynced'),
              hidden: !codebase,
              value: project.last_synced ? formatAbsolute(project.last_synced) : t('projects.detail.never'),
            },
          ]}
        />
      </Section>

      {/* ── Explore ──────────────────────────────────────────────────────── */}
      <Section title={t('projects.detail.explore')}>
        <EntityList aria-label={t('projects.detail.explore')}>
          {exploreLinks.map((l) => (
            <EntityRow
              key={l.label}
              title={l.label}
              href={l.to}
              description={l.desc}
              leading={<l.icon className="w-4 h-4 text-gray-500" aria-hidden="true" />}
              chevron
            />
          ))}
        </EntityList>
      </Section>

      {/* ENTITY_GRAPH_SLOT entity_type="project" entity_id={project.id} */}

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      <FormDialog {...milestoneFormDialog.dialogProps} onSubmit={milestoneForm.submit}>
        {milestoneForm.fields}
      </FormDialog>
      <FormDialog {...releaseFormDialog.dialogProps} onSubmit={releaseForm.submit}>
        {releaseForm.fields}
      </FormDialog>
      <FormDialog {...editProjectDialog.dialogProps} onSubmit={editProjectForm.submit}>
        {editProjectForm.fields}
      </FormDialog>
    </PageContainer>
  )
}
