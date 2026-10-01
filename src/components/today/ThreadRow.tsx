import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { StatusDot, StatusIcon } from '@/components/ui/Status'
import { RelativeTime } from '@/components/ui/MetaLine'
import { focusRing, inlineLink, metaText, provenanceText } from '@/components/ui/classes'
import { formatCost, formatDurationMs } from '@/components/ui/format'
import { workspacePath } from '@/utils/paths'
import type {
  AttentionThread,
  OrphanRequest,
  ResumePreview,
  RunnerState,
  SessionLink,
  StuckReason,
  UnattachedSession,
  WaitingRequest,
} from '@/types/attention'
import { MiniThreadGraph } from './MiniThreadGraph'
import { ContinueSheet } from './ContinueSheet'

/**
 * One row per thread of work (bands 2 and 3 of Today). Rows, not cards: they
 * sit in a `ThreadRowList` (`divide-y`), no surface, no border, no shadow —
 * elevation carries no hierarchy here (today-ux). The body is the thread's
 * `MiniThreadGraph`.
 *
 * Variants:
 * - `running`  : title, lane, duration, cost (updated IN PLACE, never tweened),
 *                a status dot that pulses only while the run is running; the
 *                title and the graph open the full plan graph.
 * - `stuck`    : the cause in clear, the resume preview EXACTLY as the backend
 *                sent it (`resume`, no computation here), the blocked tasks by
 *                name with a link to unblock them, and "Reprendre". When the
 *                runner is busy the button is DISABLED with the reason and a
 *                link — the constraint is said before the click, never by a 409.
 * - `orphan`   : what was asked, since when the CLI stopped, and "Reprendre la
 *                session" which opens a message field. NEVER an "Autoriser"
 *                button: the server cannot answer a dead CLI (spike 0.1), the
 *                only way back is a `user_message` (resume_session).
 * - `unattached`: a session with NO link, same row, labelled "sans fil", same
 *                reply actions (dead => Reprendre la session; live => Repondre).
 *
 * The component is presentational: `onResume` (POST /plans/{id}/run — the
 * server attaches the new sessions to the NEW run) and `onSendMessage`
 * (user_message) are injected by the page.
 */

// ---------------------------------------------------------------------------
// Wording (one place; the spike 0.1 texts are verbatim)
// ---------------------------------------------------------------------------

export const ROW_TEXT = {
  resume: 'Reprendre',
  resumeSession: 'Reprendre la session',
  reply: 'Répondre…',
  noThread: 'sans fil',
  runnerBusy: 'Runner occupé par le plan',
  noPlan: 'Aucun plan à reprendre.',
  noPreview: "L'aperçu de la reprise n'est pas disponible.",
  unblockFirst: 'Débloque-la avant de reprendre : le runner la saute.',
  resumeStarted: 'Reprise lancée.',
  resumeFailed: 'La reprise a échoué.',
  /** Help of an orphan PERMISSION (only valid for a request without decision). */
  helpPermission:
    "La session s'est interrompue avant ta réponse. Reprendre relance l'assistant, qui redemandera l'autorisation si besoin. Rien n'a été exécuté.",
  /** Help of an orphan QUESTION. */
  helpQuestion:
    "La session s'est interrompue avant ta réponse. Choisis une option : elle sera envoyée comme message à la reprise.",
  helpLive: 'La session attend ta réponse : elle sera envoyée comme message.',
  livePermissionElsewhere: 'Cette autorisation se donne dans « T’attend ».',
  /** What the sheet opens with when no option was chosen. */
  defaultMessage: 'Continue.',
} as const

const STUCK_LABEL: Record<StuckReason, string> = {
  failed: 'Run échoué',
  budget_exceeded: 'Budget dépassé',
  task_blocked: 'Tâche bloquée',
  session_error: 'Erreur de session',
  orphan_request: 'Demande restée sans réponse',
}

/** Message sent on resume once the user picked an option of an orphan question (spike 0.1). */
export function questionAnswerMessage(question: string, option: string): string {
  return `Ma réponse à ta question précédente (« ${question} ») : ${option}. Ne la repose pas, continue.`
}

