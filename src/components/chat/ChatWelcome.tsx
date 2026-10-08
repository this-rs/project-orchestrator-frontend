/**
 * ChatWelcome — the first screen of a conversation, before anything was said.
 *
 * Suggestions follow the PROFILE of the current project (`constants/projectProfile`):
 * a project without code, or no project at all, gets the work of everyday life
 * (prepare, keep track, resume, what was decided); a codebase gets the three code
 * questions on top of the common ones. The label is what the person reads, the
 * prompt is what the assistant receives: the prompt may be more precise than the
 * label (website/AUDIENCE.md § 2, § 6 « l'écran d'accueil du chat reste dev »).
 *
 * Words and suggestions live in `welcomeSuggestions.ts` (English for now; `src/i18n`
 * after #252). Statuses read the registry (`StatusText`), materials come from
 * `@/components/ui` — no local colours, no glow, no pill.
 */
import { useRef, useCallback } from 'react'
import { Search, ClipboardList, Check, FileEdit, RefreshCw, MessageCircle, Clock } from 'lucide-react'
import { useWelcomeData } from '@/hooks'
import { profileOf } from '@/constants/projectProfile'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { Button, PriorityText, RelativeTime, StatusText, TONE_CLASSES, metaText, surface } from '@/components/ui'
import type { Project } from '@/types'
import { WELCOME_TEXT, suggestionsFor, type Suggestion } from './welcomeSuggestions'

/** The registry's word for a count, lower-case, without the number (the number is set apart in the tile). */
const noun = (n: number, concept: { singular: string; plural: string }): string =>
  (n === 1 ? concept.singular : concept.plural).toLowerCase()

// ============================================================================
// PROPS
// ============================================================================

interface ChatWelcomeProps {
  /** Insert a prompt into the chat textarea */
  onQuickAction: (prompt: string, cursorOffset?: number) => void
  /** Resume a previous conversation */
  onSelectSession: (sessionId: string, turnIndex?: number, title?: string) => void
  /** Currently selected project (null = none) */
  selectedProject: Project | null
}

// Debounce delay for quick action clicks (ms)
const DEBOUNCE_MS = 300

// ============================================================================
// SKELETON LOADERS
// ============================================================================

function StatusSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-3 w-32 bg-white/[0.06] rounded" />
      <div className="h-3 w-48 bg-white/[0.06] rounded" />
      <div className="h-3 w-24 bg-white/[0.06] rounded" />
    </div>
  )
}

function SessionsSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-8 bg-white/[0.06] rounded" />
      <div className="h-8 bg-white/[0.06] rounded" />
      <div className="h-8 bg-white/[0.06] rounded" />
    </div>
  )
}

/** The small header of a block (the `ListGroup` register: 11 px, medium, grey — never uppercase). */
function BlockTitle({ children }: { children: string }) {
  return <h3 className={`${metaText} font-medium mb-2`}>{children}</h3>
}

const tile = `${surface} flex items-center gap-2 px-3 py-2 min-w-0`

// ============================================================================
// COMPONENT
// ============================================================================

