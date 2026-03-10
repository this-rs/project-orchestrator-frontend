// ============================================================================
// EntityGroupPanel — Compact icon-only entity group toggles
// ============================================================================
//
// Each non-core group cycles through 3 visual modes:
//   off         → dim icon, no content in graph
//   connections → semi-lit icon with link indicator, edges + tiny nodes
//   expanded    → fully lit icon, full nodes + edges in graph
//
// Hover reveals a tooltip with label, count, and current mode.
// Core group is always on and cannot be toggled.
// ============================================================================

import { useCallback, useMemo, useRef, useState } from 'react'
import { useSetAtom } from 'jotai'
import {
  Circle,
  Code,
  BookOpen,
  GitCommit,
  MessageCircle,
  Network,
  Workflow,
} from 'lucide-react'
import { highlightedGroupAtom } from '@/atoms/intelligence'
import type { EntityGroup, EntityGroupConfig, GroupMode } from '@/types/fractal-graph'

// ── Icon mapping ────────────────────────────────────────────────────────────

const GROUP_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  Circle,
  Code,
  BookOpen,
  GitCommit,
  MessageCircle,
  Network,
  Workflow,
}

// ── Group accent colors ─────────────────────────────────────────────────────

const GROUP_ACCENT: Record<EntityGroup, { active: string; conn: string; off: string; dot: string }> = {
  core:       { active: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/40', conn: 'text-emerald-400/70 bg-emerald-500/10 border-emerald-500/25', off: 'text-slate-500 bg-slate-800/40 border-slate-700/40', dot: 'bg-emerald-400' },
  code:       { active: 'text-blue-400 bg-blue-500/20 border-blue-500/40',          conn: 'text-blue-400/70 bg-blue-500/10 border-blue-500/25',          off: 'text-slate-500 bg-slate-800/40 border-slate-700/40', dot: 'bg-blue-400' },
  knowledge:  { active: 'text-amber-400 bg-amber-500/20 border-amber-500/40',       conn: 'text-amber-400/70 bg-amber-500/10 border-amber-500/25',       off: 'text-slate-500 bg-slate-800/40 border-slate-700/40', dot: 'bg-amber-400' },
  git:        { active: 'text-lime-400 bg-lime-500/20 border-lime-500/40',           conn: 'text-lime-400/70 bg-lime-500/10 border-lime-500/25',           off: 'text-slate-500 bg-slate-800/40 border-slate-700/40', dot: 'bg-lime-400' },
  sessions:   { active: 'text-indigo-400 bg-indigo-500/20 border-indigo-500/40',     conn: 'text-indigo-400/70 bg-indigo-500/10 border-indigo-500/25',     off: 'text-slate-500 bg-slate-800/40 border-slate-700/40', dot: 'bg-indigo-400' },
  features:   { active: 'text-fuchsia-400 bg-fuchsia-500/20 border-fuchsia-500/40',  conn: 'text-fuchsia-400/70 bg-fuchsia-500/10 border-fuchsia-500/25',  off: 'text-slate-500 bg-slate-800/40 border-slate-700/40', dot: 'bg-fuchsia-400' },
  behavioral: { active: 'text-orange-400 bg-orange-500/20 border-orange-500/40',     conn: 'text-orange-400/70 bg-orange-500/10 border-orange-500/25',     off: 'text-slate-500 bg-slate-800/40 border-slate-700/40', dot: 'bg-orange-400' },
}

// ── Mode labels ─────────────────────────────────────────────────────────────

const MODE_LABELS: Record<GroupMode, string> = {
  off: 'Off',
  connections: 'Connections',
  expanded: 'Expanded',
}

// ── Component ───────────────────────────────────────────────────────────────

interface EntityGroupPanelProps {
  /** Available group configs from the adapter */
  groups: EntityGroupConfig[]
  /** Display mode per group */
  groupModes: Map<EntityGroup, GroupMode>
  /** Entity counts per group */
  counts: Record<EntityGroup, number>
  /** Cycle callback: off → connections → expanded → off */
  onCycle: (group: EntityGroup) => void
  /** Enable all callback */
  onEnableAll: () => void
  /** Reset to defaults callback */
  onResetDefaults: () => void
  /** Layout direction */
  direction?: 'horizontal' | 'vertical'
  /** Additional CSS class */
  className?: string
  /** Enable hover highlighting (only makes sense in 3D view) */
  enableHover?: boolean
}

export function EntityGroupPanel({
  groups,
  groupModes,
  counts,
  onCycle,
  onEnableAll,
  onResetDefaults,
  direction = 'horizontal',
  className = '',
  enableHover = false,
}: EntityGroupPanelProps) {
  const setHighlightedGroup = useSetAtom(highlightedGroupAtom)
  const [tooltipGroup, setTooltipGroup] = useState<EntityGroup | null>(null)

  // Memoize Set instances per group to avoid creating new references on each hover
  const groupSetsRef = useRef<Map<EntityGroup, Set<string>>>(new Map())
  const groupSets = useMemo(() => {
    const map = new Map<EntityGroup, Set<string>>()
    for (const g of groups) {
      const existing = groupSetsRef.current.get(g.id)
      const types = g.entityTypes
      if (existing && types.length === existing.size && types.every((t) => existing.has(t))) {
        map.set(g.id, existing)
      } else {
        map.set(g.id, new Set(types))
      }
    }
    groupSetsRef.current = map
    return map
  }, [groups])

  // Debounced leave: 200ms delay before clearing highlight
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = useCallback(
    (group: EntityGroup) => {
      setTooltipGroup(group)
      if (!enableHover) return
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current)
        leaveTimerRef.current = null
      }
      const set = groupSets.get(group)
      if (set) {
        setHighlightedGroup(set)
      }
    },
    [enableHover, setHighlightedGroup, groupSets],
  )

  const handleMouseLeave = useCallback(() => {
    setTooltipGroup(null)
    if (!enableHover) return
    leaveTimerRef.current = setTimeout(() => {
      setHighlightedGroup(null)
      leaveTimerRef.current = null
    }, 200)
  }, [enableHover, setHighlightedGroup])

  // Show all supported groups from the adapter
  const visibleGroups = groups

  if (visibleGroups.length <= 1) return null

  const isHorizontal = direction === 'horizontal'

  return (
    <div
      className={`flex ${isHorizontal ? 'flex-row items-center' : 'flex-col items-start'} gap-1.5 bg-slate-900/80 backdrop-blur-sm border border-slate-700/60 px-2 py-1.5 ${className}`}
    >
      {visibleGroups.map((group) => {
        const isCore = group.id === 'core'
        const mode: GroupMode = isCore ? 'expanded' : (groupModes.get(group.id) ?? 'off')
        const count = counts[group.id] ?? 0
        const accent = GROUP_ACCENT[group.id]
        const Icon = GROUP_ICONS[group.icon] ?? Circle
        const isHovered = tooltipGroup === group.id

        // Select accent classes by mode
        const accentClasses = mode === 'expanded' ? accent.active
          : mode === 'connections' ? accent.conn
          : accent.off

        return (
          <div key={group.id} className="relative">
            <button
              onClick={() => !isCore && onCycle(group.id)}
              onMouseEnter={() => handleMouseEnter(group.id)}
              onMouseLeave={handleMouseLeave}
              disabled={isCore}
              className={`
                relative flex items-center justify-center w-7 h-7 rounded-md
                border transition-all duration-150 select-none
                ${isCore ? 'cursor-default' : 'cursor-pointer hover:scale-110'}
                ${accentClasses}
              `}
            >
              <Icon size={14} />

              {/* Mode dot indicator (bottom-right) — non-core only */}
              {!isCore && mode !== 'off' && (
                <span className={`
                  absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-900
                  ${mode === 'expanded' ? accent.dot : `${accent.dot} opacity-50`}
                `} />
              )}

              {/* Count badge (top-right) — compact */}
              {count > 0 && mode !== 'off' && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-slate-800 border border-slate-600 text-[8px] font-bold text-slate-300 leading-none px-0.5">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>

            {/* Tooltip on hover */}
            {isHovered && (
              <div className={`absolute z-50 pointer-events-none whitespace-nowrap
                ${isHorizontal ? 'top-full mt-1.5 left-1/2 -translate-x-1/2' : 'left-full ml-1.5 top-1/2 -translate-y-1/2'}
              `}>
                <div className="px-2 py-1 rounded-md bg-slate-800 border border-slate-600 shadow-lg text-[10px]">
                  <div className="font-semibold text-slate-200">{group.label}</div>
                  <div className="text-slate-400">
                    {count} entities · {MODE_LABELS[mode]}
                    {!isCore && ' · click to cycle'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Separator + All toggle */}
      {(() => {
        const allExpanded = visibleGroups
          .filter((g) => g.id !== 'core')
          .every((g) => groupModes.get(g.id) === 'expanded')
        return (
          <div className={`flex items-center ${isHorizontal ? 'ml-0.5 pl-1 border-l' : 'mt-0.5 pt-1 border-t'} border-slate-700/40`}>
            <button
              onClick={allExpanded ? onResetDefaults : onEnableAll}
              className={`
                h-6 px-1.5 rounded text-[9px] font-bold tracking-wide uppercase transition-all duration-150
                ${allExpanded
                  ? 'text-cyan-400 bg-cyan-500/15 border border-cyan-500/30 hover:bg-cyan-500/25'
                  : 'text-slate-500 bg-slate-800/40 border border-slate-700/40 hover:text-slate-300 hover:bg-slate-700/40'
                }
              `}
              title={allExpanded ? 'Reset to defaults' : 'Expand all groups'}
            >
              All
            </button>
          </div>
        )
      })()}
    </div>
  )
}
