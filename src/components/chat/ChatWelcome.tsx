import { useRef, useCallback } from 'react'
import { useWelcomeData } from '@/hooks'
import type { Project, Plan } from '@/types'

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
  label: string
  description: string
  prompt: string
  /** Cursor position from the end of the prompt string */
  cursorOffset?: number
  icon: 'next' | 'plan' | 'impact' | 'arch' | 'search' | 'roadmap'
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Next task',
    description: 'Get next available task',
    prompt: 'Quelle est la prochaine tâche disponible sur le plan actif ? Montre-moi le contexte et les steps.',
    icon: 'next',
  },
  {
    label: 'Plan something',
    description: 'Plan an implementation',
    prompt: "Planifie l'implémentation de : ",
    cursorOffset: 0,
    icon: 'plan',
  },
  {
    label: 'Impact analysis',
    description: 'Analyze change impact',
    prompt: "Analyse l'impact de modifier : ",
    cursorOffset: 0,
    icon: 'impact',
  },
  {
    label: 'Architecture',
    description: 'Codebase overview',
    prompt: "Donne-moi une vue d'ensemble de l'architecture du projet",
    icon: 'arch',
  },
  {
    label: 'Code search',
    description: 'Search in codebase',
    prompt: 'Cherche dans le code : ',
    cursorOffset: 0,
    icon: 'search',
  },
  {
    label: 'Roadmap',
    description: 'Milestones & releases',
    prompt: 'Montre-moi la roadmap complète avec milestones et releases',
    icon: 'roadmap',
  },
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
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
        </svg>
      )
    case 'plan':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      )
    case 'impact':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    case 'arch':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      )
    case 'search':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      )
    case 'roadmap':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/** Format a date string as relative time (e.g. "5h ago", "2d ago") */
function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  if (isNaN(then)) return ''
  const diffMs = now - then
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

/** Get a short plan status label with color class */
function planStatusStyle(status: Plan['status']): { label: string; cls: string } {
  switch (status) {
    case 'draft': return { label: 'Draft', cls: 'text-gray-400' }
    case 'approved': return { label: 'Approved', cls: 'text-blue-400' }
    case 'in_progress': return { label: 'In Progress', cls: 'text-amber-400' }
    case 'completed': return { label: 'Done', cls: 'text-emerald-400' }
    case 'cancelled': return { label: 'Cancelled', cls: 'text-red-400' }
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
  const { data, isLoading } = useWelcomeData(selectedProject)
  const lastClickRef = useRef(0)

  // Debounced quick action handler — prevents double-clicks
  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      const now = Date.now()
      if (now - lastClickRef.current < DEBOUNCE_MS) return
      lastClickRef.current = now
      onQuickAction?.(action.prompt, action.cursorOffset)
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
            Project Orchestrator
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            What would you like to do?
          </p>
        </div>

        {/* ── Quick Actions ──────────────────────────────── */}
        <div className="opacity-0" style={{ animation: 'fadeSlideIn 300ms ease-out 100ms forwards' }}>
          <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
            Quick Actions
          </div>
          <div data-tour="chat-quick-actions" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                    {action.label}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {action.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {!selectedProject && (
            <p className="text-[10px] text-gray-600 mt-1.5 text-center">
              Select a project above to use quick actions
            </p>
          )}
        </div>

        {/* ── Project Status ─────────────────────────────── */}
        {isLoading ? (
          <div className="opacity-0" style={{ animation: 'fadeSlideIn 300ms ease-out 450ms forwards' }}>
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
              {selectedProject ? selectedProject.name : 'Project Status'}
            </div>
            <StatusSkeleton />
          </div>
        ) : hasStatusData ? (
          <div className="opacity-0" style={{ animation: 'fadeSlideIn 300ms ease-out 450ms forwards' }}>
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
              {selectedProject ? selectedProject.name : 'Project Status'}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {/* Active plans count */}
              {activePlans.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06]">
                  <svg className="w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span className="text-xs text-gray-400">
                    <span className="text-gray-200 font-medium">{activePlans.length}</span>
                    {' '}active plan{activePlans.length !== 1 ? 's' : ''}
                  </span>
                </div>
              )}

              {/* Notes needing review */}
              {notesNeedingReview.length > 0 ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06]">
                  <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span className="text-xs text-gray-400">
                    <span className="text-amber-300 font-medium">{notesNeedingReview.length}</span>
                    {' '}to review
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06]">
                  <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs text-gray-500">All clear</span>
                </div>
              )}

              {/* Total active notes */}
              {totalActiveNotes > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06]">
                  <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="text-xs text-gray-400">
                    <span className="text-gray-200 font-medium">{totalActiveNotes}</span>
                    {' '}notes
                  </span>
                </div>
              )}

              {/* Last sync */}
              {lastSyncDate && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06]">
                  <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="text-xs text-gray-500">
                    Synced {relativeTime(lastSyncDate)}
                  </span>
                </div>
              )}
            </div>

            {/* Top plan detail line */}
            {activePlans.length > 0 && (() => {
              const topPlan = activePlans[0]
              const st = planStatusStyle(topPlan.status)
              return (
                <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg border border-white/[0.06]">
                  <svg className="w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs text-gray-400 truncate min-w-0">
                    {topPlan.title ?? 'Untitled'}
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
              Recent Conversations
            </div>
            <SessionsSkeleton />
          </div>
        ) : recentSessions.length > 0 ? (
          <div className="opacity-0" style={{ animation: 'fadeSlideIn 300ms ease-out 500ms forwards' }}>
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
              Recent Conversations
            </div>
            <div className="space-y-1">
              {recentSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => handleSelectSession(session.id, session.title ?? undefined)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/[0.04] group"
                >
                  <svg className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span className="text-xs text-gray-400 group-hover:text-gray-300 truncate min-w-0 transition-colors">
                    {session.title ?? session.preview ?? 'Untitled conversation'}
                  </span>
                  <span className="text-[10px] text-gray-600 shrink-0 ml-auto">
                    {relativeTime(session.updated_at ?? session.created_at)}
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
