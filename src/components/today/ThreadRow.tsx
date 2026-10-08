import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ReferenceSource } from '@/refs/source'
import { Button } from '@/components/ui/Button'
import { StatusIcon } from '@/components/ui/Status'
import { RelativeTime } from '@/components/ui/MetaLine'
import { ChevronRight } from 'lucide-react'
import { focusRing, hitArea, inlineLink, metaTextReadable as metaText, segmentItem, segmented } from '@/components/ui/classes'
import { formatDurationMs } from '@/components/ui/format'
import { CostDisplay } from '@/components/ui/CostDisplay'
import { costReport, formatUsd2 } from '@/utils/cost'
import { workspacePath } from '@/utils/paths'
import type {
  AttentionThread,
  OrphanRequest,
  ResumePreview,
  RunnerState,
  SessionLink,
  UnattachedSession,
  WaitingRequest,
} from '@/types/attention'
import { PlanStateBar, countPlanStates, stateSegments } from './PlanStateBar'
import { Ring } from './charts'
import { ageText } from './startHere'
import { ContinueSheet } from './ContinueSheet'
import { STUCK_LABEL } from './bands'
import { TEXT } from './text'

/**
 * One row per thread to take back up (section "To resume" of Today). Rows, not cards: they
 * sit in a `ThreadRowList` (`divide-y`), no surface, no border, no shadow —
 * elevation carries no hierarchy here (today-ux). The body is the thread's
 * `MiniThreadGraph`.
 *
 * Variants:
 * - `stuck`    : the cause in clear, the resume preview EXACTLY as the backend
 *                sent it (`resume`, no computation here), the blocked tasks by
 *                name with a link to unblock them, and "Resume". When the
 *                runner is busy the button is DISABLED with the reason and a
 *                link — the constraint is said before the click, never by a 409.
 * - `orphan`   : what was asked, since when the CLI stopped, and "Resume the
 *                conversation" which opens a message field. NEVER an "Allow"
 *                button: the server cannot answer a dead CLI (spike 0.1), the
 *                only way back is a `user_message` (resume_session).
 * - `unattached`: a session with NO link, same row, labelled "free conversation", same
 *                reply actions (dead => Resume the conversation; live => Reply).
 *
 * The component is presentational: `onResume` (POST /plans/{id}/run — the
 * server attaches the new sessions to the NEW run) and `onSendMessage`
 * (user_message) are injected by the page.
 */

// ---------------------------------------------------------------------------
// Wording: a slice of the one registry (`./text`), kept under its historical name
// ---------------------------------------------------------------------------

export const ROW_TEXT = TEXT.row

/** Message sent on resume once the user picked an option of an orphan question (spike 0.1). */
export function questionAnswerMessage(question: string, option: string): string {
  return ROW_TEXT.questionAnswer(question, option)
}

/**
 * The resume preview, worded from the backend's fields as they are — "Resume reruns
 * 2 tasks; 4 already done". Counts are shown, not recomputed. The blocked tasks the resume
 * skips are named right under it (`blocked-tasks`), so they are not repeated here.
 */
export function resumePreviewText(p: ResumePreview): string {
  return `${ROW_TEXT.rerun(p.rerun_count)}${ROW_TEXT.kept(p.done_count)}`
}

/** Where a session is attached, in words (provenance of each link; never computed membership). */
export function linkProvenance(link: SessionLink, thread?: AttentionThread): string {
  switch (link.via) {
    case 'runner_run':
    case 'spawned_by_json': {
      // Neutral: the contract gives `via` + ids only. Whether a run is the current
      // one is the backend's to say, never inferred here (requirement 07909b4a).
      const id = link.run_id ? shortId(link.run_id) : null
      return link.via === 'runner_run' ? ROW_TEXT.attachedToExecution(id) : ROW_TEXT.createdByExecution(id)
    }
    case 'task_association':
      return ROW_TEXT.attachedToTask(link.task_id ? shortId(link.task_id) : null)
    case 'plan_association':
      return ROW_TEXT.attachedToPlan(thread?.plan ? thread.plan.title : null)
  }
}

const shortId = (id: string) => id.slice(0, 8)

/**
 * Buttons of the rows (bands 2 and 3) are quiet `<Button variant="secondary" flat>`: glass without
 * blur, because a button that repeats per row must not add a backdrop filter per row (DESIGN.md
 * § 9). The ONE filled button of the page is the answer to a live assistant (band 1): eight stuck
 * threads must not stack eight identical primaries.
 */

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

