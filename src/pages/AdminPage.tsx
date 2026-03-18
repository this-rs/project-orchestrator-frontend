import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FolderSync,
  Eye,
  EyeOff,
  Play,
  Square,
  Search,
  Trash2,
  Database,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Wrench,
  Zap,
  Brain,
  BarChart3,
  Activity,
  GitCommitHorizontal,
} from 'lucide-react'
import {
  Badge,
  Button,
  Select,
  Input,
  ConfirmDialog,
  PageShell,
  CollapsibleSection,
} from '@/components/ui'
import { adminApi, workspacesApi } from '@/services'
import { useConfirmDialog, useToast, useWorkspaceSlug } from '@/hooks'
import type {
  BackfillJobStatus,
  MeilisearchStats,
  MaintenanceLevel,
} from '@/types'


// ============================================================================
// ACTION ITEM — Row with icon, title, description and action button
// ============================================================================

interface ActionItemProps {
  title: string
  description: string
  icon: React.ReactNode
  buttonLabel?: string
  buttonVariant?: 'primary' | 'secondary' | 'danger'
  confirm?: {
    title: string
    description?: string
    variant?: 'danger' | 'warning' | 'info'
    confirmLabel?: string
  }
  onAction: () => Promise<string>
  disabled?: boolean
}

function ActionItem({
  title,
  description,
  icon,
  buttonLabel = 'Run',
  buttonVariant = 'secondary',
  confirm,
  onAction,
  disabled,
}: ActionItemProps) {
  const [loading, setLoading] = useState(false)
  const confirmDialog = useConfirmDialog()
  const toast = useToast()

  const run = async () => {
    setLoading(true)
    try {
      const msg = await onAction()
      toast.success(msg)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setLoading(false)
    }
  }

  const handleClick = () => {
    if (confirm) {
      confirmDialog.open({
        title: confirm.title,
        description: confirm.description || `Are you sure you want to run "${title}"?`,
        variant: confirm.variant || 'info',
        confirmLabel: confirm.confirmLabel,
        onConfirm: run,
      })
    } else {
      run()
    }
  }

  return (
    <>
      <div className="flex items-start gap-3 py-3 px-4 group">
        <div className="shrink-0 w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-gray-500 group-hover:text-gray-400 transition-colors mt-0.5">
          {icon}
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <h4 className="text-sm font-medium text-gray-200">{title}</h4>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
        </div>
        <Button
          variant={buttonVariant}
          size="sm"
          onClick={handleClick}
          disabled={disabled || loading}
          className="shrink-0 mt-0.5"
        >
          {loading ? (
            <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : null}
          {buttonLabel}
        </Button>
      </div>
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </>
  )
}

/** Groups ActionItems visually with a shared border and dividers */
function ActionGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-white/[0.04] rounded-lg border border-white/[0.06] bg-white/[0.01] overflow-hidden">
      {children}
    </div>
  )
}

// ============================================================================
// BACKFILL STATUS (with polling)
// ============================================================================

interface BackfillPanelProps {
  title: string
  description: string
  getStatus: () => Promise<BackfillJobStatus>
  onStart: () => Promise<unknown>
  onCancel: () => Promise<unknown>
}

