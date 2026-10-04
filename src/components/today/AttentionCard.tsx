import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/services/api'
import { ORPHAN_NOTICE } from '@/hooks/useAttention'
import { Button } from '@/components/ui/Button'
import { RelativeTime } from '@/components/ui/MetaLine'
import { StatusDot } from '@/components/ui/Status'
import { focusRing, inlineLink, provenanceText } from '@/components/ui/classes'
import type { SessionLink, SessionState, WaitingRequest } from '@/types/attention'
import { workspacePath } from '@/utils/paths'
import { ReplyAction } from './ThreadRow'

/**
 * Section "À traiter": a LIVE agent is stopped on the user.
 *
 * The one card of the page that is deliberately NOT a graph: to decide, the user
 * must READ what is asked.
 *
 * - The exact text is shown whole (monospace, wrapping) — never truncated, never
 *   clamped, never scrolled: the command on screen IS the confirmation, so there is
 *   NO confirmation dialog.
 * - One primary + one secondary at most (`Autoriser` / `Refuser`), plus a link.
 *   A question: one button per option, and a free answer.
 * - Every button is visible (nothing on hover), >= 36 px, with a visible focus ring.
 * - Double tap is impossible: the controls lock while a call is in flight and after
 *   it succeeded. A 409 means "already decided elsewhere": the card says so and stays
 *   locked, it is never an error. A 410 means the CLI died: the request becomes an
 *   orphan (never "Autoriser" again), with an explicit notice.
 * - Opaque surface, no card inside the card, no entrance/exit animation: the parent
 *   removes the item (optimistic) and a toast confirms.
 * - The provenance of the session's attachment is displayed as the backend gave it
 *   (`links`); the frontend never computes membership.
 *
 * The component is controlled: the handlers do the calls (see `useAttention`:
 * `answerPermission`, `sendReply`) and resolve with an `AnswerResult`. A rejected
 * `ApiError` 409 / 410 is understood too.
 */

/** What a handler tells the card. `void` / `true` = sent; `false` = failed (the caller already toasted). */
export type AnswerResult = boolean | 'already_decided' | 'orphaned' | void

/** Names the backend does not put on a link (only ids): looked up by the caller. Optional. */
export interface LinkNames {
  runs?: Record<string, string>
  tasks?: Record<string, string>
  plans?: Record<string, string>
}

export interface AttentionCardProps {
  request: WaitingRequest
  /** Display name of the lane (workspace). */
  lane: string
  /** Title of the thread the session belongs to; `null` for a session without a thread. */
  threadTitle: string | null
  /** The asking session; `null` when unknown. */
  session?: { title: string; state: SessionState } | null
  /** Links of the session AS PROVIDED by the backend; `null` or empty = "sans fil". */
  links?: SessionLink[] | null
  names?: LinkNames
  /** Set (by `useAttention.notices`) when a 410 revealed that the CLI is dead. */
  notice?: string
  onPermission: (req: WaitingRequest, allow: boolean) => Promise<AnswerResult>
  onReply: (req: WaitingRequest, content: string) => Promise<AnswerResult>
  /** Free answer draft, kept by the parent so a refetch cannot lose it. Falls back to local state. */
  draft?: string
  onDraftChange?: (text: string) => void
  /** "Rattacher à…" for a session with no link (shown only then). */
  attachSlot?: ReactNode
}

const shortId = (id: string) => id.slice(0, 8)

/** One link -> its provenance sentence, from the fields the backend sent. */
export function linkLabel(link: SessionLink, names: LinkNames = {}): string {
  const run = link.run_id ? (names.runs?.[link.run_id] ?? shortId(link.run_id)) : null
  const task = link.task_id ? (names.tasks?.[link.task_id] ?? shortId(link.task_id)) : null
  const plan = link.plan_id ? (names.plans?.[link.plan_id] ?? shortId(link.plan_id)) : null
  switch (link.via) {
    case 'runner_run':
      return run ? `rattaché à l’exécution ${run}` : 'rattaché à une exécution'
    case 'spawned_by_json':
      if (run) return `lancé par l’exécution ${run}`
      return plan ? `lancé par le plan ${plan}` : 'lancé par un plan'
    case 'task_association':
      return task ? `rattaché à la tâche ${task}` : 'rattaché à une tâche'
    case 'plan_association':
      return plan ? `rattaché au plan ${plan}` : 'rattaché à un plan'
  }
}