export function ChatWelcome({ onQuickAction, onSelectSession, selectedProject }: ChatWelcomeProps) {
  const { data, isLoading } = useWelcomeData(selectedProject)
  const lastClickRef = useRef(0)
  const suggestions = suggestionsFor(selectedProject ? profileOf(selectedProject) : null)

  // Debounced quick action handler — prevents double-clicks
  const handleSuggestion = useCallback(
    (s: Suggestion) => {
      const now = Date.now()
      if (now - lastClickRef.current < DEBOUNCE_MS) return
      lastClickRef.current = now
      onQuickAction?.(s.prompt, s.cursorOffset)
    },
    [onQuickAction],
  )

  // Debounced session selection
  const handleSelectSession = useCallback(
    (sessionId: string, title?: string) => {
      const now = Date.now()
      if (now - lastClickRef.current < DEBOUNCE_MS) return
      lastClickRef.current = now
      onSelectSession?.(sessionId, undefined, title)
    },
    [onSelectSession],
  )

  // ---- Derived data with defensive fallbacks ----

  const activePlans = Array.isArray(data.activePlans) ? data.activePlans : []
  const notesNeedingReview = Array.isArray(data.notesNeedingReview) ? data.notesNeedingReview : []
  const recentSessions = Array.isArray(data.recentSessions) ? data.recentSessions : []
  const projects = Array.isArray(data.projects) ? data.projects : []
  const totalActiveNotes = Number(data.totalActiveNotes) || 0

  // Sync date: use selected project directly, or find most recently synced across all
  const lastSyncDate =
    selectedProject?.last_synced ??
    projects.reduce<string | null>((latest, proj) => {
      if (!proj.last_synced) return latest
      if (!latest) return proj.last_synced
      return new Date(proj.last_synced) > new Date(latest) ? proj.last_synced : latest
    }, null)

  // Check if any status data is worth showing
  const hasStatusData = activePlans.length > 0 || notesNeedingReview.length > 0 || totalActiveNotes > 0 || lastSyncDate !== null
  const topPlan = activePlans[0]

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-lg mx-auto space-y-6">
        {/* ── Header ─────────────────────────────────────── */}
        <div className="text-center pt-4 pb-2">
          <h2 className="text-lg font-semibold text-gray-100 text-balance">{WELCOME_TEXT.title}</h2>
          <p className="text-sm text-gray-400 mt-1 text-balance">{WELCOME_TEXT.lead}</p>
        </div>

        {/* ── Suggestions ────────────────────────────────── */}
        <section aria-label={WELCOME_TEXT.suggestions}>
          <BlockTitle>{WELCOME_TEXT.suggestions}</BlockTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {suggestions.map((s) => {
              const Icon = s.icon
              return (
                <Button
                  key={s.id}
                  variant="secondary"
                  flat
                  onClick={() => handleSuggestion(s)}
                  className="justify-start text-left items-start gap-3 py-2.5 min-w-0"
                >
                  <Icon className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" aria-hidden="true" />
                  <span className="min-w-0 flex flex-col">
                    <span className="text-sm font-medium text-gray-100 break-words">{s.label}</span>
                    <span className="text-xs font-normal text-gray-400 break-words">{s.hint}</span>
                  </span>
                </Button>
              )
            })}
          </div>
          {!selectedProject && <p className={`${metaText} mt-2 text-center`}>{WELCOME_TEXT.noProject}</p>}
        </section>

        {/* ── Where things stand ─────────────────────────── */}
        {isLoading ? (
          <section aria-label={WELCOME_TEXT.status}>
            <BlockTitle>{selectedProject ? selectedProject.name : WELCOME_TEXT.status}</BlockTitle>
            <StatusSkeleton />
          </section>
        ) : hasStatusData ? (
          <section aria-label={WELCOME_TEXT.status}>
            <BlockTitle>{selectedProject ? selectedProject.name : WELCOME_TEXT.status}</BlockTitle>
            <div className="grid grid-cols-2 gap-2">
              {/* Active plans count */}
              {activePlans.length > 0 && (
                <div className={tile}>
                  <ClipboardList className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" />
                  <span className="text-xs text-gray-400 tabular-nums">
                    <span className="text-gray-200 font-medium">{activePlans.length}</span>{' '}
                    {`active ${noun(activePlans.length, NOMENCLATURE.plans)}`}
                  </span>
                </div>
              )}

              {/* Notes needing review */}
              {notesNeedingReview.length > 0 ? (
                <div className={tile}>
                  <Search className={`w-3.5 h-3.5 shrink-0 ${TONE_CLASSES.warning.text}`} aria-hidden="true" />
                  <span className="text-xs text-gray-400 tabular-nums">
                    <span className={`font-medium ${TONE_CLASSES.warning.text}`}>{notesNeedingReview.length}</span>{' '}
                    {WELCOME_TEXT.toReview}
                  </span>
                </div>
              ) : (
                <div className={tile}>
                  <Check className={`w-3.5 h-3.5 shrink-0 ${TONE_CLASSES.success.text}`} aria-hidden="true" />
                  <span className="text-xs text-gray-500">{WELCOME_TEXT.allClear}</span>
                </div>
              )}

              {/* Total active notes */}
              {totalActiveNotes > 0 && (
                <div className={tile}>
                  <FileEdit className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" />
                  <span className="text-xs text-gray-400 tabular-nums">
                    <span className="text-gray-200 font-medium">{totalActiveNotes}</span>{' '}
                    {noun(totalActiveNotes, NOMENCLATURE.notes)}
                  </span>
                </div>
              )}

              {/* Last sync */}
              {lastSyncDate && (
                <div className={tile}>
                  <RefreshCw className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" />
                  <RelativeTime date={lastSyncDate} prefix={WELCOME_TEXT.synced} className="text-xs text-gray-400" />
                </div>
              )}
            </div>

            {/* Top plan detail line */}
            {topPlan && (
              <div className={`${tile} mt-2`}>
                <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" />
                <span className="text-xs text-gray-300 truncate min-w-0" title={topPlan.title ?? undefined}>
                  {topPlan.title ?? WELCOME_TEXT.untitledPlan}
                </span>
                <span className="ml-auto flex items-center gap-2 shrink-0">
                  <StatusText kind="plan" status={topPlan.status} />
                  <PriorityText priority={topPlan.priority} />
                </span>
              </div>
            )}
          </section>
        ) : null}

        {/* ── Recent conversations ───────────────────────── */}
        {isLoading ? (
          <section aria-label={WELCOME_TEXT.recent}>
            <BlockTitle>{WELCOME_TEXT.recent}</BlockTitle>
            <SessionsSkeleton />
          </section>
        ) : recentSessions.length > 0 ? (
          <section aria-label={WELCOME_TEXT.recent}>
            <BlockTitle>{WELCOME_TEXT.recent}</BlockTitle>
            <ul className="space-y-1">
              {recentSessions.map((session) => {
                const title = session.title ?? session.preview ?? WELCOME_TEXT.untitledConversation
                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectSession(session.id, session.title ?? undefined)}
                      className="w-full min-h-9 flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/[0.04] group"
                    >
                      <MessageCircle
                        className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 shrink-0 transition-colors"
                        aria-hidden="true"
                      />
                      <span className="text-xs text-gray-400 group-hover:text-gray-300 truncate min-w-0 transition-colors" title={title}>
                        {title}
                      </span>
                      <RelativeTime date={session.updated_at ?? session.created_at} className={`${metaText} shrink-0 ml-auto`} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}
