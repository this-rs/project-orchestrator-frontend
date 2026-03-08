import { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Search, Globe, Download, Tag, SlidersHorizontal } from 'lucide-react'
import { registryApi } from '@/services'
import {
  Card,
  CardContent,
  Badge,
  Button,
  Input,
  Select,
  SkeletonCard,
  LoadMoreSentinel,
} from '@/components/ui'
import { TrustBadge } from './TrustBadge'
import { useInfiniteList } from '@/hooks'
import { fadeInUp, staggerContainer, useReducedMotion } from '@/utils/motion'
import type { PublishedSkillSummary, PaginatedResponse } from '@/types'

// ── Filter options ────────────────────────────────────────────────────────

const trustOptions = [
  { value: 'all', label: 'Any Trust' },
  { value: '0.8', label: 'High (80%+)' },
  { value: '0.5', label: 'Medium (50%+)' },
  { value: '0.3', label: 'Low (30%+)' },
]

// ── Relative time ─────────────────────────────────────────────────────────

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

// ── Main browser ──────────────────────────────────────────────────────────

interface SkillBrowserProps {
  /** Called when user clicks "Import" on a skill */
  onImport: (skill: PublishedSkillSummary) => void
}

export function SkillBrowser({ onImport }: SkillBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [minTrust, setMinTrust] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)
  const reducedMotion = useReducedMotion()

  // Debounced search
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (debounceTimer) clearTimeout(debounceTimer)
    const timer = setTimeout(() => setDebouncedQuery(value), 300)
    setDebounceTimer(timer)
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
    }): Promise<PaginatedResponse<PublishedSkillSummary>> => {
      return registryApi.search({
        query: params.query,
        min_trust: params.min_trust ? parseFloat(params.min_trust) : undefined,
        limit: params.limit,
        offset: params.offset,
      })
    },
    [],
  )

  const {
    items: skills,
    loading,
    loadingMore,
    hasMore,
    total,
    sentinelRef,
  } = useInfiniteList({ fetcher, filters, enabled: true })

  return (
    <div>
      {/* Search bar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search published skills..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="secondary"
          onClick={() => setShowFilters(!showFilters)}
          className={showFilters ? 'ring-1 ring-indigo-500/50' : ''}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </Button>
      </div>

      {/* Filter bar (collapsible) */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            className="overflow-hidden mb-4"
          >
            <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <Select
                options={trustOptions}
                value={minTrust}
                onChange={setMinTrust}
                className="w-40"
              />
              {total > 0 && (
                <span className="text-xs text-gray-500 ml-auto">
                  {total} skill{total !== 1 ? 's' : ''} found
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      ) : skills.length === 0 ? (
        <RegistryEmptyState hasQuery={!!debouncedQuery} />
      ) : (
        <>
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
            variants={reducedMotion ? undefined : staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <AnimatePresence mode="popLayout">
              {skills.map((skill) => (
                <motion.div key={skill.id} variants={fadeInUp} exit="exit" layout={!reducedMotion}>
                  <PublishedSkillCard skill={skill} onImport={() => onImport(skill)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
          <LoadMoreSentinel sentinelRef={sentinelRef} loadingMore={loadingMore} hasMore={hasMore} />
        </>
      )}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────

function RegistryEmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-white/[0.06] rounded-2xl">
      <div className="w-16 h-16 rounded-full bg-white/[0.03] flex items-center justify-center text-gray-500 mb-4">
        <Globe className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-medium text-gray-200 mb-1">
        {hasQuery ? 'No matching skills' : 'Registry is empty'}
      </h3>
      <p className="text-sm text-gray-400 max-w-sm">
        {hasQuery
          ? 'Try different search terms or adjust the trust filter.'
          : 'No skills have been published to the registry yet. Publish skills from your projects to share them.'}
      </p>
    </div>
  )
}

// ── Published Skill Card ──────────────────────────────────────────────────

interface PublishedSkillCardProps {
  skill: PublishedSkillSummary
  onImport: () => void
}

function PublishedSkillCard({ skill, onImport }: PublishedSkillCardProps) {
  return (
    <Card className="group relative">
      <CardContent>
        {/* Header: name + trust badge */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-gray-100 truncate">{skill.name}</h3>
            {skill.description && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{skill.description}</p>
            )}
          </div>
          <TrustBadge trustScore={skill.trust_score} trustLevel={skill.trust_level} />
        </div>

        {/* Source + remote indicator */}
        <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
          <span className="truncate">from {skill.source_project_name}</span>
          {skill.is_remote && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 ring-1 ring-inset ring-blue-500/20 text-[10px] font-medium shrink-0">
              <Globe className="w-2.5 h-2.5" />
              Remote
            </span>
          )}
        </div>

        {/* Tags */}
        {skill.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {skill.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="default">
                <Tag className="w-2.5 h-2.5 mr-0.5" />
                {tag}
              </Badge>
            ))}
            {skill.tags.length > 4 && (
              <span className="text-xs text-gray-500">+{skill.tags.length - 4}</span>
            )}
          </div>
        )}

        {/* Footer: metrics + import button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>{skill.note_count} note{skill.note_count !== 1 ? 's' : ''}</span>
            {skill.protocol_count > 0 && (
              <span>{skill.protocol_count} protocol{skill.protocol_count !== 1 ? 's' : ''}</span>
            )}
            {skill.import_count > 0 && (
              <span>{skill.import_count} import{skill.import_count !== 1 ? 's' : ''}</span>
            )}
            <span className="ml-auto">{relativeTime(skill.published_at)}</span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onImport()
            }}
            className="ml-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            Import
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
