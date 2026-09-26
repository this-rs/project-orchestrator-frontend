import { useState, useCallback } from 'react'
import { Check, ChevronRight, Copy, GitCommitHorizontal } from 'lucide-react'
import { commitsApi } from '@/services'
import { EntityList, EntityRow, RelativeTime, hitArea, pluralize, rowInteractive } from '@/components/ui'
import { focusRing } from '@/components/ui/classes'
import type { Commit, CommitFile } from '@/types'

interface CommitListProps {
  commits: Commit[]
  emptyMessage?: string
}

/** Linked commits as EntityRows; tap a row to load its changed files. */
export function CommitList({ commits, emptyMessage = 'No commits' }: CommitListProps) {
  if (commits.length === 0) {
    return <p className="px-1 py-2 text-xs text-gray-500">{emptyMessage}</p>
  }

  return (
    <EntityList aria-label="Commits">
      {commits.map((commit) => (
        <CommitRow key={commit.sha} commit={commit} />
      ))}
    </EntityList>
  )
}

function CommitRow({ commit }: { commit: Commit }) {
  const [expanded, setExpanded] = useState(false)
  const [files, setFiles] = useState<CommitFile[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const short = commit.sha.slice(0, 7)

  const handleToggle = useCallback(async () => {
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

  const handleCopySha = () => {
    navigator.clipboard
      ?.writeText(commit.sha)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }

  return (
    <EntityRow
      title={commit.message || short}
      onClick={handleToggle}
      leading={
        <ChevronRight
          className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      }
      trailing={<RelativeTime date={commit.timestamp} />}
      meta={[
        <button
          key="sha"
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleCopySha()
          }}
          aria-label={copied ? `Copied ${short}` : `Copy SHA ${short}`}
          title={commit.sha}
          className={`${rowInteractive} ${hitArea} ${focusRing} inline-flex items-center gap-1 rounded font-mono text-indigo-300/90 hover:text-indigo-200`}
        >
          <GitCommitHorizontal className="w-3 h-3" aria-hidden="true" />
          {short}
          {copied ? (
            <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" />
          ) : (
            <Copy className="w-3 h-3 opacity-60" aria-hidden="true" />
          )}
        </button>,
        commit.author ? (
          <span key="author" className="truncate max-w-[12rem]">
            {commit.author}
          </span>
        ) : null,
        commit.files_changed && commit.files_changed.length > 0 ? pluralize(commit.files_changed.length, 'file') : null,
      ]}
    >
      {expanded && (
        <div className="rounded-md bg-white/[0.02] border border-white/[0.04] px-2 py-1.5">
          {loading ? (
            <p className="text-xs text-gray-500 py-1">Loading files…</p>
          ) : files && files.length > 0 ? (
            <ul className="space-y-0.5">
              {files.map((file) => (
                <li key={file.file_path} className="flex items-baseline gap-2 text-xs py-0.5 min-w-0">
                  <code className="flex-1 min-w-0 font-mono text-gray-300 break-all">{file.file_path}</code>
                  {file.additions > 0 && <span className="shrink-0 font-mono tabular-nums text-emerald-400">+{file.additions}</span>}
                  {file.deletions > 0 && <span className="shrink-0 font-mono tabular-nums text-red-400">-{file.deletions}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-500 py-1">No file details available</p>
          )}
        </div>
      )}
    </EntityRow>
  )
}
