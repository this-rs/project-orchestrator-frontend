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
  Facts,
  FormDialog,
  LoadingPage,
  MetricTooltip,
  PageContainer,
  PageHeader,
  RelativeTime,
  Section,
  StatusText,
  WatcherToggle,
  focusRing,
  formatAbsolute,
  formatDay,
  pluralize,
  ProgressLine,
} from '@/components/ui'
import { ExpandableMilestoneRow } from '@/components/expandable'
import {
  useIntelligenceData,
  IntelAttention,
  IntelFallback,
  IntelHealthBreakdown,
  IntelQuickActions,
  IntelRefreshButton,
  IntelStatGrid,
} from '@/components/intelligence/IntelligenceDashboard'
import { projectsApi } from '@/services'
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

// ─── Main Page ──────────────────────────────────────────────────────────────

export function ProjectDetailPage() {
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
      setError('Failed to load project')
    } finally {
      if (!signal?.aborted && isInitialLoad) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- project is a data object (would cause loop); setSuggestedProjectId is a stable Jotai setter
  }, [slug, projectRefresh, planRefresh, milestoneRefresh, taskRefresh])

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
      toast.success('Codebase synced')
    } catch (err) {
      console.error('Failed to sync project:', err)
      toast.error('Failed to sync project')
    } finally {
      setSyncing(false)
    }
  }

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
      toast.success('Path copied')
    } catch {
      toast.error('Could not copy path')
    }
  }

  const milestoneForm = CreateMilestoneForm({
    onSubmit: async (data) => {
      if (!project) return
      await projectsApi.createMilestone(project.id, data)
      toast.success('Milestone added')
      await reloadRoadmap(project.id)
    },
  })

  const releaseForm = CreateReleaseForm({
    onSubmit: async (data) => {
      if (!project) return
      await projectsApi.createRelease(project.id, data)
      toast.success('Release added')
      await reloadRoadmap(project.id)
    },
  })

  const editProjectForm = EditProjectForm({
    initialValues: {
      name: project?.name ?? '',
      slug: project?.slug,
      description: project?.description,
      root_path: project?.root_path,
    },
    onSubmit: async (data) => {
      if (!project) return
      await projectsApi.update(project.slug, data)
      setProject({ ...project, ...data })
      toast.success('Project updated')
    },
  })

  if (error) return <ErrorState title="Failed to load" description={error} onRetry={fetchData} />
  if (loading || !project) return <LoadingPage />

  const milestones = roadmap?.milestones ?? []
  const releases = roadmap?.releases ?? []
  const progress = roadmap?.progress
  const intelReady = !intelligence.loading && !intelligence.error && !!intelligence.summary

  const exploreLinks = [
    {
      to: workspacePath(wsSlug, `/projects/${project.slug}/intelligence`),
      icon: Brain,
      label: 'Intelligence',
      desc: 'Layers, neural, behavioral',
    },
    { to: workspacePath(wsSlug, '/skills'), icon: Sparkles, label: 'Skills', desc: 'Skill maturity & profiles' },
    { to: workspacePath(wsSlug, '/feature-graphs'), icon: Network, label: 'Feature graphs', desc: 'Entity graphs & flows' },
  ]

  return (
    <PageContainer width="wide" className="space-y-6">
      {/* ── Header: name, key facts, sync / watch, ⋯ ─────────────────────── */}
      <PageHeader
        title={project.name}
        description={project.description}
        meta={[
          <span key="slug" className="font-mono">
            {project.slug}
          </span>,
          project.last_synced ? (
            <RelativeTime key="sync" date={project.last_synced} prefix="synced " />
          ) : (
            <span key="sync" className="text-amber-400/80">
              Never synced
            </span>
          ),
          pluralize(milestones.length, 'milestone'),
          releases.length > 0 ? pluralize(releases.length, 'release') : null,
        ]}
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={handleSync} loading={syncing} aria-label="Sync codebase">
              {!syncing && <RefreshCw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />}
              {syncing ? 'Syncing…' : 'Sync'}
            </Button>
            {project.root_path && <WatcherToggle projectId={project.id} rootPath={project.root_path} className="min-h-9" />}
          </>
        }
        overflowActions={[
          { label: 'Edit', icon: Pencil, onClick: () => editProjectDialog.open({ title: 'Edit project' }) },
          {
            label: 'Copy root path',
            icon: Clipboard,
            hidden: !project.root_path,
            onClick: () => copyPath(project.root_path),
          },
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'danger',
            onClick: async () => {
              await projectsApi.delete(project.slug)
              toast.success('Project deleted')
              navigate(workspacePath(wsSlug, '/projects'))
            },
            confirm: {
              title: 'Delete project?',
              description: 'This will permanently delete this project and all associated data.',
              confirmLabel: 'Delete',
            },
          },
        ]}
      />

      {/* ── Progress (only when the roadmap has tasks) ───────────────────── */}
      {progress && progress.total_tasks > 0 && (
        <section aria-label="Project progress" className="space-y-1.5">
          <ProgressLine value={progress.percentage} size="md" label="Project progress" />
          <p className="text-[11px] leading-4 text-gray-500 tabular-nums">
            {progress.completed_tasks} / {progress.total_tasks} tasks completed · {Math.round(progress.percentage)}%
            {progress.in_progress_tasks > 0 && ` · ${progress.in_progress_tasks} in progress`}
            {progress.pending_tasks > 0 && ` · ${progress.pending_tasks} pending`}
          </p>
        </section>
      )}

      {/* ── Attention needed (actionable, short) ─────────────────────────── */}
      {intelReady && <IntelAttention data={intelligence} />}

      {/* ── Milestones ───────────────────────────────────────────────────── */}
      <Section
        title="Milestones"
        count={milestones.length}
        action={
          <Button size="sm" variant="ghost" onClick={() => milestoneFormDialog.open({ title: 'Add milestone' })}>
            Add
          </Button>
        }
      >
        {milestones.length === 0 ? (
          <EmptyState
            size="sm"
            title="No milestones yet"
            description="Group plans into milestones to track delivery."
            action={
              <Button size="sm" variant="secondary" onClick={() => milestoneFormDialog.open({ title: 'Add milestone' })}>
                Add
              </Button>
            }
          />
        ) : (
          <EntityList aria-label="Milestones">
            {milestones.map(({ milestone, progress: msProgress }) => (
              <ExpandableMilestoneRow key={milestone.id} milestone={milestone} progress={msProgress} refreshTrigger={taskRefresh} />
            ))}
          </EntityList>
        )}
      </Section>

      {/* ── Releases (collapsed by default) ──────────────────────────────── */}
      <Section
        title={<MetricTooltip term="release">Releases</MetricTooltip>}
        count={releases.length}
        collapsible
        defaultOpen={false}
        action={
          <Button size="sm" variant="ghost" onClick={() => releaseFormDialog.open({ title: 'Add release' })}>
            Add
          </Button>
        }
      >
        {releases.length === 0 ? (
          <EmptyState size="sm" title="No releases yet" />
        ) : (
          <EntityList aria-label="Releases">
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
                    <span title={formatAbsolute(release.target_date)}>due {formatDay(release.target_date)}</span>
                  ) : undefined
                }
                meta={[
                  <StatusText key="s" kind="release" status={release.status} />,
                  tasks.length > 0 ? pluralize(tasks.length, 'task') : null,
                  commits.length > 0 ? pluralize(commits.length, 'commit') : null,
                ]}
              />
            ))}
          </EntityList>
        )}
      </Section>

      {/* ── Health: key numbers + breakdown ──────────────────────────────── */}
      <Section title="Health" action={intelReady ? <IntelRefreshButton data={intelligence} /> : undefined}>
        {intelReady && intelligence.summary ? (
          <div className="space-y-2">
            <IntelStatGrid summary={intelligence.summary} />
            <IntelHealthBreakdown data={intelligence} />
          </div>
        ) : (
          <IntelFallback intelligence={intelligence} />
        )}
      </Section>

      {/* ── Knowledge graph maintenance (collapsed) ──────────────────────── */}
      {intelReady && <IntelQuickActions data={intelligence} />}

      {/* ── Details ──────────────────────────────────────────────────────── */}
      <Section title="Details">
        <Facts
          items={[
            {
              label: 'Root path',
              value: project.root_path ? (
                <button
                  type="button"
                  onClick={() => copyPath(project.root_path)}
                  title="Copy path"
                  className={`font-mono text-xs text-gray-300 break-all text-right sm:text-left hover:text-white inline-flex items-start gap-1.5 rounded ${focusRing}`}
                >
                  <span>{project.root_path}</span>
                  <Clipboard className="w-3 h-3 mt-0.5 shrink-0 text-gray-500" aria-hidden="true" />
                  <span className="sr-only">Copy path</span>
                </button>
              ) : null,
            },
            { label: 'Created', value: project.created_at ? formatAbsolute(project.created_at) : null },
            { label: 'Last synced', value: project.last_synced ? formatAbsolute(project.last_synced) : 'Never' },
          ]}
        />
      </Section>

      {/* ── Explore ──────────────────────────────────────────────────────── */}
      <Section title="Explore">
        <EntityList aria-label="Explore">
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
