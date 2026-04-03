import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { chatSessionRefreshAtom, activeWorkspaceSlugAtom, showSpawnedSessionsAtom } from '@/atoms'
import { chatApi, getEventBus, workspacesApi } from '@/services'
import { useActiveRunTracker, useDetachedRuns } from '@/hooks'
import type {
  ChatSession,
  CrudEvent,
  MessageSearchResult,
  PermissionMode,
  Project,
  SpawnedBy,
} from '@/types'
import { Select, PulseIndicator } from '@/components/ui'
import { Folder, Trash2, Search, X, Loader2, ChevronRight, MessageCircle, Play, GitBranch, ChevronDown, Clock, Pencil } from 'lucide-react'

interface SessionListProps {
  activeSessionId?: string | null
  onSelect: (sessionId: string, targetMessageTurnIndex?: number, title?: string, searchHit?: { snippet: string; createdAt: number; role: 'user' | 'assistant' }) => void
  onClose: () => void
  /** When true, hides the header + "New conversation" button (parent provides them) */
  embedded?: boolean
}

const SESSION_PAGE_SIZE = 30

const MODE_DOT_COLORS: Record<PermissionMode, string> = {
  bypassPermissions: 'bg-emerald-400',
  acceptEdits: 'bg-blue-400',
  default: 'bg-amber-400',
  plan: 'bg-gray-400',
}

/** Shorten an absolute path by replacing the home directory with ~ */
function shortenPath(path: string): string {
  if (path.startsWith('~/')) return path
  return path.replace(/^\/(?:Users|home)\/[^/]+\//, '~/')
}

// ============================================================================
// Date grouping helpers
// ============================================================================

type DateGroup = 'Today' | 'Yesterday' | 'This week' | 'This month' | 'Older'

function getDateGroup(dateStr: string): DateGroup {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)
  const monthAgo = new Date(today)
  monthAgo.setDate(monthAgo.getDate() - 30)

  if (date >= today) return 'Today'
  if (date >= yesterday) return 'Yesterday'
  if (date >= weekAgo) return 'This week'
  if (date >= monthAgo) return 'This month'
  return 'Older'
}

function groupSessionsByDate(sessions: ChatSession[]): { group: DateGroup; sessions: ChatSession[] }[] {
  const groups = new Map<DateGroup, ChatSession[]>()
  const order: DateGroup[] = ['Today', 'Yesterday', 'This week', 'This month', 'Older']

  for (const session of sessions) {
    const group = getDateGroup(session.updated_at)
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(session)
  }

  return order.filter((g) => groups.has(g)).map((g) => ({ group: g, sessions: groups.get(g)! }))
}

// ============================================================================
// Spawned badge colors by spawn type
// ============================================================================

const SPAWN_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  runner: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'runner' },
  conversation: { bg: 'bg-violet-500/15', text: 'text-violet-400', label: 'spawned' },
  delegation: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'delegated' },
}

