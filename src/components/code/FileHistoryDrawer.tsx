import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui'
import { MetricTooltip } from '@/components/ui'
import {
  X,
  History,
  GitCommitHorizontal,
  FileCode,
  ArrowRight,
  GitBranch,
} from 'lucide-react'
import { commitsApi } from '@/services'
import { CoChangeGraph } from './CoChangeGraph'
import type { FileHistoryEntry, CoChanger } from '@/types'

// ── Relative time helper ────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'à l\u2019instant'
  if (mins < 60) return `il y a ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `il y a ${days}j`
  return new Date(dateStr).toLocaleDateString()
}

/** Group entries by date label */
function groupByDate(entries: FileHistoryEntry[]): Map<string, FileHistoryEntry[]> {
  const map = new Map<string, FileHistoryEntry[]>()
  for (const entry of entries) {
    const date = new Date(entry.date).toLocaleDateString('fr-FR', {
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

// ── Props ────────────────────────────────────────────────────────────────

interface FileHistoryDrawerProps {
  filePath: string
  projectSlug: string | null
  workspaceSlug?: string
  onClose: () => void
  /** Navigate to another file's history (e.g. from co-changers) */
  onNavigate: (filePath: string) => void
}

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

  const groupedHistory = groupByDate(history)
  const fileName = filePath.split('/').pop() || filePath

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-xl bg-zinc-900 border-l border-white/[0.08] overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 bg-zinc-900/95 backdrop-blur border-b border-white/[0.08]">
          <div className="flex items-center gap-2 min-w-0">
            <History className="w-4 h-4 text-indigo-400 shrink-0" />
            <h2 className="text-sm font-semibold text-gray-100 truncate">
              Historique de{' '}
              <code className="text-indigo-400 font-mono">{fileName}</code>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/[0.08] text-gray-400 hover:text-gray-200 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Full path */}
          <div className="flex items-center gap-2">
            <FileCode className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <span className="font-mono text-xs text-gray-400 truncate">{filePath}</span>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12">
              <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              <span className="text-sm text-gray-400">Chargement...</span>
            </div>
          )}

          {/* History timeline */}
          {!loading && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>Commits</CardTitle>
                  <span className="text-xs text-gray-500 ml-auto">{history.length} commits</span>
                </div>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center">
                    Aucun historique trouvé
                  </p>
                ) : (
                  <div className="relative">
                    <div className="absolute left-[11px] top-2 bottom-2 w-px bg-zinc-700" />

                    {Array.from(groupedHistory.entries()).map(([date, entries]) => (
                      <div key={date} className="mb-4 last:mb-0">
                        <div className="relative flex items-center gap-3 mb-2">
                          <div className="w-[23px] h-[23px] rounded-full bg-zinc-800 border-2 border-zinc-600 flex items-center justify-center z-10">
                            <div className="w-2 h-2 rounded-full bg-zinc-500" />
                          </div>
                          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                            {date}
                          </span>
                        </div>

                        {entries.map((entry) => (
                          <div
                            key={entry.commit_sha}
                            className="relative flex items-start gap-3 ml-[7px] pl-[20px] py-1.5 group"
                          >
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
                                    <span className="text-green-400 font-mono">
                                      +{entry.additions}
                                    </span>
                                  )}
                                  {entry.deletions > 0 && (
                                    <span className="text-red-400 font-mono">
                                      -{entry.deletions}
                                    </span>
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
          {!loadingCoChangers && coChangers.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-gray-500" />
                  <MetricTooltip term="co_change" showIndicator>
                    <CardTitle>Fichiers souvent modifiés ensemble</CardTitle>
                  </MetricTooltip>
                  <span className="text-xs text-gray-500 ml-auto">
                    {coChangers.length} fichiers
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {coChangers.map((cc) => {
                    const maxCount = coChangers[0]?.co_change_count || 1
                    return (
                      <button
                        key={cc.file_path}
                        onClick={() => onNavigate(cc.file_path)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors text-left group"
                      >
                        <FileCode className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                        <code className="text-sm text-gray-300 font-mono truncate min-w-0 flex-1 group-hover:text-indigo-400 transition-colors">
                          {cc.file_path}
                        </code>
                        <span className="text-xs text-gray-500 font-mono shrink-0 w-8 text-right">
                          ×{cc.co_change_count}
                        </span>
                        <div className="w-20 h-1.5 bg-white/[0.06] rounded-full overflow-hidden shrink-0">
                          <div
                            className="h-full bg-blue-500/60 rounded-full transition-all"
                            style={{
                              width: `${Math.min((cc.co_change_count / maxCount) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {loadingCoChangers && (
            <div className="flex items-center gap-2 py-4 justify-center">
              <div className="w-3 h-3 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-xs text-gray-500">Chargement des co-changements...</span>
            </div>
          )}

          {/* Co-Change Graph toggle */}
          {projectSlug && (
            <div className="space-y-3">
              {!showGraph ? (
                <Button variant="secondary" size="sm" onClick={() => setShowGraph(true)}>
                  <GitBranch className="w-3.5 h-3.5 mr-1.5" />
                  Graphe de co-changements
                </Button>
              ) : (
                <>
                  <Button variant="secondary" size="sm" onClick={() => setShowGraph(false)}>
                    Masquer le graphe
                  </Button>
                  <CoChangeGraph projectSlug={projectSlug} />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
