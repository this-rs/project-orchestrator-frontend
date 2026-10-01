import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ExternalLink, Pencil, Plus, Rocket, Trash2, XCircle } from 'lucide-react'
import {
  Button,
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  FormDialog,
  Input,
  ListGroup,
  PageShell,
  RelativeTime,
  Select,
  Textarea,
  hitArea,
  inlineLink,
  rowInteractive,
  type OverflowMenuAction,
} from '@/components/ui'
import { useToast, useWorkspaceSlug } from '@/hooks'
import { apiErrorMessage } from '@/services/api'
import { workspacesApi } from '@/services/workspaces'
import {
  DEPLOYMENT_STATUSES,
  ENVIRONMENT_KINDS,
  environmentsApi,
  type DeploymentMatrixEntry,
  type DeploymentStatus,
  type Environment,
  type EnvironmentKind,
} from '@/services/environments'
import type { Project } from '@/types'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { workspacePath } from '@/utils/paths'

const STATUS: Record<DeploymentStatus, { label: string; dot: string; text: string }> = {
  succeeded: { label: 'Succeeded', dot: 'bg-emerald-400', text: 'text-emerald-400' },
  running: { label: 'Running', dot: 'bg-indigo-400', text: 'text-indigo-400' },
  pending: { label: 'Pending', dot: 'bg-gray-500', text: 'text-gray-400' },
  failed: { label: 'Failed', dot: 'bg-red-400', text: 'text-red-400' },
  rolled_back: { label: 'Rolled back', dot: 'bg-amber-400', text: 'text-amber-400' },
}

const KIND_ORDER: Record<EnvironmentKind, number> = { dev: 0, staging: 1, production: 2, other: 3 }
const KIND_LABEL: Record<EnvironmentKind, string> = {
  dev: 'Dev',
  staging: 'Staging',
  production: 'Production',
  other: 'Other',
}

const KIND_OPTIONS = ENVIRONMENT_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))
const STATUS_OPTIONS = DEPLOYMENT_STATUSES.map((s) => ({ value: s, label: STATUS[s].label }))

interface ProjectMatrix {
  project: Project
  rows: DeploymentMatrixEntry[]
}

/** Labelled form row — same shape as the other pages' dialogs. */
function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-gray-400 mb-1">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
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
 * Create or edit an environment. On edit every field is sent, empty included,
 * so clearing a URL or a description actually clears it server-side (the API
 * leaves omitted fields untouched).
 */