/** All links, one sentence each; none = "sans fil". */
export function provenanceLabels(links: SessionLink[] | null | undefined, names?: LinkNames): string[] {
  return links && links.length > 0 ? links.map((l) => linkLabel(l, names)) : ['Conversation libre : rattachée à aucun plan']
}

type Phase = 'idle' | 'sending' | 'sent' | 'decided' | 'orphaned'

const DECIDED_NOTICE = 'Déjà tranché : la demande a été traitée ailleurs.'
const ERROR_NOTICE = 'Réponse non envoyée. Tu peux réessayer.'

export function AttentionCard({
  request,
  lane,
  threadTitle,
  session = null,
  links = null,
  names,
  notice,
  onPermission,
  onReply,
  draft,
  onDraftChange,
  attachSlot,
}: AttentionCardProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [localDraft, setLocalDraft] = useState('')
  /** The free answer of a question WITH options is folded until asked for (or until a draft exists). */
  const [freeOpen, setFreeOpen] = useState(false)
  // A ref, not state: two taps in the same tick must not both pass.
  const inFlight = useRef(false)

  const isPermission = request.kind === 'permission'
  const sessionName = session?.title?.trim() || shortId(request.session_id)
  const regionLabel = isPermission
    ? `Autorisation demandée par ${sessionName}`
    : `Question posée par ${sessionName}`

  // A dead session can never be authorized, and neither can one whose state we do not know
  // (session === null): same as an orphan (resume the session instead).
  const dead = session?.state !== 'live'
  const orphaned = phase === 'orphaned' || Boolean(notice) || dead
  const locked = phase !== 'idle' || orphaned
  const text = draft ?? localDraft
  const setText = (t: string) => (onDraftChange ? onDraftChange(t) : setLocalDraft(t))

  async function send(call: () => Promise<AnswerResult>) {
    if (inFlight.current || locked) return
    inFlight.current = true
    setPhase('sending')
    setError(null)
    try {
      const res = await call()
      if (res === false) {
        setPhase('idle')
        setError(ERROR_NOTICE)
      } else if (res === 'already_decided') setPhase('decided')
      else if (res === 'orphaned') {
        // The orphan notice says it all: no extra error.
        setError(null)
        setPhase('orphaned')
      } else setPhase('sent')
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setPhase('decided')
      else if (err instanceof ApiError && err.status === 410) {
        setError(null)
        setPhase('orphaned')
      }
      else {
        setPhase('idle')
        setError(ERROR_NOTICE)
      }
    } finally {
      inFlight.current = false
    }
  }

  // Resuming a dead session = a plain user_message (the server resumes the CLI); never
  // permission_response / input_response, which a dead CLI cannot receive (spike 0.1).
  const resumeSession = async (_sessionId: string, content: string) => {
    const res = await onReply(request, content)
    if (res === false) throw new Error(ERROR_NOTICE)
  }
  const resumeAction = (
    <ReplyAction req={request} sessionId={request.session_id} dead emphasis="primary" onSendMessage={resumeSession} />
  )

  const allow = (v: boolean) => void send(() => onPermission(request, v))
  const reply = (content: string) => {
    const c = content.trim()
    if (c) void send(() => onReply(request, c))
  }

  const sending = phase === 'sending'
  const live = session?.state === 'live'
  const provenance = provenanceLabels(links, names)
  const btn = 'min-h-9'

  const hasOptions = request.options.length > 0
  const linked = Boolean(links && links.length > 0)

  return (
    <section
      aria-label={regionLabel}
      data-testid="attention-card"
      className="@container/card min-w-0 space-y-2.5 rounded-xl border border-white/[0.09] border-l-[3px] border-l-sky-400/80 bg-white/[0.03] px-4 py-3"
    >
      {/* Who asks: the plan (or conversation) first, then where and since when. One wrapping line, no "·" separators. */}
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="shrink-0 text-xs font-semibold text-sky-300">{isPermission ? 'Autorisation' : 'Question'}</span>
        <span className="min-w-0 max-w-full truncate text-sm font-medium text-gray-100">{threadTitle ?? session?.title?.trim() ?? 'Conversation libre'}</span>
        <span className="flex flex-wrap items-baseline gap-x-3 text-xs leading-4 text-gray-400">
          <span>{lane}</span>
          <RelativeTime date={request.requested_at} prefix="depuis " />
          {!live && (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <StatusDot tone="muted" />
              {session ? 'arrêté' : 'état inconnu'}
            </span>
          )}
        </span>
        {live && <span className="sr-only">vivant</span>}
      </div>

      {/* What: the EXACT text, whole */}
      {isPermission ? (
        <div className="min-w-0 space-y-1">
          <p className="text-xs leading-4 text-gray-400">
            {request.tool_name ? (
              <>
                L’assistant veut lancer <span className="font-mono text-gray-300">{request.tool_name}</span> :
              </>
            ) : (
              'Commande demandée :'
            )}
          </p>
          <pre
            data-testid="attention-text"
            className="m-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-lg bg-black/35 px-3 py-2 font-mono text-[13px] leading-5 text-gray-100"
          >
            {request.text}
          </pre>
        </div>
      ) : (
        <p data-testid="attention-text" className="m-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-gray-100">
          {request.text}
        </p>
      )}

      {/* Provenance, as the backend gave it: read by assistive tech and by the conversation it opens; shown only when the conversation belongs to no plan. */}
      <p className={linked ? 'sr-only' : `${provenanceText} break-words`} data-testid="attention-provenance">
        {provenance.join(' · ')}
      </p>
      {attachSlot && !linked && <div>{attachSlot}</div>}

      {/* Status messages */}
      {orphaned && (
        <p role="status" className="text-sm text-amber-300 break-words">
          {notice ?? ORPHAN_NOTICE}
        </p>
      )}
      {phase === 'decided' && (
        <p role="status" className="text-sm text-gray-300 break-words">
          {DECIDED_NOTICE}
        </p>
      )}
      {phase === 'sent' && (
        <p role="status" className="text-sm text-gray-400">
          Réponse envoyée.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-300 break-words">
          {error}
        </p>
      )}

      {/* Actions */}
      {isPermission ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {orphaned && resumeAction}
          {!orphaned && (
            <>
              <Button size="sm" className={btn} disabled={locked} loading={sending} onClick={() => allow(true)}>
                Autoriser
              </Button>
              <Button size="sm" variant="secondary" className={btn} disabled={locked} onClick={() => allow(false)}>
                Refuser
              </Button>
            </>
          )}
          <OpenSession request={request} />
        </div>
      ) : (
        <div className="space-y-2">
          {hasOptions && !orphaned && (
            <ul className="m-0 grid list-none gap-2 p-0 @lg/card:grid-cols-2" aria-label="Réponses proposées">
              {request.options.map((o) => (
                <li key={o.label} className="min-w-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    className={`${btn} h-full w-full !justify-start text-left whitespace-normal break-words`}
                    disabled={locked}
                    onClick={() => reply(o.label)}
                  >
                    <span className="min-w-0">
                      <span className="block">{o.label}</span>
                      {o.description && <span className="block text-xs font-normal text-gray-400">{o.description}</span>}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {!orphaned && (hasOptions && !freeOpen && text.trim() === '' ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" className={btn} disabled={locked} onClick={() => setFreeOpen(true)}>
                Autre réponse…
              </Button>
              <OpenSession request={request} />
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                aria-label="Autre réponse"
                rows={2}
                value={text}
                disabled={locked}
                autoFocus={freeOpen}
                placeholder={hasOptions ? 'Autre réponse…' : 'Ta réponse…'}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) reply(text)
                }}
                className={`w-full resize-y rounded-lg border border-border-default bg-black/20 px-3 py-2 text-base md:text-sm text-gray-100 placeholder-gray-500 disabled:opacity-50 ${focusRing}`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={hasOptions ? 'secondary' : 'primary'}
                  className={btn}
                  disabled={locked || text.trim() === ''}
                  loading={sending}
                  onClick={() => reply(text)}
                >
                  Envoyer
                </Button>
                <OpenSession request={request} />
              </div>
            </div>
          ))}
          {orphaned && (
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
              {resumeAction}
              <OpenSession request={request} />
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function OpenSession({ request }: { request: WaitingRequest }) {
  return (
    <Link
      to={workspacePath(request.workspace, `/chat/${request.session_id}`)}
      className={`${inlineLink} inline-flex min-h-9 items-center px-2 text-sm ${focusRing}`}
    >
      Ouvrir la conversation
    </Link>
  )
}
