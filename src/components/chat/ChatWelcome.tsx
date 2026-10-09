import { useRef, useCallback } from 'react'
import { useWelcomeData } from '@/hooks'
import { useT } from '@/i18n'
import type { Translator } from '@/i18n/translate'
import type { Project, Plan } from '@/types'
import { Play, Lightbulb, Zap, Building, Search, BarChart3, ClipboardList, Check, FileEdit, RefreshCw, MessageCircle, Clock } from 'lucide-react'

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

// ============================================================================
// QUICK ACTION DEFINITIONS (hardcoded prompts — no dynamic API data)
// ============================================================================

interface QuickAction {
  /** Cursor position from the end of the prompt string */
  cursorOffset?: number
  icon: 'next' | 'plan' | 'impact' | 'arch' | 'search' | 'roadmap'
}

/** Label, description and prompt of each action live in the catalog (`chatA-messages.welcome.actions.<icon>`). */
const QUICK_ACTIONS: QuickAction[] = [
  { icon: 'next' },
  { icon: 'plan', cursorOffset: 0 },
  { icon: 'impact', cursorOffset: 0 },
  { icon: 'arch' },
  { icon: 'search', cursorOffset: 0 },
  { icon: 'roadmap' },
]

// Debounce delay for quick action clicks (ms)
const DEBOUNCE_MS = 300

// ============================================================================
// ICONS (inline SVG — lucide-style, no library import)
// ============================================================================

function QuickActionIcon({ type }: { type: QuickAction['icon'] }) {
  const cls = 'w-4 h-4 shrink-0'
  switch (type) {
    case 'next':
      return <Play className={cls} />
    case 'plan':
      return <Lightbulb className={cls} />
    case 'impact':
      return <Zap className={cls} />
    case 'arch':
      return <Building className={cls} />
    case 'search':
      return <Search className={cls} />
    case 'roadmap':
      return <BarChart3 className={cls} />
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/** Format a date string as relative time (e.g. "5h ago", "2d ago") */
function relativeTime(dateStr: string, t: Translator['t']): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  if (isNaN(then)) return ''
  const diffMs = now - then
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return t('chatA-messages.welcome.time.now')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('chatA-messages.welcome.time.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('chatA-messages.welcome.time.hours', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return t('chatA-messages.welcome.time.days', { count: days })
  const months = Math.floor(days / 30)
  return t('chatA-messages.welcome.time.months', { count: months })
}

/** Get a short plan status label with color class */
function planStatusStyle(status: Plan['status'], t: Translator['t']): { label: string; cls: string } {
  switch (status) {
    case 'draft': return { label: t('chatA-messages.welcome.plan.draft'), cls: 'text-gray-400' }
    case 'approved': return { label: t('chatA-messages.welcome.plan.approved'), cls: 'text-blue-400' }
    case 'in_progress': return { label: t('chatA-messages.welcome.plan.in_progress'), cls: 'text-amber-400' }
    case 'completed': return { label: t('chatA-messages.welcome.plan.completed'), cls: 'text-emerald-400' }
    case 'cancelled': return { label: t('chatA-messages.welcome.plan.cancelled'), cls: 'text-red-400' }
    default: return { label: String(status), cls: 'text-gray-500' }
  }
}

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
    </div>
  )
}

// ============================================================================
// ANIMATION STYLES (injected once via <style> tag would be overkill for this)
// Using inline keyframes via Tailwind's arbitrary animation values:
//   animate-[fadeSlideIn_300ms_ease-out_forwards]
// The keyframes are defined in the wrapper div below.
// ============================================================================

const FADE_KEYFRAMES = `
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
`

// ============================================================================
// COMPONENT
// ============================================================================

