import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FolderSync,
  Eye,
  Square,
  Trash2,
  Sparkles,
  RefreshCw,
  Wrench,
  Zap,
  Brain,
  BarChart3,
  Activity,
  GitCommitHorizontal,
  Play,
} from 'lucide-react'
import {
  Button,
  Facts,
  Input,
  ListGroup,
  PageContainer,
  PageHeader,
  RelativeTime,
  Section,
  Select,
  StatusText,
  Switch,
  ConfirmDialog,
} from '@/components/ui'
import { useT } from '@/i18n'
import { ActionRow, Notice, SettingRow, SettingsList } from '@/components/settings/SettingRow'
import { adminApi, workspacesApi } from '@/services'
import { useConfirmDialog, useToast, useWorkspaceSlug } from '@/hooks'
import type { BackfillJobStatus, MeilisearchStats, MaintenanceLevel, WatchStatus } from '@/types'
import { isProjectWatched, unlinkedWatchedPaths } from '@/utils/watch'
import { NOMENCLATURE } from '@/constants/nomenclature'

// ============================================================================
// MAIN PAGE
// ============================================================================

export function AdminPage() {
  const { t } = useT()
  const wsSlug = useWorkspaceSlug()

  // Projects for scoping the Knowledge Fabric actions
  const [projects, setProjects] = useState<{ id: string; name: string; slug: string }[]>([])
  const [selectedProject, setSelectedProject] = useState('')

  useEffect(() => {
    if (!wsSlug) return
    workspacesApi
      .listProjects(wsSlug)
      .then((data) => {
        const mapped = data.map((p) => ({ id: p.id, name: p.name, slug: p.slug }))
        setProjects(mapped)
        if (mapped.length > 0) setSelectedProject(mapped[0].id)
      })
      .catch(() => {})
  }, [wsSlug])

  const selectedProjectSlug = projects.find((p) => p.id === selectedProject)?.slug || ''

  return (
    <PageContainer width="narrow" className="space-y-6">
      <PageHeader
        title={NOMENCLATURE.admin.plural}
        intro="admin"
        description={t('admin.description')}
      />

      <SyncWatchersSection />
      <SearchEngineSection />
      <EmbeddingsSection />
      <KnowledgeFabricSection
        projects={projects}
        projectId={selectedProject}
        projectSlug={selectedProjectSlug}
        onProjectChange={setSelectedProject}
      />
      <CleanupSection />
    </PageContainer>
  )
}

// ============================================================================
// SECTION: SYNC & WATCHERS
// ============================================================================

interface WsProjects {
  workspace: { name: string; slug: string }
  projects: { id: string; name: string; slug: string; root_path: string }[]
}

