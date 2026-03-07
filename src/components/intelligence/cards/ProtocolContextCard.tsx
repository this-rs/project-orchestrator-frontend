import { memo, useEffect, useState } from 'react'
import type { ProtocolNodeData } from '@/types/intelligence'
import type { ProtocolDetailApi } from '@/types/intelligence'
import { intelligenceApi } from '@/services/intelligence'
import {
  Workflow,
  Circle,
  Play,
  Square,
  ArrowRight,
  Brain,
  Loader2,
} from 'lucide-react'

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

function ProtocolContextCardComponent({ data, entityId }: ProtocolContextCardProps) {
  const [detail, setDetail] = useState<ProtocolDetailApi | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchDetail() {
      setLoading(true)
      try {
        const result = await intelligenceApi.getProtocol(entityId)
        if (!cancelled) setDetail(result)
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
