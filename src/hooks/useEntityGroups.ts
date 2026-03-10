// ============================================================================
// useEntityGroups — Manages 3-state display mode for entity groups
// ============================================================================
//
// Each non-core group cycles through 3 modes:
//   off         → group hidden (no nodes, no edges)
//   connections → edges visible + nodes as tiny dim dots (low energy)
//   expanded    → full nodes + edges at normal size
//
// Core group is always 'expanded' and cannot be toggled.
// ============================================================================

import { useCallback, useMemo, useState } from 'react'
import type { EntityGroup, EntityGroupConfig, GraphAdapter, GroupMode } from '@/types/fractal-graph'

interface UseEntityGroupsReturn {
  /** Currently enabled groups (both 'connections' and 'expanded' are in this set) */
  enabledGroups: Set<EntityGroup>
  /** Display mode per group */
  groupModes: Map<EntityGroup, GroupMode>
  /** Cycle a group: off → connections → expanded → off */
  cycle: (group: EntityGroup) => void
  /** Legacy toggle: off ↔ expanded (used by Enable All / Reset) */
  toggle: (group: EntityGroup) => void
  /** Enable a specific group (expanded mode) */
  enable: (group: EntityGroup) => void
  /** Disable a specific group */
  disable: (group: EntityGroup) => void
  /** Enable all groups (expanded mode) */
  enableAll: () => void
  /** Reset to defaults */
  resetToDefaults: () => void
  /** Check if a group is enabled (connections or expanded) */
  isEnabled: (group: EntityGroup) => boolean
  /** Available group configs for this adapter */
  groups: EntityGroupConfig[]
}

/** Cycle order: off → connections → expanded → off */
const CYCLE_ORDER: GroupMode[] = ['off', 'connections', 'expanded']

function nextMode(current: GroupMode): GroupMode {
  const idx = CYCLE_ORDER.indexOf(current)
  return CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length]
}

/**
 * Hook to manage entity group 3-state toggle.
 *
 * @param adapter - The GraphAdapter for the current scale level
 * @returns Controls and state for entity group toggling
 */
export function useEntityGroups<T>(adapter: GraphAdapter<T>): UseEntityGroupsReturn {
  const groups = adapter.supportedGroups

  // Build default modes: core = expanded, others depend on adapter.defaultGroupMode
  const adapterDefaultMode = adapter.defaultGroupMode
  const defaultModes = useMemo(() => {
    const map = new Map<EntityGroup, GroupMode>()
    for (const g of groups) {
      if (g.defaultEnabled) {
        map.set(g.id, 'expanded')
      } else {
        map.set(g.id, adapterDefaultMode ?? 'off')
      }
    }
    return map
  }, [groups, adapterDefaultMode])

  const [groupModes, setGroupModes] = useState<Map<EntityGroup, GroupMode>>(defaultModes)

  // Derive enabledGroups from groupModes (both connections and expanded count as "enabled")
  const enabledGroups = useMemo(() => {
    const set = new Set<EntityGroup>()
    for (const [group, mode] of groupModes) {
      if (mode !== 'off') set.add(group)
    }
    return set
  }, [groupModes])

  // Cycle: off → connections → expanded → off
  const cycle = useCallback((group: EntityGroup) => {
    if (group === 'core') return
    setGroupModes((prev) => {
      const next = new Map(prev)
      const current = prev.get(group) ?? 'off'
      next.set(group, nextMode(current))
      return next
    })
  }, [])

  // Legacy toggle: off ↔ expanded
  const toggle = useCallback((group: EntityGroup) => {
    if (group === 'core') return
    setGroupModes((prev) => {
      const next = new Map(prev)
      const current = prev.get(group) ?? 'off'
      next.set(group, current === 'off' ? 'expanded' : 'off')
      return next
    })
  }, [])

  const enable = useCallback((group: EntityGroup) => {
    setGroupModes((prev) => {
      if (prev.get(group) === 'expanded') return prev
      const next = new Map(prev)
      next.set(group, 'expanded')
      return next
    })
  }, [])

  const disable = useCallback((group: EntityGroup) => {
    if (group === 'core') return
    setGroupModes((prev) => {
      if (prev.get(group) === 'off') return prev
      const next = new Map(prev)
      next.set(group, 'off')
      return next
    })
  }, [])

  const enableAll = useCallback(() => {
    setGroupModes((prev) => {
      const next = new Map(prev)
      for (const g of groups) {
        next.set(g.id, 'expanded')
      }
      return next
    })
  }, [groups])

  const resetToDefaults = useCallback(() => {
    setGroupModes(defaultModes)
  }, [defaultModes])

  const isEnabled = useCallback(
    (group: EntityGroup) => enabledGroups.has(group),
    [enabledGroups],
  )

  return {
    enabledGroups,
    groupModes,
    cycle,
    toggle,
    enable,
    disable,
    enableAll,
    resetToDefaults,
    isEnabled,
    groups,
  }
}
