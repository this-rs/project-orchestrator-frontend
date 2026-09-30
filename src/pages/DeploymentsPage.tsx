import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, GitCommitHorizontal, Layers, Tag } from 'lucide-react'
import {
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  Fact,
  ListGroup,
  PageShell,
  RelativeTime,
  ToneText,
  type StatusTone,
  hitArea,
  inlineLink,
  rowInteractive,
} from '@/components/ui'
import { useWorkspaceSlug } from '@/hooks'
import { workspacesApi } from '@/services/workspaces'
import {
  environmentsApi,
  type DeploymentMatrixEntry,
  type DeploymentStatus,
  type EnvironmentKind,
} from '@/services/environments'
import type { Project } from '@/types'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { workspacePath } from '@/utils/paths'

const STATUS: Record<DeploymentStatus, { label: string; tone: StatusTone; dot: string }> = {
  succeeded: { label: 'Succeeded', tone: 'success', dot: 'bg-emerald-400' },
  running: { label: 'Running', tone: 'progress', dot: 'bg-indigo-400' },
  pending: { label: 'Pending', tone: 'neutral', dot: 'bg-gray-500' },
  failed: { label: 'Failed', tone: 'danger', dot: 'bg-red-400' },
  rolled_back: { label: 'Rolled back', tone: 'warning', dot: 'bg-amber-400' },
}

const KIND_ORDER: Record<EnvironmentKind, number> = { dev: 0, staging: 1, production: 2, other: 3 }
const KIND_LABEL: Record<EnvironmentKind, string> = {
  dev: 'Dev',
  staging: 'Staging',
  production: 'Production',
  other: 'Other',
}

interface ProjectMatrix {
  project: Project
  rows: DeploymentMatrixEntry[]
}

/** Latest first, as a short row of dots (colour + a title: never colour alone). */
function History({ statuses }: { statuses: DeploymentStatus[] }) {
  if (statuses.length === 0) return null
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Last ${statuses.length} deployments`}>
      {[...statuses].reverse().map((s, i) => (
        <span key={i} title={STATUS[s].label} className={`h-1.5 w-1.5 rounded-full ${STATUS[s].dot}`} />
      ))}
    </span>
  )
}

/**
 * Deployments — for every project, where it runs (environments) and what was
 * shipped there last. Read from the deployment matrix.
 */
export function DeploymentsPage() {
  const wsSlug = useWorkspaceSlug()
  const [matrices, setMatrices] = useState<ProjectMatrix[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const projects = await workspacesApi.listProjects(wsSlug)
      const all = await Promise.all(
        projects.map(async (project) => ({
          project,
          rows: await environmentsApi.matrix(project.id).catch(() => [] as DeploymentMatrixEntry[]),
        })),
      )
      setMatrices(all)
    } catch {
      setError('Failed to load deployments')
    } finally {
      setLoading(false)
    }
  }, [wsSlug])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const withEnvs = matrices.filter((m) => m.rows.length > 0)

  return (
    <PageShell title={NOMENCLATURE.deployments.plural} description={NOMENCLATURE.deployments.description} width="wide">
      {loading ? (
        <EntityListSkeleton rows={4} />
      ) : error ? (
        <ErrorState description={error} onRetry={load} />
      ) : withEnvs.length === 0 ? (
        <EmptyState
          title="No environment yet"
          description="Ask the agent to define where a project runs (dev, staging, production) and to record what it ships there."
        />
      ) : (
        <div className="space-y-6">
          {withEnvs.map(({ project, rows }) => (
            <ListGroup key={project.id} title={project.name} count={rows.length}>
              <EntityList aria-label={`${project.name} environments`}>
                {[...rows]
                  .sort((a, b) => KIND_ORDER[a.environment.kind] - KIND_ORDER[b.environment.kind])
                  .map(({ environment: env, latest_deployment: dep, recent_statuses }) => {
                    const st = dep ? STATUS[dep.status] : null
                    return (
                      <EntityRow
                        key={env.id}
                        title={env.name}
                        description={env.description || undefined}
                        tone={st?.tone}
                        trailing={dep ? <RelativeTime date={dep.finished_at ?? dep.started_at} /> : undefined}
                        status={[
                          st ? (
                            <ToneText key="st" tone={st.tone} icon pulse={dep?.status === 'running'} label={st.label} />
                          ) : (
                            <ToneText key="st" tone="neutral" icon label="Never deployed" />
                          ),
                        ]}
                        meta={[
                          dep?.version ? (
                            <Fact key="v" icon={Tag} title="Version">
                              <span className="tabular-nums">{dep.version}</span>
                            </Fact>
                          ) : null,
                          dep?.commit_sha ? (
                            <Fact key="c" icon={GitCommitHorizontal} title="Commit" mono>
                              {dep.commit_sha.slice(0, 7)}
                            </Fact>
                          ) : null,
                          <Fact key="k" icon={Layers} title="Environment kind">
                            {KIND_LABEL[env.kind]}
                          </Fact>,
                          <History key="h" statuses={recent_statuses} />,
                          env.url ? (
                            <a
                              key="u"
                              href={env.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`${rowInteractive} ${hitArea} ${inlineLink} inline-flex items-center gap-1 min-w-0`}
                            >
                              <span className="truncate max-w-[14rem]">{env.url.replace(/^https?:\/\//, '')}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                            </a>
                          ) : null,
                        ]}
                      />
                    )
                  })}
              </EntityList>
            </ListGroup>
          ))}
          {matrices.length > withEnvs.length && (
            <p className="text-xs text-gray-500">
              {matrices.length - withEnvs.length} project(s) have no environment yet.{' '}
              <Link className={inlineLink} to={workspacePath(wsSlug, '/projects')}>
                Projects
              </Link>
            </p>
          )}
        </div>
      )}
    </PageShell>
  )
}