function SyncWatchersSection() {
  const { t } = useT()
  const [watchStatus, setWatchStatus] = useState<WatchStatus | null>(null)
  const [wsProjectGroups, setWsProjectGroups] = useState<WsProjects[]>([])
  const [syncPath, setSyncPath] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [togglingPaths, setTogglingPaths] = useState<Set<string>>(new Set())
  const toast = useToast()
  const confirmDialog = useConfirmDialog()

  const fetchWatchStatus = useCallback(async () => {
    try {
      setWatchStatus(await adminApi.getWatchStatus())
    } catch {
      setWatchStatus(null)
    }
  }, [])

  // Fetch all workspaces + their projects
  useEffect(() => {
    fetchWatchStatus()
    workspacesApi
      .list({ limit: 100 })
      .then(async (res) => {
        const workspaces = res.items || []
        const groups: WsProjects[] = await Promise.all(
          workspaces.map(async (ws) => {
            try {
              const projects = await workspacesApi.listProjects(ws.slug)
              return {
                workspace: { name: ws.name, slug: ws.slug },
                projects: projects
                  .filter((p) => p.root_path)
                  .map((p) => ({ id: p.id, name: p.name, slug: p.slug, root_path: p.root_path as string })),
              }
            } catch {
              return { workspace: { name: ws.name, slug: ws.slug }, projects: [] }
            }
          }),
        )
        setWsProjectGroups(groups.filter((g) => g.projects.length > 0))
      })
      .catch(() => {})
  }, [fetchWatchStatus])

  const allProjects = wsProjectGroups.flatMap((g) => g.projects)

  const isPathWatched = useCallback(
    (projectId: string, rootPath: string) => isProjectWatched(watchStatus, projectId, rootPath),
    [watchStatus],
  )

  const handleToggleWatchPath = async (
    path: string,
    projectId: string | undefined,
    projectName: string | undefined,
    currentlyWatched: boolean,
  ) => {
    setTogglingPaths((prev) => new Set(prev).add(path))
    try {
      if (currentlyWatched) {
        if (projectId) {
          await adminApi.stopWatch(projectId)
          toast.success(t('admin.sync.stoppedFor', { name: projectName ?? path }))
        } else {
          await adminApi.stopWatch()
          toast.success(t('admin.sync.stopped'))
        }
      } else {
        await adminApi.startWatch({ path, project_id: projectId })
        toast.success(t('admin.sync.startedFor', { name: projectName ?? path }))
      }
      fetchWatchStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.sync.toggleFailed'))
    } finally {
      setTogglingPaths((prev) => {
        const next = new Set(prev)
        next.delete(path)
        return next
      })
    }
  }

  /** Watched paths not matching any known project */
  const unlinkedPaths = unlinkedWatchedPaths(watchStatus, allProjects)

  const handleSync = async () => {
    if (!syncPath.trim()) return
    setSyncing(true)
    try {
      const res = await adminApi.syncDirectory({ path: syncPath.trim() })
      toast.success(t('admin.sync.synced', { synced: res.files_synced, skipped: res.files_skipped, deleted: res.files_deleted }))
      setSyncPath('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.sync.syncFailed'))
    } finally {
      setSyncing(false)
    }
  }

  const handleStartWatch = async () => {
    if (!syncPath.trim()) return
    try {
      await adminApi.startWatch({ path: syncPath.trim() })
      toast.success(t('admin.sync.startedFor', { name: syncPath.trim() }))
      setSyncPath('')
      fetchWatchStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.sync.startFailed'))
    }
  }

  const handleStopAll = () => {
    confirmDialog.open({
      title: t('admin.sync.stopAllTitle'),
      description: t('admin.sync.stopAllDescription'),
      variant: 'warning',
      confirmLabel: t('admin.sync.stopAll'),
      onConfirm: async () => {
        await adminApi.stopWatch()
        toast.success(t('admin.sync.allStopped'))
        fetchWatchStatus()
      },
    })
  }

  const activeCount = watchStatus?.watched_paths.length ?? 0

  return (
    <Section
      title={t('admin.sync.title')}
      description={t('admin.sync.description')}
      action={
        watchStatus?.running && activeCount > 0 ? (
          <Button size="sm" variant="danger" onClick={handleStopAll}>
            <Square className="w-3.5 h-3.5" aria-hidden="true" />
            {t('admin.sync.stopAll')}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {watchStatus && (
          <p className="text-xs text-gray-500">
            <StatusText
              status={watchStatus.running ? 'running' : 'idle'}
              kind="run"
              label={watchStatus.running ? (activeCount === 1 ? t('admin.sync.watchingOne') : t('admin.sync.watchingMany', { n: activeCount })) : t('admin.sync.noWatcher')}
            />
          </p>
        )}

        {(wsProjectGroups.length > 0 || unlinkedPaths.length > 0) && (
          <div>
            {wsProjectGroups.map((group) => (
              <ListGroup key={group.workspace.slug} title={group.workspace.name} count={group.projects.length}>
                {group.projects.map((project) => {
                  const watched = isPathWatched(project.id, project.root_path)
                  return (
                    <SettingRow
                      key={project.id}
                      label={project.name}
                      description={
                        <code className="block truncate font-mono text-[11px]" title={project.root_path}>
                          {project.root_path}
                        </code>
                      }
                      control={
                        <Switch
                          checked={watched}
                          disabled={togglingPaths.has(project.root_path)}
                          onChange={() => handleToggleWatchPath(project.root_path, project.id, project.name, watched)}
                          ariaLabel={t('admin.sync.watchAria', { name: project.name })}
                        />
                      }
                    />
                  )
                })}
              </ListGroup>
            ))}
            {unlinkedPaths.length > 0 && (
              <ListGroup title={t('admin.sync.unlinked')} count={unlinkedPaths.length}>
                {unlinkedPaths.map((path) => (
                  <SettingRow
                    key={path}
                    label={
                      <code className="block truncate font-mono text-xs" title={path}>
                        {path}
                      </code>
                    }
                    description={t('admin.sync.unlinkedDescription')}
                    control={
                      <Switch
                        checked
                        disabled={togglingPaths.has(path)}
                        onChange={() => handleToggleWatchPath(path, undefined, undefined, true)}
                        ariaLabel={t('admin.sync.watchAria', { name: path })}
                      />
                    }
                  />
                ))}
              </ListGroup>
            )}
          </div>
        )}

        <SettingsList>
          <SettingRow
            label={t('admin.sync.syncOrWatch')}
            description={t('admin.sync.syncOrWatchDescription')}
          >
            <div className="flex flex-wrap gap-2">
              <div className="flex-[1_1_12rem] min-w-0">
                <Input
                  placeholder={t('admin.sync.pathPlaceholder')}
                  aria-label={t('admin.sync.pathAria')}
                  value={syncPath}
                  onChange={(e) => setSyncPath(e.target.value)}
                  className="h-9 py-1.5"
                />
              </div>
              <Button variant="secondary" size="sm" onClick={handleSync} loading={syncing} disabled={!syncPath.trim()}>
                {!syncing && <FolderSync className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />}
                {t('admin.sync.sync')}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleStartWatch} disabled={!syncPath.trim()}>
                <Eye className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                {t('admin.sync.watch')}
              </Button>
            </div>
          </SettingRow>
        </SettingsList>
      </div>
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </Section>
  )
}

