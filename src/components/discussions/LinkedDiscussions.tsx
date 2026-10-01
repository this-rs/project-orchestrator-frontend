import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { focusRing, inlineLink } from '@/components/ui/classes'
import { ReplyAction } from '@/components/today/ThreadRow'
import { useAttentionDigest, useRequestAttentionRefresh } from '@/hooks/useAttentionCount'
import { useToast } from '@/hooks/useToast'
import { attentionApi } from '@/services/attention'
import { planRunTarget, runnerApi } from '@/services/runner'
import { workspacePath } from '@/utils/paths'
import type { DiscussionNode } from '@/services/discussions'
import { AttachSessionButton } from './AttachSessionButton'
import { DiscussionForestView } from './DiscussionTreeView'
import { countNodes } from './linkedForest'
import { computeOwners, resumeActionsFor, type BusyReason, type ResumeAction, type ResumeContext } from './resumeActions'
import { useLinkedForest, type LinkedEntity } from './useLinkedForest'

/**
 * The discussion tree of ONE entity (plan, task or run), whatever the page.
 *
 * - One forest: the sessions linked by the entity route, each with its subtree; a
 *   session attached by hand whose parent is elsewhere is a root. None is lost.
 * - Per node: "Rattacher à…" and, ONLY when the state justifies it, "Reprendre la
 *   session" / "Reprendre le run" / "Relancer la tâche" (see `resumeActions`).
 * - Limits of the server are written in the footer, not hidden.
 */

export const LINKED_TEXT = {
  empty: 'Aucune discussion liée à ce plan, cette tâche ou ce run.',
  emptyHelp:
    "Les discussions se lient seules quand le runner exécute une tâche, ou à la main depuis une conversation (« Rattacher à… »).",
  limits:
    "Rattacher : un plan ou une tâche du même projet seulement ; un run se retrouve par son plan. Détacher : le serveur n'a pas de route de détachement, un rattachement ne peut donc pas être annulé depuis l'application.",
  treeErrors: (n: number) =>
    `${n} arbre${n > 1 ? 's' : ''} de sous-discussions n'${n > 1 ? 'ont' : 'a'} pas pu être lu${n > 1 ? 's' : ''} : ${n > 1 ? 'ces sessions sont' : 'cette session est'} affichée${n > 1 ? 's' : ''} sans ${n > 1 ? 'leurs' : 'sa'} descendance.`,
  resumeStarted: 'Reprise lancée.',
  retryStarted: 'Tâche relancée.',
  actionFailed: "L'action a échoué.",
}

export interface LinkedDiscussionsProps {
  entity: LinkedEntity
  /** Project of the entity: the "Rattacher à…" picker offers plans and tasks of THIS project. */
  projectId?: string | null
  projectSlug?: string | null
  /** Used by the picker when the project is unknown (plans of every project of the workspace). */
  workspaceSlug?: string | null
  /** What the resume buttons need (plan, folder, run state, task states). */
  resume?: ResumeContext
  /** Number of nodes, whenever it changes (tab counts). */
  onCountChange?: (count: number) => void
  /** Called after something changed (attach, resume): the host may refresh its own data. */
  onChanged?: () => void
}

function BusyNote({ reason }: { reason: BusyReason }) {
  return (
    <span data-testid="busy-reason" className="text-xs text-gray-400">
      {reason.text}{' '}
      <Link
        to={workspacePath(reason.link.workspace, `/plans/${reason.link.planId}`)}
        className={`inline-flex min-h-9 items-center ${inlineLink}`}
      >
        {reason.link.label}
      </Link>
    </span>
  )
}

const BTN =
  'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 text-xs font-medium text-gray-100 hover:bg-white/[0.1]'