function SpawnedBadge({ spawnedBy }: { spawnedBy: SpawnedBy }) {
  const style = SPAWN_TYPE_STYLES[spawnedBy.type] || SPAWN_TYPE_STYLES.conversation
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium ${style.bg} ${style.text} shrink-0`}>
      <GitBranch className="w-2.5 h-2.5" />
      {style.label}
    </span>
  )
}

// ============================================================================
// Expandable children indicator
// ============================================================================

function formatDuration(startedAt: string): string {
  const start = new Date(startedAt).getTime()
  const now = new Date().getTime()
  const diffMs = now - start
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return '<1m'
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  return `${diffHours}h ${diffMins % 60}m`
}

function ChildrenIndicator({ sessionId, onSelect }: { sessionId: string; onSelect: (id: string, turnIndex?: number, title?: string) => void }) {
  const { runs, isLoading } = useDetachedRuns(sessionId)
  const [expanded, setExpanded] = useState(false)

  if (isLoading || runs.length === 0) return null

  return (
    <div className="mt-0.5">
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
        className="flex items-center gap-1 text-[10px] text-amber-400/80 hover:text-amber-300 transition-colors"
      >
        <ChevronDown className={`w-2.5 h-2.5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
        <PulseIndicator variant="pending" size={6} />
        <span>{runs.length} child{runs.length > 1 ? 'ren' : ''}</span>
      </button>

      {expanded && (
        <div className="ml-2 mt-1 border-l border-white/[0.06] pl-2 space-y-0.5">
          {runs.map((run) => (
            <button
              key={run.sessionId}
              onClick={(e) => { e.stopPropagation(); onSelect(run.sessionId, undefined, run.title) }}
              className="w-full text-left flex items-center gap-1.5 py-0.5 hover:bg-white/[0.04] rounded px-1 transition-colors group/child"
            >
              {run.isStreaming ? (
                <PulseIndicator variant="active" size={6} />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-gray-600 shrink-0" />
              )}
              <span className="text-[10px] text-gray-400 truncate flex-1">{run.title}</span>
              <span className="flex items-center gap-0.5 text-[9px] text-gray-600 shrink-0">
                <Clock className="w-2.5 h-2.5" />
                {formatDuration(run.startedAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SessionList component
// ============================================================================

export const SessionList = memo(function SessionList({ activeSessionId, onSelect, onClose, embedded }: SessionListProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMoreSessions, setHasMoreSessions] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const offsetRef = useRef(0)

  // Sentinel ref for IntersectionObserver (infinite scroll)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Live refresh via WebSocket CRUD events
  const chatSessionRefresh = useAtomValue(chatSessionRefreshAtom)

  // Track active detached runs per parent session
  const activeRuns = useActiveRunTracker()

  // Track streaming sessions via direct event bus subscription
  const [streamingSessions, setStreamingSessions] = useState<Set<string>>(
    () => new Set(),
  )

  // Listen to chat_session events for streaming status updates
  useEffect(() => {
    const bus = getEventBus()
    const off = bus.on((event: CrudEvent) => {
      if (event.entity_type !== 'chat_session') return

      if (
        event.action === 'updated' &&
        event.payload &&
        typeof event.payload.is_streaming === 'boolean'
      ) {
        setStreamingSessions((prev) => {
          const next = new Set(prev)
          if (event.payload.is_streaming) {
            next.add(event.entity_id)
          } else {
            next.delete(event.entity_id)
          }
          return next
        })
      }
    })
    return () => { off() }
  }, [])

  // Active workspace from global atom
  const activeWsSlug = useAtomValue(activeWorkspaceSlugAtom)

  // Show/hide spawned sessions toggle
  const [showSpawned, setShowSpawned] = useAtom(showSpawnedSessionsAtom)

  // Filter state
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')

  // Inline rename state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MessageSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const isSearchActive = debouncedQuery.trim().length > 0

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Load workspace projects on mount / workspace change (for project filter dropdown)
  useEffect(() => {
    if (!activeWsSlug) {
      setProjects([])
      return
    }
    workspacesApi.listProjects(activeWsSlug).then((data) => {
      const items = Array.isArray(data) ? data : []
      setProjects(items)
    })
  }, [activeWsSlug])

  // Fetch sessions — initial load resets the list, loadMore appends
  const fetchSessions = useCallback(
    async (loadMore = false) => {
      if (loadMore) {
        setIsLoadingMore(true)
      } else {
        setLoading(true)
        offsetRef.current = 0
      }

      try {
        const params: { limit: number; offset: number; project_slug?: string; workspace_slug?: string } = {
          limit: SESSION_PAGE_SIZE,
          offset: loadMore ? offsetRef.current : 0,
        }
        if (selectedProject) {
          params.project_slug = selectedProject
        } else if (activeWsSlug) {
          params.workspace_slug = activeWsSlug
        }
        const data = await chatApi.listSessions(params)
        const newItems = data.items || []

        if (loadMore) {
          setSessions((prev) => [...prev, ...newItems])
        } else {
          setSessions(newItems)
        }

        offsetRef.current = (loadMore ? offsetRef.current : 0) + newItems.length
        setHasMoreSessions(!!data.has_more)
      } catch {
        // ignore
      } finally {
        if (loadMore) {
          setIsLoadingMore(false)
        } else {
          setLoading(false)
        }
      }
    },
    [selectedProject, activeWsSlug],
  )

  // Initial load + refresh on filter/CRUD changes
  useEffect(() => {
    fetchSessions(false)
  }, [fetchSessions, chatSessionRefresh])

  // IntersectionObserver for infinite scroll sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreSessions && !isLoadingMore && !loading) {
          fetchSessions(true)
        }
      },
      { threshold: 0.1 },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMoreSessions, isLoadingMore, loading, fetchSessions])

  // Execute search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSearchResults([])
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)

    chatApi
      .searchMessages({
        q: debouncedQuery,
        project_slug: selectedProject || undefined,
        limit: 15,
      })
      .then((results) => {
        if (!cancelled) {
          setSearchResults(results)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSearchResults([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSearching(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery, selectedProject])

  // Filter out spawned sessions when toggle is off, then group by date
  const filteredSessions = useMemo(() => {
    if (showSpawned) return sessions
    return sessions.filter((s) => !s.spawned_by)
  }, [sessions, showSpawned])

  const groupedSessions = useMemo(() => groupSessionsByDate(filteredSessions), [filteredSessions])

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    await chatApi.deleteSession(sessionId)
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
  }

  const handleStartRename = (e: React.MouseEvent, session: ChatSession) => {
    e.stopPropagation()
    setEditingSessionId(session.id)
    setEditingTitle(session.title || `Session ${session.id.slice(0, 8)}`)
    // Focus after React renders the input
    requestAnimationFrame(() => editInputRef.current?.select())
  }

  const handleCommitRename = async () => {
    if (!editingSessionId) return
    const trimmed = editingTitle.trim()
    if (trimmed) {
      try {
        await chatApi.renameSession(editingSessionId, trimmed)
        setSessions((prev) =>
          prev.map((s) => s.id === editingSessionId ? { ...s, title: trimmed } : s)
        )
      } catch {
        // Revert silently
      }
    }
    setEditingSessionId(null)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCommitRename()
    } else if (e.key === 'Escape') {
      setEditingSessionId(null)
    }
  }

  const handleClearSearch = () => {
    setSearchQuery('')
    setDebouncedQuery('')
    setSearchResults([])
    searchInputRef.current?.focus()
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts * 1000)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  const formatCost = (cost?: number) => {
    if (!cost) return null
    return `$${cost.toFixed(2)}`
  }

  // Render a single session card
  const renderSessionCard = (session: ChatSession) => {
    const isActive = session.id === activeSessionId
    const title = session.title || `Session ${session.id.slice(0, 8)}`

    return (
      <div
        key={session.id}
        role="button"
        tabIndex={0}
        onClick={() => isActive ? onClose() : onSelect(session.id, undefined, title)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (isActive) { onClose() } else { onSelect(session.id, undefined, title) } } }}
        className={`w-full text-left px-3 py-2.5 transition-all group flex items-start gap-2 cursor-pointer ${
          isActive
            ? 'bg-indigo-500/[0.08] border-l-2 border-indigo-500 pl-2.5'
            : 'hover:bg-white/[0.04] border-l-2 border-transparent'
        }`}
      >
        <div className="flex-1 min-w-0">
          {/* Title + streaming indicator + mode dot + spawned badge */}
          <div className="flex items-center gap-1.5">
            {streamingSessions.has(session.id) && (
              <PulseIndicator variant="active" size={8} />
            )}
            {editingSessionId === session.id ? (
              <input
                ref={editInputRef}
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={handleCommitRename}
                onKeyDown={handleRenameKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="text-sm bg-white/[0.06] border border-indigo-500/40 rounded px-1.5 py-0.5 text-gray-200 focus:outline-none w-full min-w-0"
                autoFocus
              />
            ) : (
              <span
                className={`text-sm truncate ${isActive ? 'text-gray-200 font-medium' : 'text-gray-300'}`}
                onDoubleClick={(e) => handleStartRename(e, session)}
              >
                {title}
              </span>
            )}
            {session.permission_mode && editingSessionId !== session.id && (
              <span
                className={`shrink-0 w-1.5 h-1.5 rounded-full ${MODE_DOT_COLORS[session.permission_mode] ?? 'bg-gray-400'}`}
                title={session.permission_mode}
              />
            )}
            {session.spawned_by && editingSessionId !== session.id && (
              <SpawnedBadge spawnedBy={session.spawned_by} />
            )}
          </div>

          {/* Preview or streaming label */}
          {streamingSessions.has(session.id) ? (
            <div className="text-[10px] text-emerald-400/70 mt-0.5">
              Working...
            </div>
          ) : (
            session.preview && session.preview !== session.title && (
              <div className="text-xs text-gray-500 truncate mt-0.5">
                {session.preview}
              </div>
            )
          )}

          {/* Expandable children indicator */}
          <ChildrenIndicator sessionId={session.id} onSelect={onSelect} />

          {/* CWD */}
          {session.cwd && (
            <div className="flex items-center gap-1 mt-0.5 min-w-0">
              <Folder className="w-2.5 h-2.5 text-gray-600 shrink-0" />
              <span className="text-[10px] text-gray-600 truncate">
                {shortenPath(session.cwd)}
              </span>
            </div>
          )}

          {/* Metadata row */}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap overflow-hidden">
            <span className="text-[10px] text-gray-600 shrink-0">
              {formatDate(session.updated_at)}
            </span>
            <span className="text-[10px] text-gray-700 shrink-0">&middot;</span>
            <span className="text-[10px] text-gray-600 shrink-0">
              {session.message_count} msgs
            </span>
            {session.model && (
              <>
                <span className="text-[10px] text-gray-700 shrink-0">&middot;</span>
                <span className="text-[10px] text-gray-600 truncate max-w-[80px]">
                  {session.model}
                </span>
              </>
            )}
            {formatCost(session.total_cost_usd) && (
              <>
                <span className="text-[10px] text-gray-700 shrink-0">&middot;</span>
                <span className="text-[10px] text-gray-600 shrink-0">
                  {formatCost(session.total_cost_usd)}
                </span>
              </>
            )}
            {session.workspace_slug && (
              <span className="text-[10px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded-full ml-auto truncate max-w-[100px]">
                ⬡ {session.workspace_slug}
              </span>
            )}
            {!session.workspace_slug && session.project_slug && (
              <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded-full ml-auto truncate max-w-[100px]">
                {session.project_slug}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="shrink-0 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
          <button
            onClick={(e) => handleStartRename(e, session)}
            className="p-1 text-gray-600 hover:text-indigo-400 transition-colors"
            title="Rename"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => handleDelete(e, session.id)}
            className="p-1 text-gray-600 hover:text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header — hidden when embedded (parent provides it) */}
      {!embedded && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Sessions
          </span>
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Back
          </button>
        </div>
      )}

      {/* Search + Filters */}
      <div className="px-3 py-2 border-b border-white/[0.06] space-y-1.5">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-7 pr-7 py-1.5 text-xs bg-white/[0.03] border border-white/[0.06] rounded-md text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500/40 focus:bg-white/[0.05] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Project filter (scoped to active workspace) */}
        {projects.length > 0 && (
          <Select
            value={selectedProject}
            onChange={setSelectedProject}
            options={[
              { value: '', label: 'All projects' },
              ...projects.map((p) => ({ value: p.slug, label: p.name })),
            ]}
            placeholder="All projects"
            icon={<Folder className="w-3 h-3" />}
          />
        )}

        {/* Show spawned sessions toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none py-0.5">
          <button
            role="switch"
            aria-checked={showSpawned}
            onClick={() => setShowSpawned(!showSpawned)}
            className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
              showSpawned ? 'bg-indigo-500/60' : 'bg-white/[0.08]'
            }`}
          >
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full bg-white transition-transform ${
                showSpawned ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span className="text-[10px] text-gray-500 flex items-center gap-1">
            <GitBranch className="w-2.5 h-2.5" />
            Show spawned
          </span>
        </label>
      </div>

      {/* Content area: session list or search results */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {isSearchActive ? (
          // Search results mode
          searching ? (
            <div className="flex items-center justify-center py-8 text-gray-600 text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Searching...
            </div>
          ) : searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-600 text-sm">
              <Search className="w-6 h-6 mb-2 text-gray-700" />
              No results for &ldquo;{debouncedQuery}&rdquo;
            </div>
          ) : (
            <div className="py-1">
              <div className="px-4 py-1.5 text-[10px] text-gray-600 uppercase tracking-wider">
                {searchResults.length} session{searchResults.length !== 1 ? 's' : ''} found
              </div>
              {searchResults.map((result) => (
                <div
                  key={result.session_id || result.conversation_id}
                  className="border-b border-white/[0.03] last:border-b-0"
                >
                  {/* Session header */}
                  <button
                    onClick={() => onSelect(result.session_id, undefined, result.session_title)}
                    className="w-full text-left px-4 py-2 hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="text-sm text-gray-300 truncate">
                      {result.session_title || `Session ${result.session_id.slice(0, 8)}`}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-gray-600">
                        {result.hits.length} match{result.hits.length !== 1 ? 'es' : ''}
                      </span>
                      {result.workspace_slug && (
                        <span className="text-[10px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded-full">
                          ⬡ {result.workspace_slug}
                        </span>
                      )}
                      {!result.workspace_slug && result.project_slug && (
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded-full">
                          {result.project_slug}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Message hits */}
                  {result.hits.slice(0, 3).map((hit) => (
                    <button
                      key={hit.message_id}
                      onClick={() => onSelect(result.session_id, hit.turn_index, result.session_title, { snippet: hit.content_snippet, createdAt: hit.created_at, role: hit.role })}
                      className="w-full text-left px-4 pl-7 py-1.5 hover:bg-indigo-500/[0.06] transition-colors group"
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`shrink-0 text-[9px] mt-0.5 px-1 py-0.5 rounded font-medium ${
                            hit.role === 'user'
                              ? 'bg-blue-500/10 text-blue-400'
                              : 'bg-emerald-500/10 text-emerald-400'
                          }`}
                        >
                          {hit.role === 'user' ? 'U' : 'A'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-400 line-clamp-2">
                            {hit.content_snippet}
                          </div>
                          <span className="text-[10px] text-gray-600 mt-0.5">
                            {formatTimestamp(hit.created_at)}
                          </span>
                        </div>
                        {/* Arrow indicator */}
                        <ChevronRight className="w-3 h-3 text-gray-700 group-hover:text-indigo-400 shrink-0 mt-1 transition-colors" />
                      </div>
                    </button>
                  ))}
                  {result.hits.length > 3 && (
                    <button
                      onClick={() => onSelect(result.session_id, undefined, result.session_title)}
                      className="w-full text-left px-4 pl-7 py-1 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                    >
                      +{result.hits.length - 3} more match{result.hits.length - 3 !== 1 ? 'es' : ''}...
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        ) : // Normal session list mode
        loading ? (
          <div className="flex items-center justify-center py-8 text-gray-600 text-sm">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading...
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-600 text-sm">
            <MessageCircle className="w-6 h-6 mb-2 text-gray-700" />
            No conversations yet
          </div>
        ) : (
          <div className="py-1">
            {/* Active runs section — shown when detached runs exist */}
            {activeRuns.size > 0 && (
              <div className="border-b border-white/[0.06] pb-2 mb-1">
                <div className="px-4 pt-2 pb-1.5 flex items-center gap-2">
                  <PulseIndicator variant="pending" size={6} />
                  <span className="text-[10px] font-medium text-amber-400 uppercase tracking-wider">
                    Active runs
                  </span>
                  <div className="flex-1 h-px bg-amber-400/10" />
                  <span className="text-[10px] text-amber-400/60">
                    {Array.from(activeRuns.values()).reduce((sum, info) => sum + info.runCount, 0)}
                  </span>
                </div>
                {Array.from(activeRuns.entries()).map(([parentId, info]) => {
                  const parentSession = sessions.find(s => s.id === parentId)
                  const parentTitle = parentSession?.title || `Session ${parentId.slice(0, 8)}`
                  return (
                    <button
                      key={parentId}
                      onClick={() => onSelect(parentId, undefined, parentTitle)}
                      className="w-full text-left px-4 py-1.5 hover:bg-amber-500/[0.06] transition-colors flex items-center gap-2"
                    >
                      <Play className="w-3 h-3 text-amber-400/70 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-gray-300 truncate block">{parentTitle}</span>
                        <span className="text-[10px] text-amber-400/60">
                          {info.runCount} run{info.runCount > 1 ? 's' : ''} in progress
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {groupedSessions.map(({ group, sessions: groupSessions }) => (
              <div key={group}>
                {/* Date group header */}
                <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
                  <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                    {group}
                  </span>
                  <div className="flex-1 h-px bg-white/[0.04]" />
                  <span className="text-[10px] text-gray-600">{groupSessions.length}</span>
                </div>

                {groupSessions.map(renderSessionCard)}
              </div>
            ))}

            {/* Infinite scroll sentinel + loading indicator */}
            {hasMoreSessions && (
              <div ref={sentinelRef} className="flex items-center justify-center py-3">
                {isLoadingMore ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" />
                    <span className="ml-1.5 text-[10px] text-gray-600">Loading more...</span>
                  </>
                ) : (
                  <span className="text-[10px] text-gray-700">Scroll for more</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
