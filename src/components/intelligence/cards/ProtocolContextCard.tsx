import { Fragment, memo, useEffect, useState } from 'react'
import type { ProtocolNodeData } from '@/types/intelligence'
import type { ProtocolDetailApi, ProtocolRunApi, RouteResult } from '@/types/intelligence'
import { intelligenceApi } from '@/services/intelligence'
import {
  Workflow,
  Circle,
  Play,
  Square,
  ArrowRight,
  Brain,
  Loader2,
  Activity,
  Target,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { ProtocolRunViewer } from '../ProtocolRunViewer'
import { ContextRadar } from '../ContextRadar'

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const stateTypeIcons: Record<string, typeof Circle> = {
  start: Play,
  intermediate: Circle,
  terminal: Square,
}

const stateTypeColors: Record<string, string> = {
  start: '#22C55E',
  intermediate: '#FB923C',
  terminal: '#EF4444',
}

const categoryBadgeColors: Record<string, { bg: string; text: string; border: string }> = {
  system: { bg: '#172554', text: '#60A5FA', border: '#1E40AF' },
  business: { bg: '#431407', text: '#FB923C', border: '#9A3412' },
}

function CategoryBadge({ category }: { category: string }) {
  const colors = categoryBadgeColors[category] ?? { bg: '#1e293b', text: '#94a3b8', border: '#334155' }
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-md border"
      style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
    >
      {category}
    </span>
  )
}

function SectionLoader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <Loader2 size={10} className="animate-spin text-slate-500" />
      <span className="text-[10px] text-slate-500">{label}</span>
    </div>
  )
}

// ============================================================================
// MAIN CARD
// ============================================================================

interface ProtocolContextCardProps {
  data: ProtocolNodeData
  entityId: string
}

// ============================================================================
// DIMENSION BAR (for "Why Activated" panel)
// ============================================================================

const DIMENSION_BAR_CONFIG: Record<string, { label: string; color: string }> = {
  phase: { label: 'Phase', color: '#818cf8' },
  structure: { label: 'Structure', color: '#34d399' },
  domain: { label: 'Domain', color: '#fb923c' },
  resource: { label: 'Resource', color: '#38bdf8' },
  lifecycle: { label: 'Lifecycle', color: '#f472b6' },
}

function dimensionBarColor(similarity: number): string {
  if (similarity >= 0.7) return '#22c55e'  // green
  if (similarity >= 0.4) return '#f59e0b'  // amber
  return '#ef4444'                         // red
}