export function ChatWelcome({
  onQuickAction,
  onSelectSession,
  selectedProject,
}: ChatWelcomeProps) {
  const { t } = useT()
  const { data, isLoading } = useWelcomeData(selectedProject)
  const lastClickRef = useRef(0)

  // Debounced quick action handler — prevents double-clicks
  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      const now = Date.now()
      if (now - lastClickRef.current < DEBOUNCE_MS) return
      lastClickRef.current = now
      onQuickAction?.(t(`chatA-messages.welcome.actions.${action.icon}.prompt`), action.cursorOffset)
    },
    [onQuickAction, t],
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
  const lastSyncDate = selectedProject?.last_synced
    ?? projects.reduce<string | null>((latest, proj) => {
      if (!proj.last_synced) return latest
      if (!latest) return proj.last_synced
      return new Date(proj.last_synced) > new Date(latest) ? proj.last_synced : latest
    }, null)

  // Check if any status data is worth showing
  const hasStatusData = activePlans.length > 0
    || notesNeedingReview.length > 0
    || totalActiveNotes > 0
    || lastSyncDate !== null

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      {/* Inject keyframes for staggered fade-in animation */}
      <style>{FADE_KEYFRAMES}</style>
      <div className="max-w-lg mx-auto space-y-6">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="text-center pt-4 pb-2 opacity-0" style={{ animation: 'fadeSlideIn 300ms ease-out forwards' }}>
          <h2 className="text-lg font-semibold text-gray-200">
            {t('chatA-messages.welcome.title')}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {t('chatA-messages.welcome.subtitle')}
          </p>
        </div>

        {/* ── Quick Actions ──────────────────────────────── */}
        <div className="opacity-0" style={{ animation: 'fadeSlideIn 300ms ease-out 100ms forwards' }}>
          <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
            {t('chatA-messages.welcome.quickActions')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {QUICK_ACTIONS.map((action, i) => (
              <button
                key={action.icon}
                onClick={() => handleQuickAction(action)}
                className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-white/[0.06] text-left transition-colors hover:bg-white/[0.04] hover:border-white/[0.1] group opacity-0"
                style={{ animation: `fadeSlideIn 250ms ease-out ${150 + i * 50}ms forwards` }}
              >
                <span className="mt-0.5 text-indigo-400 group-hover:text-indigo-300 transition-colors">
                  <QuickActionIcon type={action.icon} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-300 group-hover:text-gray-200 transition-colors">
                    {t(`chatA-messages.welcome.actions.${action.icon}.label`)}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {t(`chatA-messages.welcome.actions.${action.icon}.description`)}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {!selectedProject && (
            <p className="text-[10px] text-gray-600 mt-1.5 text-center">
              {t('chatA-messages.welcome.selectProject')}
            </p>
          )}
        </div>

        {/* ── Project Status ─────────────────────────────── */}
        {isLoading ? (
          <div className="opacity-0" style={{ animation: 'fadeSlideIn 300ms ease-out 450ms forwards' }}>
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
              {selectedProject ? selectedProject.name : t('chatA-messages.welcome.projectStatus')}
            </div>
            <StatusSkeleton />
          </div>
        ) : hasStatusData ? (
          <div className="opacity-0" style={{ animation: 'fadeSlideIn 300ms ease-out 450ms forwards' }}>
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
              {selectedProject ? selectedProject.name : t('chatA-messages.welcome.projectStatus')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {/* Active plans count */}
              {activePlans.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06]">
                  <ClipboardList className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="text-xs text-gray-400">
                    {t(activePlans.length === 1 ? 'chatA-messages.welcome.activePlanOne' : 'chatA-messages.welcome.activePlanMany', { count: activePlans.length })}
                  </span>
                </div>
              )}

              {/* Notes needing review */}
              {notesNeedingReview.length > 0 ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06]">
                  <Search className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-xs text-gray-400">
                    {t('chatA-messages.welcome.toReview', { count: notesNeedingReview.length })}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06]">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-xs text-gray-500">{t('chatA-messages.welcome.allClear')}</span>
                </div>
              )}

              {/* Total active notes */}
              {totalActiveNotes > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06]">
                  <FileEdit className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-xs text-gray-400">
                    {t(totalActiveNotes === 1 ? 'chatA-messages.welcome.notesOne' : 'chatA-messages.welcome.notesMany', { count: totalActiveNotes })}
                  </span>
                </div>
              )}

              {/* Last sync */}
              {lastSyncDate && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06]">
                  <RefreshCw className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                  <span className="text-xs text-gray-500">
                    {t('chatA-messages.welcome.synced', { when: relativeTime(lastSyncDate, t) })}
                  </span>
                </div>
              )}
            </div>

            {/* Top plan detail line */}
            {activePlans.length > 0 && (() => {
              const topPlan = activePlans[0]
              const st = planStatusStyle(topPlan.status, t)
              return (
                <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg border border-white/[0.06]">
                  <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="text-xs text-gray-400 truncate min-w-0">
                    {topPlan.title ?? t('chatA-messages.welcome.untitled')}
                  </span>
                  <span className={`text-[10px] font-medium ${st.cls} shrink-0`}>
                    {st.label}
                  </span>
                  <span className="text-[10px] text-gray-600 shrink-0">
                    P{Number(topPlan.priority) || 0}
                  </span>
                </div>
              )
            })()}
          </div>
        ) : null}

        {/* ── Recent Conversations ────────────────────────── */}
        {isLoading ? (
          <div className="opacity-0" style={{ animation: 'fadeSlideIn 300ms ease-out 500ms forwards' }}>
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
              {t('chatA-messages.welcome.recent')}
            </div>
            <SessionsSkeleton />
          </div>
        ) : recentSessions.length > 0 ? (
          <div className="opacity-0" style={{ animation: 'fadeSlideIn 300ms ease-out 500ms forwards' }}>
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
              {t('chatA-messages.welcome.recent')}
            </div>
            <div className="space-y-1">
              {recentSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => handleSelectSession(session.id, session.title ?? undefined)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/[0.04] group"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 shrink-0 transition-colors" />
                  <span className="text-xs text-gray-400 group-hover:text-gray-300 truncate min-w-0 transition-colors">
                    {session.title ?? session.preview ?? t('chatA-messages.welcome.untitledConversation')}
                  </span>
                  <span className="text-[10px] text-gray-600 shrink-0 ml-auto">
                    {relativeTime(session.updated_at ?? session.created_at, t)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

      </div>
    </div>
  )
}
