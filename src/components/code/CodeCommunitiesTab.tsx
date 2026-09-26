import { useState, useEffect, useCallback } from 'react'
import { FileText, Hash, Sparkles } from 'lucide-react'
import {
  Button,
  Dialog,
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  Facts,
  Section,
  SkeletonLine,
  StatusText,
  focusRing,
  pluralize,
  Meter,
} from '@/components/ui'
import { pressFeedback } from '@/components/ui/classes'
import { useToast } from '@/hooks'
import { codeApi } from '@/services'
import type { CodeCommunity, NodeImportance } from '@/types'

interface CodeCommunitiesTabProps {
  projectSlug: string | null
}

const MEMBER_PREVIEW = 40

const isFilePath = (member: string) => member.includes('/') || member.includes('.')

function shortName(member: string): string {
  if (!isFilePath(member)) return member
  const parts = member.split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : member
}

const communityName = (c: CodeCommunity, idx: number) => (c.enriched_by ? c.label : `Community #${idx + 1}`)

// ── Member chip ─────────────────────────────────────────────────────────

function MemberChip({ member, onClick }: { member: string; onClick: () => void }) {
  const Icon = isFilePath(member) ? FileText : Hash
  return (
    <button
      type="button"
      onClick={onClick}
      title={member}
      aria-label={`Importance of ${member}`}
      className={`inline-flex items-center gap-1 h-9 px-2.5 rounded-lg border border-white/[0.08] text-[11px] font-mono text-gray-300 hover:text-gray-100 hover:border-white/[0.16] max-w-full ${pressFeedback} ${focusRing}`}
    >
      <Icon className="w-3 h-3 shrink-0 text-gray-500" aria-hidden="true" />
      <span className="truncate">{shortName(member)}</span>
    </button>
  )
}

// ── Node importance (dialog content) ────────────────────────────────────

function NodeImportanceContent({ member, projectSlug }: { member: string; projectSlug: string }) {
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
      <div className="space-y-2" role="status" aria-label="Loading">
        <SkeletonLine width="40%" />
        <SkeletonLine />
        <SkeletonLine width="70%" />
      </div>
    )
  }
  if (error) return <p className="text-sm text-gray-500">Could not load the importance data.</p>
  if (!data) return null

  const m = data.metrics
  const f = data.fabric_metrics

  return (
    <div className="space-y-3">
      <p className="font-mono text-xs text-gray-400 break-all">{member}</p>
      {data.risk_level && <StatusText status={data.risk_level} label={`${data.risk_level} risk`} />}
      {data.summary && <p className="text-sm text-gray-300 leading-relaxed">{data.summary}</p>}
      {data.message && !data.summary && <p className="text-xs text-gray-500">{data.message}</p>}
      <Facts
        items={[
          { label: 'PageRank', value: m.pagerank != null ? m.pagerank.toFixed(4) : null },
          { label: 'Betweenness', value: m.betweenness != null ? m.betweenness.toFixed(4) : null },
          { label: 'In-degree', value: m.in_degree },
          { label: 'Out-degree', value: m.out_degree },
          { label: 'Clustering', value: m.clustering_coefficient != null ? m.clustering_coefficient.toFixed(4) : null },
          { label: 'Fabric PageRank', value: f?.fabric_pagerank != null ? f.fabric_pagerank.toFixed(4) : null },
          { label: 'Fabric betweenness', value: f?.fabric_betweenness != null ? f.fabric_betweenness.toFixed(4) : null },
          { label: 'Community', value: f?.fabric_community_label ?? null },
        ]}
      />
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────

export function CodeCommunitiesTab({ projectSlug }: CodeCommunitiesTabProps) {
  const toast = useToast()
  const [communities, setCommunities] = useState<CodeCommunity[]>([])
  const [totalFiles, setTotalFiles] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enriching, setEnriching] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState<Set<string>>(new Set())
  const [selectedMember, setSelectedMember] = useState<string | null>(null)

  const loadCommunities = useCallback(async () => {
    if (!projectSlug) return
    setLoading(true)
    setError(null)
    try {
      const data = await codeApi.getCommunities({ project_slug: projectSlug, min_size: 3 })
      setCommunities(data.communities)
      setTotalFiles(data.total_files)
    } catch {
      setError('Could not load the communities.')
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
      toast.success('Community labels enriched')
    } catch {
      toast.error('Could not enrich the labels')
    } finally {
      setEnriching(false)
    }
  }

  if (!projectSlug) {
    return (
      <EmptyState
        title="Select a project"
        description="Community analysis works on one project at a time — pick one in the filter above."
      />
    )
  }
  if (loading && communities.length === 0) return <EntityListSkeleton rows={4} />
  if (error) return <ErrorState title="Communities unavailable" description={error} onRetry={loadCommunities} />
  if (communities.length === 0) {
    return (
      <EmptyState
        title="No communities detected"
        description="Sync the project first: communities are detected on the coupling graph (Louvain)."
      />
    )
  }

  return (
    <>
      <Section
        title="Communities"
        count={communities.length}
        description={`Clusters of tightly coupled files and functions across ${pluralize(totalFiles, 'file')}. Open one to inspect its members.`}
        action={
          <Button variant="ghost" size="sm" onClick={handleEnrich} loading={enriching}>
            <Sparkles className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
            Enrich labels
          </Button>
        }
      >
        <EntityList aria-label="Communities">
          {communities.map((community, idx) => {
            const name = communityName(community, idx)
            const open = openId === community.id
            const members = community.members ?? community.key_files
            const visible = showAll.has(community.id) ? members : members.slice(0, MEMBER_PREVIEW)
            return (
              <EntityRow
                key={community.id}
                title={name}
                onClick={() => setOpenId(open ? null : community.id)}
                selected={open}
                chevron
                trailing={pluralize(community.size, 'member')}
                meta={[
                  community.cohesion != null ? (
                    <Meter key="c" size="inline" value={community.cohesion} display={`cohesion ${(community.cohesion * 100).toFixed(0)}%`} />
                  ) : null,
                  community.key_files.length ? pluralize(community.key_files.length, 'key file') : null,
                ]}
              >
                {open && (
                  <div className="flex flex-wrap gap-1.5">
                    {visible.map((member) => (
                      <MemberChip key={member} member={member} onClick={() => setSelectedMember(member)} />
                    ))}
                    {members.length > visible.length && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAll((prev) => new Set(prev).add(community.id))}
                      >
                        +{members.length - visible.length} more
                      </Button>
                    )}
                  </div>
                )}
              </EntityRow>
            )
          })}
        </EntityList>
      </Section>

      <Dialog open={!!selectedMember} onClose={() => setSelectedMember(null)} title={selectedMember ? shortName(selectedMember) : ''}>
        {selectedMember && <NodeImportanceContent member={selectedMember} projectSlug={projectSlug} />}
      </Dialog>
    </>
  )
}
