import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { chatSessionRefreshAtom } from '@/atoms'
import { chatApi, getEventBus, projectsApi, workspacesApi } from '@/services'
import type {
  ChatSession,
  CrudEvent,
  MessageSearchResult,
  PermissionMode,
  Project,
  Workspace,
} from '@/types'
import { Select } from '@/components/ui'

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

  // Filter state
  const [projects, setProjects] = useState<Project[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('')
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [workspaceProjects, setWorkspaceProjects] = useState<
    { id: string; slug: string }[]
  >([])

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

  // Load projects and workspaces on mount
  useEffect(() => {
    projectsApi.list({ limit: 100 }).then((data) => {
      setProjects(data.items || [])
    })
    workspacesApi.list({ limit: 100 }).then((data) => {
      setWorkspaces(data.items || [])
    })
  }, [])

  // When workspace changes, load its projects
  useEffect(() => {
    if (!selectedWorkspace) {
      setWorkspaceProjects([])
      return
    }
    workspacesApi.listProjects(selectedWorkspace).then((data) => {
      setWorkspaceProjects(
        (data.items || []).map((p) => ({ id: p.id, slug: p.slug })),
      )
    })
  }, [selectedWorkspace])

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
        const params: { limit: number; offset: number; project_slug?: string } = {
          limit: SESSION_PAGE_SIZE,
          offset: loadMore ? offsetRef.current : 0,
        }
        if (selectedProject) {
          params.project_slug = selectedProject
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
    [selectedProject],
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

  // Client-side filter by workspace (filter sessions whose project_slug is in workspace projects)
  const filteredSessions = useMemo(() => {
    if (!selectedWorkspace || workspaceProjects.length === 0) return sessions
    const slugSet = new Set(workspaceProjects.map((p) => p.slug))
    return sessions.filter(
      (s) => s.project_slug && slugSet.has(s.project_slug),
    )
  }, [sessions, selectedWorkspace, workspaceProjects])

  // Group sessions by date
  const groupedSessions = useMemo(() => groupSessionsByDate(filteredSessions), [filteredSessions])

  // Available projects for the project dropdown (scoped by workspace if selected)
  const availableProjects = useMemo(() => {
    if (!selectedWorkspace || workspaceProjects.length === 0) return projects
    const idSet = new Set(workspaceProjects.map((p) => p.id))
    return projects.filter((p) => idSet.has(p.id))
  }, [projects, selectedWorkspace, workspaceProjects])

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    await chatApi.deleteSession(sessionId)
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
  }

  const handleWorkspaceChange = (slug: string) => {
    setSelectedWorkspace(slug)
    setSelectedProject('') // Reset project filter on workspace change
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
          {/* Title + streaming indicator + mode dot */}
          <div className="flex items-center gap-1.5">
            {streamingSessions.has(session.id) && (
              <span
                className="shrink-0 w-2 h-2 rounded-full bg-emerald-400 animate-pulse"
                title="Streaming..."
              />
            )}
            <span className={`text-sm truncate ${isActive ? 'text-gray-200 font-medium' : 'text-gray-300'}`}>
              {title}
            </span>
            {session.permission_mode && (
              <span
                className={`shrink-0 w-1.5 h-1.5 rounded-full ${MODE_DOT_COLORS[session.permission_mode] ?? 'bg-gray-400'}`}
                title={session.permission_mode}
              />
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

          {/* CWD */}
          {session.cwd && (
            <div className="flex items-center gap-1 mt-0.5 min-w-0">
              <svg className="w-2.5 h-2.5 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
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

        {/* Delete button */}
        <button
          onClick={(e) => handleDelete(e, session.id)}
          className="shrink-0 p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
          title="Delete session"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
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
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
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
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Dropdown filters */}
        <Select
          value={selectedWorkspace}
          onChange={handleWorkspaceChange}
          options={[
            { value: '', label: 'All workspaces' },
            ...workspaces.map((w) => ({ value: w.slug, label: w.name })),
          ]}
          placeholder="All workspaces"
          icon={<svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>}
        />
        <Select
          value={selectedProject}
          onChange={setSelectedProject}
          options={[
            { value: '', label: 'All projects' },
            ...availableProjects.map((p) => ({ value: p.slug, label: p.name })),
          ]}
          placeholder="All projects"
          icon={<svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>}
        />
      </div>

      {/* Content area: session list or search results */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {isSearchActive ? (
          // Search results mode
          searching ? (
            <div className="flex items-center justify-center py-8 text-gray-600 text-sm">
              <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Searching...
            </div>
          ) : searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-600 text-sm">
              <svg className="w-6 h-6 mb-2 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
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
                        <svg className="w-3 h-3 text-gray-700 group-hover:text-indigo-400 shrink-0 mt-1 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
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
            <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading...
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-600 text-sm">
            <svg className="w-6 h-6 mb-2 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            No conversations yet
          </div>
        ) : (
          <div className="py-1">
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
                    <svg className="w-3.5 h-3.5 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
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
