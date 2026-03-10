// ============================================================================
// EntityGroupPanel — Toggleable entity group chips for fractal graph views
// ============================================================================
//
// Renders pill-style chips for each entity group, with count badges and
// toggle behavior. Works identically at every scale level — same UI,
// different group configs depending on the adapter.
//
// Replaces the ad-hoc FeatureGraphChip pattern in PlanUniverse3D.
// ============================================================================

import { useCallback } from 'react'
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
} from 'lucide-react'
import { highlightedGroupAtom } from '@/atoms/intelligence'
import type { EntityGroup, EntityGroupConfig } from '@/types/fractal-graph'

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

const GROUP_COLORS: Record<EntityGroup, { bg: string; border: string; text: string; activeBg: string; activeBorder: string }> = {
  core:       { bg: 'bg-emerald-950/40', border: 'border-emerald-800/40', text: 'text-emerald-400', activeBg: 'bg-emerald-900/60', activeBorder: 'border-emerald-600/60' },
  code:       { bg: 'bg-blue-950/40',    border: 'border-blue-800/40',    text: 'text-blue-400',    activeBg: 'bg-blue-900/60',    activeBorder: 'border-blue-600/60' },
  knowledge:  { bg: 'bg-amber-950/40',   border: 'border-amber-800/40',   text: 'text-amber-400',   activeBg: 'bg-amber-900/60',   activeBorder: 'border-amber-600/60' },
  git:        { bg: 'bg-lime-950/40',    border: 'border-lime-800/40',    text: 'text-lime-400',    activeBg: 'bg-lime-900/60',    activeBorder: 'border-lime-600/60' },
  sessions:   { bg: 'bg-indigo-950/40',  border: 'border-indigo-800/40',  text: 'text-indigo-400',  activeBg: 'bg-indigo-900/60',  activeBorder: 'border-indigo-600/60' },
  features:   { bg: 'bg-fuchsia-950/40', border: 'border-fuchsia-800/40', text: 'text-fuchsia-400', activeBg: 'bg-fuchsia-900/60', activeBorder: 'border-fuchsia-600/60' },
  behavioral: { bg: 'bg-orange-950/40',  border: 'border-orange-800/40',  text: 'text-orange-400',  activeBg: 'bg-orange-900/60',  activeBorder: 'border-orange-600/60' },
}

// ── Component ───────────────────────────────────────────────────────────────

interface EntityGroupPanelProps {
  /** Available group configs from the adapter */
  groups: EntityGroupConfig[]
  /** Currently enabled groups */
  enabledGroups: Set<EntityGroup>
  /** Entity counts per group */
  counts: Record<EntityGroup, number>
  /** Toggle callback */
  onToggle: (group: EntityGroup) => void
  /** Enable all callback */
  onEnableAll: () => void
  /** Reset to defaults callback */
  onResetDefaults: () => void
  /** Layout direction */
  direction?: 'horizontal' | 'vertical'
  /** Additional CSS class */
  className?: string
}

export function EntityGroupPanel({
  groups,
  enabledGroups,
  counts,
  onToggle,
  onEnableAll,
  onResetDefaults,
  direction = 'horizontal',
  className = '',
}: EntityGroupPanelProps) {
  const setHighlightedGroup = useSetAtom(highlightedGroupAtom)

  const handleMouseEnter = useCallback(
    (group: EntityGroup) => {
      // highlightedGroupAtom expects Set<string> — set containing the entity types in this group
      const config = groups.find((g) => g.id === group)
      if (config) {
        setHighlightedGroup(new Set(config.entityTypes))
      }
    },
    [setHighlightedGroup, groups],
  )

  const handleMouseLeave = useCallback(() => {
    setHighlightedGroup(null)
  }, [setHighlightedGroup])

  // Filter out groups with 0 entities (except core)
  const visibleGroups = groups.filter((g) => g.id === 'core' || (counts[g.id] ?? 0) > 0)

  if (visibleGroups.length <= 1) return null // Only core → no panel needed

  const isHorizontal = direction === 'horizontal'

  return (
    <div
      className={`flex ${isHorizontal ? 'flex-row flex-wrap' : 'flex-col'} items-start gap-1 rounded-lg bg-slate-900/80 backdrop-blur-sm border border-slate-700/60 p-1.5 ${className}`}
    >
      {visibleGroups.map((group) => {
        const isEnabled = enabledGroups.has(group.id)
        const isCore = group.id === 'core'
        const count = counts[group.id] ?? 0
        const colors = GROUP_COLORS[group.id]
        const Icon = GROUP_ICONS[group.icon] ?? Circle

        return (
          <button
            key={group.id}
            onClick={() => !isCore && onToggle(group.id)}
            onMouseEnter={() => handleMouseEnter(group.id)}
            onMouseLeave={handleMouseLeave}
            disabled={isCore}
            className={`
              flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium
              border transition-all duration-150 select-none
              ${isCore ? 'cursor-default' : 'cursor-pointer'}
              ${isEnabled
                ? `${colors.activeBg} ${colors.activeBorder} ${colors.text}`
                : `${colors.bg} ${colors.border} text-slate-500 opacity-50 hover:opacity-75`
              }
            `}
            title={`${group.label}: ${count} entities${isCore ? ' (always on)' : ''}`}
          >
            <Icon size={12} />
            <span>{group.label}</span>
            {count > 0 && (
              <span
                className={`
                  ml-0.5 px-1 py-px rounded text-[9px] font-semibold
                  ${isEnabled ? 'bg-white/10' : 'bg-white/5'}
                `}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}

      {/* Action buttons */}
      <div className={`flex items-center gap-0.5 ${isHorizontal ? 'ml-1' : 'mt-1'} border-l border-slate-700/40 pl-1.5`}>
        <button
          onClick={onEnableAll}
          className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/40 transition-colors"
          title="Show all groups"
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
