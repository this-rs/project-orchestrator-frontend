import { useState, useCallback } from 'react'
import { GitCommitHorizontal, ChevronRight, Copy, Check } from 'lucide-react'
import { commitsApi } from '@/services'
import type { Commit, CommitFile } from '@/types'

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

// ── Main CommitList component ───────────────────────────────────────────

interface CommitListProps {
  commits: Commit[]
  emptyMessage?: string
}

export function CommitList({ commits, emptyMessage = 'No commits' }: CommitListProps) {
  if (commits.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4 text-center">{emptyMessage}</p>
    )
  }

  return (
    <div className="space-y-1.5">
      {commits.map((commit) => (
        <CommitRow key={commit.sha} commit={commit} />
      ))}
    </div>
  )
}

// ── Single commit row with expand ───────────────────────────────────────

function CommitRow({ commit }: { commit: Commit }) {
  const [expanded, setExpanded] = useState(false)
  const [files, setFiles] = useState<CommitFile[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleExpand = useCallback(async () => {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (files) return // already loaded
    setLoading(true)
    try {
      const res = await commitsApi.getCommitFiles(commit.sha)
      setFiles(res.items || [])
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [expanded, files, commit.sha])

  const handleCopySha = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(commit.sha).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Header row */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleExpand}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleExpand() }}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
      >
        <ChevronRight
          className={`w-3.5 h-3.5 text-gray-600 transition-transform duration-150 shrink-0 ${expanded ? 'rotate-90' : ''}`}
        />
        <GitCommitHorizontal className="w-3.5 h-3.5 text-gray-500 shrink-0" />

        {/* SHA */}
        <button
          onClick={handleCopySha}
          className="font-mono text-xs text-indigo-400 hover:text-indigo-300 shrink-0 flex items-center gap-1 transition-colors"
          title="Copy full SHA"
        >
          {commit.sha.slice(0, 7)}
          {copied ? (
            <Check className="w-3 h-3 text-green-400" />
          ) : (
            <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100" />
          )}
        </button>

        {/* Message */}
        <span className="text-sm text-gray-200 truncate min-w-0 flex-1">
          {commit.message}
        </span>

        {/* Author + time */}
        <span className="text-xs text-gray-500 shrink-0 hidden sm:inline">
          {commit.author && `${commit.author} · `}
          {relativeTime(commit.timestamp)}
        </span>
      </div>

      {/* Expanded: file list */}
      {expanded && (
        <div className="border-t border-white/[0.06] px-3 py-2 bg-white/[0.01]">
          {loading ? (
            <div className="flex items-center gap-2 py-2">
              <div className="w-3 h-3 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              <span className="text-xs text-gray-500">Loading files...</span>
            </div>
          ) : files && files.length > 0 ? (
            <div className="space-y-1">
              {files.map((file) => (
                <div
                  key={file.file_path}
                  className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-white/[0.04]"
                >
                  <code className="text-gray-300 font-mono truncate min-w-0 flex-1">
                    {file.file_path}
                  </code>
                  {file.additions > 0 && (
                    <span className="text-green-400 font-mono shrink-0">
                      +{file.additions}
                    </span>
                  )}
                  {file.deletions > 0 && (
                    <span className="text-red-400 font-mono shrink-0">
                      -{file.deletions}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 py-1">No file details available</p>
          )}
        </div>
      )}
    </div>
  )
}