const titleClass = 'min-w-0 break-words text-sm font-medium leading-5 text-gray-100 line-clamp-2'

function Title({ thread }: { thread: AttentionThread }) {
  const text = <span className={titleClass}>{thread.title}</span>
  if (thread.plan) {
    return (
      <ReferenceSource entity={{ kind: 'plan', id: thread.plan.id, label: thread.title }} button className="flex min-w-0 flex-1 items-start gap-1">
      <Link
        to={`${workspacePath(thread.workspace, `/plans/${thread.plan.id}`)}#graph`}
        className={`min-w-0 flex-1 rounded ${hitArea} ${focusRing} hover:text-white`}
      >
        {text}
      </Link>
      </ReferenceSource>
    )
  }
  return <span className="min-w-0 flex-1">{text}</span>
}

/**
 * The row shape shared by every variant: a state mark, the title with THE action at its right
 * (under the text on a narrow column), one line of facts, then whatever the variant adds.
 */
function RowShell({
  attrs,
  lead,
  title,
  action,
  meta,
  children,
  className = '',
}: {
  attrs: Record<string, string>
  lead: ReactNode
  title: ReactNode
  action?: ReactNode
  meta?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <li {...attrs} className={`flex min-w-0 items-start gap-2.5 py-3 ${className}`}>
      <span className="flex min-h-5 min-w-4 shrink-0 items-center justify-center">{lead}</span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2">
          <div className="min-w-[12rem] flex-1">
            <div className="flex min-w-0">{title}</div>
            {meta && <div className={`mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 ${metaText}`}>{meta}</div>}
          </div>
          {action && <div className="-my-1 shrink-0">{action}</div>}
        </div>
        {children}
      </div>
    </li>
  )
}

