import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ChevronRight,
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
  Card,
  CardContent,
  Badge,
  Button,
  Select,
  Input,
  ConfirmDialog,
  PageShell,
} from '@/components/ui'
import { adminApi, workspacesApi } from '@/services'
import { useConfirmDialog, useToast, useWorkspaceSlug } from '@/hooks'
import type {
  BackfillJobStatus,
  MeilisearchStats,
  MaintenanceLevel,
} from '@/types'

// ============================================================================
// COLLAPSIBLE SECTION
// ============================================================================

interface SectionProps {
  title: string
  icon: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}

function Section({ title, icon, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Card>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <ChevronRight
          className={`w-4 h-4 text-gray-500 transition-transform duration-150 shrink-0 ${open ? 'rotate-90' : ''}`}
        />
        <span className="text-gray-400">{icon}</span>
        <span className="text-sm font-semibold text-gray-200">{title}</span>
      </button>
      {open && (
        <CardContent className="pt-0 pb-5 px-5 border-t border-white/[0.06]">
          {children}
        </CardContent>
      )}
    </Card>
  )
}

// ============================================================================
// ACTION BUTTON (with loading + confirmation)
// ============================================================================

interface ActionButtonProps {
  label: string
  icon?: React.ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
  confirmTitle?: string
  confirmDescription?: string
  onAction: () => Promise<string>
  disabled?: boolean
}

function ActionButton({
  label,
  icon,
  variant = 'secondary',
  confirmTitle,
  confirmDescription,
  onAction,
  disabled,
}: ActionButtonProps) {
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
    if (confirmTitle) {
      confirmDialog.open({
        title: confirmTitle,
        description: confirmDescription || `Are you sure you want to run "${label}"?`,
        onConfirm: run,
      })
    } else {
      run()
    }
  }

  const btnVariant = variant === 'danger' ? 'danger' : variant === 'primary' ? 'primary' : 'secondary'

  return (
    <>
      <Button
        variant={btnVariant}
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
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </>
  )
}

// ============================================================================
// BACKFILL STATUS (with polling)
// ============================================================================

interface BackfillPanelProps {
  title: string
  getStatus: () => Promise<BackfillJobStatus>
  onStart: () => Promise<unknown>
  onCancel: () => Promise<unknown>
}

function BackfillPanel({ title, getStatus, onStart, onCancel }: BackfillPanelProps) {
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
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-gray-300">{title}</h4>
        <StatusBadge status={status?.status || 'idle'} />
      </div>

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
      onConfirm: async () => {
        await adminApi.stopWatch()
        toast.success('File watcher stopped')
        fetchWatchStatus()
      },
    })
  }

  return (
    <Section title="Sync & Watchers" icon={<FolderSync className="w-4 h-4" />} defaultOpen>
      {/* Watcher status */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <h4 className="text-xs uppercase tracking-wider text-gray-500">File Watcher</h4>
          {watchStatus && (
            <Badge variant={watchStatus.running ? 'success' : 'default'}>
              {watchStatus.running ? 'Running' : 'Stopped'}
            </Badge>
          )}
        </div>

        {watchStatus?.running && watchStatus.watched_paths.length > 0 && (
          <div className="mb-3 space-y-1">
            {watchStatus.watched_paths.map((path) => (
              <div
                key={path}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] text-xs"
              >
                <Eye className="w-3.5 h-3.5 text-green-400 shrink-0" />
                <code className="text-gray-300 font-mono truncate">{path}</code>
              </div>
            ))}
          </div>
        )}

        {watchStatus && !watchStatus.running && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-white/[0.04] text-xs text-gray-500">
            <EyeOff className="w-3.5 h-3.5 shrink-0" />
            No active watcher
          </div>
        )}

        {watchStatus?.running && (
          <Button variant="danger" size="sm" onClick={handleStopWatch}>
            <Square className="w-3.5 h-3.5 mr-1.5" />
            Stop Watcher
          </Button>
        )}
      </div>

      {/* Manual sync / start watcher */}
      <div className="border-t border-white/[0.06] pt-4">
        <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-3">Manual Sync / Start Watcher</h4>
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
    <Section title="Search Engine" icon={<Search className="w-4 h-4" />}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <StatBox label="Documents" value={stats?.code_documents?.toLocaleString() ?? '—'} />
        <StatBox
          label="Status"
          value={stats?.is_indexing ? 'Indexing' : 'Ready'}
          highlight={stats?.is_indexing}
        />
      </div>

      <ActionButton
        label="Clean Orphans"
        icon={<Trash2 className="w-3.5 h-3.5" />}
        confirmTitle="Delete Orphan Documents"
        confirmDescription="Remove orphaned documents from Meilisearch that no longer exist in Neo4j. This is safe to run."
        onAction={async () => {
          const res = await adminApi.deleteMeilisearchOrphans()
          return res.message || 'Orphans cleaned'
        }}
      />
    </Section>
  )
}