// ============================================================================
// SECTION: SEARCH ENGINE (Meilisearch)
// ============================================================================

function SearchEngineSection() {
  const { t } = useT()
  const [stats, setStats] = useState<MeilisearchStats | null>(null)

  useEffect(() => {
    adminApi
      .getMeilisearchStats()
      .then(setStats)
      .catch(() => setStats(null))
  }, [])

  return (
    <Section
      title={t('admin.search.title')}
      description={t('admin.search.description')}
      collapsible
      defaultOpen={false}
    >
      <div className="space-y-3">
        <Facts
          items={[
            {
              label: t('admin.search.documents'),
              value: stats ? (
                <span>
                  <span className="tabular-nums">{stats.code_documents.toLocaleString()}</span>
                  <span className="text-gray-500"> {t('admin.search.filesIndexed')}</span>
                </span>
              ) : (
                '—'
              ),
            },
            {
              label: t('admin.search.status'),
              value: stats ? (
                <StatusText
                  kind="run"
                  status={stats.is_indexing ? 'running' : 'completed'}
                  label={stats.is_indexing ? t('admin.search.indexing') : t('admin.search.ready')}
                  pulse={stats.is_indexing}
                />
              ) : (
                '—'
              ),
            },
          ]}
        />
        <SettingsList>
          <ActionRow
            label={t('admin.search.cleanLabel')}
            description={t('admin.search.cleanDescription')}
            cost={t('admin.search.cleanCost')}
            icon={<Trash2 />}
            buttonLabel={t('admin.search.clean')}
            confirm={{
              title: t('admin.search.cleanLabel'),
              description: t('admin.search.confirmDescription'),
              variant: 'info',
            }}
            onAction={async () => {
              const res = await adminApi.deleteMeilisearchOrphans()
              return res.message || t('admin.search.cleaned')
            }}
          />
        </SettingsList>
      </div>
    </Section>
  )
}

