import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, Button, Dialog, EmptyState, ErrorState } from '@/components/ui'
import { FileText, Code, Sparkles, Loader2 } from 'lucide-react'
import { codeApi } from '@/services'
import type { CodeCommunity, NodeImportance } from '@/types'

interface CodeCommunitiesTabProps {
  projectSlug: string | null
}

// ── Color palette for communities ───────────────────────────────────────

const COMMUNITY_COLORS = [
  { bg: 'bg-indigo-500/20', border: 'border-indigo-500/30', text: 'text-indigo-400', pill: 'bg-indigo-500/15 text-indigo-300' },
  { bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', text: 'text-emerald-400', pill: 'bg-emerald-500/15 text-emerald-300' },
  { bg: 'bg-amber-500/20', border: 'border-amber-500/30', text: 'text-amber-400', pill: 'bg-amber-500/15 text-amber-300' },
  { bg: 'bg-purple-500/20', border: 'border-purple-500/30', text: 'text-purple-400', pill: 'bg-purple-500/15 text-purple-300' },
  { bg: 'bg-rose-500/20', border: 'border-rose-500/30', text: 'text-rose-400', pill: 'bg-rose-500/15 text-rose-300' },
  { bg: 'bg-cyan-500/20', border: 'border-cyan-500/30', text: 'text-cyan-400', pill: 'bg-cyan-500/15 text-cyan-300' },
  { bg: 'bg-orange-500/20', border: 'border-orange-500/30', text: 'text-orange-400', pill: 'bg-orange-500/15 text-orange-300' },
  { bg: 'bg-teal-500/20', border: 'border-teal-500/30', text: 'text-teal-400', pill: 'bg-teal-500/15 text-teal-300' },
  { bg: 'bg-pink-500/20', border: 'border-pink-500/30', text: 'text-pink-400', pill: 'bg-pink-500/15 text-pink-300' },
  { bg: 'bg-sky-500/20', border: 'border-sky-500/30', text: 'text-sky-400', pill: 'bg-sky-500/15 text-sky-300' },
]

function getColor(index: number) {
  return COMMUNITY_COLORS[index % COMMUNITY_COLORS.length]
}

// ── Helpers ──────────────────────────────────────────────────────────────

function isFilePath(member: string): boolean {
  return member.includes('/') || member.includes('.')
}

function shortName(member: string): string {
  if (isFilePath(member)) {
    const parts = member.split('/')
    return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : member
  }
  return member
}

// ── Risk badge styles ────────────────────────────────────────────────────

const RISK_BADGE_STYLES: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400',
  high: 'bg-orange-500/20 text-orange-400',
  medium: 'bg-amber-500/20 text-amber-400',
  low: 'bg-emerald-500/20 text-emerald-400',
}

// ── Node Importance Dialog Content ───────────────────────────────────────

