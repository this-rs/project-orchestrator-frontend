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
  TONE_CLASSES,
  Textarea,
  ToneText,
  hitArea,
  inlineLink,
  rowInteractive,
  type OverflowMenuAction,
  type StatusTone,
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
import { useT } from '@/i18n'
import { workspacePath } from '@/utils/paths'

/** Deployment states are outside the status registry: a tone each (§4), never a colour alone. */
const STATUS: Record<DeploymentStatus, { tone: StatusTone }> = {
  succeeded: { tone: 'success' },
  running: { tone: 'progress' },
  pending: { tone: 'neutral' },
  failed: { tone: 'danger' },
  rolled_back: { tone: 'warning' },
}
/** States that draw the row's rail: moving or needing attention (done / pending stay quiet). */
const RAIL_TONES: ReadonlySet<DeploymentStatus> = new Set(['running', 'failed', 'rolled_back'])

const KIND_ORDER: Record<EnvironmentKind, number> = { dev: 0, staging: 1, production: 2, other: 3 }

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
  const { t } = useT()
  if (statuses.length === 0) return null
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={t('deployments.lastN', { count: statuses.length })}>
      {[...statuses].reverse().map((s, i) => (
        <span key={i} title={t(`deployments.status.${s}` as const)} className={`h-1.5 w-1.5 rounded-full ${TONE_CLASSES[STATUS[s].tone].dot}`} />
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
  const { t } = useT()
  const toast = useToast()
  const editing = Boolean(environment)
  const kindOptions = ENVIRONMENT_KINDS.map((k) => ({ value: k, label: t(`deployments.kind.${k}` as const) }))
  const [projectId, setProjectId] = useState(initialProjectId)
  const [name, setName] = useState(environment?.name ?? '')
  const [kind, setKind] = useState<EnvironmentKind>(environment?.kind ?? 'dev')
  const [url, setUrl] = useState(environment?.url ?? '')
  const [description, setDescription] = useState(environment?.description ?? '')
  const [config, setConfig] = useState(environment?.config ?? '')

  const handleSubmit = async () => {
    const cleanName = name.trim()
    if (!cleanName) {
      toast.error(t('deployments.envDialog.nameRequired'))
      return false
    }
    if (config.trim()) {
      try {
        JSON.parse(config)
      } catch {
        toast.error(t('deployments.envDialog.configInvalid'))
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
        toast.success(t('deployments.envDialog.updated', { name: cleanName }))
      } else {
        await environmentsApi.create(projectId, {
          name: cleanName,
          kind,
          ...(url.trim() && { url: url.trim() }),
          ...(description.trim() && { description: description.trim() }),
          ...(config.trim() && { config: config.trim() }),
        })
        toast.success(t('deployments.envDialog.created', { name: cleanName }))
      }
      onSaved()
    } catch (err) {
      toast.error(apiErrorMessage(err, t('deployments.envDialog.saveFailed')))
      return false
    }
  }

  return (
    <FormDialog
      open
      onClose={onClose}
      onSubmit={handleSubmit}
      title={editing ? t('deployments.envDialog.editTitle', { name: environment?.name ?? '' }) : t('deployments.envDialog.newTitle')}
      submitLabel={editing ? t('deployments.envDialog.save') : t('deployments.envDialog.create')}
    >
      <div className="space-y-3">
        {!editing && (
          <Field label={t('deployments.envDialog.project')}>
            {() => (
              <Select
                value={projectId}
                onChange={setProjectId}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
            )}
          </Field>
        )}
        <Field label={t('deployments.envDialog.name')} hint={t('deployments.envDialog.nameHint')}>
          {(id) => (
            <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('deployments.envDialog.namePlaceholder')} />
          )}
        </Field>
        <Field label={t('deployments.envDialog.kind')}>
          {() => <Select value={kind} onChange={(v) => setKind(v as EnvironmentKind)} options={kindOptions} />}
        </Field>
        <Field label={t('deployments.envDialog.url')}>
          {(id) => (
            <Input id={id} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://app.example.com" />
          )}
        </Field>
        <Field label={t('deployments.envDialog.description')}>
          {(id) => (
            <Input
              id={id}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('deployments.envDialog.descriptionPlaceholder')}
            />
          )}
        </Field>
        <Field label={t('deployments.envDialog.config')} hint={t('deployments.envDialog.configHint')}>
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
  const { t } = useT()
  const toast = useToast()
  const statusOptions = DEPLOYMENT_STATUSES.map((s) => ({ value: s, label: t(`deployments.status.${s}` as const) }))
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
      toast.success(t('deployments.deployDialog.recorded', { name: environment.name }))
      onSaved()
    } catch (err) {
      toast.error(apiErrorMessage(err, t('deployments.deployDialog.failed')))
      return false
    }
  }

  return (
    <FormDialog
      open
      onClose={onClose}
      onSubmit={handleSubmit}
      title={t('deployments.deployDialog.title', { name: environment.name })}
      submitLabel={t('deployments.deployDialog.submit')}
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          {t('deployments.deployDialog.intro')}
        </p>
        <Field label={t('deployments.deployDialog.version')}>
          {(id) => (
            <Input id={id} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v0.0.15" />
          )}
        </Field>
        <Field label={t('deployments.deployDialog.commit')}>
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
        <Field label={t('deployments.deployDialog.status')}>
          {() => <Select value={status} onChange={(v) => setStatus(v as DeploymentStatus)} options={statusOptions} />}
        </Field>
        <Field label={t('deployments.deployDialog.notes')}>
          {(id) => (
            <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t('deployments.deployDialog.notesPlaceholder')} />
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
  const { t } = useT()
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
      setError(t('deployments.page.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [wsSlug, t])

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
      toast.success(t('deployments.page.deleted', { name: env.name }))
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err, t('deployments.page.deleteFailed')))
    }
  }

  /** Close an in-flight deployment without opening a form. */
  const settle = async (deploymentId: string | undefined, status: DeploymentStatus) => {
    if (!deploymentId) return
    try {
      await environmentsApi.updateDeployment(deploymentId, { status })
      toast.success(t('deployments.page.marked', { status: t(`deployments.status.${status}` as const).toLowerCase() }))
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err, t('deployments.page.updateFailed')))
    }
  }

  const withEnvs = matrices.filter((m) => m.rows.length > 0)
  const newEnvironment = () => setEnvTarget({ projectId: projects[0]?.id ?? '' })

  return (
    <PageShell
      title={t('nav.concepts.deployments')}
      description={t('deployments.description')}
      intro="deployments"
      width="wide"
      actions={
        projects.length > 0 ? (
          <Button size="sm" onClick={newEnvironment}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            {t('deployments.page.newEnvironment')}
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
          title={t('deployments.page.emptyTitle')}
          description={t('deployments.page.emptyBody')}
          action={
            projects.length > 0 ? (
              <Button size="sm" onClick={newEnvironment}>
                <Plus className="w-4 h-4" aria-hidden="true" />
                {t('deployments.page.newEnvironment')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          {withEnvs.map(({ project, rows }) => (
            <ListGroup key={project.id} title={project.name} count={rows.length}>
              <EntityList aria-label={t('deployments.page.environments', { name: project.name })}>
                {[...rows]
                  .sort((a, b) => KIND_ORDER[a.environment.kind] - KIND_ORDER[b.environment.kind])
                  .map(({ environment: env, latest_deployment: dep, recent_statuses }) => {
                    const st = dep ? STATUS[dep.status] : null
                    // The deployment still open, if any — settling needs its id.
                    const inFlight = dep && (dep.status === 'pending' || dep.status === 'running') ? dep : null
                    const actions: OverflowMenuAction[] = [
                      { label: t('deployments.page.record'), icon: Rocket, onClick: () => setDeployTarget(env) },
                      {
                        label: t('deployments.page.markSucceeded'),
                        icon: CheckCircle2,
                        hidden: !inFlight,
                        onClick: () => settle(inFlight?.id, 'succeeded'),
                      },
                      {
                        label: t('deployments.page.markFailed'),
                        icon: XCircle,
                        hidden: !inFlight,
                        onClick: () => settle(inFlight?.id, 'failed'),
                      },
                      {
                        label: t('deployments.page.edit'),
                        icon: Pencil,
                        onClick: () => setEnvTarget({ projectId: project.id, environment: env }),
                      },
                      {
                        label: t('deployments.page.delete'),
                        icon: Trash2,
                        variant: 'danger',
                        onClick: () => remove(env),
                        confirm: {
                          title: t('deployments.page.deleteTitle', { name: env.name }),
                          description: t('deployments.page.deleteBody'),
                          confirmLabel: t('deployments.page.delete'),
                        },
                      },
                    ]
                    return (
                      <EntityRow
                        key={env.id}
                        title={env.name}
                        description={env.description || undefined}
                        actions={actions}
                        status={
                          st && dep ? (
                            <ToneText tone={st.tone} icon label={t(`deployments.status.${dep.status}` as const)} pulse={dep.status === 'running'} />
                          ) : (
                            <span className="text-gray-500">{t('deployments.page.neverDeployed')}</span>
                          )
                        }
                        tone={dep && RAIL_TONES.has(dep.status) ? STATUS[dep.status].tone : undefined}
                        trailing={dep ? <RelativeTime date={dep.finished_at ?? dep.started_at} /> : undefined}
                        meta={[
                          dep?.version ? <span key="v" className="tabular-nums">{dep.version}</span> : null,
                          dep?.commit_sha ? <code key="c" className="text-[11px]">{dep.commit_sha.slice(0, 7)}</code> : null,
                          t(`deployments.kind.${env.kind}` as const),
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
              {t('deployments.page.noEnvironment', { count: matrices.length - withEnvs.length })}{' '}
              <Link className={inlineLink} to={workspacePath(wsSlug, '/projects')}>
                {t('deployments.page.projects')}
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