function BackfillPanel({ title, description, getStatus, onStart, onCancel }: BackfillPanelProps) {
  const [status, setStatus] = useState<BackfillJobStatus | null>(null)
  const [starting, setStarting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const toast = useToast()

  const fetchStatus = useCallback(async () => {
    try {
      const s = await getStatus()
      setStatus(s)
      return s
    } catch {
      return null
    }
  }, [getStatus])

  // Initial fetch
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Polling when running
  useEffect(() => {
    if (status?.status === 'running') {
      intervalRef.current = setInterval(fetchStatus, 3000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [status?.status, fetchStatus])

  const handleStart = async () => {
    setStarting(true)
    try {
      await onStart()
      toast.success(`${title} started`)
      await fetchStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await onCancel()
      toast.success(`${title} cancelled`)
      await fetchStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel')
    } finally {
      setCancelling(false)
    }
  }

  const isRunning = status?.status === 'running'
  const progress = status?.progress

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-medium text-gray-300">{title}</h4>
        <StatusBadge status={status?.status || 'idle'} />
      </div>
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">{description}</p>

      {isRunning && progress && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>
              {progress.current} / {progress.total}
            </span>
            <span>{progress.percentage.toFixed(1)}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>
      )}

      {status?.error && (
        <p className="text-xs text-red-400 mb-2">{status.error}</p>
      )}

      <div className="flex gap-2">
        {isRunning ? (
          <Button
            variant="danger"
            size="sm"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Square className="w-3.5 h-3.5 mr-1.5" />
            )}
            Cancel
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleStart}
            disabled={starting}
          >
            {starting ? (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 mr-1.5" />
            )}
            Start
          </Button>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: 'default' | 'info' | 'success' | 'warning' | 'error'; label: string }> = {
    idle: { variant: 'default', label: 'Idle' },
    running: { variant: 'info', label: 'Running' },
    completed: { variant: 'success', label: 'Completed' },
    failed: { variant: 'error', label: 'Failed' },
    cancelled: { variant: 'warning', label: 'Cancelled' },
  }
  const c = config[status] || config.idle
  return <Badge variant={c.variant}>{c.label}</Badge>
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export function AdminPage() {
  const wsSlug = useWorkspaceSlug()

  // Projects for scoping
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

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }))
  const selectedProjectSlug = projects.find((p) => p.id === selectedProject)?.slug || ''

  const projectRequired = !selectedProject

  return (
    <PageShell
      title="Administration"
      description="System maintenance, sync, backfills and cleanup operations"
      actions={
        projects.length > 0 ? (
          <Select
            options={projectOptions}
            value={selectedProject}
            onChange={setSelectedProject}
            className="w-full sm:w-52"
          />
        ) : undefined
      }
    >
      <div className="space-y-3">
        {/* ── Sync & Watchers ──────────────────────────────────── */}
        <SyncWatchersSection />

        {/* ── Search Engine ────────────────────────────────────── */}
        <SearchEngineSection />

        {/* ── Embeddings & Backfills ───────────────────────────── */}
        <EmbeddingsSection />

        {/* ── Knowledge Fabric ─────────────────────────────────── */}
        <KnowledgeFabricSection
          projectId={selectedProject}
          projectSlug={selectedProjectSlug}
          projectRequired={projectRequired}
        />

        {/* ── Cleanup ──────────────────────────────────────────── */}
        <CleanupSection />
      </div>
    </PageShell>
  )
}

// ============================================================================
// SECTION: SYNC & WATCHERS
// ============================================================================

