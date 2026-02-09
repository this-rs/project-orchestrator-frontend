import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { chatApi, projectsApi, workspacesApi } from '@/services'
import type {
  ChatSession,
  MessageSearchResult,
  Project,
  Workspace,
} from '@/types'

interface SessionListProps {
  onSelect: (sessionId: string, targetMessageTurnIndex?: number) => void
  onClose: () => void
}

export function SessionList({ onSelect, onClose }: SessionListProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(true)

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

  // Fetch sessions when project filter changes
  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      const params: { limit: number; project_slug?: string } = { limit: 50 }
      if (selectedProject) {
        params.project_slug = selectedProject
      }
      const data = await chatApi.listSessions(params)
      setSessions(data.items || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [selectedProject])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
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

      {/* Search + Filters */}
      <div className="px-3 py-2 border-b border-white/[0.06] space-y-1.5">
        {/* Search input */}
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500"
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
            placeholder="Search in conversations..."
            className="w-full pl-7 pr-7 py-1 text-xs bg-white/[0.04] border border-white/[0.06] rounded text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500/40"
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Workspace filter */}
        <select
          value={selectedWorkspace}
          onChange={(e) => handleWorkspaceChange(e.target.value)}
          className="w-full px-2 py-1 text-xs bg-white/[0.04] border border-white/[0.06] rounded text-gray-300 focus:outline-none focus:border-indigo-500/40 appearance-none cursor-pointer"
        >
          <option value="">All workspaces</option>
          {workspaces.map((w) => (
            <option key={w.slug} value={w.slug}>
              {w.name}
            </option>
          ))}
        </select>

        {/* Project filter */}
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="w-full px-2 py-1 text-xs bg-white/[0.04] border border-white/[0.06] rounded text-gray-300 focus:outline-none focus:border-indigo-500/40 appearance-none cursor-pointer"
        >
          <option value="">All projects</option>
          {availableProjects.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Content area: session list or search results */}
      <div className="flex-1 overflow-y-auto">
        {isSearchActive ? (
          // Search results mode
          searching ? (
            <div className="flex items-center justify-center py-8 text-gray-600 text-sm">
              <svg
                className="w-4 h-4 mr-2 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth={4}
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Searching...
            </div>
          ) : searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-600 text-sm">
              <svg
                className="w-6 h-6 mb-2 text-gray-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              No results for &ldquo;{debouncedQuery}&rdquo;
            </div>
          ) : (
            <div className="py-1">
              <div className="px-4 py-1.5 text-[10px] text-gray-600 uppercase tracking-wider">
                {searchResults.length} session
                {searchResults.length !== 1 ? 's' : ''} found
              </div>
              {searchResults.map((result) => (
                <div
                  key={result.session_id || result.conversation_id}
                  className="border-b border-white/[0.03] last:border-b-0"
                >
                  {/* Session header */}
                  <button
                    onClick={() => onSelect(result.session_id)}
                    className="w-full text-left px-4 py-2 hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="text-sm text-gray-300 truncate">
                      {result.session_title ||
                        `Session ${result.session_id.slice(0, 8)}`}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-gray-600">
                        {result.hits.length} match
                        {result.hits.length !== 1 ? 'es' : ''}
                      </span>
                      {result.project_slug && (
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
                      onClick={() =>
                        onSelect(result.session_id, hit.turn_index)
                      }
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
                            {formatTimestamp(hit.created_at)} · turn{' '}
                            {hit.turn_index}
                          </span>
                        </div>
                        {/* Arrow indicator */}
                        <svg
                          className="w-3 h-3 text-gray-700 group-hover:text-indigo-400 shrink-0 mt-1 transition-colors"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </div>
                    </button>
                  ))}
                  {result.hits.length > 3 && (
                    <button
                      onClick={() => onSelect(result.session_id)}
                      className="w-full text-left px-4 pl-7 py-1 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                    >
                      +{result.hits.length - 3} more match
                      {result.hits.length - 3 !== 1 ? 'es' : ''}...
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        ) : // Normal session list mode
        loading ? (
          <div className="flex items-center justify-center py-8 text-gray-600 text-sm">
            Loading...
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-gray-600 text-sm">
            No sessions found
          </div>
        ) : (
          <div className="py-1">
            {filteredSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => onSelect(session.id)}
                className="w-full text-left px-4 py-2.5 hover:bg-white/[0.04] transition-colors group flex items-start gap-2"
              >
                <div className="flex-1 min-w-0">
                  {/* Title */}
                  <div className="text-sm text-gray-300 truncate">
                    {session.title ||
                      `Session ${session.id.slice(0, 8)}`}
                  </div>

                  {/* Preview */}
                  {session.preview && session.preview !== session.title && (
                    <div className="text-xs text-gray-500 truncate mt-0.5">
                      {session.preview}
                    </div>
                  )}

                  {/* Metadata row */}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-[10px] text-gray-600">
                      {formatDate(session.updated_at)}
                    </span>
                    <span className="text-[10px] text-gray-700">
                      &middot;
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {session.message_count} msgs
                    </span>
                    {session.model && (
                      <>
                        <span className="text-[10px] text-gray-700">
                          &middot;
                        </span>
                        <span className="text-[10px] text-gray-600">
                          {session.model}
                        </span>
                      </>
                    )}
                    {formatCost(session.total_cost_usd) && (
                      <>
                        <span className="text-[10px] text-gray-700">
                          &middot;
                        </span>
                        <span className="text-[10px] text-gray-600">
                          {formatCost(session.total_cost_usd)}
                        </span>
                      </>
                    )}
                    {session.project_slug && (
                      <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded-full ml-auto">
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
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