function EnvironmentDialog({
  projects,
  projectId: initialProjectId,
  environment,
  onClose,
  onSaved,
}: {
  projects: Project[]
  projectId: string
  environment?: Environment
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const editing = Boolean(environment)
  const [projectId, setProjectId] = useState(initialProjectId)
  const [name, setName] = useState(environment?.name ?? '')
  const [kind, setKind] = useState<EnvironmentKind>(environment?.kind ?? 'dev')
  const [url, setUrl] = useState(environment?.url ?? '')
  const [description, setDescription] = useState(environment?.description ?? '')
  const [config, setConfig] = useState(environment?.config ?? '')

  const handleSubmit = async () => {
    const cleanName = name.trim()
    if (!cleanName) {
      toast.error('A name is required')
      return false
    }
    if (config.trim()) {
      try {
        JSON.parse(config)
      } catch {
        toast.error('Config must be valid JSON')
        return false
      }
    }

    try {
      if (environment) {
        // Full replace: an emptied field must reach the server to be cleared.
        await environmentsApi.update(environment.id, {
          name: cleanName,
          kind,
          url: url.trim(),
          description: description.trim(),
          config: config.trim(),
        })
        toast.success(`${cleanName} updated`)
      } else {
        await environmentsApi.create(projectId, {
          name: cleanName,
          kind,
          ...(url.trim() && { url: url.trim() }),
          ...(description.trim() && { description: description.trim() }),
          ...(config.trim() && { config: config.trim() }),
        })
        toast.success(`${cleanName} created`)
      }
      onSaved()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not save the environment'))
      return false
    }
  }

  return (
    <FormDialog
      open
      onClose={onClose}
      onSubmit={handleSubmit}
      title={editing ? `Edit ${environment?.name}` : 'New environment'}
      submitLabel={editing ? 'Save' : 'Create'}
    >
      <div className="space-y-3">
        {!editing && (
          <Field label="Project *">
            {() => (
              <Select
                value={projectId}
                onChange={setProjectId}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
            )}
          </Field>
        )}
        <Field label="Name *" hint="Unique within the project — dev, staging, production, a region…">
          {(id) => (
            <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="production" />
          )}
        </Field>
        <Field label="Kind *">
          {() => <Select value={kind} onChange={(v) => setKind(v as EnvironmentKind)} options={KIND_OPTIONS} />}
        </Field>
        <Field label="URL">
          {(id) => (
            <Input id={id} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://app.example.com" />
          )}
        </Field>
        <Field label="Description">
          {(id) => (
            <Input
              id={id}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What runs here, and how it is served"
            />
          )}
        </Field>
        <Field label="Config" hint="Free-form JSON: host, region, runtime…">
          {(id) => (
            <Textarea
              id={id}
              value={config}
              onChange={(e) => setConfig(e.target.value)}
              placeholder={'{\n  "host": "launchd",\n  "port": 8080\n}'}
              rows={3}
              className="font-mono"
            />
          )}
        </Field>
      </div>
    </FormDialog>
  )
}

/** Record what was shipped to an environment. */
function DeployDialog({
  environment,
  onClose,
  onSaved,
}: {
  environment: Environment
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [version, setVersion] = useState('')
  const [commitSha, setCommitSha] = useState('')
  const [status, setStatus] = useState<DeploymentStatus>('succeeded')
  const [notes, setNotes] = useState('')

  const handleSubmit = async () => {
    try {
      await environmentsApi.deploy(environment.id, {
        status,
        created_by: 'ui',
        ...(version.trim() && { version: version.trim() }),
        ...(commitSha.trim() && { commit_sha: commitSha.trim() }),
        ...(notes.trim() && { notes: notes.trim() }),
      })
      toast.success(`Deployment recorded on ${environment.name}`)
      onSaved()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not record the deployment'))
      return false
    }
  }

  return (
    <FormDialog
      open
      onClose={onClose}
      onSubmit={handleSubmit}
      title={`Record a deployment — ${environment.name}`}
      submitLabel="Record"
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          What was shipped here, and how it went. A terminal status is timestamped as finished by the server.
        </p>
        <Field label="Version">
          {(id) => (
            <Input id={id} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v0.0.15" />
          )}
        </Field>
        <Field label="Commit">
          {(id) => (
            <Input
              id={id}
              value={commitSha}
              onChange={(e) => setCommitSha(e.target.value)}
              placeholder="94c04bc"
              className="font-mono"
            />
          )}
        </Field>
        <Field label="Status *">
          {() => <Select value={status} onChange={(v) => setStatus(v as DeploymentStatus)} options={STATUS_OPTIONS} />}
        </Field>
        <Field label="Notes">
          {(id) => (
            <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything worth remembering" />
          )}
        </Field>
      </div>
    </FormDialog>
  )
}

/**
 * Deployments — for every project, where it runs (environments) and what was
 * shipped there last. Read from the deployment matrix, written from here.
 */
export function DeploymentsPage() {
  const wsSlug = useWorkspaceSlug()
  const toast = useToast()
  const [projects, setProjects] = useState<Project[]>([])
  const [matrices, setMatrices] = useState<ProjectMatrix[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Open dialog: creating for a project, or editing one environment. */
  const [envTarget, setEnvTarget] = useState<{ projectId: string; environment?: Environment } | null>(null)
  const [deployTarget, setDeployTarget] = useState<Environment | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const list = await workspacesApi.listProjects(wsSlug)
      const all = await Promise.all(
        list.map(async (project) => ({
          project,
          rows: await environmentsApi.matrix(project.id).catch(() => [] as DeploymentMatrixEntry[]),
        })),
      )
      setProjects(list)
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

  const afterWrite = () => {
    setEnvTarget(null)
    setDeployTarget(null)
    load()
  }

  const remove = async (env: Environment) => {
    try {
      await environmentsApi.remove(env.id)
      toast.success(`${env.name} deleted`)
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not delete the environment'))
    }
  }

  /** Close an in-flight deployment without opening a form. */
  const settle = async (deploymentId: string | undefined, status: DeploymentStatus) => {
    if (!deploymentId) return
    try {
      await environmentsApi.updateDeployment(deploymentId, { status })
      toast.success(`Marked ${STATUS[status].label.toLowerCase()}`)
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not update the deployment'))
    }
  }

  const withEnvs = matrices.filter((m) => m.rows.length > 0)
  const newEnvironment = () => setEnvTarget({ projectId: projects[0]?.id ?? '' })

  return (
    <PageShell
      title={NOMENCLATURE.deployments.plural}
      description={NOMENCLATURE.deployments.description}
      width="wide"
      actions={
        projects.length > 0 ? (
          <Button size="sm" onClick={newEnvironment}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            New environment
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <EntityListSkeleton rows={4} />
      ) : error ? (
        <ErrorState description={error} onRetry={load} />
      ) : withEnvs.length === 0 ? (
        <EmptyState
          title="No environment yet"
          description="Declare where a project runs — dev, staging, production — then record what you ship there."
          action={
            projects.length > 0 ? (
              <Button size="sm" onClick={newEnvironment}>
                <Plus className="w-4 h-4" aria-hidden="true" />
                New environment
              </Button>
            ) : undefined
          }
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
                    // The deployment still open, if any — settling needs its id.
                    const inFlight = dep && (dep.status === 'pending' || dep.status === 'running') ? dep : null
                    const actions: OverflowMenuAction[] = [
                      { label: 'Record a deployment', icon: Rocket, onClick: () => setDeployTarget(env) },
                      {
                        label: 'Mark succeeded',
                        icon: CheckCircle2,
                        hidden: !inFlight,
                        onClick: () => settle(inFlight?.id, 'succeeded'),
                      },
                      {
                        label: 'Mark failed',
                        icon: XCircle,
                        hidden: !inFlight,
                        onClick: () => settle(inFlight?.id, 'failed'),
                      },
                      {
                        label: 'Edit',
                        icon: Pencil,
                        onClick: () => setEnvTarget({ projectId: project.id, environment: env }),
                      },
                      {
                        label: 'Delete',
                        icon: Trash2,
                        variant: 'danger',
                        onClick: () => remove(env),
                        confirm: {
                          title: `Delete ${env.name}?`,
                          description: 'Its deployment history goes with it. This cannot be undone.',
                          confirmLabel: 'Delete',
                        },
                      },
                    ]
                    return (
                      <EntityRow
                        key={env.id}
                        title={env.name}
                        description={env.description || undefined}
                        actions={actions}
                        leading={
                          <span
                            className={`h-2 w-2 rounded-full ${st ? st.dot : 'bg-gray-700'}`}
                            aria-hidden="true"
                          />
                        }
                        trailing={dep ? <RelativeTime date={dep.finished_at ?? dep.started_at} /> : undefined}
                        meta={[
                          st ? (
                            <span key="st" className={st.text}>
                              {st.label}
                            </span>
                          ) : (
                            <span key="st">Never deployed</span>
                          ),
                          dep?.version ? <span key="v" className="tabular-nums">{dep.version}</span> : null,
                          dep?.commit_sha ? <code key="c" className="text-[11px]">{dep.commit_sha.slice(0, 7)}</code> : null,
                          KIND_LABEL[env.kind],
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

      {envTarget && (
        <EnvironmentDialog
          key={envTarget.environment?.id ?? 'new'}
          projects={projects}
          projectId={envTarget.projectId}
          environment={envTarget.environment}
          onClose={() => setEnvTarget(null)}
          onSaved={afterWrite}
        />
      )}
      {deployTarget && (
        <DeployDialog
          key={deployTarget.id}
          environment={deployTarget}
          onClose={() => setDeployTarget(null)}
          onSaved={afterWrite}
        />
      )}
    </PageShell>
  )
}