function SyncWatchersSection() {
  const [watchStatus, setWatchStatus] = useState<{ running: boolean; watched_paths: string[] } | null>(null)
  const [syncPath, setSyncPath] = useState('')
  const [syncing, setSyncing] = useState(false)
  const toast = useToast()
  const confirmDialog = useConfirmDialog()

  const fetchWatchStatus = useCallback(async () => {
    try {
      const s = await adminApi.getWatchStatus()
      setWatchStatus(s)
    } catch {
      setWatchStatus(null)
    }
  }, [])

  useEffect(() => {
    fetchWatchStatus()
  }, [fetchWatchStatus])

  const handleSync = async () => {
    if (!syncPath.trim()) {
      toast.error('Please enter a directory path')
      return
    }
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
    if (!syncPath.trim()) {
      toast.error('Please enter a directory path')
      return
    }
    try {
      await adminApi.startWatch({ path: syncPath.trim() })
      toast.success(`Watcher started for ${syncPath.trim()}`)
      setSyncPath('')
      fetchWatchStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start watcher')
    }
  }

  const handleStopWatch = () => {
    confirmDialog.open({
      title: 'Stop File Watcher',
      description: 'Stop the file watcher? You can restart it at any time.',
      variant: 'warning',
      confirmLabel: 'Stop',
      onConfirm: async () => {
        await adminApi.stopWatch()
        toast.success('File watcher stopped')
        fetchWatchStatus()
      },
    })
  }

  return (
    <CollapsibleSection
      title="Sync & Watchers"
      icon={<FolderSync className="w-4 h-4" />}
      description="Parse your codebase with Tree-sitter and monitor file changes automatically."
      headerRight={
        watchStatus && (
          <Badge variant={watchStatus.running ? 'success' : 'default'}>
            <span className="flex items-center gap-1.5">
              {watchStatus.running ? (
                <Activity className="w-3 h-3" />
              ) : (
                <EyeOff className="w-3 h-3" />
              )}
              {watchStatus.running
                ? `Watching (${watchStatus.watched_paths.length})`
                : 'Inactive'}
            </span>
          </Badge>
        )
      }
      defaultOpen
    >
      {/* Watched paths */}
      {watchStatus?.running && watchStatus.watched_paths.length > 0 && (
        <div className="mb-4 space-y-1">
          <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Watched Directories</h4>
          {watchStatus.watched_paths.map((path) => (
            <div
              key={path}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] text-xs"
            >
              <Eye className="w-3.5 h-3.5 text-green-400 shrink-0" />
              <code className="text-gray-300 font-mono truncate">{path}</code>
            </div>
          ))}
          <div className="pt-2">
            <Button variant="danger" size="sm" onClick={handleStopWatch}>
              <Square className="w-3.5 h-3.5 mr-1.5" />
              Stop Watcher
            </Button>
          </div>
        </div>
      )}

      {/* Manual sync / start watcher */}
      <div className={watchStatus?.running && watchStatus.watched_paths.length > 0 ? 'border-t border-white/[0.06] pt-4' : ''}>
        <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Sync or Watch a Directory</h4>
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          Enter an absolute path to a project directory. <strong className="text-gray-400">Sync</strong> performs a one-time
          Tree-sitter parse of all source files. <strong className="text-gray-400">Watch</strong> starts a persistent file watcher
          that automatically re-syncs on changes.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="/path/to/project"
            value={syncPath}
            onChange={(e) => setSyncPath(e.target.value)}
            className="flex-1"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSync}
            disabled={syncing || !syncPath.trim()}
          >
            {syncing ? (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <FolderSync className="w-3.5 h-3.5 mr-1.5" />
            )}
            Sync
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleStartWatch}
            disabled={!syncPath.trim()}
          >
            <Eye className="w-3.5 h-3.5 mr-1.5" />
            Watch
          </Button>
        </div>
      </div>

      <ConfirmDialog {...confirmDialog.dialogProps} />
    </CollapsibleSection>
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
    <CollapsibleSection
      title="Search Engine"
      icon={<Search className="w-4 h-4" />}
      description="Manage the Meilisearch full-text index used for semantic code search."
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <StatBox label="Documents" value={stats?.code_documents?.toLocaleString() ?? '—'} />
        <StatBox
          label="Status"
          value={stats?.is_indexing ? 'Indexing' : 'Ready'}
          highlight={stats?.is_indexing}
        />
      </div>

      <ActionGroup>
        <ActionItem
          title="Clean Orphan Documents"
          description="Remove documents from the search index that no longer have a matching node in the Neo4j graph. Safe to run at any time."
          icon={<Trash2 className="w-4 h-4" />}
          buttonLabel="Clean"
          confirm={{
            title: 'Clean Orphan Documents',
            description: 'Remove orphaned documents from Meilisearch that no longer exist in Neo4j. This is safe to run.',
            variant: 'info',
            confirmLabel: 'Clean',
          }}
          onAction={async () => {
            const res = await adminApi.deleteMeilisearchOrphans()
            return res.message || 'Orphans cleaned'
          }}
        />
      </ActionGroup>
    </CollapsibleSection>
  )
}

// ============================================================================
// SECTION: EMBEDDINGS & BACKFILLS
// ============================================================================

function EmbeddingsSection() {
  return (
    <CollapsibleSection
      title="Embeddings & Backfills"
      icon={<Database className="w-4 h-4" />}
      description="Generate vector embeddings for semantic search and backfill missing data relationships."
    >
      <div className="space-y-4">
        {/* Long-running backfill jobs with progress */}
        <BackfillPanel
          title="Note Embeddings"
          description="Generate vector embeddings for notes that don't have them yet. Required for semantic search (search_semantic) to work."
          getStatus={adminApi.getBackfillEmbeddingsStatus}
          onStart={() => adminApi.startBackfillEmbeddings()}
          onCancel={() => adminApi.cancelBackfillEmbeddings()}
        />

        <BackfillPanel
          title="Synapse Backfill"
          description="Create neural connections (synapses) between related notes based on embedding similarity. Powers the Knowledge Fabric propagation."
          getStatus={adminApi.getBackfillSynapsesStatus}
          onStart={() => adminApi.startBackfillSynapses()}
          onCancel={() => adminApi.cancelBackfillSynapses()}
        />

        {/* Quick actions */}
        <ActionGroup>
          <ActionItem
            title="Decision Embeddings"
            description="Generate vector embeddings for architectural decisions. Enables semantic search over decisions via search_semantic."
            icon={<Zap className="w-4 h-4" />}
            onAction={async () => {
              const res = await adminApi.backfillDecisionEmbeddings()
              return `Processed ${res.decisions_processed} decisions, created ${res.embeddings_created} embeddings`
            }}
          />
          <ActionItem
            title="Backfill Discussed"
            description="Reconstruct DISCUSSED relationships from past chat sessions. Links files and functions to the conversations where they were analyzed."
            icon={<Zap className="w-4 h-4" />}
            onAction={async () => {
              const res = await adminApi.backfillDiscussed()
              return `Processed ${res.sessions_processed} sessions, found ${res.entities_found} entities, created ${res.relations_created} relations`
            }}
          />
        </ActionGroup>
      </div>
    </CollapsibleSection>
  )
}

