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
import { ActionRow, Notice, SettingRow, SettingsList } from '@/components/settings/SettingRow'
import { adminApi, workspacesApi } from '@/services'
import { useConfirmDialog, useToast, useWorkspaceSlug } from '@/hooks'
import type { BackfillJobStatus, MeilisearchStats, MaintenanceLevel } from '@/types'

// ============================================================================
// MAIN PAGE
// ============================================================================

export function AdminPage() {
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
        title="Administration"
        description="Server maintenance: code sync, search index, embeddings, graph analyses and cleanup. Each action says what it does and what it costs; destructive ones ask for confirmation."
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
  const [watchStatus, setWatchStatus] = useState<{ running: boolean; watched_paths: string[] } | null>(null)
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
                  .map((p) => ({ id: p.id, name: p.name, slug: p.slug, root_path: p.root_path })),
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
    (rootPath: string) =>
      watchStatus?.watched_paths.some(
        (wp) => wp === rootPath || rootPath.startsWith(wp + '/') || wp.startsWith(rootPath + '/'),
      ) ?? false,
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
          toast.success(`Watcher stopped for ${projectName}`)
        } else {
          await adminApi.stopWatch()
          toast.success('Watcher stopped')
        }
      } else {
        await adminApi.startWatch({ path, project_id: projectId })
        toast.success(`Watcher started for ${projectName ?? path}`)
      }
      fetchWatchStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to toggle watcher')
    } finally {
      setTogglingPaths((prev) => {
        const next = new Set(prev)
        next.delete(path)
        return next
      })
    }
  }

  /** Watched paths not matching any known project */
  const unlinkedPaths =
    watchStatus?.watched_paths.filter(
      (wp) =>
        !allProjects.some(
          (p) => p.root_path === wp || wp.startsWith(p.root_path + '/') || p.root_path.startsWith(wp + '/'),
        ),
    ) ?? []

  const handleSync = async () => {
    if (!syncPath.trim()) return
    setSyncing(true)
    try {
      const res = await adminApi.syncDirectory({ path: syncPath.trim() })
      toast.success(`Synced ${res.files_synced} files (${res.files_skipped} skipped, ${res.files_deleted} deleted)`)
      setSyncPath('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const handleStartWatch = async () => {
    if (!syncPath.trim()) return
    try {
      await adminApi.startWatch({ path: syncPath.trim() })
      toast.success(`Watcher started for ${syncPath.trim()}`)
      setSyncPath('')
      fetchWatchStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start watcher')
    }
  }

  const handleStopAll = () => {
    confirmDialog.open({
      title: 'Stop all watchers',
      description: 'No project will be resynced automatically any more. You can start them again at any time.',
      variant: 'warning',
      confirmLabel: 'Stop all',
      onConfirm: async () => {
        await adminApi.stopWatch()
        toast.success('All watchers stopped')
        fetchWatchStatus()
      },
    })
  }

  const activeCount = watchStatus?.watched_paths.length ?? 0

  return (
    <Section
      title="Sync & watchers"
      description="A watcher follows a project's files and updates the code graph on every change."
      action={
        watchStatus?.running && activeCount > 0 ? (
          <Button size="sm" variant="ghost" onClick={handleStopAll} className="text-red-300">
            <Square className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
            Stop all
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
              label={watchStatus.running ? `Watching ${activeCount} path${activeCount === 1 ? '' : 's'}` : 'No watcher running'}
            />
          </p>
        )}

        {(wsProjectGroups.length > 0 || unlinkedPaths.length > 0) && (
          <div>
            {wsProjectGroups.map((group) => (
              <ListGroup key={group.workspace.slug} title={group.workspace.name} count={group.projects.length}>
                {group.projects.map((project) => {
                  const watched = isPathWatched(project.root_path)
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
                          ariaLabel={`Watch ${project.name}`}
                        />
                      }
                    />
                  )
                })}
              </ListGroup>
            ))}
            {unlinkedPaths.length > 0 && (
              <ListGroup title="Unlinked paths" count={unlinkedPaths.length}>
                {unlinkedPaths.map((path) => (
                  <SettingRow
                    key={path}
                    label={
                      <code className="block truncate font-mono text-xs" title={path}>
                        {path}
                      </code>
                    }
                    description="Watched folder that matches no known project."
                    control={
                      <Switch
                        checked
                        disabled={togglingPaths.has(path)}
                        onChange={() => handleToggleWatchPath(path, undefined, undefined, true)}
                        ariaLabel={`Watch ${path}`}
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
            label="Sync or watch a directory"
            description="Sync: a one-off analysis of all the code in the folder (Tree-sitter, seconds to minutes). Watch: then resyncs automatically on every change."
          >
            <div className="flex flex-wrap gap-2">
              <div className="flex-[1_1_12rem] min-w-0">
                <Input
                  placeholder="/absolute/path/to/project"
                  aria-label="Directory path"
                  value={syncPath}
                  onChange={(e) => setSyncPath(e.target.value)}
                  className="text-base md:text-sm h-9 py-1.5"
                />
              </div>
              <Button variant="secondary" size="sm" onClick={handleSync} loading={syncing} disabled={!syncPath.trim()}>
                {!syncing && <FolderSync className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />}
                Sync
              </Button>
              <Button variant="secondary" size="sm" onClick={handleStartWatch} disabled={!syncPath.trim()}>
                <Eye className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                Watch
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
  const [stats, setStats] = useState<MeilisearchStats | null>(null)

  useEffect(() => {
    adminApi
      .getMeilisearchStats()
      .then(setStats)
      .catch(() => setStats(null))
  }, [])

  return (
    <Section
      title="Search engine"
      description="Full-text index (Meilisearch) used by code search."
      collapsible
      defaultOpen={false}
    >
      <div className="space-y-3">
        <Facts
          items={[
            {
              label: 'Documents',
              value: stats ? (
                <span>
                  <span className="tabular-nums">{stats.code_documents.toLocaleString()}</span>
                  <span className="text-gray-500"> files indexed</span>
                </span>
              ) : (
                '—'
              ),
            },
            {
              label: 'Status',
              value: stats ? (
                <StatusText
                  kind="run"
                  status={stats.is_indexing ? 'running' : 'completed'}
                  label={stats.is_indexing ? 'Indexing — results incomplete' : 'Ready'}
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
            label="Clean orphan documents"
            description="Removes from the index the documents whose file no longer exists in the graph."
            cost="A few seconds · safe"
            icon={<Trash2 />}
            buttonLabel="Clean"
            confirm={{
              title: 'Clean orphan documents',
              description: 'Removes from Meilisearch the documents that no longer exist in Neo4j. Safe.',
              variant: 'info',
            }}
            onAction={async () => {
              const res = await adminApi.deleteMeilisearchOrphans()
              return res.message || 'Orphans cleaned'
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
        toast.success(`${label} cancelled`)
      } else {
        await onStart()
        toast.success(`${label} started`)
      }
      await fetchStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : isRunning ? 'Failed to cancel' : 'Failed to start')
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
          label={state === 'idle' ? 'Idle' : undefined}
          pulse={isRunning}
        />,
        isRunning && progress ? (
          <span key="p" className="tabular-nums">
            {progress.current} / {progress.total} · {progress.percentage.toFixed(1)}%
          </span>
        ) : null,
        !isRunning && status?.finished_at ? <RelativeTime key="f" date={status.finished_at} prefix="finished " /> : null,
        cost,
      ]}
      control={
        <Button
          variant={isRunning ? 'danger' : 'secondary'}
          size="sm"
          onClick={handle}
          loading={busy}
          aria-label={`${isRunning ? 'Cancel' : 'Start'} — ${label}`}
        >
          {!busy && (isRunning ? <Square className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> : <Play className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />)}
          {isRunning ? 'Cancel' : 'Start'}
        </Button>
      }
    >
      {(isRunning && progress) || status?.error ? (
        <div className="space-y-1.5">
          {isRunning && progress && (
            <div
              className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden"
              role="progressbar"
              aria-label={`${label} progress`}
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
  return (
    <Section
      title="Embeddings & backfills"
      description="Computes the vectors behind semantic search and rebuilds missing links."
      collapsible
      defaultOpen={false}
    >
      <SettingsList>
        <BackfillRow
          label="Note embeddings"
          description="Embeds the notes that have no vector yet — required for semantic search."
          cost="Background job · minutes depending on volume"
          getStatus={adminApi.getBackfillEmbeddingsStatus}
          onStart={() => adminApi.startBackfillEmbeddings()}
          onCancel={() => adminApi.cancelBackfillEmbeddings()}
        />
        <BackfillRow
          label="Synapse backfill"
          description="Links close notes with synapses (embedding similarity) so knowledge can propagate."
          cost="Background job · minutes depending on volume"
          getStatus={adminApi.getBackfillSynapsesStatus}
          onStart={() => adminApi.startBackfillSynapses()}
          onCancel={() => adminApi.cancelBackfillSynapses()}
        />
        <ActionRow
          label="Decision embeddings"
          description="Embeds architectural decisions so semantic search can find them."
          cost="A few seconds · safe"
          icon={<Zap />}
          onAction={async () => {
            const res = await adminApi.backfillDecisionEmbeddings()
            return `Processed ${res.decisions_processed} decisions, created ${res.embeddings_created} embeddings`
          }}
        />
        <ActionRow
          label="Backfill discussed"
          description="Links files and functions to the past conversations where they were analysed."
          cost="Seconds to minutes · safe"
          icon={<Zap />}
          onAction={async () => {
            const res = await adminApi.backfillDiscussed()
            return `Processed ${res.sessions_processed} sessions, found ${res.entities_found} entities, created ${res.relations_created} relations`
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

const levelOptions = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'full', label: 'Full' },
]

function KnowledgeFabricSection({ projects, projectId, projectSlug, onProjectChange }: KnowledgeFabricSectionProps) {
  const [maintenanceLevel, setMaintenanceLevel] = useState<MaintenanceLevel>('daily')
  const projectRequired = !projectId

  return (
    <Section
      title="Knowledge Fabric"
      description="Knowledge graph analyses (communities, centrality, risks) and synapse upkeep."
      collapsible
      defaultOpen={false}
    >
      <div className="space-y-3">
        <SettingsList>
          <SettingRow
            label="Project"
            description="The pipeline and skills actions apply to this project only."
            control={
              projects.length > 0 ? (
                <Select
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                  value={projectId}
                  onChange={onProjectChange}
                  className="w-44"
                />
              ) : (
                <span className="text-xs text-gray-500">No project</span>
              )
            }
          />
        </SettingsList>
        {projectRequired && <Notice tone="warning">Add a project to the workspace to enable the project-scoped actions.</Notice>}

        <ListGroup title="Pipeline">
          <ActionRow
            label="Bootstrap Knowledge Fabric"
            description="Builds the whole pipeline: git links, embeddings, graph scores, churn, density and risks."
            cost="Several minutes · non-destructive"
            icon={<Sparkles />}
            buttonLabel="Bootstrap"
            buttonVariant="primary"
            disabled={projectRequired}
            confirm={{
              title: 'Bootstrap Knowledge Fabric',
              description: 'Runs the full pipeline. Can take several minutes depending on the project size.',
            }}
            onAction={async () => {
              const res = await adminApi.bootstrapKnowledgeFabric({ project_id: projectId })
              const ok = res.steps_completed.length
              const fail = res.steps_failed.length
              return `${ok} steps completed${fail > 0 ? `, ${fail} failed` : ''} in ${(res.total_time_ms / 1000).toFixed(1)}s`
            }}
          />
          <ActionRow
            label="Update fabric scores"
            description="Recomputes communities (Louvain), PageRank, centrality, churn, density and risks."
            cost="A few seconds · safe"
            icon={<BarChart3 />}
            buttonLabel="Update"
            disabled={projectRequired}
            confirm={{
              title: 'Update fabric scores',
              description: 'Recomputes every graph analysis score. Safe, usually a few seconds.',
            }}
            onAction={async () => {
              const res = await adminApi.updateFabricScores({ project_id: projectId })
              return `Updated ${res.nodes_updated} nodes, ${res.communities} communities in ${(res.computation_ms / 1000).toFixed(1)}s`
            }}
          />
          <ActionRow
            label="Backfill touches"
            description="Walks the whole git history to link each commit to the files it changed."
            cost="Depends on repository size · non-destructive"
            icon={<GitCommitHorizontal />}
            buttonLabel="Start"
            disabled={projectRequired || !projectSlug}
            confirm={{
              title: 'Backfill TOUCHES',
              description: 'Walks the full git history to rebuild the Commit → File links. Duration depends on the repository size.',
            }}
            onAction={async () => {
              const res = await adminApi.backfillTouches(projectSlug)
              return `Parsed ${res.commits_parsed} commits, backfilled ${res.commits_backfilled}, created ${res.touches_created} touches`
            }}
          />
        </ListGroup>

        <ListGroup title="Skills & hooks">
          <ActionRow
            label="Detect skills"
            description="Spots the areas of expertise emerging from clusters of connected notes."
            cost="A few seconds · safe"
            icon={<Brain />}
            disabled={projectRequired}
            onAction={async () => {
              const res = await adminApi.detectSkills(projectId)
              return `Detected ${res.skills_detected} skills (${res.skills_created} new, ${res.skills_updated} updated)`
            }}
          />
          <ActionRow
            label="Install git hooks"
            description="Adds a post-commit hook that links each new commit to its files in real time."
            cost="Instant · existing hooks kept"
            icon={<Wrench />}
            buttonLabel="Install"
            disabled={projectRequired}
            confirm={{
              title: 'Install git hooks',
              description: 'Adds a post-commit hook in the project’s .git/hooks. Existing hooks are kept.',
            }}
            onAction={async () => {
              await adminApi.installHooks({ project_id: projectId })
              return 'Git hooks installed'
            }}
          />
          <ActionRow
            label="Skill maintenance"
            description="Weakens rarely used synapses, removes dead links and detects new skills. Hourly = light, Full = complete recompute."
            cost="Seconds (Hourly) to minutes (Full)"
            icon={<Activity />}
            buttonLabel="Run"
            disabled={projectRequired}
            extra={
              <Select
                options={levelOptions}
                value={maintenanceLevel}
                onChange={(v) => setMaintenanceLevel(v as MaintenanceLevel)}
                className="w-28"
              />
            }
            onAction={async () => {
              const res = await adminApi.skillMaintenance({ project_id: projectId, level: maintenanceLevel })
              return `${res.level} maintenance: ${res.synapses_decayed} decayed, ${res.synapses_pruned} pruned, ${res.skills_detected} skills in ${(res.elapsed_ms / 1000).toFixed(1)}s`
            }}
          />
        </ListGroup>

        {/* These three are global (no project parameter): never disabled. */}
        <ListGroup title="Neural maintenance · all projects">
          <ActionRow
            label="Update staleness scores"
            description="Recomputes note freshness from their last update; stale notes come back up for review."
            cost="A few seconds · safe"
            icon={<RefreshCw />}
            onAction={async () => {
              const res = await adminApi.updateStaleness()
              return `Updated staleness for ${res.notes_updated} notes`
            }}
          />
          <ActionRow
            label="Update energy scores"
            description="Lets note energy decay over time unless the notes are reused."
            cost="A few seconds · safe"
            icon={<Zap />}
            onAction={async () => {
              const res = await adminApi.updateEnergy()
              return `Updated energy for ${res.notes_updated} notes (half-life: ${res.half_life_days}d)`
            }}
          />
          <ActionRow
            label="Decay synapses"
            description="Lowers every synapse weight by 0.01 and removes those under 0.1 — routine upkeep."
            cost="A few seconds · removes weak links"
            icon={<Activity />}
            buttonLabel="Run decay"
            confirm={{
              title: 'Decay synapses',
              description: 'Lowers every weight by 0.01 and removes the synapses under 0.1. Routine upkeep.',
            }}
            onAction={async () => {
              const res = await adminApi.decayNeurons()
              return `Decayed ${res.synapses_decayed} synapses, pruned ${res.synapses_pruned}`
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
  return (
    <Section
      title="Cleanup"
      description="Removes wrong or obsolete data from the graph. Irreversible: each action asks for confirmation."
      collapsible
      defaultOpen={false}
    >
      <SettingsList>
        <ActionRow
          label="Cross-project calls"
          description="Removes calls between functions of different projects — usually misresolved homonyms."
          cost="Irreversible · seconds"
          icon={<Trash2 />}
          buttonLabel="Clean"
          buttonVariant="danger"
          confirm={{
            title: 'Cleanup cross-project calls',
            description: 'Removes the CALLS relations between different projects (false positives from homonyms). This cannot be undone.',
            variant: 'danger',
            confirmLabel: 'Delete',
          }}
          onAction={async () => {
            const res = await adminApi.cleanupCrossProjectCalls()
            return `Deleted ${res.deleted_count} cross-project calls`
          }}
        />
        <ActionRow
          label="Builtin calls"
          description="Removes calls to the standard library that were misresolved during code analysis."
          cost="Irreversible · seconds"
          icon={<Trash2 />}
          buttonLabel="Clean"
          buttonVariant="danger"
          confirm={{
            title: 'Cleanup builtin calls',
            description: 'Removes the CALLS relations to misresolved standard/builtin functions. This cannot be undone.',
            variant: 'danger',
            confirmLabel: 'Delete',
          }}
          onAction={async () => {
            const res = await adminApi.cleanupBuiltinCalls()
            return `Deleted ${res.deleted_count} builtin calls`
          }}
        />
        <ActionRow
          label="Migrate call confidence"
          description="Moves calls to the new confidence computation, without deleting anything."
          cost="Seconds · non-destructive"
          icon={<RefreshCw />}
          buttonLabel="Migrate"
          confirm={{
            title: 'Migrate calls confidence',
            description: 'Updates the CALLS relations to the new confidence score. Non-destructive.',
          }}
          onAction={async () => {
            const res = await adminApi.migrateCallsConfidence()
            return `Migrated ${res.updated_count} call relationships`
          }}
        />
        <ActionRow
          label="Cleanup sync data"
          description="Removes file-tracking metadata that no longer matches any file."
          cost="Irreversible · seconds"
          icon={<Trash2 />}
          buttonLabel="Clean"
          buttonVariant="danger"
          confirm={{
            title: 'Cleanup sync data',
            description: 'Removes orphaned sync metadata from the graph. This cannot be undone.',
            variant: 'danger',
            confirmLabel: 'Delete',
          }}
          onAction={async () => {
            const res = await adminApi.cleanupSyncData()
            return res.message || `Deleted ${res.deleted_count} sync entries`
          }}
        />
      </SettingsList>
    </Section>
  )
}
