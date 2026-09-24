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
        description="Maintenance du serveur : synchronisation du code, index de recherche, embeddings, analyses du graphe et nettoyage. Chaque action indique ce qu'elle fait et ce qu'elle coûte ; les actions destructives demandent confirmation."
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
      description: 'Plus aucun projet ne sera resynchronisé automatiquement. Vous pourrez les relancer à tout moment.',
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
      description="Un watcher surveille les fichiers d'un projet et met le graphe de code à jour à chaque modification."
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
                    description="Dossier surveillé qui ne correspond à aucun projet connu."
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
            description="Sync : analyse unique de tout le code du dossier (Tree-sitter, de quelques secondes à quelques minutes). Watch : resynchronise ensuite automatiquement à chaque changement."
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
      description="Index plein texte (Meilisearch) utilisé par la recherche de code."
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
                  <span className="text-gray-500"> fichiers indexés</span>
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
                  label={stats.is_indexing ? 'Indexing — résultats incomplets' : 'Ready'}
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
            description="Retire de l'index les documents dont le fichier n'existe plus dans le graphe."
            cost="Quelques secondes · sans risque"
            icon={<Trash2 />}
            buttonLabel="Clean"
            confirm={{
              title: 'Clean orphan documents',
              description: 'Supprime de Meilisearch les documents qui n’existent plus dans Neo4j. Sans risque.',
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
      description="Calcule les vecteurs qui alimentent la recherche sémantique et reconstruit les liens manquants."
      collapsible
      defaultOpen={false}
    >
      <SettingsList>
        <BackfillRow
          label="Note embeddings"
          description="Vectorise les notes qui n'en ont pas encore — indispensable à la recherche sémantique."
          cost="Tâche de fond · minutes selon le volume"
          getStatus={adminApi.getBackfillEmbeddingsStatus}
          onStart={() => adminApi.startBackfillEmbeddings()}
          onCancel={() => adminApi.cancelBackfillEmbeddings()}
        />
        <BackfillRow
          label="Synapse backfill"
          description="Relie les notes proches par des synapses (similarité des embeddings) pour la propagation du savoir."
          cost="Tâche de fond · minutes selon le volume"
          getStatus={adminApi.getBackfillSynapsesStatus}
          onStart={() => adminApi.startBackfillSynapses()}
          onCancel={() => adminApi.cancelBackfillSynapses()}
        />
        <ActionRow
          label="Decision embeddings"
          description="Vectorise les décisions d'architecture pour les retrouver par recherche sémantique."
          cost="Quelques secondes · sans risque"
          icon={<Zap />}
          onAction={async () => {
            const res = await adminApi.backfillDecisionEmbeddings()
            return `Processed ${res.decisions_processed} decisions, created ${res.embeddings_created} embeddings`
          }}
        />
        <ActionRow
          label="Backfill discussed"
          description="Relie fichiers et fonctions aux conversations passées où ils ont été analysés."
          cost="Secondes à minutes · sans risque"
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
      description="Analyses du graphe de connaissances (communautés, centralité, risques) et entretien des synapses."
      collapsible
      defaultOpen={false}
    >
      <div className="space-y-3">
        <SettingsList>
          <SettingRow
            label="Project"
            description="Les actions « pipeline » et « skills » ne s'appliquent qu'à ce projet."
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
        {projectRequired && <Notice tone="warning">Ajoutez un projet au workspace pour activer les actions liées à un projet.</Notice>}

        <ListGroup title="Pipeline">
          <ActionRow
            label="Bootstrap Knowledge Fabric"
            description="Construit tout le pipeline : liens git, embeddings, scores du graphe, churn, densité et risques."
            cost="Plusieurs minutes · non destructif"
            icon={<Sparkles />}
            buttonLabel="Bootstrap"
            buttonVariant="primary"
            disabled={projectRequired}
            confirm={{
              title: 'Bootstrap Knowledge Fabric',
              description: 'Lance le pipeline complet. Peut prendre plusieurs minutes selon la taille du projet.',
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
            description="Recalcule communautés (Louvain), PageRank, centralité, churn, densité et risques."
            cost="Quelques secondes · sans risque"
            icon={<BarChart3 />}
            buttonLabel="Update"
            disabled={projectRequired}
            confirm={{
              title: 'Update fabric scores',
              description: 'Recalcule tous les scores d’analyse du graphe. Sans risque, quelques secondes en général.',
            }}
            onAction={async () => {
              const res = await adminApi.updateFabricScores({ project_id: projectId })
              return `Updated ${res.nodes_updated} nodes, ${res.communities} communities in ${(res.computation_ms / 1000).toFixed(1)}s`
            }}
          />
          <ActionRow
            label="Backfill touches"
            description="Parcourt tout l'historique git pour relier chaque commit aux fichiers modifiés."
            cost="Selon la taille du dépôt · non destructif"
            icon={<GitCommitHorizontal />}
            buttonLabel="Start"
            disabled={projectRequired || !projectSlug}
            confirm={{
              title: 'Backfill TOUCHES',
              description: 'Parcourt l’historique git complet pour reconstruire les liens Commit → Fichier. Durée selon la taille du dépôt.',
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
            description="Repère les domaines d'expertise qui émergent des groupes de notes connectées."
            cost="Quelques secondes · sans risque"
            icon={<Brain />}
            disabled={projectRequired}
            onAction={async () => {
              const res = await adminApi.detectSkills(projectId)
              return `Detected ${res.skills_detected} skills (${res.skills_created} new, ${res.skills_updated} updated)`
            }}
          />
          <ActionRow
            label="Install git hooks"
            description="Ajoute un hook post-commit pour relier chaque nouveau commit à ses fichiers en temps réel."
            cost="Instantané · hooks existants conservés"
            icon={<Wrench />}
            buttonLabel="Install"
            disabled={projectRequired}
            confirm={{
              title: 'Install git hooks',
              description: 'Ajoute un hook post-commit dans .git/hooks du projet. Les hooks existants sont conservés.',
            }}
            onAction={async () => {
              await adminApi.installHooks({ project_id: projectId })
              return 'Git hooks installed'
            }}
          />
          <ActionRow
            label="Skill maintenance"
            description="Affaiblit les synapses peu utilisées, supprime les liens morts et détecte de nouveaux skills. Hourly = léger, Full = recalcul complet."
            cost="Secondes (Hourly) à minutes (Full)"
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
            description="Recalcule la fraîcheur des notes selon leur dernière mise à jour ; les notes périmées remontent en revue."
            cost="Quelques secondes · sans risque"
            icon={<RefreshCw />}
            onAction={async () => {
              const res = await adminApi.updateStaleness()
              return `Updated staleness for ${res.notes_updated} notes`
            }}
          />
          <ActionRow
            label="Update energy scores"
            description="Fait décroître l'énergie des notes avec le temps, sauf si elles sont réutilisées."
            cost="Quelques secondes · sans risque"
            icon={<Zap />}
            onAction={async () => {
              const res = await adminApi.updateEnergy()
              return `Updated energy for ${res.notes_updated} notes (half-life: ${res.half_life_days}d)`
            }}
          />
          <ActionRow
            label="Decay synapses"
            description="Baisse tous les poids de synapse de 0,01 et supprime ceux sous 0,1 — entretien de routine."
            cost="Quelques secondes · supprime les liens faibles"
            icon={<Activity />}
            buttonLabel="Run decay"
            confirm={{
              title: 'Decay synapses',
              description: 'Baisse tous les poids de 0,01 et supprime les synapses sous 0,1. Entretien de routine.',
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
      description="Supprime des données fausses ou obsolètes du graphe. Irréversible : chaque action demande confirmation."
      collapsible
      defaultOpen={false}
    >
      <SettingsList>
        <ActionRow
          label="Cross-project calls"
          description="Supprime les appels entre fonctions de projets différents — en général des homonymes mal résolus."
          cost="Irréversible · secondes"
          icon={<Trash2 />}
          buttonLabel="Clean"
          buttonVariant="danger"
          confirm={{
            title: 'Cleanup cross-project calls',
            description: 'Supprime les relations CALLS entre projets différents (faux positifs dus aux homonymes). Irréversible.',
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
          description="Supprime les appels vers la bibliothèque standard mal résolus pendant l'analyse du code."
          cost="Irréversible · secondes"
          icon={<Trash2 />}
          buttonLabel="Clean"
          buttonVariant="danger"
          confirm={{
            title: 'Cleanup builtin calls',
            description: 'Supprime les relations CALLS vers des fonctions standard/builtin mal résolues. Irréversible.',
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
          description="Passe les appels au nouveau calcul de confiance, sans rien supprimer."
          cost="Secondes · non destructif"
          icon={<RefreshCw />}
          buttonLabel="Migrate"
          confirm={{
            title: 'Migrate calls confidence',
            description: 'Met à jour les relations CALLS vers le nouveau score de confiance. Non destructif.',
          }}
          onAction={async () => {
            const res = await adminApi.migrateCallsConfidence()
            return `Migrated ${res.updated_count} call relationships`
          }}
        />
        <ActionRow
          label="Cleanup sync data"
          description="Supprime les métadonnées de suivi de fichiers qui ne correspondent plus à aucun fichier."
          cost="Irréversible · secondes"
          icon={<Trash2 />}
          buttonLabel="Clean"
          buttonVariant="danger"
          confirm={{
            title: 'Cleanup sync data',
            description: 'Supprime les métadonnées de synchronisation orphelines du graphe. Irréversible.',
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