/** A fold for what explains a row without being needed to act on it. */
function Fold({ summary, children, testId }: { summary: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <details data-testid={testId} className="group/fold mt-1 min-w-0">
      <summary
        className={`-ml-1 inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded px-1 text-xs text-gray-400 hover:text-gray-200 [&::-webkit-details-marker]:hidden ${focusRing}`}
      >
        <ChevronRight className="h-3.5 w-3.5 shrink-0 group-open/fold:rotate-90" aria-hidden="true" />
        {summary}
      </summary>
      <div className="min-w-0 pb-1 pl-4">{children}</div>
    </details>
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
  const cause = reason ? STUCK_LABEL[reason] : TEXT.bands.stuck.title
  const states = countPlanStates(thread.waves)

  // Why the button cannot be used — said before the click.
  let disabledReason: ReactNode = null
  if (busy) {
    disabledReason = (
      <>
        {ROW_TEXT.unavailableBusy}{' '}
        <Link
          to={workspacePath(busy.workspace, `/plans/${busy.plan_id}`)}
          className={`${inlineLink} underline`}
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
    <RowShell
      attrs={{ 'data-variant': 'stuck', 'data-thread': thread.id }}
      className={className}
      lead={
        states.total > 0 ? (
          <Ring size={40} stroke={4} total={states.total} segments={stateSegments(states)} className="mt-0.5">
            <StatusIcon tone={reason === 'task_blocked' ? 'warning' : 'danger'} className="h-4 w-4" />
          </Ring>
        ) : (
          <StatusIcon tone={reason === 'task_blocked' ? 'warning' : 'danger'} className="h-4 w-4" />
        )
      }
      title={<Title thread={thread} />}
      action={
        <Button
          variant="secondary"
          size="sm"
          flat
          onClick={click}
          disabled={disabled}
          aria-describedby={noteId}
          // Not a dimmed button: a visibly unavailable one (dashed, grey), at full opacity so its reason stays readable.
          // The glass draws its hairline in `::after`; the dashed border needs a real 1px border.
          className="disabled:border disabled:border-dashed disabled:border-white/[0.12]! disabled:bg-transparent! disabled:bg-none! disabled:shadow-none! disabled:text-gray-400! disabled:opacity-100!"
        >
          {pending ? ROW_TEXT.resuming : ROW_TEXT.resume}
        </Button>
      }
      meta={
        <>
          <span className={reason === 'task_blocked' ? 'text-amber-300' : 'text-red-300'}>{cause}</span>
          <span>{laneName ?? thread.workspace}</span>
          <span>{ROW_TEXT.since(ageText(thread.age_secs))}</span>
          {thread.run && (
            <span data-testid="run-cost" className="tabular-nums">
              {/* The basis comes with the figure; without one (an older backend) it is a reported cost, zero included. */}
              <CostDisplay cost={costReport(thread.run.cost_usd, thread.run.cost_basis)} format={formatUsd2} />
            </span>
          )}
        </>
      }
    >
      <PlanStateBar waves={thread.waves} planId={thread.plan?.id} workspace={thread.workspace} className="mt-1" />
      {disabledReason && (
        <p data-testid="resume-disabled-reason" className="text-xs text-amber-300">
          {disabledReason}
        </p>
      )}
      {thread.resume && (
        <p id={noteId} data-testid="resume-preview" className="text-xs text-gray-400">
          {resumePreviewText(thread.resume)}
        </p>
      )}
      {blocked.length > 0 && (
        <Fold testId="blocked-tasks" summary={<span className="text-amber-300">{ROW_TEXT.blockedToggle(blocked.length)}</span>}>
          <ul className="text-xs text-gray-300">
            {blocked.map((t) => (
              <ReferenceSource as="li" key={t.id} entity={{ kind: 'task', id: t.id, label: t.title }} button className="flex items-center gap-1">
                <Link
                  to={workspacePath(thread.workspace, `/tasks/${t.id}`)}
                  className={`inline-flex min-h-9 items-center underline underline-offset-2 ${focusRing}`}
                >
                  {t.title}
                </Link>
              </ReferenceSource>
            ))}
          </ul>
          <p className="text-xs text-gray-400">{ROW_TEXT.unblockFirst}</p>
        </Fold>
      )}
      {started && (
        <p role="status" className="mt-1 text-xs text-emerald-300">
          {ROW_TEXT.resumeStarted}
          {thread.plan && (
            <>
              {' '}
              <Link
                to={`${workspacePath(thread.workspace, `/plans/${thread.plan.id}`)}#runner`}
                className={`inline-flex min-h-9 items-center underline underline-offset-2 ${focusRing}`}
              >
                {ROW_TEXT.followRun}
              </Link>
            </>
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-300">
          {error}
        </p>
      )}
    </RowShell>
  )
}

// ---------------------------------------------------------------------------
// Orphan (band 3) and unattached
// ---------------------------------------------------------------------------

/** The request itself, whole (monospace, wrapping), behind a fold: the row says what happened, the fold what was asked. */
function RequestText({ req }: { req: WaitingRequest }) {
  return (
    <Fold
      summary={
        <span>
          {ROW_TEXT.showRequest}
          {ROW_TEXT.requestKind(req.kind, req.tool_name)}
        </span>
      }
    >
      <pre data-testid="request-text" className="max-w-full whitespace-pre-wrap break-words rounded-lg bg-black/30 px-3 py-2 font-mono text-xs text-gray-200">
        {req.text}
      </pre>
    </Fold>
  )
}

/**
 * Options of a QUESTION: choosing one pre-fills the message; a permission has none. They are the
 * segmented control of the contract (`seg` / `seg-item`): the chosen option is the tinted glass of
 * `aria-pressed="true"`, the strip wraps on a narrow column.
 */
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
    <div role="group" aria-label={ROW_TEXT.optionsLabel} className={`${segmented} mt-2 max-w-full flex-wrap`}>
      {options.map((o) => {
        const on = o.label === selected
        return (
          <button
            key={o.label}
            type="button"
            aria-pressed={on}
            aria-label={o.label}
            onClick={() => onSelect(on ? null : o.label)}
            className={`${segmentItem} min-h-9 flex-col items-start! px-3 py-1.5 text-left text-xs`}
          >
            <span className="block">{o.label}</span>
            {o.description && <span className="block font-normal text-gray-400">{o.description}</span>}
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
        <p className="mt-1 text-xs text-gray-400">{ROW_TEXT.livePermissionElsewhere}</p>
      ) : (
        <div className={isQuestion && req.options.length > 0 ? 'mt-2' : ''}>
          <Button variant={emphasis === 'primary' ? 'primary' : 'secondary'} size="sm" flat onClick={() => setOpen(true)}>
            {dead ? ROW_TEXT.resumeSession : ROW_TEXT.reply}
          </Button>
        </div>
      )}
      <ContinueSheet
        open={open}
        onClose={() => setOpen(false)}
        title={dead ? ROW_TEXT.resumeSession : ROW_TEXT.replyTitle}
        help={help}
        initialText={initialText}
        submitLabel={dead ? ROW_TEXT.resumeSession : ROW_TEXT.send}
        fieldLabel={dead ? ROW_TEXT.resumeField : ROW_TEXT.replyField}
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
  /** "Attach to…", shown only when the session has no link (a free conversation). */
  attachSlot?: ReactNode
}

export function OrphanThreadRow({ thread, orphan, onSendMessage, attachSlot, laneName, className }: OrphanThreadRowProps) {
  const session = thread.sessions.find((s) => s.id === orphan.session_id)
  const linked = Boolean(session && session.links.length > 0)
  return (
    <RowShell
      attrs={{ 'data-variant': 'orphan', 'data-thread': thread.id }}
      className={className}
      lead={<StatusIcon tone="warning" className="h-4 w-4" />}
      title={<Title thread={thread} />}
      action={orphan.kind === 'permission' || orphan.options.length === 0 ? <ReplyAction req={orphan} sessionId={orphan.session_id} dead onSendMessage={onSendMessage} /> : undefined}
      meta={
        <>
          <span className="text-amber-300">{STUCK_LABEL.orphan_request}</span>
          <span>{laneName ?? thread.workspace}</span>
          {orphan.cli_stopped_at ? (
            <RelativeTime date={orphan.cli_stopped_at} prefix={ROW_TEXT.conversationStoppedSince} />
          ) : (
            <span>{ROW_TEXT.conversationStopped}</span>
          )}
        </>
      }
    >
      <RequestText req={orphan} />
      {/* A question with options: the options ARE the action, they cannot sit at the right of the title. */}
      {orphan.kind === 'question' && orphan.options.length > 0 && (
        <ReplyAction req={orphan} sessionId={orphan.session_id} dead onSendMessage={onSendMessage} />
      )}
      <p data-testid="provenance" className="sr-only">
        {linked && session ? session.links.map((l) => linkProvenance(l, thread)).join(' · ') : ROW_TEXT.noThread}
      </p>
      {attachSlot && !linked && <div className="mt-1">{attachSlot}</div>}
    </RowShell>
  )
}

export interface UnattachedThreadRowProps extends CommonProps {
  session: UnattachedSession
  onSendMessage: (sessionId: string, text: string) => Promise<void>
  /** "Attach to…": a session without a thread is exactly what it is for. */
  attachSlot?: ReactNode
}

/** A session with no link: same row shape, labelled "free conversation", same reply actions. */
export function UnattachedThreadRow({ session, onSendMessage, attachSlot, laneName, className = '' }: UnattachedThreadRowProps) {
  const dead = session.state === 'dead'
  return (
    <RowShell
      attrs={{ 'data-variant': 'unattached', 'data-session': session.id }}
      className={className}
      lead={<StatusIcon tone={dead ? 'warning' : 'info'} className="h-4 w-4" />}
      title={<span className={`flex-1 ${titleClass}`}>{session.title}</span>}
      action={attachSlot}
      meta={
        <>
          <span data-testid="no-thread-label" className="text-gray-300">
            {ROW_TEXT.noThread}
          </span>
          <span>{laneName ?? session.workspace_slug}</span>
          <span className="tabular-nums">{ROW_TEXT.sessionSince(dead, formatDurationMs(session.age_secs * 1000))}</span>
        </>
      }
    >
      {session.pending.map((req) => (
        <div key={req.request_id} data-request={req.request_id}>
          <RequestText req={req} />
          <ReplyAction req={req} sessionId={session.id} dead={dead} onSendMessage={onSendMessage} />
        </div>
      ))}
    </RowShell>
  )
}

// ---------------------------------------------------------------------------
// Single entry point
// ---------------------------------------------------------------------------

export type ThreadRowProps =
  | ({ variant: 'stuck' } & StuckThreadRowProps)
  | ({ variant: 'orphan' } & OrphanThreadRowProps)
  | ({ variant: 'unattached' } & UnattachedThreadRowProps)

export function ThreadRow(props: ThreadRowProps) {
  switch (props.variant) {
    case 'stuck':
      return <StuckThreadRow {...props} />
    case 'orphan':
      return <OrphanThreadRow {...props} />
    case 'unattached':
      return <UnattachedThreadRow {...props} />
  }
}