// ============================================================================
// SECTION: EMBEDDINGS & BACKFILLS
// ============================================================================

interface BackfillRowProps {
  label: string
  description: string
  cost: string
  getStatus: () => Promise<BackfillJobStatus>
  onStart: () => Promise<unknown>
  onCancel: () => Promise<unknown>
}

/** Long-running backfill job: status, progress (polled every 3 s while running), start / cancel. */
function BackfillRow({ label, description, cost, getStatus, onStart, onCancel }: BackfillRowProps) {
  const { t } = useT()
  const [status, setStatus] = useState<BackfillJobStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const toast = useToast()

  const fetchStatus = useCallback(async () => {
    try {
      setStatus(await getStatus())
    } catch {
      // keep last known status
    }
  }, [getStatus])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Poll while running
  useEffect(() => {
    if (status?.status === 'running') {
      intervalRef.current = setInterval(fetchStatus, 3000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [status?.status, fetchStatus])

  const isRunning = status?.status === 'running'
  const progress = status?.progress

  const handle = async () => {
    setBusy(true)
    try {
      if (isRunning) {
        await onCancel()
        toast.success(t('admin.embeddings.cancelled', { label }))
      } else {
        await onStart()
        toast.success(t('admin.embeddings.started', { label }))
      }
      await fetchStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : isRunning ? t('admin.embeddings.cancelFailed') : t('admin.embeddings.startFailed'))
    } finally {
      setBusy(false)
    }
  }

  const state = status?.status ?? 'idle'

  return (
    <SettingRow
      label={label}
      description={description}
      meta={[
        <StatusText
          key="s"
          kind="run"
          status={state === 'idle' ? 'pending' : state}
          label={state === 'idle' ? t('admin.embeddings.idle') : undefined}
          pulse={isRunning}
        />,
        isRunning && progress ? (
          <span key="p" className="tabular-nums">
            {progress.current} / {progress.total} · {progress.percentage.toFixed(1)}%
          </span>
        ) : null,
        !isRunning && status?.finished_at ? <RelativeTime key="f" date={status.finished_at} prefix={`${t('admin.embeddings.finished')} `} /> : null,
        cost,
      ]}
      control={
        <Button
          variant={isRunning ? 'danger' : 'secondary'}
          size="sm"
          onClick={handle}
          loading={busy}
          aria-label={`${isRunning ? t('admin.embeddings.cancel') : t('admin.embeddings.start')} — ${label}`}
        >
          {!busy && (isRunning ? <Square className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> : <Play className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />)}
          {isRunning ? t('admin.embeddings.cancel') : t('admin.embeddings.start')}
        </Button>
      }
    >
      {(isRunning && progress) || status?.error ? (
        <div className="space-y-1.5">
          {isRunning && progress && (
            <div
              className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden"
              role="progressbar"
              aria-label={t('admin.embeddings.progress', { label })}
              aria-valuenow={Math.round(progress.percentage)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              {/* No width tween: live data updates in place (DESIGN.md › Mouvement) */}
              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${progress.percentage}%` }} />
            </div>
          )}
          {status?.error && <p className="text-xs text-red-400 break-words">{status.error}</p>}
        </div>
      ) : null}
    </SettingRow>
  )
}

function EmbeddingsSection() {
  const { t } = useT()
  return (
    <Section
      title={t('admin.embeddings.title')}
      description={t('admin.embeddings.description')}
      collapsible
      defaultOpen={false}
    >
      <SettingsList>
        <BackfillRow
          label={t('admin.embeddings.noteLabel')}
          description={t('admin.embeddings.noteDescription')}
          cost={t('admin.embeddings.backgroundCost')}
          getStatus={adminApi.getBackfillEmbeddingsStatus}
          onStart={() => adminApi.startBackfillEmbeddings()}
          onCancel={() => adminApi.cancelBackfillEmbeddings()}
        />
        <BackfillRow
          label={t('admin.embeddings.synapseLabel')}
          description={t('admin.embeddings.synapseDescription')}
          cost={t('admin.embeddings.backgroundCost')}
          getStatus={adminApi.getBackfillSynapsesStatus}
          onStart={() => adminApi.startBackfillSynapses()}
          onCancel={() => adminApi.cancelBackfillSynapses()}
        />
        <ActionRow
          label={t('admin.embeddings.decisionLabel')}
          description={t('admin.embeddings.decisionDescription')}
          cost={t('admin.embeddings.safeCost')}
          icon={<Zap />}
          onAction={async () => {
            const res = await adminApi.backfillDecisionEmbeddings()
            return t('admin.embeddings.decisionResult', { decisions: res.decisions_processed, embeddings: res.embeddings_created })
          }}
        />
        <ActionRow
          label={t('admin.embeddings.discussedLabel')}
          description={t('admin.embeddings.discussedDescription')}
          cost={t('admin.embeddings.discussedCost')}
          icon={<Zap />}
          onAction={async () => {
            const res = await adminApi.backfillDiscussed()
            return t('admin.embeddings.discussedResult', { sessions: res.sessions_processed, entities: res.entities_found, relations: res.relations_created })
          }}
        />
      </SettingsList>
    </Section>
  )
}

// ============================================================================
// SECTION: KNOWLEDGE FABRIC
// ============================================================================

interface KnowledgeFabricSectionProps {
  projects: { id: string; name: string }[]
  projectId: string
  projectSlug: string
  onProjectChange: (id: string) => void
}

const LEVELS = ['hourly', 'daily', 'weekly', 'full'] as const

function KnowledgeFabricSection({ projects, projectId, projectSlug, onProjectChange }: KnowledgeFabricSectionProps) {
  const { t } = useT()
  const [maintenanceLevel, setMaintenanceLevel] = useState<MaintenanceLevel>('daily')
  const projectRequired = !projectId

  return (
    <Section
      title={t('admin.fabric.title')}
      description={t('admin.fabric.description')}
      collapsible
      defaultOpen={false}
    >
      <div className="space-y-3">
        <SettingsList>
          <SettingRow
            label={t('admin.fabric.project')}
            description={t('admin.fabric.projectDescription')}
            control={
              projects.length > 0 ? (
                <Select
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                  value={projectId}
                  onChange={onProjectChange}
                  className="w-44"
                />
              ) : (
                <span className="text-xs text-gray-500">{t('admin.fabric.noProject')}</span>
              )
            }
          />
        </SettingsList>
        {projectRequired && <Notice tone="warning">{t('admin.fabric.addProject')}</Notice>}

        <ListGroup title={t('admin.fabric.pipeline')}>
          <ActionRow
            label={t('admin.fabric.bootstrapLabel')}
            description={t('admin.fabric.bootstrapDescription')}
            cost={t('admin.fabric.bootstrapCost')}
            icon={<Sparkles />}
            buttonLabel={t('admin.fabric.bootstrapButton')}
            buttonVariant="primary"
            disabled={projectRequired}
            confirm={{
              title: t('admin.fabric.bootstrapLabel'),
              description: t('admin.fabric.bootstrapConfirm'),
            }}
            onAction={async () => {
              const res = await adminApi.bootstrapKnowledgeFabric({ project_id: projectId })
              const ok = res.steps_completed.length
              const fail = res.steps_failed.length
              const seconds = (res.total_time_ms / 1000).toFixed(1)
              return fail > 0 ? t('admin.fabric.bootstrapResultFailed', { ok, fail, seconds }) : t('admin.fabric.bootstrapResult', { ok, seconds })
            }}
          />
          <ActionRow
            label={t('admin.fabric.scoresLabel')}
            description={t('admin.fabric.scoresDescription')}
            cost={t('admin.embeddings.safeCost')}
            icon={<BarChart3 />}
            buttonLabel={t('admin.fabric.update')}
            disabled={projectRequired}
            confirm={{
              title: t('admin.fabric.scoresLabel'),
              description: t('admin.fabric.scoresConfirm'),
            }}
            onAction={async () => {
              const res = await adminApi.updateFabricScores({ project_id: projectId })
              return t('admin.fabric.scoresResult', { nodes: res.nodes_updated, communities: res.communities, seconds: (res.computation_ms / 1000).toFixed(1) })
            }}
          />
          <ActionRow
            label={t('admin.fabric.touchesLabel')}
            description={t('admin.fabric.touchesDescription')}
            cost={t('admin.fabric.touchesCost')}
            icon={<GitCommitHorizontal />}
            buttonLabel={t('admin.embeddings.start')}
            disabled={projectRequired || !projectSlug}
            confirm={{
              title: t('admin.fabric.touchesConfirmTitle'),
              description: t('admin.fabric.touchesConfirm'),
            }}
            onAction={async () => {
              const res = await adminApi.backfillTouches(projectSlug)
              return t('admin.fabric.touchesResult', { parsed: res.commits_parsed, backfilled: res.commits_backfilled, created: res.touches_created })
            }}
          />
        </ListGroup>

        <ListGroup title={t('admin.fabric.skillsGroup')}>
          <ActionRow
            label={t('admin.fabric.detectLabel')}
            description={t('admin.fabric.detectDescription')}
            cost={t('admin.embeddings.safeCost')}
            icon={<Brain />}
            disabled={projectRequired}
            onAction={async () => {
              const res = await adminApi.detectSkills(projectId)
              return t('admin.fabric.detectResult', { detected: res.skills_detected, created: res.skills_created, updated: res.skills_updated })
            }}
          />
          <ActionRow
            label={t('admin.fabric.hooksLabel')}
            description={t('admin.fabric.hooksDescription')}
            cost={t('admin.fabric.hooksCost')}
            icon={<Wrench />}
            buttonLabel={t('admin.fabric.install')}
            disabled={projectRequired}
            confirm={{
              title: t('admin.fabric.hooksLabel'),
              description: t('admin.fabric.hooksConfirm'),
            }}
            onAction={async () => {
              await adminApi.installHooks({ project_id: projectId })
              return t('admin.fabric.hooksInstalled')
            }}
          />
          <ActionRow
            label={t('admin.fabric.maintenanceLabel')}
            description={t('admin.fabric.maintenanceDescription')}
            cost={t('admin.fabric.maintenanceCost')}
            icon={<Activity />}
            buttonLabel={t('admin.fabric.run')}
            disabled={projectRequired}
            extra={
              <Select
                options={LEVELS.map((l) => ({ value: l, label: t(`admin.levels.${l}`) }))}
                value={maintenanceLevel}
                onChange={(v) => setMaintenanceLevel(v as MaintenanceLevel)}
                className="w-28"
              />
            }
            onAction={async () => {
              const res = await adminApi.skillMaintenance({ project_id: projectId, level: maintenanceLevel })
              return t('admin.fabric.maintenanceResult', { level: (LEVELS as readonly string[]).includes(res.level) ? t(`admin.levels.${res.level as (typeof LEVELS)[number]}`) : res.level, decayed: res.synapses_decayed, pruned: res.synapses_pruned, skills: res.skills_detected, seconds: (res.elapsed_ms / 1000).toFixed(1) })
            }}
          />
        </ListGroup>

        {/* These three are global (no project parameter): never disabled. */}
        <ListGroup title={t('admin.fabric.neuralGroup')}>
          <ActionRow
            label={t('admin.fabric.stalenessLabel')}
            description={t('admin.fabric.stalenessDescription')}
            cost={t('admin.embeddings.safeCost')}
            icon={<RefreshCw />}
            onAction={async () => {
              const res = await adminApi.updateStaleness()
              return t('admin.fabric.stalenessResult', { n: res.notes_updated })
            }}
          />
          <ActionRow
            label={t('admin.fabric.energyLabel')}
            description={t('admin.fabric.energyDescription')}
            cost={t('admin.embeddings.safeCost')}
            icon={<Zap />}
            onAction={async () => {
              const res = await adminApi.updateEnergy()
              return t('admin.fabric.energyResult', { n: res.notes_updated, days: res.half_life_days })
            }}
          />
          <ActionRow
            label={t('admin.fabric.decayLabel')}
            description={t('admin.fabric.decayDescription')}
            cost={t('admin.fabric.decayCost')}
            icon={<Activity />}
            buttonLabel={t('admin.fabric.decayButton')}
            confirm={{
              title: t('admin.fabric.decayLabel'),
              description: t('admin.fabric.decayConfirm'),
            }}
            onAction={async () => {
              const res = await adminApi.decayNeurons()
              return t('admin.fabric.decayResult', { decayed: res.synapses_decayed, pruned: res.synapses_pruned })
            }}
          />
        </ListGroup>
      </div>
    </Section>
  )
}

// ============================================================================
// SECTION: CLEANUP
// ============================================================================

function CleanupSection() {
  const { t } = useT()
  return (
    <Section
      title={t('admin.cleanup.title')}
      description={t('admin.cleanup.description')}
      collapsible
      defaultOpen={false}
    >
      <SettingsList>
        <ActionRow
          label={t('admin.cleanup.crossLabel')}
          description={t('admin.cleanup.crossDescription')}
          cost={t('admin.cleanup.irreversibleCost')}
          icon={<Trash2 />}
          buttonLabel={t('admin.cleanup.clean')}
          buttonVariant="danger"
          confirm={{
            title: t('admin.cleanup.crossConfirmTitle'),
            description: t('admin.cleanup.crossConfirm'),
            variant: 'danger',
            confirmLabel: t('admin.cleanup.clean'),
          }}
          onAction={async () => {
            const res = await adminApi.cleanupCrossProjectCalls()
            return t('admin.cleanup.crossResult', { n: res.deleted_count })
          }}
        />
        <ActionRow
          label={t('admin.cleanup.builtinLabel')}
          description={t('admin.cleanup.builtinDescription')}
          cost={t('admin.cleanup.irreversibleCost')}
          icon={<Trash2 />}
          buttonLabel={t('admin.cleanup.clean')}
          buttonVariant="danger"
          confirm={{
            title: t('admin.cleanup.builtinConfirmTitle'),
            description: t('admin.cleanup.builtinConfirm'),
            variant: 'danger',
            confirmLabel: t('admin.cleanup.clean'),
          }}
          onAction={async () => {
            const res = await adminApi.cleanupBuiltinCalls()
            return t('admin.cleanup.builtinResult', { n: res.deleted_count })
          }}
        />
        <ActionRow
          label={t('admin.cleanup.migrateLabel')}
          description={t('admin.cleanup.migrateDescription')}
          cost={t('admin.cleanup.migrateCost')}
          icon={<RefreshCw />}
          buttonLabel={t('admin.cleanup.migrate')}
          confirm={{
            title: t('admin.cleanup.migrateConfirmTitle'),
            description: t('admin.cleanup.migrateConfirm'),
          }}
          onAction={async () => {
            const res = await adminApi.migrateCallsConfidence()
            return t('admin.cleanup.migrateResult', { n: res.updated_count })
          }}
        />
        <ActionRow
          label={t('admin.cleanup.syncLabel')}
          description={t('admin.cleanup.syncDescription')}
          cost={t('admin.cleanup.irreversibleCost')}
          icon={<Trash2 />}
          buttonLabel={t('admin.cleanup.clean')}
          buttonVariant="danger"
          confirm={{
            title: t('admin.cleanup.syncConfirmTitle'),
            description: t('admin.cleanup.syncConfirm'),
            variant: 'danger',
            confirmLabel: t('admin.cleanup.clean'),
          }}
          onAction={async () => {
            const res = await adminApi.cleanupSyncData()
            return res.message || t('admin.cleanup.syncResult', { n: res.deleted_count })
          }}
        />
      </SettingsList>
    </Section>
  )
}