function ActionButton({
  action,
  onDone,
  resume,
}: {
  action: Extract<ResumeAction, { kind: 'run' | 'task' }>
  onDone: () => void
  resume?: ResumeContext
}) {
  const toast = useToast()
  const [pending, setPending] = useState(false)
  const disabled = action.disabled !== null || pending

  const click = async () => {
    setPending(true)
    try {
      if (action.kind === 'run') {
        if (resume?.project) {
          const { cwd, projectSlug } = planRunTarget(resume.project)
          await runnerApi.startRun(action.planId, cwd, projectSlug)
        } else {
          await attentionApi.resumeRun(action.planId)
        }
        toast.success(LINKED_TEXT.resumeStarted)
      } else {
        await runnerApi.retryTask(action.planId, action.taskId)
        toast.success(LINKED_TEXT.retryStarted)
      }
      onDone()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : LINKED_TEXT.actionFailed)
    } finally {
      setPending(false)
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        data-action={action.kind}
        onClick={click}
        disabled={disabled}
        aria-describedby={undefined}
        className={`${BTN} disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-gray-500 ${focusRing}`}
      >
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
        {action.label}
      </button>
      {action.disabled && <BusyNote reason={action.disabled} />}
    </span>
  )
}

export function LinkedDiscussions({ entity, projectId, projectSlug, workspaceSlug, resume, onCountChange, onChanged }: LinkedDiscussionsProps) {
  const { forest, isLoading, error, treeErrors, refresh } = useLinkedForest(entity)
  const digest = useAttentionDigest()
  const requestAttentionRefresh = useRequestAttentionRefresh()
  const toast = useToast()

  const count = forest ? countNodes(forest.roots) : null
  useEffect(() => {
    if (count !== null) onCountChange?.(count)
  }, [count, onCountChange])

  const changed = useCallback(() => {
    refresh()
    requestAttentionRefresh()
    onChanged?.()
  }, [refresh, requestAttentionRefresh, onChanged])

  const facts = useMemo(() => ({ deadPending: digest.deadPending, runner: digest.runner }), [digest])
  const ctx = resume ?? {}
  const owners = useMemo(() => computeOwners(forest?.roots ?? []), [forest])

  const sendMessage = useCallback(
    async (sessionId: string, text: string) => {
      await attentionApi.sendMessage(sessionId, text)
      toast.success(LINKED_TEXT.resumeStarted)
      changed()
    },
    [changed, toast],
  )

  const renderActions = useCallback(
    (node: DiscussionNode) => {
      const actions = resumeActionsFor(node, ctx, facts, owners)
      return (
        <>
          {actions.map((a) =>
            a.kind === 'session' ? (
              // Dead session: a message is the only way back (never "Autoriser").
              <ReplyAction key="session" req={a.request} sessionId={node.session_id} dead onSendMessage={sendMessage} />
            ) : (
              <ActionButton key={a.kind} action={a} resume={ctx} onDone={changed} />
            ),
          )}
          <AttachSessionButton
            sessionId={node.session_id}
            projectId={projectId}
            projectSlug={projectSlug}
            workspaceSlug={workspaceSlug}
            onAttached={refresh}
          />
        </>
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx is rebuilt each render by pages; its fields are what matter
    [ctx.planId, ctx.project, ctx.run?.id, ctx.run?.status, ctx.taskStatuses, facts, owners, sendMessage, changed, projectId, projectSlug, workspaceSlug, refresh],
  )

  if (error && !forest) {
    return (
      <EmptyState
        title="Discussions indisponibles"
        description={error}
        action={
          <button type="button" onClick={refresh} className={`${BTN} ${focusRing}`}>
            Réessayer
          </button>
        }
      />
    )
  }
  if (isLoading && !forest) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-gray-500" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Chargement des discussions…
      </div>
    )
  }
  if (!forest) return null

  return (
    <div className="space-y-3" data-testid="linked-discussions" data-entity={entity.type}>
      {forest.roots.length === 0 ? (
        <div className="rounded-lg border border-white/[0.06] px-4 py-6 text-center">
          <p className="text-sm text-gray-300">{LINKED_TEXT.empty}</p>
          <p className="mt-1 text-xs text-gray-400">{LINKED_TEXT.emptyHelp}</p>
        </div>
      ) : (
        <DiscussionForestView
          roots={forest.roots}
          isLoading={isLoading}
          onRefresh={refresh}
          renderActions={renderActions}
          title="Discussions"
          headerExtra={<span className="text-xs text-gray-500">{count}</span>}
        />
      )}
      {treeErrors > 0 && (
        <p role="status" className="text-xs text-amber-400" data-testid="tree-errors">
          {LINKED_TEXT.treeErrors(treeErrors)}
        </p>
      )}
      <p className="text-xs text-gray-400" data-testid="linked-limits">
        {LINKED_TEXT.limits}
      </p>
    </div>
  )
}
