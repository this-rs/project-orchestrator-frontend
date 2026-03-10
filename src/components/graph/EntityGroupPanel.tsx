// ============================================================================
// EntityGroupPanel — Toggleable entity group chips for fractal graph views
// ============================================================================
//
// Each non-core group cycles through 3 visual modes:
//   off         → dim chip, no content in graph
//   connections → outlined chip with link icon, edges + tiny nodes in graph
//   expanded    → fully lit chip, full nodes + edges in graph
//
// Core group is always on and cannot be toggled.
// ============================================================================

import { useCallback, useMemo, useRef } from 'react'
import { useSetAtom } from 'jotai'
import {
  Circle,
  Code,
  BookOpen,
  GitCommit,
  MessageCircle,
  Network,
  Workflow,
  RotateCcw,
  Eye,
  Link2,
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

// ── Group colors (subtle, matches overall dark theme) ───────────────────────

const GROUP_COLORS: Record<EntityGroup, { bg: string; border: string; text: string; activeBg: string; activeBorder: string; connBg: string; connBorder: string }> = {
  core:       { bg: 'bg-emerald-950/40', border: 'border-emerald-800/40', text: 'text-emerald-400', activeBg: 'bg-emerald-900/60', activeBorder: 'border-emerald-600/60', connBg: 'bg-emerald-950/25', connBorder: 'border-emerald-700/50' },
  code:       { bg: 'bg-blue-950/40',    border: 'border-blue-800/40',    text: 'text-blue-400',    activeBg: 'bg-blue-900/60',    activeBorder: 'border-blue-600/60',    connBg: 'bg-blue-950/25',    connBorder: 'border-blue-700/50' },
  knowledge:  { bg: 'bg-amber-950/40',   border: 'border-amber-800/40',   text: 'text-amber-400',   activeBg: 'bg-amber-900/60',   activeBorder: 'border-amber-600/60',   connBg: 'bg-amber-950/25',   connBorder: 'border-amber-700/50' },
  git:        { bg: 'bg-lime-950/40',    border: 'border-lime-800/40',    text: 'text-lime-400',    activeBg: 'bg-lime-900/60',    activeBorder: 'border-lime-600/60',    connBg: 'bg-lime-950/25',    connBorder: 'border-lime-700/50' },
  sessions:   { bg: 'bg-indigo-950/40',  border: 'border-indigo-800/40',  text: 'text-indigo-400',  activeBg: 'bg-indigo-900/60',  activeBorder: 'border-indigo-600/60',  connBg: 'bg-indigo-950/25',  connBorder: 'border-indigo-700/50' },
  features:   { bg: 'bg-fuchsia-950/40', border: 'border-fuchsia-800/40', text: 'text-fuchsia-400', activeBg: 'bg-fuchsia-900/60', activeBorder: 'border-fuchsia-600/60', connBg: 'bg-fuchsia-950/25', connBorder: 'border-fuchsia-700/50' },
  behavioral: { bg: 'bg-orange-950/40',  border: 'border-orange-800/40',  text: 'text-orange-400',  activeBg: 'bg-orange-900/60',  activeBorder: 'border-orange-600/60',  connBg: 'bg-orange-950/25',  connBorder: 'border-orange-700/50' },
}

// ── Mode labels for tooltip ─────────────────────────────────────────────────

const MODE_LABELS: Record<GroupMode, string> = {
  off: 'Off',
  connections: 'Connections only',
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
      className={`flex ${isHorizontal ? 'flex-row flex-wrap' : 'flex-col'} items-start gap-1 rounded-lg bg-slate-900/80 backdrop-blur-sm border border-slate-700/60 p-1.5 ${className}`}
    >
      {visibleGroups.map((group) => {
        const isCore = group.id === 'core'
        const mode: GroupMode = isCore ? 'expanded' : (groupModes.get(group.id) ?? 'off')
        const count = counts[group.id] ?? 0
        const colors = GROUP_COLORS[group.id]
        const Icon = GROUP_ICONS[group.icon] ?? Circle

        // Visual classes per mode
        let chipClasses: string
        let textClasses: string

        if (mode === 'expanded') {
          chipClasses = `${colors.activeBg} ${colors.activeBorder} ${colors.text}`
          textClasses = colors.text
        } else if (mode === 'connections') {
          chipClasses = `${colors.connBg} ${colors.connBorder} ${colors.text}`
          textClasses = `${colors.text} opacity-75`
        } else {
          chipClasses = `${colors.bg} ${colors.border} text-slate-500 opacity-50 hover:opacity-80`
          textClasses = 'text-slate-500'
        }

        return (
          <button
            key={group.id}
            onClick={() => !isCore && onCycle(group.id)}
            onMouseEnter={() => handleMouseEnter(group.id)}
            onMouseLeave={handleMouseLeave}
            disabled={isCore}
            className={`
              flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium
              border transition-colors duration-150 select-none
              ${isCore ? 'cursor-default' : 'cursor-pointer'}
              ${chipClasses}
            `}
            title={`${group.label}: ${count} entities — ${MODE_LABELS[mode]}${isCore ? ' (always on)' : ' (click to cycle)'}`}
          >
            <Icon size={12} />
            <span className={textClasses}>{group.label}</span>

            {/* Mode indicator for connections */}
            {mode === 'connections' && (
              <Link2 size={9} className={`${colors.text} opacity-60`} />
            )}

            {/* Count badge */}
            {count > 0 && (
              <span
                className={`
                  ml-0.5 px-1 py-px rounded text-[9px] font-semibold
                  ${mode === 'expanded' ? 'bg-white/10' : mode === 'connections' ? 'bg-white/5' : 'bg-white/5'}
                `}
              >
                {count}
              </span>
            )}

            {/* Small dot indicator for current mode (non-core only) */}
            {!isCore && (
              <span className={`
                w-1.5 h-1.5 rounded-full ml-0.5 flex-shrink-0
                ${mode === 'expanded' ? `bg-current opacity-80` : ''}
                ${mode === 'connections' ? `bg-current opacity-40` : ''}
                ${mode === 'off' ? 'bg-slate-600 opacity-30' : ''}
              `} />
            )}
          </button>
        )
      })}

      {/* Action buttons */}
      <div className={`flex items-center gap-0.5 ${isHorizontal ? 'ml-1' : 'mt-1'} border-l border-slate-700/40 pl-1.5`}>
        <button
          onClick={onEnableAll}
          className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/40 transition-colors"
          title="Expand all groups"
        >
          <Eye size={12} />
        </button>
        <button
          onClick={onResetDefaults}
          className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/40 transition-colors"
          title="Reset to defaults"
        >
          <RotateCcw size={12} />
        </button>
      </div>
    </div>
  )
}