function ProtocolContextCardComponent({ data, entityId }: ProtocolContextCardProps) {
  const [detail, setDetail] = useState<ProtocolDetailApi | null>(null)
  const [activeRun, setActiveRun] = useState<ProtocolRunApi | null>(null)
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [whyExpanded, setWhyExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function fetchDetail() {
      setLoading(true)
      try {
        const [result, runsResult] = await Promise.all([
          intelligenceApi.getProtocol(entityId),
          intelligenceApi.listRuns(entityId, 'running').catch(() => null),
        ])
        if (!cancelled) {
          setDetail(result)
          // Pick the first running run (there should be at most 1 due to concurrency guard)
          const running = runsResult?.items?.[0] ?? null
          setActiveRun(running)

          // Fetch routing data for this protocol's project
          if (result?.project_id) {
            try {
              const routeData = await intelligenceApi.routeProtocols({
                project_id: result.project_id,
              })
              if (!cancelled) {
                // Find this protocol in the ranked results
                const match = routeData.results.find(r => r.protocol_id === entityId)
                if (match) setRouteResult(match)
              }
            } catch {
              // Routing is optional — silently ignore
            }
          }
        }
      } catch (err) {
        console.error('[ProtocolContextCard] fetch error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchDetail()
    return () => { cancelled = true }
  }, [entityId])

  if (loading) return <SectionLoader label="Loading protocol..." />

  const states = detail?.states ?? []
  const transitions = detail?.transitions ?? []

  // Build a name lookup for states so transitions show names
  const stateNameMap = new Map(states.map(s => [s.id, s.name]))

  return (
    <div className="space-y-3">
      {/* Category & Stats row */}
      <div className="flex items-center gap-2 flex-wrap">
        <CategoryBadge category={data.category} />
        <span className="text-[10px] text-slate-500">
          {states.length} state{states.length !== 1 ? 's' : ''}
        </span>
        <span className="text-[10px] text-slate-600">&middot;</span>
        <span className="text-[10px] text-slate-500">
          {transitions.length} transition{transitions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Description */}
      {detail?.description && (
        <div className="bg-slate-800/50 rounded-md p-2 border border-slate-700/50">
          <p className="text-[10px] text-slate-400 mb-1 font-medium uppercase tracking-wider">Description</p>
          <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-4">
            {detail.description}
          </p>
        </div>
      )}

      {/* Skill link */}
      {data.skillId && (
        <div className="flex items-center gap-1.5 bg-pink-950/20 rounded-md px-2 py-1.5 border border-pink-900/30">
          <Brain size={10} className="text-pink-400" />
          <span className="text-[10px] text-pink-300 font-medium">Linked to Skill</span>
          <span className="text-[9px] font-mono text-pink-600 ml-auto truncate max-w-[120px]">
            {data.skillId}
          </span>
        </div>
      )}

      {/* Context Routing — Why Activated */}
      {routeResult && (
        <div>
          <button
            className="flex items-center gap-1.5 w-full text-left mb-1.5"
            onClick={() => setWhyExpanded(v => !v)}
          >
            {whyExpanded
              ? <ChevronDown size={10} className="text-indigo-400" />
              : <ChevronRight size={10} className="text-indigo-400" />
            }
            <Target size={10} className="text-indigo-400" />
            <span className="text-[10px] text-indigo-400 font-medium uppercase tracking-wider">
              Why Activated
            </span>
            <span
              className="text-[10px] font-mono font-semibold ml-auto"
              style={{ color: dimensionBarColor(routeResult.affinity.score) }}
            >
              {(routeResult.affinity.score * 100).toFixed(0)}%
            </span>
          </button>

          {/* Compact radar (always visible) */}
          <div className="flex justify-center">
            <ContextRadar
              affinity={routeResult.affinity}
              relevanceVector={routeResult.relevance_vector}
              size="sm"
            />
          </div>

          {/* Expanded details */}
          {whyExpanded && (
            <div className="mt-2 space-y-2">
              {/* Dimension breakdown bars */}
              <div className="space-y-1.5">
                {routeResult.affinity.dimensions.map((dim) => {
                  const similarity = 1 - Math.abs(dim.context_value - dim.relevance_value)
                  const cfg = DIMENSION_BAR_CONFIG[dim.name]
                  return (
                    <div key={dim.name} className="flex items-center gap-2">
                      <span className="text-[9px] text-slate-500 w-14 shrink-0">
                        {cfg?.label ?? dim.name}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.round(similarity * 100)}%`,
                            backgroundColor: dimensionBarColor(similarity),
                          }}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-slate-500 w-8 text-right shrink-0">
                        {(similarity * 100).toFixed(0)}%
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Explanation text */}
              <div className="bg-slate-900/60 rounded px-2 py-1.5 border border-slate-700/30">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  {routeResult.affinity.explanation}
                </p>
              </div>

              {/* Context vs Relevance values */}
              <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[9px]">
                <span className="text-slate-600 font-medium">Dim</span>
                <span className="text-slate-600 font-medium text-center">Context</span>
                <span className="text-slate-600 font-medium text-center">Ideal</span>
                {routeResult.affinity.dimensions.map((dim) => (
                  <Fragment key={dim.name}>
                    <span className="text-slate-500">{DIMENSION_BAR_CONFIG[dim.name]?.label ?? dim.name}</span>
                    <span className="font-mono text-slate-400 text-center">{dim.context_value.toFixed(2)}</span>
                    <span className="font-mono text-indigo-400 text-center">{dim.relevance_value.toFixed(2)}</span>
                  </Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active Run — FSM Viewer (compact) */}
      {activeRun && detail && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Activity size={10} className="text-cyan-400" />
            <span className="text-[10px] text-cyan-400 font-medium uppercase tracking-wider">
              Active Run
            </span>
            <span className="text-[9px] text-slate-600 ml-auto">
              {activeRun.states_visited.length}/{states.length} states
            </span>
          </div>
          <ProtocolRunViewer
            protocol={detail}
            activeRun={activeRun}
            compact
          />
        </div>
      )}

      {/* States list */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Circle size={10} className="text-orange-400" />
          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
            States
          </span>
        </div>
        {states.length === 0 ? (
          <p className="text-[10px] text-slate-600 italic pl-3">No states defined</p>
        ) : (
          <div className="space-y-1 max-h-[140px] overflow-y-auto">
            {states.map((state) => {
              const StateIcon = stateTypeIcons[state.state_type] ?? Circle
              const stColor = stateTypeColors[state.state_type] ?? '#FB923C'
              return (
                <div
                  key={state.id}
                  className="bg-orange-950/15 rounded-md px-2 py-1 border border-orange-900/25"
                >
                  <div className="flex items-center gap-1.5">
                    <StateIcon size={9} color={stColor} />
                    <span className="text-[10px] font-medium text-orange-200">
                      {state.name}
                    </span>
                    <span className="text-[8px] text-slate-600 ml-auto">{state.state_type}</span>
                  </div>
                  {state.description && (
                    <p className="text-[9px] text-slate-500 mt-0.5 line-clamp-1 pl-3.5">
                      {state.description}
                    </p>
                  )}
                  {state.action && (
                    <p className="text-[8px] text-cyan-600 mt-0.5 pl-3.5 font-mono">
                      action: {state.action}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Transitions list */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <ArrowRight size={10} className="text-orange-400" />
          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
            Transitions
          </span>
        </div>
        {transitions.length === 0 ? (
          <p className="text-[10px] text-slate-600 italic pl-3">No transitions defined</p>
        ) : (
          <div className="space-y-1 max-h-[140px] overflow-y-auto">
            {transitions.map((t) => {
              const fromName = stateNameMap.get(t.from_state) ?? '?'
              const toName = stateNameMap.get(t.to_state) ?? '?'
              return (
                <div
                  key={t.id}
                  className="bg-orange-950/10 rounded-md px-2 py-1 border border-orange-900/20"
                >
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-slate-400 font-medium">{fromName}</span>
                    <ArrowRight size={8} className="text-orange-500" />
                    <span className="text-[9px] text-slate-400 font-medium">{toName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 pl-1">
                    <Workflow size={7} className="text-orange-600" />
                    <span className="text-[9px] text-orange-300 font-mono">{t.trigger}</span>
                    {t.guard && (
                      <span className="text-[8px] text-slate-600 font-mono ml-auto">
                        [{t.guard}]
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Timestamps */}
      {detail && (
        <div className="flex items-center gap-3 text-[9px] text-slate-600 pt-1 border-t border-slate-800">
          <span>Created: {new Date(detail.created_at).toLocaleDateString()}</span>
          <span>Updated: {new Date(detail.updated_at).toLocaleDateString()}</span>
        </div>
      )}
    </div>
  )
}

export const ProtocolContextCard = memo(ProtocolContextCardComponent)
