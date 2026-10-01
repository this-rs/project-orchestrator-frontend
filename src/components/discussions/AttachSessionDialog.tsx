import { useEffect, useId, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { focusRing } from '@/components/ui/classes'
import { chatApi } from '@/services/chat'
import { plansApi } from '@/services/plans'
import { tasksApi } from '@/services/tasks'
import { projectsApi } from '@/services/projects'
import { workspacesApi } from '@/services/workspaces'

/**
 * "Rattacher à…": link a session to a plan or a task OF THE SAME PROJECT
 * (`POST /api/chat/sessions/{id}/associate`, source `manual`).
 *
 * What the server allows is said in the dialog, not hidden:
 * - only a Plan or a Task can be targeted (a run is reached through its plan);
 * - there is no detach route: an attachment made here cannot be undone from the app.
 */

export const ATTACH_TEXT = {
  title: 'Rattacher à…',
  limits:
    "Le serveur rattache une session à un plan ou à une tâche, pas à un run : un run se retrouve par son plan.",
  noDetach:
    "Il n'existe pas de détachement côté serveur : un rattachement fait ici ne peut pas être annulé depuis l'application.",
  unknownProject: 'Le projet de cette session est inconnu : impossible de proposer des plans ou des tâches du même projet.',
  loadFailed: 'Impossible de charger les plans et les tâches du projet.',
  attachFailed: 'Le rattachement a échoué.',
  nothing: 'Ce projet ne contient aucun plan ni aucune tâche.',
}

export interface AttachSessionDialogProps {
  open: boolean
  onClose: () => void
  sessionId: string
  /** Project of the session (preferred) ... */
  projectId?: string | null
  /** ... or its slug, resolved through the project list. */
  projectSlug?: string | null
  /**
   * ... or, when the project is unknown (a session without a thread, a plan reference that
   * carries no project), the workspace: the plans and tasks of ALL its projects are offered.
   */
  workspaceSlug?: string | null
  /** Called once the link exists: the caller refreshes its tree and the attention count. */
  onAttached: () => void
}

interface Choice {
  id: string
  label: string
}

export function AttachSessionDialog({ open, onClose, sessionId, projectId, projectSlug, workspaceSlug, onAttached }: AttachSessionDialogProps) {
  const [kind, setKind] = useState<'Plan' | 'Task'>('Plan')
  const [plans, setPlans] = useState<Choice[]>([])
  const [tasks, setTasks] = useState<Choice[]>([])
  const [loading, setLoading] = useState(false)
  const [unknownProject, setUnknownProject] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [targetId, setTargetId] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const kindName = useId()
  const selectId = useId()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setUnknownProject(false)
    setLoadError(false)
    setError(null)
    setTargetId('')
    setKind('Plan')
    ;(async () => {
      let pids: string[] = projectId ? [projectId] : []
      if (pids.length === 0 && projectSlug) {
        const found = ((await projectsApi.list()).items || []).find((p) => p.slug === projectSlug)?.id
        if (found) pids = [found]
      }
      if (pids.length === 0 && workspaceSlug) {
        pids = ((await workspacesApi.listProjects(workspaceSlug)) || []).map((p) => p.id)
      }
      if (pids.length === 0) {
        if (!cancelled) setUnknownProject(true)
        return
      }
      const perProject = await Promise.all(
        pids.map((pid) =>
          Promise.all([plansApi.list({ project_id: pid, limit: 100 }), tasksApi.list({ project_id: pid, limit: 100 })]),
        ),
      )
      const p = { items: perProject.flatMap(([pl]) => pl.items || []) }
      const t = { items: perProject.flatMap(([, tk]) => tk.items || []) }
      if (cancelled) return
      setPlans((p.items || []).map((x) => ({ id: x.id, label: x.title })))
      setTasks((t.items || []).map((x) => ({ id: x.id, label: `${x.title || x.id.slice(0, 8)} — ${x.plan_title}` })))
    })()
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, projectId, projectSlug, workspaceSlug])

  const choices = kind === 'Plan' ? plans : tasks

  const submit = async () => {
    if (!targetId || sending) return
    setSending(true)
    setError(null)
    try {
      await chatApi.associateSession(sessionId, kind, targetId, 'manual')
      onAttached()
      onClose()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : ATTACH_TEXT.attachFailed)
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={ATTACH_TEXT.title} size="sm">
      <div className="space-y-3" data-testid="attach-dialog">
        <p className="text-xs text-gray-400">{ATTACH_TEXT.limits}</p>
        <p className="text-xs text-gray-400" data-testid="attach-no-detach">
          {ATTACH_TEXT.noDetach}
        </p>

        {loading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Chargement…
          </div>
        ) : unknownProject ? (
          <p role="alert" className="text-sm text-amber-400">
            {ATTACH_TEXT.unknownProject}
          </p>
        ) : loadError ? (
          <p role="alert" className="text-sm text-red-400">
            {ATTACH_TEXT.loadFailed}
          </p>
        ) : (
          <>
            <fieldset className="flex gap-4">
              <legend className="sr-only">Rattacher à</legend>
              {(['Plan', 'Task'] as const).map((k) => (
                <label key={k} className="inline-flex min-h-9 items-center gap-2 text-sm text-gray-200">
                  <input
                    type="radio"
                    name={kindName}
                    checked={kind === k}
                    onChange={() => {
                      setKind(k)
                      setTargetId('')
                    }}
                  />
                  {k === 'Plan' ? 'Un plan' : 'Une tâche'}
                </label>
              ))}
            </fieldset>
            {plans.length === 0 && tasks.length === 0 ? (
              <p className="text-sm text-gray-400">{ATTACH_TEXT.nothing}</p>
            ) : (
              <div>
                <label htmlFor={selectId} className="mb-1 block text-xs text-gray-400">
                  {kind === 'Plan' ? 'Plan' : 'Tâche'} {projectId || projectSlug ? 'du même projet' : 'du même espace de travail'}
                </label>
                <select
                  id={selectId}
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className={`min-h-10 w-full rounded-lg border border-white/[0.1] bg-surface-base px-3 text-base text-gray-100 md:text-sm ${focusRing}`}
                >
                  <option value="">Choisir…</option>
                  {choices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`min-h-9 rounded-lg px-3 text-sm text-gray-300 hover:bg-white/[0.06] ${focusRing}`}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!targetId || sending}
            className={`inline-flex min-h-9 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
          >
            {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Rattacher
          </button>
        </div>
      </div>
    </Dialog>
  )
}