// ============================================================================
// SECTION: KNOWLEDGE FABRIC
// ============================================================================

interface KnowledgeFabricSectionProps {
  projectId: string
  projectSlug: string
  projectRequired: boolean
}

function KnowledgeFabricSection({ projectId, projectSlug, projectRequired }: KnowledgeFabricSectionProps) {
  const [maintenanceLevel, setMaintenanceLevel] = useState<MaintenanceLevel>('daily')

  const levelOptions = [
    { value: 'hourly', label: 'Hourly' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'full', label: 'Full' },
  ]

  return (
    <CollapsibleSection
      title="Knowledge Fabric"
      icon={<Brain className="w-4 h-4" />}
      description="Graph analytics, neural maintenance and knowledge pipeline. Requires a project to be selected."
    >
      {projectRequired && (
        <div className="flex items-center gap-2 px-3 py-2.5 mb-4 rounded-lg bg-amber-500/[0.08] border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">
            Select a project in the top-right dropdown to enable these actions.
          </p>
        </div>
      )}

      {/* Core pipeline actions */}
      <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Pipeline</h4>
      <ActionGroup>
        <ActionItem
          title="Bootstrap Knowledge Fabric"
          description="Initialize the full pipeline from scratch: TOUCHES, embeddings, discussed relationships, fabric scores (communities, PageRank, betweenness), churn, knowledge density and risk assessment. May take several minutes."
          icon={<Sparkles className="w-4 h-4" />}
          buttonLabel="Bootstrap"
          buttonVariant="primary"
          disabled={projectRequired}
          confirm={{
            title: 'Bootstrap Knowledge Fabric',
            description: 'This will run the complete Knowledge Fabric pipeline. It may take a few minutes depending on project size.',
            variant: 'info',
            confirmLabel: 'Bootstrap',
          }}
          onAction={async () => {
            const res = await adminApi.bootstrapKnowledgeFabric({ project_id: projectId })
            const ok = res.steps_completed.length
            const fail = res.steps_failed.length
            return `${ok} steps completed${fail > 0 ? `, ${fail} failed` : ''} in ${(res.total_time_ms / 1000).toFixed(1)}s`
          }}
        />

        <ActionItem
          title="Update Fabric Scores"
          description="Recalculate all GDS metrics: community detection (Louvain), PageRank, betweenness centrality, churn scores, knowledge density and risk assessment."
          icon={<BarChart3 className="w-4 h-4" />}
          disabled={projectRequired}
          confirm={{
            title: 'Update Fabric Scores',
            description: 'Recalculate all graph analytics scores. This is safe and typically takes a few seconds.',
            variant: 'info',
            confirmLabel: 'Update',
          }}
          onAction={async () => {
            const res = await adminApi.updateFabricScores({ project_id: projectId })
            return `Updated ${res.nodes_updated} nodes, ${res.communities} communities in ${(res.computation_ms / 1000).toFixed(1)}s`
          }}
        />

        <ActionItem
          title="Backfill Touches"
          description="Reconstruct TOUCHES relationships by scanning the full git history. Creates Commit → File links with additions/deletions data."
          icon={<GitCommitHorizontal className="w-4 h-4" />}
          disabled={projectRequired || !projectSlug}
          confirm={{
            title: 'Backfill TOUCHES',
            description: 'Scan the full git history to reconstruct Commit → File relationships. Duration depends on repository size.',
            variant: 'info',
            confirmLabel: 'Start',
          }}
          onAction={async () => {
            const res = await adminApi.backfillTouches(projectSlug)
            return `Parsed ${res.commits_parsed} commits, backfilled ${res.commits_backfilled}, created ${res.touches_created} touches`
          }}
        />
      </ActionGroup>

      {/* Skills & Hooks */}
      <h4 className="text-xs uppercase tracking-wider text-gray-500 mt-5 mb-2">Skills & Hooks</h4>
      <ActionGroup>
        <ActionItem
          title="Detect Skills"
          description="Discover emergent knowledge clusters by analyzing note synapse patterns. Skills represent areas of expertise that emerge naturally from connected notes."
          icon={<Brain className="w-4 h-4" />}
          disabled={projectRequired}
          onAction={async () => {
            const res = await adminApi.detectSkills(projectId)
            return `Detected ${res.skills_detected} skills (${res.skills_created} new, ${res.skills_updated} updated)`
          }}
        />

        <ActionItem
          title="Install Git Hooks"
          description="Install a post-commit hook in the project repository. This automatically creates TOUCHES relationships on each commit for real-time tracking."
          icon={<Wrench className="w-4 h-4" />}
          buttonLabel="Install"
          disabled={projectRequired}
          confirm={{
            title: 'Install Git Hooks',
            description: 'This will add a post-commit hook to the project\'s .git/hooks directory. Existing hooks are preserved.',
            variant: 'info',
            confirmLabel: 'Install',
          }}
          onAction={async () => {
            await adminApi.installHooks({ project_id: projectId })
            return 'Git hooks installed'
          }}
        />
      </ActionGroup>

      {/* Skill Maintenance with level selector */}
      <h4 className="text-xs uppercase tracking-wider text-gray-500 mt-5 mb-2">Skill Maintenance</h4>
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] p-4">
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          Run periodic maintenance: decay weak synapse weights, prune dead connections and detect new skills.
          Intensity increases from <strong className="text-gray-400">Hourly</strong> (light) to <strong className="text-gray-400">Full</strong> (complete recalculation).
        </p>
        <div className="flex items-center gap-2">
          <Select
            options={levelOptions}
            value={maintenanceLevel}
            onChange={(v) => setMaintenanceLevel(v as MaintenanceLevel)}
            className="w-32"
          />
          <ActionItemInlineButton
            label="Run Maintenance"
            icon={<Activity className="w-3.5 h-3.5" />}
            disabled={projectRequired}
            onAction={async () => {
              const res = await adminApi.skillMaintenance({ project_id: projectId, level: maintenanceLevel })
              return `${res.level} maintenance: ${res.synapses_decayed} decayed, ${res.synapses_pruned} pruned, ${res.skills_detected} skills in ${(res.elapsed_ms / 1000).toFixed(1)}s`
            }}
          />
        </div>
      </div>

      {/* Neural maintenance */}
      <h4 className="text-xs uppercase tracking-wider text-gray-500 mt-5 mb-2">Neural Maintenance</h4>
      <ActionGroup>
        <ActionItem
          title="Update Staleness Scores"
          description="Recalculate freshness scores for all notes based on their last update time. Stale notes surface in reviews."
          icon={<RefreshCw className="w-4 h-4" />}
          disabled={projectRequired}
          onAction={async () => {
            const res = await adminApi.updateStaleness()
            return `Updated staleness for ${res.notes_updated} notes`
          }}
        />
        <ActionItem
          title="Update Energy Scores"
          description="Recalculate neural energy levels for all notes using exponential decay. Notes lose energy over time unless reinforced by activity."
          icon={<Zap className="w-4 h-4" />}
          disabled={projectRequired}
          onAction={async () => {
            const res = await adminApi.updateEnergy()
            return `Updated energy for ${res.notes_updated} notes (half-life: ${res.half_life_days}d)`
          }}
        />
        <ActionItem
          title="Decay Synapses"
          description="Reduce all synapse weights by a small amount and prune connections that fall below threshold. This is normal neural maintenance that keeps the knowledge graph healthy."
          icon={<Activity className="w-4 h-4" />}
          disabled={projectRequired}
          confirm={{
            title: 'Decay Synapses',
            description: 'Decay all synapse weights by 0.01 and prune those below 0.1. This is routine maintenance that cleans up weak connections.',
            variant: 'info',
            confirmLabel: 'Run Decay',
          }}
          onAction={async () => {
            const res = await adminApi.decayNeurons()
            return `Decayed ${res.synapses_decayed} synapses, pruned ${res.synapses_pruned}`
          }}
        />
      </ActionGroup>
    </CollapsibleSection>
  )
}

