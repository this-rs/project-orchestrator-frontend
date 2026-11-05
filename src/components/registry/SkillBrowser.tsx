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
} from '@/components/ui'
import { TrustBadge } from './TrustBadge'
import { tagSummary } from './metrics'
import { useInfiniteList } from '@/hooks'
import { useT } from '@/i18n'
import type { PublishedSkillSummary, PaginatedResponse } from '@/types'

type Translate = ReturnType<typeof useT>['t']
type Noun = 'note' | 'protocol' | 'import' | 'publishedSkill'
/** `1 note` / `2 notes`, from the `nouns` keys. */
const count = (t: Translate, n: number, noun: Noun) => t(`siteSkills.nouns.${noun}.${n === 1 ? 'one' : 'other'}`, { count: n })

// ── Filter options ────────────────────────────────────────────────────────

const trustValues = ['all', '0.8', '0.5', '0.3'] as const
const trustKeys = { all: 'any', '0.8': 'high', '0.5': 'medium', '0.3': 'low' } as const

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
  const { t } = useT()
  const trustOptions = trustValues.map((value) => ({
    value,
    label: t(`siteSkills.skillBrowser.trust.${trustKeys[value]}`),
  }))

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

  const { items: skills, loading, total, sentinelProps } = useInfiniteList({
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
        searchPlaceholder={t('siteSkills.skillBrowser.searchPlaceholder')}
        activeCount={trustActive ? 1 : 0}
        activeLabels={[trustActive ? trustOptions.find((o) => o.value === minTrust)?.label ?? '' : '']}
        onClear={() => setMinTrust('all')}
        filters={<Select options={trustOptions} value={minTrust} onChange={setMinTrust} />}
      />

      {!loading && skills.length > 0 && (
        <p className="px-1 text-[11px] tabular-nums text-gray-500">{count(t, total, 'publishedSkill')}</p>
      )}

      {loading ? (
        <EntityListSkeleton rows={4} />
      ) : skills.length === 0 ? (
        <EmptyState
          icon={<Globe className="w-8 h-8" />}
          title={filtered ? t('siteSkills.skillBrowser.noMatching') : t('siteSkills.skillBrowser.noPublished')}
          description={
            filtered ? t('siteSkills.skillBrowser.tryDifferent') : t('siteSkills.skillBrowser.noPublishedHint')
          }
          action={
            filtered ? (
              <Button variant="secondary" size="sm" onClick={clearAll}>
                {t('siteSkills.common.clear')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <EntityList aria-label={t('siteSkills.skillBrowser.listLabel')}>
            {skills.map((skill) => (
              <PublishedSkillRow key={skill.id} skill={skill} onImport={() => onImport(skill)} />
            ))}
          </EntityList>
          <LoadMoreSentinel {...sentinelProps} />
        </>
      )}
    </div>
  )
}

// ── Published skill row ───────────────────────────────────────────────────

function PublishedSkillRow({ skill, onImport }: { skill: PublishedSkillSummary; onImport: () => void }) {
  const { t } = useT()
  return (
    <EntityRow
      title={skill.name}
      onClick={onImport}
      description={skill.description || undefined}
      trailing={<RelativeTime date={skill.published_at} />}
      meta={[
        <TrustBadge key="trust" trustScore={skill.trust_score} trustLevel={skill.trust_level} />,
        <span key="src" className="truncate max-w-[12rem]" title={t('siteSkills.skillBrowser.sourceTitle', { name: skill.source_project_name })}>
          {t('siteSkills.common.from', { source: skill.source_project_name })}
        </span>,
        skill.is_remote ? (
          <span key="remote" className="inline-flex items-center gap-1">
            <Globe className="w-3 h-3" aria-hidden="true" />
            {t('siteSkills.common.remote')}
          </span>
        ) : null,
        count(t, skill.note_count, 'note'),
        skill.protocol_count > 0 ? count(t, skill.protocol_count, 'protocol') : null,
        skill.import_count > 0 ? count(t, skill.import_count, 'import') : null,
        tagSummary(skill.tags, 4),
      ]}
      actions={[{ label: t('siteSkills.common.import'), icon: Download, onClick: onImport }]}
    />
  )
}