/**
 * The resume preview, worded from the backend's three fields as they are —
 * "4 faites et 1 bloquée seront sautées, 2 relancées". Counts are shown, not
 * recomputed; the only count taken is the length of the named blocked list.
 */
export function resumePreviewText(p: ResumePreview): string {
  const blocked = p.skipped_blocked.length
  const done = p.done_count
  const doneWord = `${done} ${done === 1 ? 'faite' : 'faites'}`
  const blockedWord = `${blocked} ${blocked === 1 ? 'bloquée' : 'bloquées'}`
  let skipped = ''
  if (blocked > 0 && done > 0) skipped = `${doneWord} et ${blockedWord} seront sautées`
  else if (blocked > 0) skipped = `${blockedWord} ${blocked === 1 ? 'sera sautée' : 'seront sautées'}`
  else if (done > 0) skipped = `${doneWord} ${done === 1 ? 'sera sautée' : 'seront sautées'}`
  const rerun = p.rerun_count > 0 ? `${p.rerun_count} ${p.rerun_count === 1 ? 'relancée' : 'relancées'}` : 'aucune relancée'
  return skipped ? `${skipped}, ${rerun}` : rerun
}

/** Where a session is attached, in words (provenance of each link; never computed membership). */
export function linkProvenance(link: SessionLink, thread?: AttentionThread): string {
  switch (link.via) {
    case 'runner_run':
    case 'spawned_by_json': {
      // Neutral: the contract gives `via` + ids only. Whether a run is the current
      // one is the backend's to say, never inferred here (requirement 07909b4a).
      const who = link.via === 'runner_run' ? 'rattachée au run' : 'créée par le run'
      return link.run_id ? `${who} ${shortId(link.run_id)}` : who
    }
    case 'task_association':
      return link.task_id ? `rattachée à la tâche ${shortId(link.task_id)}` : 'rattachée à une tâche'
    case 'plan_association':
      return thread?.plan ? `rattachée au plan ${thread.plan.title}` : 'rattachée à un plan'
  }
}

const shortId = (id: string) => id.slice(0, 8)

/**
 * Buttons of the rows (bands 2 and 3). The ONE primary of the page is the answer to a
 * live agent (band 1): eight stuck threads must not stack eight identical primaries.
 */
const BTN = 'inline-flex min-h-9 items-center justify-center rounded-lg px-4 text-sm font-medium'
const secondaryBtn = `${BTN} border border-white/[0.12] bg-white/[0.06] text-gray-100 hover:bg-white/[0.1]`
const primaryBtn = `${BTN} bg-indigo-600 text-white hover:bg-indigo-500`

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

export function ThreadRowList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-white/[0.06]">
      {children}
    </ul>
  )
}

interface CommonProps {
  /** Display name of the thread's lane; falls back to its slug. */
  laneName?: string
  className?: string
}

function Title({ thread }: { thread: AttentionThread }) {
  const text = <span className="min-w-0 break-words text-sm text-gray-200">{thread.title}</span>
  if (thread.plan) {
    return (
      <Link
        to={`${workspacePath(thread.workspace, `/plans/${thread.plan.id}`)}#graph`}
        className={`inline-flex min-h-9 min-w-0 items-center rounded ${focusRing} hover:text-gray-100`}
      >
        {text}
      </Link>
    )
  }
  return <span className="inline-flex min-h-9 min-w-0 items-center">{text}</span>
}