// ============================================================================
// SECTION: EMBEDDINGS & BACKFILLS
// ============================================================================

function EmbeddingsSection() {
  return (
    <Section title="Embeddings & Backfills" icon={<Database className="w-4 h-4" />}>
      <div className="space-y-4">
        {/* Note Embeddings */}
        <BackfillPanel
          title="Note Embeddings"
          getStatus={adminApi.getBackfillEmbeddingsStatus}
          onStart={() => adminApi.startBackfillEmbeddings()}
          onCancel={() => adminApi.cancelBackfillEmbeddings()}
        />

        {/* Synapse Backfill */}
        <BackfillPanel
          title="Synapse Backfill"
          getStatus={adminApi.getBackfillSynapsesStatus}
          onStart={() => adminApi.startBackfillSynapses()}
          onCancel={() => adminApi.cancelBackfillSynapses()}
        />

        {/* Simple actions */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/[0.06]">
          <ActionButton
            label="Decision Embeddings"
            icon={<Zap className="w-3.5 h-3.5" />}
            onAction={async () => {
              const res = await adminApi.backfillDecisionEmbeddings()
              return `Processed ${res.decisions_processed} decisions, created ${res.embeddings_created} embeddings`
            }}
          />
          <ActionButton
            label="Backfill Discussed"
            icon={<Zap className="w-3.5 h-3.5" />}
            onAction={async () => {
              const res = await adminApi.backfillDiscussed()
              return `Processed ${res.sessions_processed} sessions, found ${res.entities_found} entities, created ${res.relations_created} relations`
            }}
          />
        </div>
      </div>
    </Section>
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
    <Section title="Knowledge Fabric" icon={<Brain className="w-4 h-4" />}>
      {projectRequired && (
        <p className="text-xs text-amber-400/80 mb-3 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Select a project above to enable these actions
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <ActionButton
          label="Bootstrap Fabric"
          icon={<Sparkles className="w-3.5 h-3.5" />}
          variant="primary"
          disabled={projectRequired}
          confirmTitle="Bootstrap Knowledge Fabric"
          confirmDescription="Initialize the full Knowledge Fabric pipeline: TOUCHES, embeddings, discussed, fabric scores, churn, knowledge density, risk. This may take a while."
          onAction={async () => {
            const res = await adminApi.bootstrapKnowledgeFabric({ project_id: projectId })
            const ok = res.steps_completed.length
            const fail = res.steps_failed.length
            return `${ok} steps completed${fail > 0 ? `, ${fail} failed` : ''} in ${(res.total_time_ms / 1000).toFixed(1)}s`
          }}
        />

        <ActionButton
          label="Update Fabric Scores"
          icon={<BarChart3 className="w-3.5 h-3.5" />}
          disabled={projectRequired}
          confirmTitle="Update Fabric Scores"
          confirmDescription="Recalculate all GDS scores (communities, pagerank, betweenness, churn, knowledge density, risk)."
          onAction={async () => {
            const res = await adminApi.updateFabricScores({ project_id: projectId })
            return `Updated ${res.nodes_updated} nodes, ${res.communities} communities in ${(res.computation_ms / 1000).toFixed(1)}s`
          }}
        />

        <ActionButton
          label="Detect Skills"
          icon={<Brain className="w-3.5 h-3.5" />}
          disabled={projectRequired}
          onAction={async () => {
            const res = await adminApi.detectSkills(projectId)
            return `Detected ${res.skills_detected} skills (${res.skills_created} new, ${res.skills_updated} updated)`
          }}
        />

        <ActionButton
          label="Install Hooks"
          icon={<Wrench className="w-3.5 h-3.5" />}
          disabled={projectRequired}
          confirmTitle="Install Git Hooks"
          confirmDescription="Install PO git hooks (post-commit) in the project repository."
          onAction={async () => {
            await adminApi.installHooks({ project_id: projectId })
            return 'Git hooks installed'
          }}
        />

        <ActionButton
          label="Backfill Touches"
          icon={<GitCommitHorizontal className="w-3.5 h-3.5" />}
          disabled={projectRequired || !projectSlug}
          confirmTitle="Backfill TOUCHES"
          confirmDescription="Reconstruct TOUCHES relationships from git history. This scans all commits."
          onAction={async () => {
            const res = await adminApi.backfillTouches(projectSlug)
            return `Parsed ${res.commits_parsed} commits, backfilled ${res.commits_backfilled}, created ${res.touches_created} touches`
          }}
        />
      </div>

      {/* Skill Maintenance with level selector */}
      <div className="border-t border-white/[0.06] pt-3">
        <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-3">Skill Maintenance</h4>
        <div className="flex items-center gap-2">
          <Select
            options={levelOptions}
            value={maintenanceLevel}
            onChange={(v) => setMaintenanceLevel(v as MaintenanceLevel)}
            className="w-32"
          />
          <ActionButton
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
      <div className="border-t border-white/[0.06] pt-3 mt-3">
        <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-3">Neural Maintenance</h4>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label="Update Staleness"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onAction={async () => {
              const res = await adminApi.updateStaleness()
              return `Updated staleness for ${res.notes_updated} notes`
            }}
          />
          <ActionButton
            label="Update Energy"
            icon={<Zap className="w-3.5 h-3.5" />}
            onAction={async () => {
              const res = await adminApi.updateEnergy()
              return `Updated energy for ${res.notes_updated} notes (half-life: ${res.half_life_days}d)`
            }}
          />
          <ActionButton
            label="Decay Synapses"
            icon={<Activity className="w-3.5 h-3.5" />}
            confirmTitle="Decay Synapses"
            confirmDescription="Decay all synapse weights by 0.01 and prune those below 0.1. This is normal maintenance."
            onAction={async () => {
              const res = await adminApi.decayNeurons()
              return `Decayed ${res.synapses_decayed} synapses, pruned ${res.synapses_pruned}`
            }}
          />
        </div>
      </div>
    </Section>
  )
}

// ============================================================================
// SECTION: CLEANUP
// ============================================================================

function CleanupSection() {
  return (
    <Section title="Cleanup" icon={<AlertTriangle className="w-4 h-4" />}>
      <p className="text-xs text-gray-500 mb-4">
        These operations clean up stale data from the graph. They are safe to run but irreversible.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <ActionButton
          label="Cross-Project Calls"
          icon={<Trash2 className="w-3.5 h-3.5" />}
          variant="danger"
          confirmTitle="Cleanup Cross-Project Calls"
          confirmDescription="Delete CALLS relationships that span across different projects. These are usually false positives from name collisions."
          onAction={async () => {
            const res = await adminApi.cleanupCrossProjectCalls()
            return `Deleted ${res.deleted_count} cross-project calls`
          }}
        />

        <ActionButton
          label="Builtin Calls"
          icon={<Trash2 className="w-3.5 h-3.5" />}
          variant="danger"
          confirmTitle="Cleanup Builtin Calls"
          confirmDescription="Delete CALLS relationships to builtin/standard library functions that were incorrectly resolved."
          onAction={async () => {
            const res = await adminApi.cleanupBuiltinCalls()
            return `Deleted ${res.deleted_count} builtin calls`
          }}
        />

        <ActionButton
          label="Migrate Confidence"
          icon={<RefreshCw className="w-3.5 h-3.5" />}
          confirmTitle="Migrate Calls Confidence"
          confirmDescription="Migrate CALLS relationships to the new confidence scoring system."
          onAction={async () => {
            const res = await adminApi.migrateCallsConfidence()
            return `Migrated ${res.updated_count} call relationships`
          }}
        />

        <ActionButton
          label="Cleanup Sync Data"
          icon={<Trash2 className="w-3.5 h-3.5" />}
          variant="danger"
          confirmTitle="Cleanup Sync Data"
          confirmDescription="Remove stale sync metadata from the graph. This cleans up orphaned file tracking data."
          onAction={async () => {
            const res = await adminApi.cleanupSyncData()
            return res.message || `Deleted ${res.deleted_count} sync entries`
          }}
        />
      </div>
    </Section>
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
