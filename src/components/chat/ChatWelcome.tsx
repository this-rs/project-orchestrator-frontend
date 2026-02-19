import { useRef, useCallback } from 'react'
import { useWelcomeData } from '@/hooks'
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
                  <ClipboardList className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="text-xs text-gray-400">
                    <span className="text-gray-200 font-medium">{activePlans.length}</span>
                    {' '}active plan{activePlans.length !== 1 ? 's' : ''}
                  </span>
                </div>
              )}

              {/* Notes needing review */}
              {notesNeedingReview.length > 0 ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06]">
                  <Search className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-xs text-gray-400">
                    <span className="text-amber-300 font-medium">{notesNeedingReview.length}</span>
                    {' '}to review
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06]">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-xs text-gray-500">All clear</span>
                </div>
              )}

              {/* Total active notes */}
              {totalActiveNotes > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06]">
                  <FileEdit className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-xs text-gray-400">
                    <span className="text-gray-200 font-medium">{totalActiveNotes}</span>
                    {' '}notes
                  </span>
                </div>
              )}

              {/* Last sync */}
              {lastSyncDate && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06]">
                  <RefreshCw className="w-3.5 h-3.5 text-gray-500 shrink-0" />
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
                  <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
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
                  <MessageCircle className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 shrink-0 transition-colors" />
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