function Frame({
  thread,
  variant,
  lead,
  meta,
  children,
  className = '',
}: {
  thread: AttentionThread
  variant: string
  lead: ReactNode
  meta?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <li data-variant={variant} data-thread={thread.id} className={`flex min-w-0 flex-col gap-1 py-3 ${className}`}>
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-[15px] flex w-4 shrink-0 items-center justify-center">{lead}</span>
        <div className="flex min-w-0 flex-1 flex-col">
          <Title thread={thread} />
          {meta && <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${metaText}`}>{meta}</div>}
        </div>
      </div>
      <div className="min-w-0 pl-6">
        <MiniThreadGraph waves={thread.waves} planId={thread.plan?.id} workspace={thread.workspace} />
        {children}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Running (band 2)
// ---------------------------------------------------------------------------

export function RunningThreadRow({ thread, laneName, className }: { thread: AttentionThread } & CommonProps) {
  const run = thread.run
  const running = run?.status === 'running'
  return (
    <Frame
      thread={thread}
      variant="running"
      className={className}
      lead={<StatusDot tone="progress" pulse={running} size="md" label={running ? 'En cours' : 'Arrêté'} />}
      meta={
        <>
          <span>{laneName ?? thread.workspace}</span>
          {run && (
            // Updated in place: plain text nodes, no key, no tween, no transition.
            <>
              <span data-testid="run-duration" className="tabular-nums">
                {formatDurationMs(run.duration_secs * 1000)}
              </span>
              <span data-testid="run-cost" className="tabular-nums">
                {formatCost(run.cost_usd) ?? '$0.00'}
              </span>
            </>
          )}
        </>
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Stuck (band 3)
// ---------------------------------------------------------------------------

export interface StuckThreadRowProps extends CommonProps {
  thread: AttentionThread
  runner: RunnerState
  /** POST /plans/{id}/run for the thread's plan. The server rattaches the new sessions to the NEW run. */
  onResume: (thread: AttentionThread) => Promise<void>
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

export function StuckThreadRow({ thread, runner, onResume, laneName, className }: StuckThreadRowProps) {
  const [pending, setPending] = useState(false)
  const [started, setStarted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const noteId = useId()

  const busy = runner.status === 'busy' ? runner.busy_with : null
  // Most complete list the contract gives, taken as-is: the thread's own blocked tasks,
  // else the resume preview's (no front-side computation; works when `resume` is absent).
  const blocked = thread.blocked_tasks.length > 0 ? thread.blocked_tasks : (thread.resume?.skipped_blocked ?? [])
  const reason = thread.stuck_reason
  const cause = reason ? STUCK_LABEL[reason] : 'Coincé'

  // Why the button cannot be used — said before the click.
  let disabledReason: ReactNode = null
  if (busy) {
    disabledReason = (
      <>
        {ROW_TEXT.runnerBusy}{' '}
        <Link
          to={workspacePath(busy.workspace, `/plans/${busy.plan_id}`)}
          className={`inline-flex min-h-9 items-center ${inlineLink}`}
        >
          {busy.plan_title}
        </Link>
      </>
    )
  } else if (!thread.plan) disabledReason = ROW_TEXT.noPlan
  else if (!thread.resume) disabledReason = ROW_TEXT.noPreview
  const disabled = disabledReason !== null || pending || started

  const click = async () => {
    setPending(true)
    setError(null)
    try {
      await onResume(thread)
      setStarted(true)
    } catch (e) {
      setError(errorMessage(e, ROW_TEXT.resumeFailed))
    } finally {
      setPending(false)
    }
  }

  return (
    <Frame
      thread={thread}
      variant="stuck"
      className={className}
      lead={<StatusIcon tone={reason === 'task_blocked' ? 'warning' : 'danger'} className="h-4 w-4" />}
      meta={
        <>
          <span className="text-gray-300">{cause}</span>
          <span>{laneName ?? thread.workspace}</span>
          {thread.run && (
            <span data-testid="run-cost" className="tabular-nums">
              {formatCost(thread.run.cost_usd) ?? '$0.00'}
            </span>
          )}
        </>
      }
    >
      {blocked.length > 0 && (
        <div data-testid="blocked-tasks" className="mt-2 text-xs text-amber-400">
          <p>
            {blocked.length === 1 ? 'Tâche bloquée' : 'Tâches bloquées'} :{' '}
            {blocked.map((t, i) => (
              <span key={t.id}>
                {i > 0 && ', '}
                <Link
                  to={workspacePath(thread.workspace, `/tasks/${t.id}`)}
                  className={`inline-flex min-h-9 items-center underline underline-offset-2 ${focusRing}`}
                >
                  {t.title}
                </Link>
              </span>
            ))}
          </p>
          <p className="text-gray-400">{ROW_TEXT.unblockFirst}</p>
        </div>
      )}
      {thread.resume && (
        <p id={noteId} data-testid="resume-preview" className="mt-2 text-xs text-gray-300">
          {resumePreviewText(thread.resume)}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={click}
          disabled={disabled}
          aria-describedby={noteId}
          className={`${secondaryBtn} disabled:cursor-not-allowed disabled:border-dashed disabled:border-white/[0.12] disabled:bg-transparent disabled:text-gray-500 ${focusRing}`}
        >
          {pending ? 'Reprise…' : ROW_TEXT.resume}
        </button>
        {disabledReason && (
          <p data-testid="resume-disabled-reason" className="text-xs text-amber-400">
            {disabledReason}
          </p>
        )}
      </div>
      {started && (
        <p role="status" className="mt-1 text-xs text-emerald-400">
          {ROW_TEXT.resumeStarted}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-400">
          {error}
        </p>
      )}
    </Frame>
  )
}

// ---------------------------------------------------------------------------
// Orphan (band 3) and unattached
// ---------------------------------------------------------------------------

/** The request itself, read in full (monospace, wrapping). */
function RequestText({ req }: { req: WaitingRequest }) {
  return (
    <div className="mt-2 min-w-0">
      <p className="text-[11px] leading-4 text-gray-500">
        {req.kind === 'permission' ? `Permission demandée${req.tool_name ? ` (${req.tool_name})` : ''}` : 'Question posée'}
      </p>
      <pre
        data-testid="request-text"
        className="mt-1 max-w-full whitespace-pre-wrap break-words font-mono text-xs text-gray-200"
      >
        {req.text}
      </pre>
    </div>
  )
}

/** Options of a QUESTION: choosing one pre-fills the message; a permission has none. */
function OptionPicker({
  options,
  selected,
  onSelect,
}: {
  options: WaitingRequest['options']
  selected: string | null
  onSelect: (label: string | null) => void
}) {
  if (options.length === 0) return null
  return (
    <div role="group" aria-label="Options de la question" className="mt-2 flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.label === selected
        return (
          <button
            key={o.label}
            type="button"
            aria-pressed={on}
            title={o.description ?? undefined}
            onClick={() => onSelect(on ? null : o.label)}
            className={`min-h-9 rounded-lg border px-3 text-left text-xs ${focusRing} ${
              on ? 'border-indigo-400/60 bg-indigo-500/15 text-gray-100' : 'border-white/[0.1] text-gray-300 hover:bg-white/[0.06]'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function ReplyAction({
  req,
  sessionId,
  dead,
  onSendMessage,
  emphasis = 'secondary',
}: {
  req: WaitingRequest
  sessionId: string
  dead: boolean
  onSendMessage: (sessionId: string, text: string) => Promise<void>
  /** `primary` only where this is THE action of the card (a dead session inside a band-1 card). */
  emphasis?: 'primary' | 'secondary'
}) {
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<string | null>(null)
  const isQuestion = req.kind === 'question'
  // Pre-fill ONLY for a question whose option was chosen. A permission gets the plain
  // short message: the new card asks again.
  const initialText =
    isQuestion && choice
      ? dead
        ? questionAnswerMessage(req.text, choice)
        : choice
      : dead
        ? ROW_TEXT.defaultMessage
        : ''
  const help = dead ? (isQuestion ? ROW_TEXT.helpQuestion : ROW_TEXT.helpPermission) : ROW_TEXT.helpLive
  // A live permission is answered from band 1 (Autoriser/Refuser live there), not here.
  const livePermission = !dead && !isQuestion

  return (
    <div className="min-w-0">
      {isQuestion && <OptionPicker options={req.options} selected={choice} onSelect={setChoice} />}
      {livePermission ? (
        <p className="mt-2 text-xs text-gray-400">{ROW_TEXT.livePermissionElsewhere}</p>
      ) : (
        <>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={`${emphasis === 'primary' ? primaryBtn : secondaryBtn} ${focusRing}`}
            >
              {dead ? ROW_TEXT.resumeSession : ROW_TEXT.reply}
            </button>
          </div>
          {dead && <p className="mt-1 text-xs text-gray-400">{help}</p>}
        </>
      )}
      <ContinueSheet
        open={open}
        onClose={() => setOpen(false)}
        title={dead ? ROW_TEXT.resumeSession : 'Répondre'}
        help={help}
        initialText={initialText}
        submitLabel={dead ? ROW_TEXT.resumeSession : 'Envoyer'}
        fieldLabel={dead ? 'Message de reprise' : 'Réponse'}
        onSend={(text) => onSendMessage(sessionId, text)}
      />
    </div>
  )
}

export interface OrphanThreadRowProps extends CommonProps {
  thread: AttentionThread
  orphan: OrphanRequest
  /** A `user_message` to the dead session (=> resume_session). NEVER permission_response / input_response. */
  onSendMessage: (sessionId: string, text: string) => Promise<void>
}

export function OrphanThreadRow({ thread, orphan, onSendMessage, laneName, className }: OrphanThreadRowProps) {
  const session = thread.sessions.find((s) => s.id === orphan.session_id)
  return (
    <Frame
      thread={thread}
      variant="orphan"
      className={className}
      lead={<StatusIcon tone="warning" className="h-4 w-4" />}
      meta={
        <>
          <span className="text-gray-300">Demande sans réponse</span>
          <span>{laneName ?? thread.workspace}</span>
          {orphan.cli_stopped_at ? (
            <RelativeTime date={orphan.cli_stopped_at} prefix="CLI arrêté depuis " />
          ) : (
            <span>CLI arrêté (date inconnue)</span>
          )}
        </>
      }
    >
      <RequestText req={orphan} />
      <p data-testid="provenance" className={`mt-2 ${provenanceText}`}>
        {session && session.links.length > 0
          ? session.links.map((l) => linkProvenance(l, thread)).join(' · ')
          : ROW_TEXT.noThread}
      </p>
      <ReplyAction req={orphan} sessionId={orphan.session_id} dead onSendMessage={onSendMessage} />
    </Frame>
  )
}

export interface UnattachedThreadRowProps extends CommonProps {
  session: UnattachedSession
  onSendMessage: (sessionId: string, text: string) => Promise<void>
}

/** A session with no link: same row shape, labelled "sans fil", same reply actions. */
export function UnattachedThreadRow({ session, onSendMessage, laneName, className = '' }: UnattachedThreadRowProps) {
  const dead = session.state === 'dead'
  return (
    <li
      data-variant="unattached"
      data-session={session.id}
      className={`flex min-w-0 flex-col gap-1 py-3 ${className}`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-[15px] flex w-4 shrink-0 items-center justify-center">
          <StatusIcon tone={dead ? 'warning' : 'info'} className="h-4 w-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="inline-flex min-h-9 min-w-0 items-center break-words text-sm text-gray-200">{session.title}</span>
          <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${metaText}`}>
            <span data-testid="no-thread-label" className="text-gray-300">
              {ROW_TEXT.noThread}
            </span>
            <span>{laneName ?? session.workspace_slug}</span>
            <span>{dead ? 'session arrêtée' : 'session vivante'}</span>
            <span className="tabular-nums">depuis {formatDurationMs(session.age_secs * 1000)}</span>
          </div>
        </div>
      </div>
      <div className="min-w-0 pl-6">
        {session.pending.map((req) => (
          <div key={req.request_id} data-request={req.request_id}>
            <RequestText req={req} />
            <ReplyAction req={req} sessionId={session.id} dead={dead} onSendMessage={onSendMessage} />
          </div>
        ))}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Single entry point
// ---------------------------------------------------------------------------

export type ThreadRowProps =
  | ({ variant: 'running'; thread: AttentionThread } & CommonProps)
  | ({ variant: 'stuck' } & StuckThreadRowProps)
  | ({ variant: 'orphan' } & OrphanThreadRowProps)
  | ({ variant: 'unattached' } & UnattachedThreadRowProps)

export function ThreadRow(props: ThreadRowProps) {
  switch (props.variant) {
    case 'running':
      return <RunningThreadRow {...props} />
    case 'stuck':
      return <StuckThreadRow {...props} />
    case 'orphan':
      return <OrphanThreadRow {...props} />
    case 'unattached':
      return <UnattachedThreadRow {...props} />
  }
}
