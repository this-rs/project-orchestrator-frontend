/**
 * ProtocolRanking — Ranked list of protocols by context affinity score.
 *
 * Shows each protocol with its overall score bar and mini dimension bars.
 * Fetches routing data from the backend and displays results sorted by
 * descending affinity.
 */
import { memo, useEffect, useState, useCallback } from 'react'
import { intelligenceApi } from '@/services/intelligence'
import type { RouteResponse, RouteResult } from '@/types/intelligence'
import {
  Workflow,
  ChevronDown,
  ChevronUp,
  Loader2,
  Target,
} from 'lucide-react'

// ============================================================================
// Dimension colors & labels
// ============================================================================

const DIMENSION_CONFIG: Record<string, { label: string; color: string }> = {
  phase: { label: 'Phase', color: '#818cf8' },      // indigo
  structure: { label: 'Struct', color: '#34d399' },  // emerald
  domain: { label: 'Domain', color: '#fb923c' },     // orange
  resource: { label: 'Rsrc', color: '#38bdf8' },     // sky
  lifecycle: { label: 'Life', color: '#f472b6' },    // pink
}

// ============================================================================
// Score bar helpers
// ============================================================================

function scoreColor(score: number): string {
  if (score >= 0.7) return '#22c55e'   // green
  if (score >= 0.4) return '#f59e0b'   // amber
  return '#ef4444'                     // red
}

function ScoreBar({ score, color, className }: { score: number; color: string; className?: string }) {
  return (
    <div className={`h-1.5 rounded-full bg-slate-800 overflow-hidden ${className ?? ''}`}>
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${Math.round(score * 100)}%`, backgroundColor: color }}
      />
    </div>
  )
}

// ============================================================================
// Single protocol result row
// ============================================================================

interface ProtocolRowProps {
  result: RouteResult
  rank: number
}

function ProtocolRow({ result, rank }: ProtocolRowProps) {
  const [expanded, setExpanded] = useState(false)
  const score = result.affinity.score
  const color = scoreColor(score)

  return (
    <div className="bg-slate-800/40 rounded-md border border-slate-700/50 overflow-hidden">
      {/* Header row */}
      <button
        className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-slate-800/60 transition-colors text-left"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Rank */}
        <span className="text-[10px] font-mono text-slate-600 w-4 text-right shrink-0">
          #{rank}
        </span>

        {/* Icon */}
        <Workflow size={12} className="text-orange-400 shrink-0" />

        {/* Name */}
        <span className="text-xs text-slate-200 font-medium truncate flex-1 min-w-0">
          {result.protocol_name}
        </span>

        {/* Category badge */}
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 shrink-0">
          {result.protocol_category}
        </span>

        {/* Score */}
        <span
          className="text-xs font-mono font-semibold w-10 text-right shrink-0"
          style={{ color }}
        >
          {(score * 100).toFixed(0)}%
        </span>

        {/* Chevron */}
        {expanded
          ? <ChevronUp size={12} className="text-slate-500 shrink-0" />
          : <ChevronDown size={12} className="text-slate-500 shrink-0" />
        }
      </button>

      {/* Score bar (always visible) */}
      <div className="px-2.5 pb-1.5">
        <ScoreBar score={score} color={color} />
      </div>

      {/* Expanded: dimension breakdown + explanation */}
      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-slate-700/40 pt-2">
          {/* Dimension bars */}
          <div className="space-y-1.5">
            {result.affinity.dimensions.map((dim) => {
              const cfg = DIMENSION_CONFIG[dim.name]
              const similarity = 1 - Math.abs(dim.context_value - dim.relevance_value)
              return (
                <div key={dim.name} className="flex items-center gap-2">
                  <span className="text-[9px] text-slate-500 w-10 shrink-0">
                    {cfg?.label ?? dim.name}
                  </span>
                  <div className="flex-1">
                    <ScoreBar
                      score={similarity}
                      color={cfg?.color ?? '#6b7280'}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 w-8 text-right shrink-0">
                    {(similarity * 100).toFixed(0)}%
                  </span>
                </div>
              )
            })}
          </div>

          {/* Explanation */}
          <div className="bg-slate-900/60 rounded px-2 py-1.5 border border-slate-700/30">
            <p className="text-[10px] text-slate-400 leading-relaxed">
              {result.affinity.explanation}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main component
// ============================================================================

interface ProtocolRankingProps {
  /** Project ID to route protocols for */
  projectId?: string
  /** Optional plan ID to auto-build context from */
  planId?: string
  /** CSS class */
  className?: string
}

function ProtocolRankingComponent({ projectId, planId, className }: ProtocolRankingProps) {
  const [routeData, setRouteData] = useState<RouteResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRoute = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const data = await intelligenceApi.routeProtocols({
        project_id: projectId,
        plan_id: planId,
      })
      setRouteData(data)
    } catch (err) {
      console.error('[ProtocolRanking] route error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load routing')
    } finally {
      setLoading(false)
    }
  }, [projectId, planId])

  useEffect(() => {
    fetchRoute()
  }, [fetchRoute])

  if (!projectId) return null

  if (loading) {
    return (
      <div className={`flex items-center gap-2 py-3 ${className ?? ''}`}>
        <Loader2 size={12} className="animate-spin text-slate-500" />
        <span className="text-[10px] text-slate-500">Loading routing...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`text-[10px] text-red-400 py-2 ${className ?? ''}`}>
        {error}
      </div>
    )
  }

  if (!routeData || routeData.results.length === 0) {
    return (
      <div className={`text-[10px] text-slate-600 italic py-2 ${className ?? ''}`}>
        No protocols to rank.
      </div>
    )
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-2">
        <Target size={10} className="text-indigo-400" />
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
          Protocol Ranking
        </span>
        <span className="text-[9px] text-slate-600 ml-auto">
          {routeData.total_evaluated} evaluated
        </span>
      </div>

      {/* Ranked list */}
      <div className="space-y-1">
        {routeData.results.map((result, i) => (
          <ProtocolRow
            key={result.protocol_id}
            result={result}
            rank={i + 1}
          />
        ))}
      </div>
    </div>
  )
}

export const ProtocolRanking = memo(ProtocolRankingComponent)
