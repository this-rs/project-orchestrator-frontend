import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Download, Globe } from 'lucide-react'
import { registryApi } from '@/services'
import {
  Button,
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  FilterBar,
  LoadMoreSentinel,
  RelativeTime,
  Select,
  pluralize,
} from '@/components/ui'
import { TrustBadge } from './TrustBadge'
import { tagSummary } from './metrics'
import { useInfiniteList } from '@/hooks'
import type { PublishedSkillSummary, PaginatedResponse } from '@/types'

// ── Filter options ────────────────────────────────────────────────────────

const trustOptions = [
  { value: 'all', label: 'Any trust' },
  { value: '0.8', label: 'High (80%+)' },
  { value: '0.5', label: 'Medium (50%+)' },
  { value: '0.3', label: 'Low (30%+)' },
]

// ── Main browser ──────────────────────────────────────────────────────────

interface SkillBrowserProps {
  /** Called when the user picks a skill to preview / import */
  onImport: (skill: PublishedSkillSummary) => void
}

/**
 * Shared catalog of published skills (registry). Search is server-side and
 * debounced; tapping a row opens the import preview.
 */
export function SkillBrowser({ onImport }: SkillBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [minTrust, setMinTrust] = useState<string>('all')
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 300)
  }

  const filters = useMemo(
    () => ({
      query: debouncedQuery || undefined,
      min_trust: minTrust !== 'all' ? minTrust : undefined,
    }),
    [debouncedQuery, minTrust],
  )

  const fetcher = useCallback(
    (params: {
      limit: number
      offset: number
      query?: string
      min_trust?: string
    }): Promise<PaginatedResponse<PublishedSkillSummary>> =>
      registryApi.search({
        query: params.query,
        min_trust: params.min_trust ? parseFloat(params.min_trust) : undefined,
        limit: params.limit,
        offset: params.offset,
      }),
    [],
  )

  const { items: skills, loading, loadingMore, hasMore, total, sentinelRef } = useInfiniteList({
    fetcher,
    filters,
    enabled: true,
  })

  const trustActive = minTrust !== 'all'
  const filtered = Boolean(debouncedQuery) || trustActive
  const clearAll = () => {
    clearTimeout(debounceRef.current)
    setSearchQuery('')
    setDebouncedQuery('')
    setMinTrust('all')
  }

  return (
    <div className="space-y-3">
      <FilterBar
        search={searchQuery}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search the shared catalog…"
        activeCount={trustActive ? 1 : 0}
        activeLabels={[trustActive ? trustOptions.find((o) => o.value === minTrust)?.label ?? '' : '']}
        onClear={() => setMinTrust('all')}
        filters={<Select options={trustOptions} value={minTrust} onChange={setMinTrust} />}
      />

      {!loading && skills.length > 0 && (
        <p className="px-1 text-[11px] tabular-nums text-gray-500">{pluralize(total, 'published skill')}</p>
      )}

      {loading ? (
        <EntityListSkeleton rows={4} />
      ) : skills.length === 0 ? (
        <EmptyState
          icon={<Globe className="w-8 h-8" />}
          title={filtered ? 'No matching skills' : 'No published skills yet'}
          description={
            filtered
              ? 'Try different search terms or lower the trust filter.'
              : 'No skill has been published yet. Publish skills from your projects to share them with other workspaces.'
          }
          action={
            filtered ? (
              <Button variant="secondary" size="sm" onClick={clearAll}>
                Clear
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <EntityList aria-label="Published skills">
            {skills.map((skill) => (
              <PublishedSkillRow key={skill.id} skill={skill} onImport={() => onImport(skill)} />
            ))}
          </EntityList>
          <LoadMoreSentinel sentinelRef={sentinelRef} loadingMore={loadingMore} hasMore={hasMore} />
        </>
      )}
    </div>
  )
}

// ── Published skill row ───────────────────────────────────────────────────

function PublishedSkillRow({ skill, onImport }: { skill: PublishedSkillSummary; onImport: () => void }) {
  return (
    <EntityRow
      title={skill.name}
      onClick={onImport}
      description={skill.description || undefined}
      trailing={<RelativeTime date={skill.published_at} />}
      meta={[
        <TrustBadge key="trust" trustScore={skill.trust_score} trustLevel={skill.trust_level} />,
        <span key="src" className="truncate max-w-[12rem]" title={`Source project: ${skill.source_project_name}`}>
          from {skill.source_project_name}
        </span>,
        skill.is_remote ? (
          <span key="remote" className="inline-flex items-center gap-1">
            <Globe className="w-3 h-3" aria-hidden="true" />
            Remote
          </span>
        ) : null,
        pluralize(skill.note_count, 'note'),
        skill.protocol_count > 0 ? pluralize(skill.protocol_count, 'protocol') : null,
        skill.import_count > 0 ? pluralize(skill.import_count, 'import') : null,
        tagSummary(skill.tags, 4),
      ]}
      actions={[{ label: 'Import', icon: Download, onClick: onImport }]}
    />
  )
}