function NodeImportanceContent({
  member,
  projectSlug,
}: {
  member: string
  projectSlug: string
}) {
  const [data, setData] = useState<NodeImportance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(false)
      try {
        const result = await codeApi.getNodeImportance({
          project_slug: projectSlug,
          node_path: member,
          node_type: isFilePath(member) ? 'File' : 'Function',
        })
        if (!cancelled) setData(result)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [member, projectSlug])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-gray-500">Could not load importance data.</p>
  }

  if (!data) return null

  return (
    <div className="space-y-3">
      {/* Risk level + summary */}
      {data.risk_level && (
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${RISK_BADGE_STYLES[data.risk_level]}`}
          >
            {data.risk_level}
          </span>
        </div>
      )}
      {data.summary && <p className="text-xs text-gray-400 leading-relaxed">{data.summary}</p>}
      {data.message && !data.summary && (
        <p className="text-xs text-gray-500 italic">{data.message}</p>
      )}

      {/* Core metrics */}
      <div className="grid grid-cols-2 gap-3">
        {data.metrics.pagerank != null && (
          <MetricItem label="PageRank" value={data.metrics.pagerank.toFixed(4)} />
        )}
        {data.metrics.betweenness != null && (
          <MetricItem label="Betweenness" value={data.metrics.betweenness.toFixed(4)} />
        )}
        <MetricItem label="In-degree" value={String(data.metrics.in_degree)} />
        <MetricItem label="Out-degree" value={String(data.metrics.out_degree)} />
        {data.metrics.clustering_coefficient != null && (
          <MetricItem label="Clustering" value={data.metrics.clustering_coefficient.toFixed(4)} />
        )}
      </div>

      {/* Fabric metrics (when available) */}
      {data.fabric_metrics &&
        (data.fabric_metrics.fabric_pagerank != null ||
          data.fabric_metrics.fabric_community_label) && (
          <div>
            <div className="text-xs text-gray-500 mb-2">Fabric</div>
            <div className="grid grid-cols-2 gap-3">
              {data.fabric_metrics.fabric_pagerank != null && (
                <MetricItem
                  label="Fabric PR"
                  value={data.fabric_metrics.fabric_pagerank.toFixed(4)}
                />
              )}
              {data.fabric_metrics.fabric_betweenness != null && (
                <MetricItem
                  label="Fabric Btw"
                  value={data.fabric_metrics.fabric_betweenness.toFixed(4)}
                />
              )}
              {data.fabric_metrics.fabric_community_label && (
                <MetricItem
                  label="Community"
                  value={data.fabric_metrics.fabric_community_label}
                />
              )}
            </div>
          </div>
        )}
    </div>
  )
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 bg-white/[0.04] rounded">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-mono text-gray-200 tabular-nums">{value}</div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────

export function CodeCommunitiesTab({ projectSlug }: CodeCommunitiesTabProps) {
  const [communities, setCommunities] = useState<CodeCommunity[]>([])
  const [totalFiles, setTotalFiles] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enriching, setEnriching] = useState(false)
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null)
  const [selectedMember, setSelectedMember] = useState<string | null>(null)

  const loadCommunities = useCallback(async () => {
    if (!projectSlug) return
    setLoading(true)
    setError(null)
    try {
      const data = await codeApi.getCommunities({ project_slug: projectSlug, min_size: 3 })
      setCommunities(data.communities)
      setTotalFiles(data.total_files)
    } catch (err) {
      console.error('Failed to load communities:', err)
      setError('Failed to load community data.')
    } finally {
      setLoading(false)
    }
  }, [projectSlug])

  useEffect(() => {
    loadCommunities()
  }, [loadCommunities])

  const handleEnrich = async () => {
    if (!projectSlug) return
    setEnriching(true)
    try {
      await codeApi.enrichCommunities({ project_slug: projectSlug })
      await loadCommunities()
    } catch (err) {
      console.error('Failed to enrich communities:', err)
    } finally {
      setEnriching(false)
    }
  }

  if (!projectSlug) {
    return (
      <EmptyState
        title="Select a project"
        description="Community analysis requires a specific project. Please select one from the filter above."
      />
    )
  }

  if (loading && communities.length === 0) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-40 bg-white/[0.04] rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return <ErrorState title="Communities failed" description={error} onRetry={loadCommunities} />
  }

  if (communities.length === 0) {
    return (
      <EmptyState
        title="No communities detected"
        description="Run a project sync first to detect code communities via the Louvain algorithm."
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Clusters of files and functions that are tightly coupled, detected via Louvain community
        analysis on the multi-layer knowledge fabric. Click a member to inspect its importance
        metrics.
      </p>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">
          {communities.length} communities across {totalFiles} files
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleEnrich}
          loading={enriching}
        >
          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          Enrich Labels
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Community list */}
        <div className="lg:col-span-1 space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
          {communities.map((community, idx) => {
            const color = getColor(idx)
            const isSelected = selectedCommunity === community.id
            return (
              <button
                key={community.id}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  isSelected
                    ? `${color.bg} ${color.border} border`
                    : 'bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.06]'
                }`}
                onClick={() => setSelectedCommunity(isSelected ? null : community.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-medium ${isSelected ? color.text : 'text-gray-200'}`}>
                    {community.enriched_by ? community.label : `Community #${idx + 1}`}
                  </span>
                  <span className="px-2 py-0.5 bg-white/[0.08] rounded-full text-xs text-gray-400">
                    {community.size}
                  </span>
                </div>

                {/* Cohesion bar */}
                {community.cohesion != null && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-gray-500">Cohesion</span>
                    <div className="flex-1 h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${color.bg.replace('/20', '/60')}`}
                        style={{ width: `${Math.min(community.cohesion * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 tabular-nums">
                      {(community.cohesion * 100).toFixed(0)}%
                    </span>
                  </div>
                )}

                {/* Key files preview */}
                {community.key_files.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {community.key_files.slice(0, 3).map((f) => (
                      <span key={f} className="px-1.5 py-0.5 bg-white/[0.06] rounded text-xs text-gray-400 font-mono truncate max-w-[140px]">
                        {shortName(f)}
                      </span>
                    ))}
                    {community.key_files.length > 3 && (
                      <span className="text-xs text-gray-500">+{community.key_files.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Right: Visual grid */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent>
              {!selectedCommunity ? (
                <div className="space-y-4">
                  {/* Overview: all communities as colored groups */}
                  {communities.map((community, idx) => {
                    const color = getColor(idx)
                    return (
                      <div key={community.id}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-3 h-3 rounded-sm ${color.bg.replace('/20', '/60')}`} />
                          <span className={`text-xs font-medium ${color.text}`}>
                            {community.enriched_by ? community.label : `Community #${idx + 1}`}
                          </span>
                          <span className="text-xs text-gray-500">({community.size} members)</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {(community.members || community.key_files).slice(0, 15).map((member) => (
                            <button
                              key={member}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${color.pill} hover:brightness-125 transition-all`}
                              onClick={() => setSelectedMember(member)}
                              title={member}
                            >
                              {isFilePath(member) ? (
                                <FileText className="w-3 h-3 shrink-0" />
                              ) : (
                                <Code className="w-3 h-3 shrink-0" />
                              )}
                              <span className="truncate max-w-[160px]">{shortName(member)}</span>
                            </button>
                          ))}
                          {(community.members || community.key_files).length > 15 && (
                            <span className="text-xs text-gray-500 self-center">
                              +{(community.members || community.key_files).length - 15} more
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                // Focused community view
                (() => {
                  const idx = communities.findIndex((c) => c.id === selectedCommunity)
                  const community = communities[idx]
                  if (!community) return null
                  const color = getColor(idx)
                  const members = community.members || community.key_files

                  return (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className={`text-lg font-semibold ${color.text}`}>
                          {community.enriched_by ? community.label : `Community #${idx + 1}`}
                        </h3>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setSelectedCommunity(null)}
                        >
                          Show All
                        </Button>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {members.map((member) => (
                          <button
                            key={member}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono ${color.pill} hover:brightness-125 transition-all`}
                            onClick={() => setSelectedMember(member)}
                            title={member}
                          >
                            {isFilePath(member) ? (
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <Code className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span className="truncate max-w-[200px]">{shortName(member)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Node Importance Dialog */}
      <Dialog
        open={!!selectedMember}
        onClose={() => setSelectedMember(null)}
        title={selectedMember ? shortName(selectedMember) : ''}
      >
        {selectedMember && projectSlug && (
          <NodeImportanceContent member={selectedMember} projectSlug={projectSlug} />
        )}
      </Dialog>
    </div>
  )
}