// ============================================================================
// SECTION: CLEANUP
// ============================================================================

function CleanupSection() {
  return (
    <CollapsibleSection
      title="Cleanup"
      icon={<AlertTriangle className="w-4 h-4" />}
      description="Remove stale or incorrect data from the graph. These operations are safe but irreversible."
    >
      <ActionGroup>
        <ActionItem
          title="Cross-Project Calls"
          description="Remove CALLS relationships between functions in different projects. These are usually false positives caused by name collisions across codebases."
          icon={<Trash2 className="w-4 h-4" />}
          buttonLabel="Clean"
          buttonVariant="danger"
          confirm={{
            title: 'Cleanup Cross-Project Calls',
            description: 'Delete CALLS relationships that span across different projects. These are usually false positives from name collisions.',
            variant: 'danger',
            confirmLabel: 'Delete',
          }}
          onAction={async () => {
            const res = await adminApi.cleanupCrossProjectCalls()
            return `Deleted ${res.deleted_count} cross-project calls`
          }}
        />

        <ActionItem
          title="Builtin Calls"
          description="Remove CALLS relationships to standard library or builtin functions that were incorrectly resolved during Tree-sitter parsing."
          icon={<Trash2 className="w-4 h-4" />}
          buttonLabel="Clean"
          buttonVariant="danger"
          confirm={{
            title: 'Cleanup Builtin Calls',
            description: 'Delete CALLS relationships to builtin/standard library functions that were incorrectly resolved.',
            variant: 'danger',
            confirmLabel: 'Delete',
          }}
          onAction={async () => {
            const res = await adminApi.cleanupBuiltinCalls()
            return `Deleted ${res.deleted_count} builtin calls`
          }}
        />

        <ActionItem
          title="Migrate Call Confidence"
          description="Migrate CALLS relationships to the latest confidence scoring system. Updates the confidence metadata without deleting anything."
          icon={<RefreshCw className="w-4 h-4" />}
          buttonLabel="Migrate"
          confirm={{
            title: 'Migrate Calls Confidence',
            description: 'Update CALLS relationships to the new confidence scoring system. This is a non-destructive migration.',
            variant: 'info',
            confirmLabel: 'Migrate',
          }}
          onAction={async () => {
            const res = await adminApi.migrateCallsConfidence()
            return `Migrated ${res.updated_count} call relationships`
          }}
        />

        <ActionItem
          title="Cleanup Sync Data"
          description="Remove orphaned file tracking metadata from the graph. Cleans up sync entries that no longer correspond to existing files."
          icon={<Trash2 className="w-4 h-4" />}
          buttonLabel="Clean"
          buttonVariant="danger"
          confirm={{
            title: 'Cleanup Sync Data',
            description: 'Remove stale sync metadata from the graph. This cleans up orphaned file tracking data.',
            variant: 'danger',
            confirmLabel: 'Delete',
          }}
          onAction={async () => {
            const res = await adminApi.cleanupSyncData()
            return res.message || `Deleted ${res.deleted_count} sync entries`
          }}
        />
      </ActionGroup>
    </CollapsibleSection>
  )
}

// ============================================================================
// HELPER: INLINE ACTION BUTTON (for use inside custom layouts)
// ============================================================================

function ActionItemInlineButton({
  label,
  icon,
  onAction,
  disabled,
}: {
  label: string
  icon?: React.ReactNode
  onAction: () => Promise<string>
  disabled?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  const handleClick = async () => {
    setLoading(true)
    try {
      const msg = await onAction()
      toast.success(msg)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleClick}
      disabled={disabled || loading}
    >
      {loading ? (
        <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
      ) : icon ? (
        <span className="mr-1.5">{icon}</span>
      ) : null}
      {label}
    </Button>
  )
}

// ============================================================================
// HELPER: STAT BOX
// ============================================================================

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
      <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-0.5">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? 'text-amber-400' : 'text-gray-200'}`}>
        {value}
      </span>
    </div>
  )
}
