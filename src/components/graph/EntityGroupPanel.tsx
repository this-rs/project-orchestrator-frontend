// ============================================================================
// EntityGroupPanel — Compact entity group toggles (icon + count)
// ============================================================================
//
// Each non-core group cycles through 3 visual modes:
//   off         → grey icon, no content in graph
//   connections → group-coloured icon at 70 %, a small dot: edges + tiny nodes
//   expanded    → pressed segment (aria-pressed), full nodes + edges in graph
//
// Material: one segmented glass control (`.seg` / `.seg-item`, DESIGN.md
// § Matière). The group hue stays on the ICON only — never a filled background.
// Every button names its group, count and mode (aria-label + title), so nothing
// depends on the hover tooltip, which only enhances on a fine pointer.
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
import { glass, segmentItem, segmented } from '@/components/ui/classes'
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

// ── Group accent colors (icon size only) ────────────────────────────────────

const GROUP_ACCENT: Record<EntityGroup, { text: string; dot: string }> = {
  core:       { text: 'text-emerald-400', dot: 'bg-emerald-400' },
  code:       { text: 'text-blue-400',    dot: 'bg-blue-400' },
  knowledge:  { text: 'text-amber-400',   dot: 'bg-amber-400' },
  git:        { text: 'text-lime-400',    dot: 'bg-lime-400' },
  sessions:   { text: 'text-indigo-400',  dot: 'bg-indigo-400' },
  features:   { text: 'text-fuchsia-400', dot: 'bg-fuchsia-400' },
  behavioral: { text: 'text-orange-400',  dot: 'bg-orange-400' },
}

// ── Mode labels ─────────────────────────────────────────────────────────────

const MODE_LABELS: Record<GroupMode, string> = {
  off: 'Off',
  connections: 'Connections',
  expanded: 'Expanded',
}

/** One item of the segmented control: 36px tap target on phones, 32px on desktop. */
const segItem = `${segmentItem} shrink-0 h-9 md:h-8 px-2.5 text-xs font-medium whitespace-nowrap gap-1.5`

const formatCount = (n: number) => (n > 999 ? '1k+' : String(n))

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
  const allExpanded = visibleGroups
    .filter((g) => g.id !== 'core')
    .every((g) => groupModes.get(g.id) === 'expanded')

  return (
    <div className={`flex ${isHorizontal ? 'flex-row items-center' : 'flex-col items-start'} max-w-full px-2 py-1.5 ${className}`}>
      <div
        role="group"
        aria-label="Entity groups"
        className={`${segmented} ${
          isHorizontal
            ? 'max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            : 'flex-col items-stretch'
        }`}
      >
        {visibleGroups.map((group) => {
          const isCore = group.id === 'core'
          const mode: GroupMode = isCore ? 'expanded' : (groupModes.get(group.id) ?? 'off')
          const count = counts[group.id] ?? 0
          const accent = GROUP_ACCENT[group.id]
          const Icon = GROUP_ICONS[group.icon] ?? Circle
          const isHovered = tooltipGroup === group.id
          const iconClass = mode === 'expanded' ? accent.text : mode === 'connections' ? `${accent.text} opacity-70` : 'text-gray-500'
          const name = `${group.label}: ${count} entities, ${MODE_LABELS[mode]}${isCore ? '' : ' — click to cycle'}`

          return (
            <div key={group.id} className={`relative ${isHorizontal ? '' : 'w-full'}`}>
              <button
                type="button"
                onClick={() => !isCore && onCycle(group.id)}
                onMouseEnter={() => handleMouseEnter(group.id)}
                onMouseLeave={handleMouseLeave}
                disabled={isCore}
                aria-pressed={isCore ? undefined : mode === 'expanded'}
                aria-label={name}
                title={name}
                className={`${segItem} ${isHorizontal ? '' : 'w-full justify-start'} ${isCore ? 'cursor-default' : ''}`}
              >
                <Icon size={14} className={iconClass} />
                {count > 0 && mode !== 'off' && <span className="text-[11px] font-normal tabular-nums">{formatCount(count)}</span>}
                {/* Connections mode: the group's dot, half-lit (expanded = the pressed segment itself) */}
                {!isCore && mode === 'connections' && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent.dot} opacity-60`} aria-hidden="true" />}
              </button>

              {/* Tooltip on hover — an enhancement for a fine pointer; the button already says it all */}
              {isHovered && (
                <div
                  className={`pointer-events-none absolute z-50 whitespace-nowrap ${
                    isHorizontal ? 'top-full mt-1.5 left-1/2 -translate-x-1/2' : 'left-full ml-1.5 top-1/2 -translate-y-1/2'
                  }`}
                  aria-hidden="true"
                >
                  <div className={`${glass} rounded-md px-2 py-1 text-[11px] leading-4`}>
                    <div className="font-medium text-gray-200">{group.label}</div>
                    <div className="text-gray-400">
                      {count} entities · {MODE_LABELS[mode]}
                      {!isCore && ' · click to cycle'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* All: expand every group / back to defaults */}
        <button
          type="button"
          onClick={allExpanded ? onResetDefaults : onEnableAll}
          aria-pressed={allExpanded}
          className={`${segItem} ${isHorizontal ? 'ml-0.5' : 'mt-0.5 w-full justify-start'}`}
          title={allExpanded ? 'Reset to defaults' : 'Expand all groups'}
        >
          All
        </button>
      </div>
    </div>
  )
}
