import { useState, useCallback, useRef, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, EmptyState, Button } from '@/components/ui'
import { Search, History, GitCommitHorizontal, FileCode, ArrowRight, GitBranch } from 'lucide-react'
import { codeApi, commitsApi } from '@/services'
import { CoChangeGraph } from './CoChangeGraph'
import type { SearchResult } from '@/services/code'
import type { FileHistoryEntry, CoChanger } from '@/types'

// ── Relative time helper ────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

/** Group entries by date label */
function groupByDate(entries: FileHistoryEntry[]): Map<string, FileHistoryEntry[]> {
  const map = new Map<string, FileHistoryEntry[]>()
  for (const entry of entries) {
    const date = new Date(entry.date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    const group = map.get(date) || []
    group.push(entry)
    map.set(date, group)
  }
  return map
}

// ── Main component ──────────────────────────────────────────────────────

interface FileHistoryTabProps {
  projectSlug: string | null
  workspaceSlug?: string
}

export function FileHistoryTab({ projectSlug, workspaceSlug }: FileHistoryTabProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SearchResult[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [history, setHistory] = useState<FileHistoryEntry[]>([])
  const [coChangers, setCoChangers] = useState<CoChanger[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingCoChangers, setLoadingCoChangers] = useState(false)
  const [showGraph, setShowGraph] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Debounced search for suggestions
  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (value.length < 2) {
        setSuggestions([])
        setShowSuggestions(false)
        return
      }
      debounceRef.current = setTimeout(async () => {
        try {
          const results = await codeApi.search(value, {
            limit: 10,
            project_slug: projectSlug || undefined,
            workspace_slug: workspaceSlug,
          })
          // Deduplicate by file path
          const seen = new Set<string>()
          const unique = results.filter((r) => {
            const path = r.document?.path
            if (!path || seen.has(path)) return false
            seen.add(path)
            return true
          })
          setSuggestions(unique)
          setShowSuggestions(unique.length > 0)
        } catch {
          setSuggestions([])
        }
      }, 300)
    },
    [projectSlug, workspaceSlug],
  )

  const selectFile = useCallback(async (filePath: string) => {
    setSelectedFile(filePath)
    setQuery(filePath)
    setShowSuggestions(false)
    setSuggestions([])

    // Load history
    setLoading(true)
    try {
      const res = await commitsApi.getFileHistory(filePath, { limit: 50 })
      setHistory(res.items || [])
    } catch {
      setHistory([])
    } finally {
      setLoading(false)
    }

    // Load co-changers
    setLoadingCoChangers(true)
    try {
      const res = await commitsApi.getFileCoChangers(filePath, { limit: 20, min_count: 2 })
      setCoChangers(res.items || [])
    } catch {
      setCoChangers([])
    } finally {
      setLoadingCoChangers(false)
    }
  }, [])

  const groupedHistory = groupByDate(history)

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Search for a file path..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50"
          />
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute z-20 mt-1 w-full max-h-60 overflow-auto bg-zinc-900 border border-white/[0.1] rounded-lg shadow-xl"
          >
            {suggestions.map((s) => {
              const path = s.document?.path || ''
              return (
                <button
                  key={path}
                  onClick={() => selectFile(path)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-white/[0.06] transition-colors flex items-center gap-2"
                >
                  <FileCode className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                  <span className="font-mono text-gray-300 truncate">{path}</span>
                  {s.document?.language && (
                    <span className="text-xs text-gray-600 shrink-0">{s.document.language}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* No file selected */}
      {!selectedFile && !loading && (
        <EmptyState
          icon={<History className="w-8 h-8 text-gray-500" />}
          title="Search for a file to view its commit history"
        />
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12">
          <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <span className="text-sm text-gray-400">Loading history...</span>
        </div>
      )}

      {/* File History Timeline */}
      {selectedFile && !loading && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-gray-500" />
              <CardTitle>
                History for{' '}
                <code className="text-indigo-400 font-mono text-sm">
                  {selectedFile.split('/').pop()}
                </code>
              </CardTitle>
              <span className="text-xs text-gray-500 ml-auto">{history.length} commits</span>
            </div>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No commit history found</p>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-zinc-700" />

                {Array.from(groupedHistory.entries()).map(([date, entries]) => (
                  <div key={date} className="mb-4 last:mb-0">
                    {/* Date header */}
                    <div className="relative flex items-center gap-3 mb-2">
                      <div className="w-[23px] h-[23px] rounded-full bg-zinc-800 border-2 border-zinc-600 flex items-center justify-center z-10">
                        <div className="w-2 h-2 rounded-full bg-zinc-500" />
                      </div>
                      <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                        {date}
                      </span>
                    </div>

                    {/* Entries */}
                    {entries.map((entry) => (
                      <div
                        key={entry.commit_sha}
                        className="relative flex items-start gap-3 ml-[7px] pl-[20px] py-1.5 group"
                      >
                        {/* Timeline dot */}
                        <div className="absolute left-[0px] top-[12px] w-[9px] h-[9px] rounded-full bg-indigo-500/60 border border-indigo-400/40 z-10" />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <GitCommitHorizontal className="w-3 h-3 text-gray-600 shrink-0" />
                            <code className="text-xs text-indigo-400 font-mono shrink-0">
                              {entry.commit_sha.slice(0, 7)}
                            </code>
                            <span className="text-sm text-gray-200 truncate min-w-0">
                              {entry.message}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            {entry.author && <span>{entry.author}</span>}
                            <span>{relativeTime(entry.date)}</span>
                            <div className="flex items-center gap-1.5">
                              {entry.additions > 0 && (
                                <span className="text-green-400 font-mono">+{entry.additions}</span>
                              )}
                              {entry.deletions > 0 && (
                                <span className="text-red-400 font-mono">-{entry.deletions}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Co-Changers */}
      {selectedFile && !loadingCoChangers && coChangers.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-gray-500" />
              <CardTitle>Files often changed together</CardTitle>
              <span className="text-xs text-gray-500 ml-auto">{coChangers.length} files</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {coChangers.map((cc) => {
                const maxCount = coChangers[0]?.co_change_count || 1
                return (
                  <button
                    key={cc.file_path}
                    onClick={() => selectFile(cc.file_path)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors text-left group"
                  >
                    <FileCode className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                    <code className="text-sm text-gray-300 font-mono truncate min-w-0 flex-1 group-hover:text-indigo-400 transition-colors">
                      {cc.file_path}
                    </code>
                    <span className="text-xs text-gray-500 font-mono shrink-0 w-8 text-right">
                      ×{cc.co_change_count}
                    </span>
                    {/* Confidence bar */}
                    <div className="w-20 h-1.5 bg-white/[0.06] rounded-full overflow-hidden shrink-0">
                      <div
                        className="h-full bg-blue-500/60 rounded-full transition-all"
                        style={{ width: `${Math.min((cc.co_change_count / maxCount) * 100, 100)}%` }}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedFile && loadingCoChangers && (
        <div className="flex items-center gap-2 py-4 justify-center">
          <div className="w-3 h-3 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-xs text-gray-500">Loading co-changers...</span>
        </div>
      )}

      {/* Co-Change Graph toggle */}
      {projectSlug && (
        <div className="space-y-3">
          {!showGraph ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowGraph(true)}
            >
              <GitBranch className="w-3.5 h-3.5 mr-1.5" />
              View Project Co-Change Graph
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowGraph(false)}
              >
                Hide Graph
              </Button>
              <CoChangeGraph projectSlug={projectSlug} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
