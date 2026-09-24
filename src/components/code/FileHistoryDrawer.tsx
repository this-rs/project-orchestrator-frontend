import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { GitBranch, History, X } from 'lucide-react'
import {
  Button,
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  ListGroup,
  RelativeTime,
  Section,
  focusRing,
  groupByRecency,
  pluralize,
} from '@/components/ui'
import { popIn } from '@/components/ui/classes'
import { commitsApi } from '@/services'
import { CoChangeGraph } from './CoChangeGraph'
import type { FileHistoryEntry, CoChanger } from '@/types'

// ── Props ────────────────────────────────────────────────────────────────

interface FileHistoryDrawerProps {
  filePath: string
  projectSlug: string | null
  workspaceSlug?: string
  onClose: () => void
  /** Navigate to another file's history (e.g. from co-changers) */
  onNavigate: (filePath: string) => void
}

/**
 * Right-hand sheet (full screen on phones) with a file's recent commits and
 * the files that usually change with it. Modal: opaque panel + dimmed backdrop.
 */
export function FileHistoryDrawer({
  filePath,
  projectSlug,
  workspaceSlug: _workspaceSlug,
  onClose,
  onNavigate,
}: FileHistoryDrawerProps) {
  const [history, setHistory] = useState<FileHistoryEntry[]>([])
  const [coChangers, setCoChangers] = useState<CoChanger[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingCoChangers, setLoadingCoChangers] = useState(true)
  const [showGraph, setShowGraph] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadingCoChangers(true)

    try {
      const res = await commitsApi.getFileHistory(filePath, { limit: 50 })
      setHistory(res.items || [])
    } catch {
      setHistory([])
    } finally {
      setLoading(false)
    }

    try {
      const res = await commitsApi.getFileCoChangers(filePath, { limit: 20, min_count: 2 })
      setCoChangers(res.items || [])
    } catch {
      setCoChangers([])
    } finally {
      setLoadingCoChangers(false)
    }
  }, [filePath])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const groups = useMemo(() => groupByRecency(history, (e) => e.date), [history])
  const fileName = filePath.split('/').pop() || filePath

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="file-history-title">
      {/* Backdrop (dimmed, not blurred) */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      <div
        className={`relative w-full max-w-xl bg-surface-base border-l border-white/[0.06] overflow-y-auto overscroll-contain shadow-2xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ${popIn}`}
      >
        <header className="sticky top-0 z-10 flex items-center gap-2 px-4 h-14 bg-surface-base border-b border-white/[0.06]">
          <History className="w-4 h-4 text-gray-500 shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <h2 id="file-history-title" className="text-sm font-semibold text-gray-100 truncate">
              {fileName}
            </h2>
            <p className="text-[11px] leading-4 text-gray-500 font-mono truncate" title={filePath}>
              {filePath}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close file history"
            className={`w-9 h-9 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-white/[0.06] shrink-0 ${focusRing}`}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </header>

        <div className="px-4 py-4 space-y-6">
          {/* ── Commits ─────────────────────────────────────────────── */}
          <Section title="Commits" count={loading ? undefined : history.length}>
            {loading ? (
              <EntityListSkeleton rows={4} />
            ) : history.length === 0 ? (
              <EmptyState size="sm" title="Aucun historique trouvé" />
            ) : (
              <div>
                {groups.map(({ group, items }) => (
                  <ListGroup key={group} title={group} count={items.length}>
                    {items.map((entry) => (
                      <EntityRow
                        key={entry.commit_sha}
                        title={entry.message}
                        trailing={<RelativeTime date={entry.date} />}
                        meta={[
                          <code key="sha" className="font-mono text-gray-400">
                            {entry.commit_sha.slice(0, 7)}
                          </code>,
                          entry.author,
                          entry.additions > 0 || entry.deletions > 0 ? (
                            <span key="diff" className="font-mono tabular-nums">
                              {entry.additions > 0 && <span className="text-emerald-400">+{entry.additions}</span>}
                              {entry.additions > 0 && entry.deletions > 0 && ' '}
                              {entry.deletions > 0 && <span className="text-red-400">−{entry.deletions}</span>}
                            </span>
                          ) : null,
                        ]}
                      />
                    ))}
                  </ListGroup>
                ))}
              </div>
            )}
          </Section>

          {/* ── Co-changers ─────────────────────────────────────────── */}
          {loadingCoChangers ? (
            <EntityListSkeleton rows={3} />
          ) : (
            coChangers.length > 0 && (
              <Section
                title="Fichiers souvent modifiés ensemble"
                count={coChangers.length}
                description="Fichiers touchés dans les mêmes commits (au moins 2 fois) — un couplage caché possible."
              >
                <EntityList aria-label="Co-changed files">
                  {coChangers.map((cc) => (
                    <EntityRow
                      key={cc.file_path}
                      title={cc.file_path.split('/').pop() || cc.file_path}
                      description={<span className="font-mono break-all">{cc.file_path}</span>}
                      onClick={() => onNavigate(cc.file_path)}
                      ariaLabel={`History of ${cc.file_path}`}
                      trailing={`×${cc.co_change_count}`}
                      meta={cc.last_at ? [<RelativeTime key="l" date={cc.last_at} prefix="last " />] : undefined}
                      chevron
                    />
                  ))}
                </EntityList>
              </Section>
            )
          )}

          {/* ── Co-change graph (on demand) ─────────────────────────── */}
          {projectSlug && (
            <div className="space-y-3">
              <Button variant="secondary" size="sm" onClick={() => setShowGraph((v) => !v)} aria-expanded={showGraph}>
                <GitBranch className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                {showGraph ? 'Masquer le graphe' : 'Graphe de co-changements'}
              </Button>
              {showGraph && (
                <div className="overflow-x-auto">
                  <CoChangeGraph projectSlug={projectSlug} />
                </div>
              )}
            </div>
          )}
          {!loading && history.length > 0 && (
            <p className="text-[11px] text-gray-600">{pluralize(history.length, 'commit')} (50 max)</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
